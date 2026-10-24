# Benchmark de performance — WattStatus

Data: 2026-10-24. Branch `feature/living-energy-3d`.

Todos os números abaixo foram medidos em laboratório local. Nenhum teste rodou contra produção ou contra a API real da SmartThings. Nenhum valor foi estimado ou inventado. Quando não há medição, a tabela diz "não medido".

## Ambiente e método

- **Servidor:** `scripts/perf/bench-server.cjs` sobe o app Express real com o driver MongoDB real. Ele usa um banco descartável (`wattstatus_perf_<8hex>`) no MongoDB 7 local (`docker wattstatus-local-mongo`, 127.0.0.1:27017) e apaga o banco ao sair.
- **Dados sintéticos:** 2 usuários; 1 imóvel com 20 ambientes e 40 aparelhos por usuário; 6 aparelhos medidos com 30 dias de leituras por hora.
- **Arquivos estáticos:** são servidos antes da API, como a CDN da Netlify faz. Assim, o rate limit da API não conta assets.
- **API:** `scripts/perf/api-bench.mjs` mede latência p50 e p95 sequencial com sessão autenticada. Também conta comandos MongoDB por requisição, via command monitoring, e roda um teste de carga controlado: 8 sessões, mesmo IP, 30 s.
- **Navegador:** `scripts/perf/measure.mjs` usa Chrome headless via CDP, sem dependências novas.
  - Mede LCP, CLS, FCP, TBT aproximado (long tasks acima de 50 ms), JS transferido, requisições, heap e draw calls do WebGL.
  - Perfil desktop: 1440×900.
  - Perfil mobile: 390×844, DPR 3, CPU 4× mais lenta e rede próxima de Slow 4G.
  - Cada carga roda 3 vezes; a tabela mostra a mediana.
- **Execução:** `node scripts/perf/run.mjs --label=<nome>` faz o build, sobe o servidor e grava `scripts/perf/results/<nome>-*.json`.
- **Limitações:**
  - O WebGL do Chrome headless roda em SwiftShader (renderização por software). FPS e tempo de frame do 3D não representam uma GPU real.
  - O servidor local não comprime respostas. A Netlify pode comprimir as respostas das functions; isso não foi verificado aqui.
  - Rede local: o TTFB não inclui a latência real até a Netlify nem o cold start da function.

## Resultados — API (p50/p95 em ms, mesmo servidor e dados)

| Endpoint | Antes p50 / p95 | Depois p50 / p95 | Comandos Mongo antes → depois |
|---|---|---|---|
| `GET /api/auth/me` | 27,5 / 36,5 | 10,1 / 206,8* | 4 → 5 |
| `GET /api/properties` | 39,9 / 70,7 | 14,3 / 25,8 | 7 → 7 |
| `GET /api/appliances` | 59,2 / 87,0 | 15,3 / 31,7 | 7 → 7 |
| `GET /api/user-settings` | 25,7 / 50,2 | 8,0 / 13,4 | 4 → 5 |
| `GET /api/energy/history` (30 dias) | 206 / 251,6 | 89,2 / 111,5 | 15 → 16 |
| `GET /api/properties/:id/floors` | 24,6 / 37,6 | 11,0 / 16,2 | 5 → 6 |
| `GET /api/properties/:id/rooms` | 27,5 / 46,4 | 11,8 / 202,5* | 5 → 6 |
| `GET /api/properties/:id/energy` | 184 / 264,8 | 90,2 / 114,3 | 16 → 17 |
| `GET /api/ai/insights` | 1601,1 / 1699,1 | 107,3 / 146,7 | 29 → 29 |

\* Uma amostra isolada em 40. Os demais percentis do mesmo endpoint ficaram baixos. Provável ruído (GC ou agendador do Windows); não confirmado.

O endpoint `/api/ai/insights` vem do módulo de IA (commit `e0dc816`). Ele foi medido antes e depois da correção com 15 amostras (`ai-insights-*-api-r20.json`).

Autenticação passou a usar mais um comando Mongo por requisição, porque o rate limit agora tem dois contadores: sessão e IP. Mesmo assim, a latência caiu.

## Resultados — carga controlada (8 sessões, mesmo IP, 30 s)

| Métrica | Antes | Depois |
|---|---|---|
| Requisições | 570 | 595 |
| 200 | 120 | 595 |
| 429 | 450 (79%) | 0 |
| p50 / p95 / p99 (ms) | 11,1 / 251,3 / 1086,6 | 32,7 / 152,2 / 538,7 |

Antes, o p50 era menor porque 79% das respostas eram 429 rápidos, sem trabalho real.

## Resultados — navegador desktop (mediana de 3)

"Utilizável" é o tempo até a rede ficar ociosa depois da navegação.

| Rota | LCP antes → depois (ms) | CLS antes → depois | TBT antes → depois (ms) | Utilizável antes → depois (ms) |
|---|---|---|---|---|
| Home (frio) | 452 → 264 | 0 → 0 | 0 → 0 | 322 → 215 |
| Login (frio) | 272 → 180 | 0 → 0 | 0 → 0 | 222 → 149 |
| Dashboard (frio) | 360 → 232 | 0,0234 → 0,0278 | 107 → 31 | 590 → 501 |
| Dashboard (quente) | não capturado → 156 | 0 → 0,0278 | 96 → 0 | 559 → 440 |
| Imóveis (frio) | 540 → 164 | 0 → 0,0001 | 0 → 0 | 626 → 268 |
| Imóvel 3D (frio) | 296 → 164 | 0 → 0,0001 | 91 → 20 | 507 → 293 |
| Aparelhos (frio) | 520 → 228 | 0 → 0 | 0 → 0 | 269 → 159 |
| Relatórios (frio) | 436 → 260 | 0,2909 → 0,0015 | 0 → 0 | 559 → 337 |
| Calculadora (frio) | 328 → 164 | 0,0029 → 0,0029 | 0 → 0 | 288 → 112 |
| SmartThings (frio) | 428 → 228 | 0 → 0 | 0 → 0 | 360 → 199 |

Fontes dos dados:
- Dashboard e Relatórios "depois": `after-fix-desktop-dashboard-reports-r20.json`, medido após as correções de insights e CLS.
- CLS de Relatórios "depois": `after-fix2-desktop-reports-r1.json`, 1 execução.
- Demais rotas: `after-browser-desktop-r20.json`.

JS transferido por rota no carregamento frio:
- Imóvel 3D: 1785 → 1414 KB (Recharts saiu da carga inicial da página).
- Demais rotas: estáveis, de +5 a +15 KB por código novo de outros agentes.
- JS inicial (entry + modulepreload): cerca de 340 KB antes; 337,5 KB depois (112 KB gzip).

## Resultados — navegação interna desktop (SPA, ms / chamadas de API)

| Passo | Antes | Depois |
|---|---|---|
| Dashboard → Imóveis | 455 / 3 | 188 / 1 |
| → Imóvel | 694 / 5 | 152 / 3 |
| → Aparelhos | 320 / 1 | 18 / 0 |
| → Dashboard | 375 / 5 | 31 / 0 |
| → Imóveis | 311 / 3 | 61 / 0 |
| → Relatórios | 361 / 6 | 125 / 2 |
| → Dashboard | 551 / 5 | 33 / 0 |

Depois, os dados ficam em cache por 30 a 60 s e são reaproveitados entre páginas. As 2 chamadas de Relatórios são eventos de telemetria (`POST /api/reports/events`).

## Resultados — mobile (390 px, DPR 3, CPU 4×, rede próxima de Slow 4G; mediana de 3)

"Depois" mediu só rotas 2D (`after-browser-mobile-r20-2d.json`). 3D e memória no mobile não foram medidos depois, por falta de memória livre na máquina (2 GB).

| Rota | LCP antes → depois (ms) | CLS antes → depois | TBT antes → depois (ms) |
|---|---|---|---|
| Home (frio) | 4136 → 4352 | 0 → 0 | 207 → 3 |
| Home (quente) | 1076 → 512 | 0 → 0 | 30 → 0 |
| Login (frio) | 3836 → 3280 | 0 → 0 | 78 → 0 |
| Dashboard (frio) | 3764 → 6812 | 0 → 0 | 981 → 1358 |
| Dashboard (quente) | 864 → 732 | 0 → 0 | 1652 → 474 |
| Imóveis (quente) | 1368 → 632 | 0,0004 → 0,0002 | 370 → 51 |
| Aparelhos (quente) | 920 → 1208 | 0 → 0 | 66 → 219 |
| Relatórios (frio) | 4536 → 5004 | 0,1414 → 0 | 138 → 144 |
| Relatórios (quente) | 1104 → 1028 | 0,1414 → 0 | 494 → 93 |

Dashboard mobile frio piorou na medição: a transferência foi de 1062 KB antes para 2735 KB depois.
- Depois, o histórico de energia (cerca de 1,6 MB, sem compressão no servidor local) terminou de baixar dentro da janela medida.
- Antes, a medição terminou antes de esse download acabar.
- Por isso, os dois números não medem a mesma coisa. Mesmo assim, o tamanho do histórico é o maior gargalo restante no mobile.

## Resultados — 3D e memória (desktop)

| Métrica | Antes | Depois |
|---|---|---|
| FPS durante órbita (SwiftShader) | 59,9 | 59,9 |
| Draw calls por frame | 164 | 204 |
| Triângulos por frame | 3673 | 4559 |
| Draw calls com a cena parada (2 s) | 0 | 0 |
| Heap após GC, 20 ciclos 2D↔3D | 19,7 → 19,69 MB | 26,32 → 28,14 MB |

Os dois lados não são comparáveis: entre as medições, a maquete ganhou móveis (commits `4a75ead`, `b456a92`). O heap depois cresce menos a cada ciclo (+1,12, +0,55, +0,11, +0,04 MB). Isso não prova vazamento; só uma medição mais longa confirmaria.

## Tabela consolidada

| Área | Antes | Depois | Melhoria | Como foi medido |
|---|---|---|---|---|
| 429 com 8 usuários no mesmo IP | 450 de 570 (79%) | 0 de 595 | Elimina 429 legítimo | api-bench, carga 30 s |
| Latência sob carga p95 / p99 | 251 / 1087 ms | 152 / 539 ms | −39% / −50% | api-bench, carga 30 s |
| `/api/appliances` p50 | 59,2 ms | 15,3 ms | −74% | api-bench, 40 amostras |
| `/api/energy/history` p50 | 206 ms | 89,2 ms | −57% | api-bench, 40 amostras |
| `/api/ai/insights` p50 | 1601 ms | 107 ms | −93% | api-bench, 15 amostras |
| Dashboard desktop, utilizável (frio) | 590 ms | 501 ms | −15% | measure.mjs, mediana de 3 |
| Relatórios CLS (desktop) | 0,2909 | 0,0015 | −99% | measure.mjs (layout-shift) |
| Relatórios CLS (mobile) | 0,1414 | 0 | −100% | measure.mjs, mobile |
| Navegação interna, chamadas de API (7 passos) | 28 | 6 | −79% | measure.mjs, SPA |
| Imóvel 3D, JS (frio) | 1785 KB | 1414 KB | −21% | measure.mjs |
| Imóvel 3D, TBT (frio) | 91 ms | 20 ms | −78% | measure.mjs |
| Imóveis LCP (frio) | 540 ms | 164 ms | −70% | measure.mjs |
| JS inicial | ~340 KB | 337,5 KB (112 KB gzip) | Estável | build Vite + modulepreload |
| Dashboard mobile (frio), LCP | 3764 ms | 6812 ms | Não comparável (ver acima) | measure.mjs, mobile |
| Memória 3D | 19,7 MB estável | 26,3 → 28,1 MB | Não comparável (cena mudou) | measure.mjs, 20 ciclos |
| Cold start da function na Netlify | não medido | não medido | — | exige deploy; não autorizado |
