# Auditoria de performance — WattStatus

Data: 2026-10-24. Branch `feature/living-energy-3d`. Os números estão em `docs/BENCHMARK_PERFORMANCE_WATTSTATUS.md`; os dados brutos, em `scripts/perf/results/`.

Método: medir, identificar, corrigir, medir de novo. Tudo rodou num ambiente local isolado, nunca em produção nem na API real da SmartThings.

## 1. Bug prioritário: 429 levava o usuário para o login

### Causa raiz (duas falhas juntas)

1. **Backend.** O rate limit HTTP era de 120 requisições por minuto por IP, para todo o tráfego.
   - Usuários atrás do mesmo IP dividiam esse limite: casa, empresa, NAT de operadora móvel.
   - Um dashboard faz de 5 a 8 chamadas por carga. Poucos usuários bastavam para receber 429.
   - Na carga de 8 sessões, 79% das respostas foram 429.
2. **Frontend.** `useAuth` tratava qualquer erro de `GET /api/auth/me` como sessão inválida e apagava o usuário.
   - Isso incluía 429, 5xx, timeout e falha de rede.
   - O `ProtectedRoute` então redirecionava para `/login`.
   - Além disso, cada foco na aba revalidava a sessão e limpava todo o cache do React Query, o que remontava as páginas.

### Correção

- **Backend** (`backend/src/middleware/security.ts`, `createHttpLimiter`):
  - O limite por sessão é de 300 por minuto. A chave é o `jti` do JWT, verificado localmente, sem consulta ao banco.
  - Existe um teto por IP para tráfego autenticado: 1200 por minuto.
  - Tráfego anônimo, ou com token inválido ou expirado, segue com 120 por minuto por IP.
  - As respostas 429 trazem `Retry-After`, `RateLimit-*` e `code: "RATE_LIMITED"`.
  - Nenhuma proteção foi removida: login, cadastro e CSRF mantêm os mesmos limitadores.
- **Frontend:**
  - `isSessionExpired()` (`src/lib/api.ts`): só 401 encerra a sessão.
  - `useAuth`:
    - Mantém o usuário conhecido em erros transitórios.
    - Sem usuário conhecido, mostra o painel "Tentar novamente" (`sessionError`) em vez do login.
    - Revalida no foco no máximo a cada 60 s, em segundo plano, sem tela de carregamento.
    - Só limpa o cache quando o usuário muda.
  - `src/lib/query-client.ts` define a política de retry:
    - Até 2 tentativas, só para 0, 408, 429 e 5xx.
    - Backoff exponencial com jitter, máximo de 8 s.
    - Mutations não repetem.

### Testes

- `backend/tests/rate-limit.test.cjs` cobre:
  - vários usuários no mesmo IP;
  - 429 com `Retry-After`;
  - teto por IP;
  - token forjado ou expirado;
  - requisições simultâneas.
- `tests/session-resilience.test.cjs` cobre:
  - 429, 403, 500 e 503 não encerram a sessão, e 401 encerra;
  - falha de rede vira status 0;
  - retry e backoff.

## 2. Requisições e cache (React Query)

**Problema.** Cada página buscava de novo `appliances`, `properties` e o histórico de energia, sem cache compartilhado. Nas mutations, as invalidações em cascata disparavam refetch de tudo.

**Correção:**
- `useAppliances` e `useEnergyHistory` passaram a usar `useQuery`, com chaves por usuário.
  - `staleTime` de 30 s (padrão) e de 60 s (histórico).
  - `keepPreviousData` no histórico: ao trocar de período, o período anterior continua visível durante o carregamento.
- As mutations gravam a resposta do servidor no cache (`setQueryData`), sem refetch.
- Excluir imóvel ou ambiente invalida os aparelhos, porque o servidor move os aparelhos.
- SmartThings: o polling usa `/overview?cached=1`. A revalidação no foco tem um intervalo mínimo de 15 s. A frequência de coleta de energia não mudou.

**Resultado:** 7 navegações internas passaram de 28 para 6 chamadas de API, e o tempo por passo passou de 311–694 ms para 18–188 ms.

## 3. Backend e MongoDB

- **Autenticação:** `getSession` e `getUserById` rodam em paralelo (`Promise.all`).
- **Índices:** são criados em paralelo por coleção, mantendo a ordem dentro de cada coleção. Isso reduz o tempo de inicialização da function (cold start).
- **`energy_samples`:** usa projeção explícita (`ENERGY_SAMPLE_FIELDS`), então lê só os campos usados. O cálculo e o formato da resposta não mudaram.
- **`ensureDefault` (imóveis):** não lista os imóveis de novo quando nada mudou.
- **`/api/ai/insights`** (módulo de IA, outro agente) levava cerca de 1,6 s por chamada. Duas causas:
  - `zonedDay` e `zoneOffset` criavam um `Intl.DateTimeFormat` novo para cada leitura de energia, milhares por chamada. Agora o formatador fica em cache por fuso e padrão.
  - Cada aparelho filtrava a lista inteira de leituras, com custo O(aparelhos × leituras). Agora as leituras são agrupadas por aparelho numa passada.
  - O resultado do cálculo é o mesmo, com o mesmo fuso e as mesmas fórmulas. p50: 1601 → 107 ms.

## 4. Carregamento das páginas

- **Dashboard:** a regressão de "utilizável" (590 → 1337 ms) vinha de `/api/ai/insights`. Depois da correção do item 3, ficou em 501 ms (frio) e 440 ms (quente), abaixo do baseline.
- **Relatórios, CLS 0,29 → 0,0015:**
  - O seletor de imóvel aparecia só depois do carregamento e quebrava a barra de filtros em duas linhas. Ele agora aparece desabilitado durante o carregamento.
  - O valor "Medido" e a barra "Medido vs. estimado" reservam a altura final enquanto carregam.
- **Imóvel (3D):** a aba "Consumo" (Recharts) é carregada sob demanda (`lazy`). JS: 1785 → 1414 KB. TBT: 91 → 20 ms.

## 5. 3D (Living Energy)

- Com a cena parada, o canvas não desenha nada: 0 draw calls em 2 s (frameloop sob demanda já estava certo).
- O FPS durante a órbita ficou em 59,9, mas em SwiftShader, que não representa uma GPU real.
- Draw calls subiram de 164 para 204 porque outro agente adicionou móveis. Isso não é regressão destas mudanças.
- **Oportunidade não aplicada:** `InstancedMesh` para móveis repetidos. Não apliquei porque `furniture.ts` estava sendo editado por outro agente.

## 6. Memória

- Antes: 19,7 MB estáveis em 20 ciclos 2D↔3D.
- Depois: 26,3 → 28,1 MB, com cena maior e incrementos decrescentes (+1,12, +0,55, +0,11, +0,04 MB).
- Não há evidência de vazamento. Recomendo uma medição de 100 ciclos para confirmar.

## 7. Mobile

- O CLS de Relatórios zerou.
- As cargas quentes melhoraram: Home LCP 1076 → 512 ms; Imóveis 1368 → 632 ms; TBT do Dashboard quente 1652 → 474 ms.
- **Gargalo restante:** o histórico de energia de um mês tem cerca de 1,6 MB de JSON. Em rede lenta, é o que domina o Dashboard frio (LCP medido de 6,8 s).
- 3D e memória no mobile não foram medidos depois (pouca memória livre na máquina).

## 8. Netlify

- O rate limit por sessão evita 429 falsos para usuários atrás do mesmo IP.
- A criação de índices em paralelo reduz o trabalho do cold start. O cold start real não foi medido, porque exige deploy, que não foi feito.
- Menos chamadas por navegação significa menos invocações da function.
- Cada requisição autenticada passou a fazer 1 escrita a mais no Mongo (contador por sessão).

## 9. Riscos restantes e próximas prioridades

1. **Histórico de energia (1,6 MB por mês):** criar um endpoint agregado por dia no servidor, ou confirmar e ativar a compressão das respostas da function na Netlify. É o maior ganho restante no mobile.
2. **`IntegrationUsage`:** faz polling de `analytics/usage` e `smartthings/usage` a cada 30 e 60 s, mesmo sem integrações. Deveria pausar quando a aba está oculta ou quando não há integração.
3. **3D:** usar `InstancedMesh` para móveis repetidos (204 draw calls).
4. **Medições pendentes:** medir 3D e memória no mobile e o cold start real na Netlify (preview deploy autorizado).
5. **Ruído no `/me` e no `/rooms`:** p95 isolado de cerca de 200 ms numa amostra. Repetir com mais amostras.
6. **Rate limit em produção:** os limites novos (300 por sessão, 1200 por IP autenticado) devem ser acompanhados em produção pelos logs de 429.

## 10. Segunda rodada: prioridades 1 a 3 aplicadas

1. **Histórico de energia em colunas:**
   - `?format=columns` em `/api/energy/history` e em `/api/properties/:id/energy` envia ids e textos uma vez só, num dicionário, e as datas em milissegundos.
   - O frontend (`src/lib/energy-compact.ts`) reconstrói os mesmos objetos. O teste `tests/energy-compact.test.cjs` compara o resultado campo a campo.
   - Se algum dado não puder ser reconstruído exatamente (data fora do formato ISO canônico ou campo desconhecido), o servidor envia o formato antigo.
   - Clientes que não pedem o formato novo, como o módulo de IA, recebem a resposta antiga.
   - Medido: 1,66 MB → 277 KB.
2. **`IntegrationUsage`:** só faz polling quando a última resposta trouxe dados. O React Query já pausa o polling com a aba oculta. Uma conta sem integrações faz uma consulta só.
3. **3D:**
   - Os móveis de cada ambiente são desenhados com um `InstancedMesh` por forma e acabamento.
   - A animação de montagem por unidade continua: o `useFrame` reescreve as matrizes das instâncias.
   - Draw calls por frame: 204 → 118.

Pendências:
- LCP do Dashboard mobile frio.
- CLS do resumo de IA em Relatórios (trabalho de outro agente).
- Cold start da Netlify, que exige deploy.
