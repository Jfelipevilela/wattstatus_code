# Integração e homologação — WattStatus AI fase 3 + Performance fase 3

Data: 2026-10-24. Worktree `C:\dev\wattstatus_integration`, branch local `feature/wattstatus-integration`. Sem push, merge nas branches originais ou deploy.

## 1. Grafo final de commits

Base: `c7bc152` (HEAD de `feature/living-energy-3d`). As duas branches de fase 3 saem desse mesmo commit, então `df844f5`, `533ab2e` e `e0dc816` já estavam nas duas, e não foram reaplicados.

```
* (integração) Refuse streams without a client address and oversized bodies early
* (integração) Test Set-Cookie headers and the body limit in the streaming adapter
* 6d97c2c      Refresh AI plan progress after energy-related changes            (integração)
* d5f6721 <- b659dd6 Add phase 3 benchmarks, stream check and homologation report
* 82dc783 <- dd47e7a Run backend test files two at a time
* e87a5f3 <- ca69002 Allocate less per frame in the furniture assembly animation
* eee4f94 <- 62dccb9 Hold the report summary's space while it loads
* 55f5249 <- b2d14ca Find opted-in users before scanning appliances for collection
* d8c6765 <- bcc3e6d Add a streaming Netlify function for server-sent events
* b2ae0ef <- 50828ce Wait at least the server's Retry-After before retrying a query
* bcafbbb <- 8116445 Key cached data by user and refresh what depends on appliances
* 01f2f46 <- ab837fe Parse each instant once in the columns energy format
* 48cf471 <- 7af2c1a WattStatus AI phase 3 frontend: investigation, plans and alerts views
* c85e04a <- 17981e1 WattStatus AI phase 3 backend: investigations, savings plans, alerts
* c7bc152 WattStatus AI phase 2 frontend (base)
```

Ordem: IA primeiro, depois performance, cada uma na ordem original. Cherry-pick sem squash. Os commits originais não foram alterados.

## 2. Alterações incorporadas

- IA fase 3: investigações multietapas, planos de economia, alertas, ferramentas determinísticas (`ai.tools.ts`), agendador (ainda não ligado).
- Performance fase 3: codec em colunas, chaves de cache por usuário com invalidação, `Retry-After`, function de streaming, coleta agendada, skeleton em Relatórios, alocação no 3D, concorrência dos testes.
- Ajustes de integração (3 commits novos, fora de `backend/src/modules/ai/**`):
  - `src/lib/cache-keys.ts`: mudar aparelho, tarifa de aparelho ou de imóvel, ambiente ou imóvel agora também invalida `["wattai","plan",id]`. O progresso do plano é recalculado do snapshot atual a cada leitura (`GET /api/ai/plans/:id`), então ficaria desatualizado. A lista de planos e os alertas são registros salvos e não são invalidados.
  - `api-stream.ts`: sem `context.ip`, responde 503. O rate limit é por endereço; um endereço padrão compartilhado juntaria todos esses pedidos num balde só.
  - `streaming-adapter.ts`: recusa `Content-Length` acima de 256 KB antes de ler o corpo; 413 com JSON.
  - Testes novos: invalidação de planos, `Set-Cookie` múltiplo e 413 no adaptador.

## 3. Conflitos encontrados

Nenhum conflito textual: as duas branches não têm arquivo em comum (25 arquivos da IA, 40 da performance).

Conflitos semânticos encontrados na revisão:
1. Novas queries da IA (`["wattai","plan",id]`, `plans`, `alerts`) não estavam na invalidação de performance.
2. Comentário de `cache-keys.ts` dizia que todas as chaves têm o usuário; as chaves `["wattai",…]` não têm.

## 4. Resoluções

1. Invalidação do progresso do plano adicionada em `refreshAfterApplianceChange` (e, por consequência, em `refreshAfterPlaceChange`), com teste.
2. Comentário corrigido. As chaves da IA continuam protegidas pelo `queryClient.clear()` na troca de usuário (`useAuth`). Incluir o usuário nessas chaves é decisão do agente de IA (arquivos `src/components/wattai/**`).

Tarifa da preferência do usuário (`/api/user-settings`): não entra no cálculo da IA (`applianceRate` usa aparelho, estado e imóvel), só preenche o formulário de novo aparelho. Por isso não precisa invalidar a IA.

## 5. Resultado das suítes (execução nova, versão integrada)

| Suíte | Resultado |
|---|---|
| TypeScript frontend (`tsconfig.app.json`) | sem erros |
| TypeScript backend (`tsconfig.json`, `tsconfig.functions.json`) | sem erros |
| ESLint | 0 erros, 13 avisos (componentes ui, hooks; 1 em `backend/dist` gerado) |
| Build frontend e backend | ok |
| Testes frontend | 45/45 |
| Testes backend com MongoDB local isolado | 145/145 |

Os 145 do backend incluem: IA (engine, guard, fases 2 e 3, avaliação, rotas sobre MongoDB com orçamento e posse), isolamento entre usuários (HTTP, propriedades, SmartThings, energia), rate limit, histórico compacto sobre MongoDB real, coleta agendada (250 aparelhos sem opt-in + 1 com), relatórios e streaming.

Navegação real no Chrome (desktop e mobile, 5 execuções por página, cache frio e quente) e 3D: ver item 6. Nenhum 429.

## 6. Performance integrada

Ambiente: build de produção, servidor isolado (`bench-server.cjs`, 20 ambientes, banco descartável `wattstatus_perf_*`, apagado ao fim). A máquina **não estava ociosa**: carga de CPU de 7% a 48% durante a medição, com 57 processos node/chrome de outras sessões. Os números abaixo são da versão integrada nesse ambiente; não são comparação antes/depois.

Dados brutos: `scripts/perf/results/int-*.json`.

**API (p50 / p95 ms, 40 amostras sequenciais):**

| Endpoint | p50 | p95 | KB | Comandos Mongo (1ª chamada) |
|---|---|---|---|---|
| /api/auth/me | 10,1 | 15,8 | 0,1 | 5 |
| /api/appliances | 14,7 | 22,8 | 20,6 | 7 |
| /api/energy/history | 95,7 | 138,3 | 1622,7 | 16 |
| /api/energy/history?format=columns | 88,3 | 122,3 | 270,4 | 16 |
| /api/properties/:id/energy | 94,7 | 118,8 | 1622,8 | 17 |
| /api/ai/insights | 112,9 | 140,1 | 8,1 | 39 |

`/api/ai/insights`: 16 dos 39 comandos são `createIndexes` das 7 coleções da IA, uma vez por processo (cold start da function). Carga de 8 usuários por 20 s: 390 requisições, todas 200, p95 180 ms.

**Navegador (mediana de 5):**

| Página | Desktop LCP frio/quente | Mobile LCP frio/quente | CLS desktop / mobile |
|---|---|---|---|
| Dashboard | 220 / 144 ms | 7044 / 944 ms | 0,0278 / 0 |
| Relatórios | 348 / 220 ms | 5604 / 1728 ms | 0 / 0,0364 |
| Imóvel 3D | 164 / 124 ms | 5404 / 1204 ms | 0,0001 / 0,0001 |

- Dashboard mobile frio continua o pior caso: LCP 7,0 s, TBT 1760 ms, 946 KB de JS, 8 chamadas de API. Hipótese (não medida isoladamente): JS da rota + histórico em rede lenta. Lazy dos gráficos não foi reintroduzido (sem ganho no A/B anterior).
- CLS do Dashboard desktop 0,0278: barra de filtros muda de altura (108 → 56 px). Abaixo do limite "bom" de 0,1; não corrigido.
- 3D desktop: 115 draw calls, 59,9 FPS na órbita (SwiftShader), 0 draw calls parado. Mobile: 108 draw calls, frame p95 216,7 ms.
- Memória em 20 ciclos 2D↔3D: desktop 33,8 → 25,2 MB após GC; mobile 20,5 → 22,6 MB, incrementos decrescentes. Sem sinal de vazamento.

Medido: tudo acima. Hipóteses: causa do LCP mobile do Dashboard; ganho em GPU real.

## 7. Streaming

Function `api-stream` (`config.path = "/api/ai/chat/stream"`), mesmo app Express.

Validado localmente (`scripts/perf/stream-check.cjs`, login, CSRF e Mongo reais): adaptador novo entrega 4 blocos separados (941, 965, 978, 984 ms, 1ª chamada inclui init do app); `serverless-http` entrega 1 corpo. Testes: entrega progressiva, cancelamento (`close` chega à rota), 401/403 sem CSRF iguais ao app, `Set-Cookie` múltiplo, 413, sem IP = 503. Provedor generativo desligado: o chat continua respondendo com o motor determinístico (teste "streaming sends stages then one validated response" roda sem provedor).

Checklist do deploy preview (não executado, precisa de autorização):
1. `POST /api/ai/chat/stream` é atendido por `api-stream` e não pelo redirect `/api/*` (ver logs da function ou header `x-nf-function-name`, se existir).
2. Eventos chegam separados no navegador (DevTools > Network > EventStream).
3. Cookie de sessão e CSRF funcionam; sem cookie = 401; sem CSRF = 403.
4. `context.ip` vem preenchido (sem ele, 503); confirmar `TRUST_PROXY_HOPS` para a cadeia da Netlify.
5. Tempo máximo da function no plano contratado vs pior caso do chat com provedor.
6. CDN não armazena nem agrupa o stream (`Cache-Control: no-cache, no-transform`).
7. Fechar a aba no meio cancela a chamada ao provedor (custo).
8. Cold start: medir a 1ª chamada (init + `createIndexes`).
9. Provedor desligado (`AI_PROVIDER` ausente): resposta determinística, sem erro.

## 8. Rate limit

Por sessão 300/min, teto por IP autenticado 1200/min, anônimo 120/min; 429 com `Retry-After`. Cliente espera pelo menos o `Retry-After` (até 30 s) e não faz logout em 429/503. Na carga integrada: 0 × 429. Function de streaming usa os mesmos limitadores.

## 9. Coleta agendada

`claimEnergyCollection` busca primeiro os usuários com opt-in e só depois os aparelhos deles; não grava configurações por aparelho. Teste com MongoDB real passou na integração. Agendador de alertas da IA: exige consentimento, entrega desligada por padrão, ainda não ligado a um cron.

## 10. Pendências de produção

Revisão de segurança (somente leitura) da versão integrada. Sem achado crítico. Isolamento entre usuários, ferramentas da IA somente leitura, nenhum comando SmartThings pela IA, CSRF e auth preservados no streaming: ok.

Para o agente de IA (`backend/src/modules/ai/**`, `src/components/wattai/**`; não alterados aqui):
1. Nomes de aparelhos entram crus nos fatos enviados ao modelo (`ai.tools.ts` 63, 85, 97, 112; `ai.prompts.ts` 16). Sugestão: aplicar `safeName` e delimitar os fatos como dados.
2. Histórico do cliente aceita turnos `assistant` forjados (`ai.schemas.ts` 31-34). Sugestão: aceitar só turnos do usuário ou reconstruir do servidor.
3. Orçamento: a narração não reserva chamada quando houve ferramenta (`ai.orchestrator.ts` 961), então o limite diário efetivo pode dobrar. Teto em USD desligado por padrão e falha aberta (`ai.routes.ts` 107).
4. Guard: "medido" é checado por resposta, não por número (`ai.orchestrator.ts` 986, `ai.guard.ts` 198); aceita inteiros pequenos sem fato e ignora a unidade (`ai.guard.ts` 171-176).
5. Agendador sem limite de tempo por execução; definir antes de ligar.
6. Chaves `["wattai",…]` sem usuário; hoje protegidas pelo `clear()` na troca de usuário.

Outras:
- Validar streaming no deploy preview (item 7).
- Dashboard mobile frio (LCP 7 s): medir numa máquina ociosa ou aparelho real antes de mudar estrutura.
- Repetir benchmarks numa máquina realmente ociosa; esta rodada teve carga de outras sessões.
- Bancos `wattstatus_test_*` e `wattstatus_ai_test_*` no Mongo local são de outras sessões; não foram apagados.
