# Homologação de performance e estabilidade — WattStatus (fase 3)

Data: 2026-10-24.

**Trabalho:**
- Branch: `feature/watt-performance-hardening`.
- Worktree: `C:\dev\wattstatus_perf`.
- Base: `c7bc152`, HEAD de `feature/living-energy-3d`. Inclui `533ab2e` e `c7bc152` (WattStatus AI fase 2) e `df844f5` (otimizações anteriores).

Nada foi enviado: sem push, sem merge, sem deploy. O módulo `backend/src/modules/ai/**` e os componentes exclusivos do WattStatus AI não foram alterados.

## Método

Todas as medições rodaram localmente, contra o build de produção (`vite build`) e o backend compilado.

**Ambiente local:**
- Banco: MongoDB 7 local, num banco descartável por execução (`wattstatus_perf_<8hex>`), apagado ao final.
- Dados sintéticos: 2 usuários, 20 ambientes, 40 aparelhos e 6 medidores com 30 dias de leituras por hora. A varredura do 3D usou 1, 5, 10, 20 e 40 ambientes.
- Navegador: Chrome headless via CDP (`scripts/perf/measure.mjs`).
  - Desktop: 1440×900.
  - Mobile: 390×844, DPR 3, CPU 4× mais lenta, rede próxima de Slow 4G.
  - Cache frio e cache aquecido, mediana de 3 execuções.
- API: latência sequencial, comandos MongoDB por requisição e carga de 8 sessões no mesmo IP por 30 s (`scripts/perf/api-bench.mjs`).

**Nenhum teste rodou contra produção nem contra a API real da SmartThings.**

### Limitação importante: ruído da máquina

O baseline (`p3-before-*`) e a medição posterior (`p3-after-*`) rodaram com cerca de 1 h de intervalo. Nesse tempo, outro agente usava a mesma máquina (worktree `wattstatus_ai_wt`).

Na medição posterior, até endpoints e páginas sem nenhuma alteração ficaram cerca de 2× mais lentos:
- `/api/auth/me`: p50 de 13,8 para 22,4 ms.
- `/api/properties/:id/floors`: p50 de 11,6 para 26,3 ms.
- Login no mobile, aquecido: LCP de 492 para 800 ms.

Por isso, a comparação sequencial de tempos não é válida e não foi usada como ganho. Os ganhos declarados abaixo vêm de três fontes:
1. **A/B intercalado:** build base e build nova alternadas no mesmo período, com os mesmos dados (`PERF_DIST` em `bench-server.cjs`).
2. **Métricas determinísticas:** bytes, número de requisições, CLS, draw calls e contagem de comandos.
3. **Microbenchmarks de CPU** no mesmo processo.

## Resultados

### 1. Histórico compacto (`?format=columns`)

**Auditoria:**
- O codificador (`backend/src/modules/energy/energy-compact.ts`) só usa o formato em colunas quando consegue reconstruir cada campo exatamente. Data fora do ISO canônico ou campo desconhecido fazem o servidor enviar o formato antigo.
- Clientes que não pedem o formato (o módulo de IA, versões antigas do app) recebem a resposta antiga.
- As datas são instantes UTC em milissegundos, então não há conversão de fuso. O fuso do imóvel só é aplicado depois, pelos consumidores.

**Testes novos:**
- `backend/tests/energy-compact-mongo.test.cjs` (MongoDB real) cobre:
  - contadores cumulativos antigos sem local;
  - leituras delta com imóvel e ambiente;
  - aparelho que mudou de ambiente;
  - dispositivo sem aparelho (`applianceId: null`);
  - decimais longos e milissegundos nas datas;
  - histórico geral e histórico por aparelho.

  O resultado decodificado é idêntico, objeto a objeto e na mesma ordem, ao JSON simples.
- `tests/energy-compact.test.cjs` cobre null e ausente, fallback do formato e tamanho.

**Custo medido** (`scripts/perf/codec-bench.cjs`, CPU, mediana de 30 rodadas):

| 30 dias por hora | JSON simples | Colunas, antes desta fase | Colunas, agora |
|---|---|---|---|
| 6 medidores (4.320 leituras), bytes | 1.766.886 | 293.124 | 293.124 |
| Codificar no servidor, p50 | 3,1–7,7 ms | 10,5 ms | 3,0–3,9 ms |
| Decodificar no navegador, p50 | 3,1–4,5 ms | 7,4 ms | 2,0–2,6 ms |
| Heap retido após decodificar | 2,11 MB | não medido* | 0,92 MB |
| 40 medidores (28.800 leituras), bytes | 11.844.014 | 2.002.160 | 2.002.160 |
| Decodificar 40 medidores, p50 | 21–32 ms | 58,6 ms | 10,7–13,1 ms |

\* A primeira versão do benchmark media o heap sem GC depois da decodificação. Esse número foi descartado.

**Causa da lentidão anterior:** cada leitura fazia `Date.parse` e `toISOString` duas vezes, no servidor e no cliente. As leituras por hora compartilham instantes, então agora cada instante é convertido uma vez e a string resultante é reaproveitada.

Na API (fixture, desktop), a resposta do histórico em colunas tem 270 KB, contra 1.623 KB no formato simples. O tempo de servidor é o mesmo dentro da medição.

### 2. Cache e consistência

**Problemas encontrados:**
- As chaves de imóveis, layout e energia do imóvel não incluíam o usuário. A proteção dependia só de `queryClient.clear()` na troca de usuário, que continua existindo (login, logout e troca de conta).
- Alterar um aparelho (potência, horas, tarifa, imóvel, ambiente, vínculo de dispositivo) atualizava só a lista de aparelhos. Histórico medido, energia do imóvel, totais por ambiente e análises da IA ficavam com valores antigos por até 60 s, ou até 5 min no caso dos insights.
- Excluir ambiente ou imóvel já invalidava os aparelhos, mas não o histórico nem a energia do imóvel.

**Correção** (`src/lib/cache-keys.ts`):
- Todas as chaves agora incluem o id do usuário, além de período, imóvel e aparelho.
- `refreshAfterApplianceChange` marca como desatualizados o histórico, os imóveis, o layout, a energia do imóvel e as consultas `["wattai","insights"]` e `["wattai","report-summary"]`. Isso só invalida as chaves; não toca na lógica da IA.
- `refreshAfterPlaceChange` faz o mesmo e também recarrega os aparelhos.
- O cache não foi desligado: os valores anteriores continuam visíveis até chegarem os novos.

**Situações cobertas:**
- **Novas leituras:** `staleTime` de 60 s e revalidação ao focar a aba.
- **Troca de período:** o período faz parte da chave.
- **Logout:** o cache é limpo.
- **Entre usuários:** chaves separadas e cache limpo na troca.

O teste `tests/cache-invalidation.test.cjs` usa o QueryClient real e verifica:
- chaves por usuário e por período;
- o que é invalidado em cada tipo de mudança;
- que preferências e outros dados não são recarregados sem necessidade.

### 3. Streaming na Netlify

**Diagnóstico:** `backend/netlify/functions/api.ts` usa `serverless-http`, que monta a resposta inteira antes de devolver. O SSE de `/api/ai/chat/stream` chegava ao navegador num bloco só.

O teste `backend/tests/streaming-adapter.test.cjs` reproduz isso: 5 eventos escritos a cada 120 ms viram um único `body`, disponível só depois de 528 ms.

**Implementação** (camada de infraestrutura):
- `backend/src/netlify/streaming-adapter.ts` executa o mesmo app Express para um `Request` da Web API e devolve um `ReadableStream`. Cada `res.write()` vira um bloco na hora em que é escrito.
- **Repassado sem mudança:** método, URL, headers, cookies, corpo e IP do cliente (`context.ip`, o mesmo papel de `sourceIp` no `serverless-http`). Com isso, autenticação, CSRF, CORS e rate limit funcionam como antes.
- **Cancelamento:** se o navegador desconecta, a rota recebe o evento `close`, que já aborta o trabalho no módulo de IA.
- **Corpo da requisição:** limite de 256 KB.
- `backend/netlify/functions/api-stream.ts` é uma Function v2 com `config.path = "/api/ai/chat/stream"`. Ela atende só essa rota; as demais continuam na function `api`.

**Validação de ponta a ponta** (`scripts/perf/stream-check.cjs`, app real, MongoDB descartável, login e CSRF reais):

| Adaptador | Entrega |
|---|---|
| Streaming | 4 blocos separados: `stage` (1259 ms), `stage` (1319 ms), `stage` (1348 ms), `response` (1363 ms) |
| `serverless-http` | 1 corpo com os 4 eventos juntos |

O tempo até o primeiro evento inclui a primeira consulta ao banco (frio). Com o motor determinístico, os estágios ficam próximos uns dos outros. Com o modelo generativo ativo, o intervalo entre eles é maior, e é aí que o streaming faz diferença.

**Limitações, a verificar num deploy de preview autorizado:**
- O runtime da Netlify não foi reproduzido localmente; `netlify dev` não foi usado.
- **Roteamento:** confirmar que uma function com `path` tem precedência sobre o redirect `/api/*` do `netlify.toml`, como diz a documentação da Netlify.
- **Timeout** das functions com streaming no plano contratado.
- **Compressão e buffering na CDN:** os headers já enviados são `Cache-Control: no-cache, no-transform` e `X-Accel-Buffering: no`.

**Contrato com o módulo de IA:** nenhuma mudança foi necessária. A rota continua sendo `POST /api/ai/chat/stream`, com SSE `stage`, `response` e `error`.

### 4. Maquete 3D

A versão com `InstancedMesh` já estava no HEAD. Esta fase:
- reduziu as alocações por frame na animação de montagem (uma passada, dois arrays por frame em vez de quatro);
- mediu as escalas abaixo, com build base e build nova, mesmo dia, desktop, SwiftShader (renderização por software).

| Ambientes | Draw calls (base / nova) | Triângulos | FPS em órbita | Frame p95 (base / nova) | Draw calls parado | Heap após GC, 20 ciclos 2D↔3D (nova) |
|---|---|---|---|---|---|---|
| 1 | 5 / 5 | 197 | 59,9 | 16,8 / 16,8 ms | 0 | 15,7 → 17,5 MB |
| 5 | 20 / 20 | 831 | 59,9 | 49,9 / 33,4 ms | 0 | 18,4 → 20,4 MB |
| 10 | 38 / 43 | 1644 / 1864 | 59,9 | 66,6 / 50,1 ms | 0 | 20,3 → 22,0 MB |
| 20 | 82 / 85 | 3373 / 3499 | 59,9 | 83,4 / 83,4 ms | 0 | 23,9 → 25,5 MB |
| 40 | 189 / 176 | 7832 / 7305 | 59,9 | 166,6 / 150 ms | 0 | 28,8 → 30,1 MB |

**Leitura dos resultados:**
- Draw calls crescem cerca de 4,5 por ambiente. O frame p95 cresce com a escala no SwiftShader. Numa GPU real, os tempos absolutos devem ser menores, mas isso não foi medido.
- As diferenças entre base e nova em 10 e 40 ambientes vêm de execuções diferentes da câmera e da cena. Não indicam mudança causada pelo código.
- **Memória:** nas duas builds e em todas as escalas, o heap sobe de 1,5 a 2 MB nos primeiros ciclos e depois quase para (+0,05 a +0,2 MB nos últimos cinco ciclos). É compatível com cache de materiais e geometrias. Não há evidência de vazamento.
- **Seleção, hover e raycasting:** os móveis já usavam `raycast={noRaycast}` antes da instanciação, então os cliques continuam chegando aos ambientes e aparelhos como antes. Sombras e materiais seguem iguais: mesmo `furnitureMaterial` e sem `castShadow` nos móveis, antes e depois.
- **Não verificado visualmente nesta fase:** vários pavimentos, movimento reduzido e o tempo de troca de ambiente. O script não clica em ambientes.

### 5. Layout shift

| Página | CLS antes | CLS depois | Medição |
|---|---|---|---|
| Relatórios, desktop frio | 0,0927 (3 execuções: 0,0926–0,0927) | 0 (0–0,0001) | A/B intercalado |
| Relatórios, desktop quente | 0,0926 | 0 | A/B intercalado |
| Relatórios, mobile frio | 0,2076 | 0,0364 | p3-before × p3-after (CLS não depende da velocidade da máquina) |

**Causa:** o resumo da IA em Relatórios aparecia acima do relatório depois que os dados chegavam e empurrava tudo para baixo. Ele agora reserva o espaço com um skeleton (título e 5 linhas) enquanto o imóvel ou o resumo carregam. A altura é ajustada ao conteúdo; não é fixa.

**Ainda aberto:** CLS de 0,028 no Dashboard (barra de escopo e hero, que mudam de altura quando os dados chegam). É baixo, abaixo do limite de 0,1, e não foi alterado.

### 6. Rate limit e sessão

**Situação:**
- Só 401 encerra a sessão.
- 403, 429, 5xx, timeout e falha de rede mantêm o usuário. O rate limit é por sessão, com teto por IP.

**Novo nesta fase:** o cliente respeita o `Retry-After` do servidor.
- O tempo pedido pelo servidor vira a espera mínima antes de repetir, com limite de 30 s.
- Sem o header, continua o backoff exponencial com jitter.

**Testes** (`tests/session-resilience.test.cjs`, `backend/tests/rate-limit.test.cjs`):
- 401 encerra a sessão; 403, 429, 500 e 503 não encerram.
- Falha de conexão.
- Retentativas e backoff.
- `Retry-After`.
- Recuperação automática depois de 429 e 503 seguidos, sem evento de sessão expirada.
- Vários usuários no mesmo IP.
- Requisições simultâneas contadas sem perda.
- Token forjado ou expirado.

**Carga** (8 sessões, mesmo IP, 30 s): 0 respostas 429 no baseline (585/585 com 200) e 0 depois (535/535). A diferença de throughput é ruído da máquina.

### 7. MongoDB e backend

**Coletor agendado** (`claimEnergyCollection`):
- **Antes:** fazia um upsert de `user_settings` por aparelho candidato, até 200 escritas por execução. A janela de 200 aparelhos podia ser preenchida só por usuários sem opt-in, e quem tinha opt-in nunca era coletado.
- **Agora:** lê os usuários com opt-in numa consulta e só examina os aparelhos deles.
- `backend/tests/energy-claim-mongo.test.cjs` cobre 250 aparelhos sem opt-in mais 1 com opt-in: o aparelho certo é encontrado e nenhuma configuração é criada para os outros.

**Comandos por requisição** (fixture):
- auth/me: 5; aparelhos: 7; histórico: 16, com cursores de 101 documentos por lote.
- Sem N+1 nas rotas de leitura auditadas.

**Pool de conexões e inicialização:** sem mudança. A conexão é reaproveitada entre invocações quentes, e a criação de índices em paralelo vem da fase anterior.

**Testes MongoDB:** os arquivos rodavam todos em paralelo no mesmo MongoDB local. Com outra sessão usando o mesmo banco, isso gerava timeouts intermitentes, que já apareciam no baseline. O backend agora usa `--test-concurrency=2`: 125/125 em duas execuções seguidas, em cerca de 15 s.

### 8. React, navegação e bundle

**Experimento descartado:** testei carregar o Recharts do Dashboard sob demanda (cerca de 384 KB).
- No A/B intercalado, desktop e mobile não melhoraram de forma consistente.
- No mobile, o TBT variou de 446 a 4368 ms na mesma build.
- Os gráficos aparecem logo abaixo do resumo e são pedidos logo depois do primeiro render, então o total baixado é o mesmo.

Pela regra de só aplicar o que o profiling justifica, a mudança foi revertida.

**Bundle:** sem mudança nesta fase. JS por rota, carga fria:
- Dashboard: 942 KB.
- Imóvel 3D: 1418 KB.
- Login: 357 KB.

**Navegação interna** (baseline desktop): 0 a 3 chamadas de API por passo, graças ao cache das fases anteriores.

## Testes executados (estado final)

| Verificação | Resultado |
|---|---|
| TypeScript (frontend) | sem erros |
| ESLint | sem erros |
| Build frontend (`vite build`) | ok |
| Build backend (`tsc` app e functions) | ok |
| Testes frontend (`npm test`) | 45/45 |
| Testes backend com MongoDB isolado | 125/125 (2 execuções seguidas) |
| Navegação real no Chrome, desktop e mobile, frio e quente | `p3-before-*`, `p3-after-*` e A/B |
| 3D, 1 a 40 ambientes | `p3-3d-*` |

## Arquivos alterados

- **Backend:**
  - `backend/src/modules/energy/energy-compact.ts`
  - `backend/src/storage/mongo-db.ts` (`claimEnergyCollection`)
  - `backend/src/netlify/streaming-adapter.ts` (novo)
  - `backend/netlify/functions/api-stream.ts` (novo)
  - `backend/package.json` (concorrência dos testes)
- **Frontend:**
  - `src/lib/energy-compact.ts`
  - `src/lib/cache-keys.ts` (novo)
  - `src/lib/api.ts`
  - `src/lib/query-client.ts`
  - `src/hooks/useAppliances.ts`
  - `src/hooks/useProperties.ts`
  - `src/hooks/useEnergyHistory.ts`
  - `src/components/tabs/ReportsTab.tsx`
  - `src/components/floorplan/FloorPlan3D.tsx`
- **Testes:**
  - `tests/cache-invalidation.test.cjs`
  - `tests/session-resilience.test.cjs`
  - `backend/tests/energy-compact-mongo.test.cjs`
  - `backend/tests/energy-claim-mongo.test.cjs`
  - `backend/tests/streaming-adapter.test.cjs`
- **Benchmarks:**
  - `scripts/perf/codec-bench.cjs`
  - `scripts/perf/stream-check.cjs`
  - `scripts/perf/measure.mjs`: elemento do LCP, origem dos layout shifts, `--routes` e `--three-only`.
  - `scripts/perf/bench-server.cjs` (`PERF_DIST`)
  - `scripts/perf/api-bench.mjs` (variante em colunas)
  - `scripts/perf/results/p3-*`

## Regressões

Nenhuma regressão causada por estas mudanças foi identificada nas medições válidas (A/B e métricas determinísticas). A queda geral de tempos em `p3-after-*` atinge também páginas e endpoints que não mudaram, e foi atribuída à carga da máquina.

## Pendências e riscos

1. **Streaming na Netlify:** validar num deploy de preview a precedência de rota, o timeout e o buffering da CDN antes de produção.
2. **Dashboard no mobile frio** (LCP 3,3 a 7,4 s, conforme a carga da máquina):
   - O peso é o JS (942 KB).
   - O lazy loading dos gráficos não mostrou ganho.
   - O próximo passo é medir numa máquina sem concorrência ou num dispositivo real, antes de mudar a estrutura.
3. **Repetir `p3-before` e `p3-after` numa máquina ociosa** para ter uma comparação sequencial confiável de tempos.
4. **3D:** testar seleção, vários pavimentos e movimento reduzido de forma automatizada. Medir o tempo de troca de ambiente.
5. **Testes do outro agente:** dois bancos `wattstatus_test_*` ficaram no MongoDB local, provavelmente de testes em andamento do agente de IA. Não foram apagados.
