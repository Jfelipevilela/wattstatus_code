# WattStatus — Release candidate 1

Data: 2026-10-24. Worktree `C:\dev\wattstatus_rc`, branch local `release/wattstatus-rc1`, base `e0d6980`. Sem push, merge nas branches originais ou deploy. Todas as worktrees anteriores foram preservadas.

## 1. Base e comparação entre `e0d6980` e `b2a6fe8`

- `e0d6980` é o HEAD de `feature/wattstatus-integration-final`; a worktree estava limpa.
- As duas branches saem de `9b2d015`.
- `git cherry` mostra que `332553d`, `0852347`, `7bdf841` e `acb54e3` (branch collect) têm equivalentes em `dbe105e`, `e20f1d6`, `b85bfc4` e `e0d6980` (branch final). Não foram reaplicados.
- Único commit sem equivalente: `b2a6fe8`, só documentação (§ 11 de `docs/INTEGRACAO_HOMOLOGACAO.md`). Incorporado por cherry-pick.
- Código de coleta (`backend/src/modules/energy`, `backend/src/storage`) e testes de coleta: idênticos nas duas branches.
- A versão final tem, além disso, a qualidade de medição da IA (`518c534`, `2d23f36`): `ai.freshness.ts` e 3 arquivos de teste.

Commits da RC sobre `e0d6980`:

| Commit | Conteúdo |
|---|---|
| `30c7d96` | Acesso administrativo por concessão no servidor; testes de escalonamento |
| (cherry-pick de `b2a6fe8`) | Seção da coleta no relatório de integração |
| (este) | Este documento e medições da RC |

## 2. Análise de segurança administrativa

### Achado crítico (corrigido)

- O cadastro (`POST /api/auth/register`) **não verifica o e-mail**: qualquer endereço ainda não cadastrado pode ser registrado por qualquer pessoa.
- O acesso administrativo era decidido só pelo e-mail estar em `AI_ADMIN_EMAILS`, em dois lugares:
  - `backend/src/modules/ai/ai.routes.ts` (`isAdmin`): `/api/ai/admin/settings` (GET/PUT), `/api/ai/admin/usage`, e o campo `admin` de `/api/ai/status`;
  - `backend/src/modules/energy/energy.routes.ts`: `/api/energy/collection-stats`.
- Impacto: quem registrasse um endereço listado e ainda sem conta virava administrador. Podia desligar a IA, trocar o modelo, alterar orçamentos e ver uso agregado e métricas da coleta.

Outros recursos privilegiados: não há rotas administrativas de integrações nem outro uso de `AI_ADMIN_EMAILS`. A página `/ia/admin` só exibe o que o servidor libera; o servidor responde 403 a quem não tem concessão. O campo `admin` em `/api/ai/status` só controla a exibição do link.

Não há rota que altere e-mail ou papel do usuário. `PUT /api/user-settings` grava só uma lista fixa de campos. O cadastro monta o registro campo a campo e ignora campos extras.

### Correção

- Nova coleção `admin_grants`: `{ userId, grantedAt, grantedBy, reason, revokedAt }`, com índice único por `userId`.
- `MongoDatabase.isAdmin(userId)`: concessão ativa (`revokedAt: null`) para o id da sessão autenticada.
- A IA recebe `isAdmin` do app (`deps.isAdmin`); a coleta usa `db.isAdmin`. Sem concessão, ninguém é administrador.
- `AI_ADMIN_EMAILS` é **ignorada**. Um teste confirma isso com a variável configurada.
- Provisionamento controlado: `backend/scripts/admin-grant.cjs`, com acesso direto ao banco. Nenhuma rota HTTP grava concessões.
  - `find --email=` mostra o id da conta.
  - `grant --user-id= --reason=` concede (a conta precisa existir).
  - `revoke --user-id= --reason=` revoga.
  - `list` lista as concessões.
  - O script registra o operador e o motivo. Confirmar fora do sistema que a pessoa controla a conta antes de conceder.

**Migração para produção:** antes do deploy, conceder acesso aos administradores atuais com o script (por id). Sem isso, ninguém terá acesso administrativo depois do deploy. Remover `AI_ADMIN_EMAILS` do ambiente.

Mudança em `backend/src/modules/ai/ai.routes.ts`: só a função `isAdmin` e a dependência `getUserEmail` → `isAdmin`. A lógica da IA não mudou.

## 3. Testes de privilégios

`backend/tests/admin-privilege-mongo.test.cjs`, com app real, MongoDB isolado, cookies e CSRF reais. Endpoints: `/api/ai/admin/settings`, `/api/ai/admin/usage` e `/api/energy/collection-stats`.

| Cenário | Resultado esperado e obtido |
|---|---|
| Cadastro não verificado com o e-mail de `AI_ADMIN_EMAILS` | 201 no cadastro; 403 nos 3 endpoints; `admin: false` |
| E-mails semelhantes (maiúsculas, `+tag`, ponto final, homóglifo) | 403 (ou cadastro recusado) |
| Usuário comum | 403; `admin: false` |
| Cliente tenta se promover (`role`, `isAdmin`, `admin` no cadastro, em `user-settings` e em preferências da IA) | campos ignorados; 403 |
| Administrador válido (concessão por id) | 200; `admin: true` |
| Administrador sem CSRF ou com CSRF forjado em `PUT /admin/settings` | 403; com CSRF válido, 200 |
| Outros usuários enquanto existe um administrador | continuam 403 |
| Concessão revogada | 403 na requisição seguinte |
| Sem sessão; token inválido; token expirado; assinatura de outra chave; token válido sem sessão no servidor; payload adulterado (`sub` trocado) | 401 |
| Administrador depois do logout | 401 |

Outros testes de rota também passaram a usar `isAdmin` por id: `ai.test.cjs`, `ai-phase2.test.cjs` e `energy-capacity-mongo.test.cjs`. O teste `energy-collection-auth.test.cjs` continua cobrindo 401 sem sessão.

## 4. Coleta integrada (verificada na RC)

Tudo coberto por testes com MongoDB descartável e SmartThings simulada:
- fila justa e prioridade por `nextAt`, de 1 a 1.000 dispositivos;
- reserva atômica: dois workers nunca pegam o mesmo dispositivo;
- concorrência limitada e limite por usuário (`maxPerUser ≤ perUserConcurrency` em todas as configurações);
- 429 (conta descansa até o reset, outras seguem), 401 e 404;
- lease expirado sem duplicar leitura;
- prazo curto sem reservas presas;
- lista de ocupados desatualizada (`acb54e3`);
- ponta a ponta sem leituras duplicadas;
- `collection-status` isolado por usuário;
- `collection-stats` só para administradores com concessão.

| Dispositivos | Orçamento / workers | Intervalo p95 | Nunca lidos | Execução média / máxima |
|---|---|---|---|---|
| 250 | 53 / 8 | 30 min | 0 | 0,66 / 1,03 s |
| 500 | 105 / 8 | 30 min | 0 | 1,20 / 1,67 s |
| 1.000 | 209 / 8 | 30 min | 0 | 2,21 / 3,03 s |

Fila mínima (3 por execução): 250, 500 e 1.000 dispositivos todos atendidos, sem ninguém atendido duas vezes antes de todos.

## 5. Integração da IA (verificada na RC)

Testes `ai-freshness*.test.cjs` e `ai-freshness-mongo.test.cjs`:
- os cinco estados (`recent`, `delayed`, `missing`, `disabled`, `error`) chegam do MongoDB;
- leitura atrasada não é apresentada como atual; a guarda permite "agora" só com leitura recente;
- falha de coleta não vira pico nem alerta de aumento;
- investigação não usa medidor atrasado como evidência;
- status consultado só do usuário.

Outras suítes da IA (motor, guarda, planos, investigações, preferências, histórico, orçamento, posse) passam. Com provedor desligado, o chat e o streaming respondem pelo motor determinístico.

## 6. Testes completos da RC (execução nova)

| Verificação | Resultado |
|---|---|
| TypeScript frontend e backend (`tsconfig.json`, `tsconfig.functions.json`) | sem erros |
| ESLint | 0 erros, 13 avisos (componentes `ui`, hooks, `backend/dist` gerado) |
| Build frontend e backend | ok |
| Frontend (relatórios PDF, energia, medições, fuso, planta, sessão, cache, codec) | 45/45 |
| Backend com MongoDB isolado | 198/198, duas execuções completas |
| Backend sem MongoDB | 153 passam, 45 pulados |

Navegação real no Chrome, build de produção, servidor isolado com 20 ambientes, 3 execuções (`scripts/perf/results/rc-*.json`). A máquina tinha carga de outras sessões.

| Página | Desktop LCP frio/quente | Mobile LCP frio/quente | CLS desktop / mobile |
|---|---|---|---|
| Dashboard | 252 / 160 ms | 7104 / 868 ms | 0,0278 / 0 |
| Relatórios | 304 / 188 ms | 5612 / 1608 ms | 0 / 0,0364 |
| Imóvel 3D | 176 / 132 ms | 5348 / 1008 ms | 0,0001 / 0,0001 |

- 0 respostas 429 em todas as cargas.
- 3D desktop: 112 draw calls, 59,9 FPS na órbita, 0 draw calls parado. Mobile: 83 draw calls.
- Memória em 20 ciclos 2D↔3D: desktop 34,2 → 35,6 MB; mobile 31,1 → 33,2 MB, incrementos decrescentes.

## 7. Pendências — Netlify Preview (não executado)

1. Rota dedicada: `POST /api/ai/chat/stream` atendido por `api-stream` e não pelo redirect `/api/*`.
2. Streaming real: eventos separados no DevTools (EventStream); `Cache-Control: no-cache, no-transform` respeitado.
3. Cookies: `Secure`, `HttpOnly` e `SameSite` corretos no domínio do preview; nome de cookie de produção.
4. Autenticação: sem cookie 401; token expirado 401; logout revoga.
5. CSRF: sem token 403, com token 200, origem estranha 403.
6. `context.ip` preenchido (sem ele, 503); `TRUST_PROXY_HOPS` coerente com a cadeia da Netlify.
7. Timeout: pior caso do chat com provedor dentro do limite da function; coleta agendada dentro de 30 s.
8. Logs sem segredos: buscar por `Bearer`, `token`, `password`, `apiKey` e pelo valor da chave do provedor.
9. Administração: concessões provisionadas por script antes do teste; `AI_ADMIN_EMAILS` removida.
10. Cold start: primeira chamada da IA (criação de índices).

## 8. Pendências — SmartThings (não executado)

Requer autorização e uma conta de homologação com credenciais próprias. Roteiro completo em `docs/INTEGRACAO_HOMOLOGACAO.md` § 11.
- Medir latência média e p95 (`avgDeviceMs`, `lastDurationMs`), chamadas externas por leitura (`externalCalls / saved`), respostas 429 (`rateLimited`) e tempo de processamento (`durationMs`).
- Escolha segura da capacidade: começar pelo padrão (60 por execução, 4 workers, 2 por usuário). Ajustar pela fórmula de `docs/COLETA_ENERGIA.md` § 5 com a latência medida. Nunca habilitar a configuração máxima por padrão.
- Parar ao primeiro 429 ou 401 inesperado.

## 9. Pendências — provedor generativo (não executado)

1. Chave separada de homologação, com limite de gasto pequeno no painel do provedor.
2. `AI_MONTHLY_COST_LIMIT_USD` definido. Hoje vem desligado por padrão e falha aberta se a consulta de custo falhar.
3. Teste real de resposta: latência (primeiro evento e resposta completa) e custo efetivo por conversa.
4. Guarda: tentar números inventados, "medido" para estimativa e "agora" com leitura atrasada.
5. Fallback: chave inválida ou provedor fora resultam em resposta determinística, sem erro para o usuário.
6. Cancelamento: fechar a aba interrompe a chamada ao provedor.
7. Pontos da revisão anterior ainda abertos no módulo de IA:
   - nomes de aparelhos crus nos fatos;
   - turnos `assistant` aceitos do cliente;
   - narração sem reserva própria de orçamento;
   - "medido" checado por resposta e não por número.

## 10. Parecer de homologação

**Apta para homologação isolada (preview), não para produção.**

- O achado crítico de privilégio foi corrigido e coberto por testes. Todas as suítes passam: frontend 45/45 e backend 198/198 duas vezes com MongoDB.
- Coleta e IA integradas sem regressão.
- **Bloqueios para produção:**
  - provisionar administradores por script;
  - validar streaming e cookies no preview da Netlify;
  - medir a SmartThings real com conta de homologação;
  - homologar o provedor com chave e teto de gasto próprios.
- **Riscos aceitos e documentados:**
  - LCP do Dashboard mobile frio, cerca de 7 s em rede lenta simulada;
  - pontos abertos do módulo de IA (§ 9.7).
