# Dashboard 2.0 — segunda etapa (29/10/2026)

## Ambiente real e causa da falha anterior

Partida em `main` no commit `9445b80`. `backend/.env` apontava para `mongodb://127.0.0.1:27017`, sem credenciais, mas não havia servidor escutando nessa porta. O mecanismo do Docker Desktop também retornava erro interno. A falha anterior era indisponibilidade do serviço local; não houve evidência de DNS, TLS, pool ou string de conexão incorreta do aplicativo. Nenhum banco de produção foi acessado.

Um MongoDB 8.2.6 descartável foi iniciado em `127.0.0.1:27017`, com oito contas e aparelhos, imóveis e leituras sintéticos persistidos em `wattstatus_local`. Frontend de produção via Vite preview em `localhost:4173`, backend local em `localhost:4000`. Os testes Mongo usam bancos exclusivos que são removidos por cada teste. Inicialização do Mongo no backend: 596 ms na primeira partida observada, 40 ms na segunda partida aquecida. A API iniciou normalmente. Os índices de `users.email`, `users.emailCanonical`, `auth_sessions`, `appliances.userId`, `properties.userId` e `energy_samples` já eram criados em `MongoDatabase.init()`; não foi encontrada ausência de índice no caminho crítico examinado.

## Como medimos

`artifacts/perf-real-*.json` guarda oito cenários (conta nova, um aparelho, vários aparelhos, múltiplos imóveis, histórico, leituras parciais, atrasadas e integração simulada), cada um com contexto Chrome novo e uma segunda passagem no mesmo contexto após limpar cookies. Não há respostas de API simuladas nesse benchmark. O CSRF, login, sessão e dados vieram do backend e do Mongo local. A integração externa não foi chamada: a conta e os registros da integração são sintéticos.

`Server-Timing` e o evento `auth.login_timing` existem somente com `PERF_DIAGNOSTICS=1` fora de produção. Medem milissegundos com relógio de alta resolução, sem registrar senha, token, cookie ou e-mail. O JSON registra duração, TTFB e fim das chamadas de API; a última rodada também registra o instante em que o DOM do navegador apresentou título, indicador e gráficos. O tempo de clique do Playwright inclui a espera automática do comando e, nesta máquina, por vezes ficou aproximadamente 400 ms acima do instante real observado no DOM. Por isso, os valores de métodos diferentes não são comparados como se fossem iguais.

| Medida local | Baseline (`baseline`, 16 passagens) | Após correção de CSRF (`after3`, 16 passagens) | Build final (`final3`, 16 passagens) |
| --- | ---: | ---: | ---: |
| Chamadas CSRF | 17 | 16 | 16 |
| Login HTTP, mediana | 196 ms | 187 ms | 285 ms |
| Indicador principal após clique, mediana pelo Playwright | 435,5 ms | 417,5 ms | 893 ms* |
| Indicador principal após clique, mediana pelo DOM do Chrome | não coletado | não coletado | 492 ms |
| Gráficos após clique, mediana pelo DOM do Chrome | não coletado | não coletado | 521,5 ms (14 casos com gráfico) |
| Fim das APIs essenciais após clique, mediana | não coletado | não coletado | 481 ms |

\* A espera automática de `click()` inflou a medição externa nessa rodada; o observador no DOM e os horários das respostas mostram a apresentação real antes disso. Houve também uma rodada intermediária com mediana de 879 ms e outra de 411 ms usando a mesma versão anterior, o que demonstra variação forte desta máquina. Inverter a ordem dos cenários moveu o outlier inicial para outro cenário. Não há evidência suficiente para afirmar um ganho duradouro de tempo total de login/dashboard.

Na rodada final, CSRF foi obtido antes do clique em 16 de 16 casos, com uma chamada por login e mediana de 5 ms. `Server-Timing` do login: middleware de segurança 6,69 ms, consulta do usuário 1,28 ms, verificação de senha 175,92 ms, criação de sessão 1,25 ms (medianas). A verificação segura da senha é a maior parcela do servidor; o custo do hash não foi reduzido. O resultado após resposta HTTP inclui atualização do contexto de autenticação, navegação e renderização React; essas etapas não foram cronometradas individualmente. Login HTTP frio e quente na rodada final: medianas de 278,5 e 285 ms, respectivamente. Indicador principal no DOM: 502,5 e 481,5 ms. Não apareceu uma diferença estável atribuível ao cache.

O dashboard faz `auth/me` na validação inicial, `user-settings` para preferências, `appliances` e `properties` para cálculo/escopo, e `energy/history` para a parte medida. As cinco têm função visível; histórico carrega sem bloquear a estimativa. Contas com integração também consultam `analytics/usage` e `integrations/smartthings/usage` depois que os aparelhos indicam integração. IA generativa não é chamada na entrada. A chamada de histórico poderia ser evitada para contas sem integração, mas isso a tornaria sequencial depois de aparelhos e atrasaria a apresentação medida nos demais casos; sem gargalo demonstrado, o fluxo não foi alterado.

Na conta com histórico, 3.600 amostras persistidas e 3.000 no intervalo consultado, `explain("executionStats")` retornou 3.000 chaves e 3.000 documentos examinados para 3.000 documentos retornados, usando `userId_1_capturedAt_1_applianceId_1` (11 ms no plano observado). Dez execuções diretas de `getEnergyHistory` (consulta, busca de predecessores e montagem de intervalos) levaram 27–50 ms e produziram 3.000 intervalos. A API de histórico teve mediana de 17 ms na rodada `after3`; a carga e o tamanho da janela variam entre cenários. Não há indício de varredura completa ou gargalo de consulta no conjunto testado.

O build final gerou `Dashboard` com 34,6 kB (10,8 kB gzip), `ConsumptionTrendChart` com 24,9 kB (7,1 kB gzip) e o pacote compartilhado de gráficos com 382 kB (101,7 kB gzip). Os gráficos são carregados sob demanda após o conteúdo principal. O bundle principal e bibliotecas compartilhadas continuam sendo uma limitação de peso; não foi introduzido 3D no dashboard.

## Auditoria de interface e correções

| Área | Achado com dados reais | Resultado |
| --- | --- | --- |
| Header e filtros | Imóvel, mês e atualização funcionaram; controles de ano tinham setas que avançavam além da lista. | Setas respeitam os extremos da lista. Escolha de imóvel e mês foi validada no navegador; custo muda com o imóvel. |
| Indicadores e origem | Um mês com última leitura antiga parecia ter medição atual. Sem tarifa válida, custo zero podia parecer conhecido. | Selo “Leituras desatualizadas” para mês corrente sem leitura há mais de 24 h. Custo total e por aparelho indica ausência de tarifa ou subtotal parcial. Medido permanece separado do estimado. |
| Gráfico de seis meses | A área é projeção baseada nos aparelhos atuais; barras são leituras, e meses sem barra não têm medição. | Rótulo e legenda preservam essa distinção; tooltip real mostrou mês, 36,0 kWh estimados e 90,0 kWh medidos no cenário de histórico. Eixos e legendas foram inspecionados em desktop e mobile. |
| Distribuição | A rosca anterior ficava ilegível com muitos aparelhos e fatias pequenas. | Barra proporcional e lista dos cinco maiores mais “Outros”, com kWh e porcentagens. Nomes iguais mantêm identificadores distintos. |
| Ranking | Doze linhas ocupavam a página inteira; status genérico “Normal/Crítico” não explicava consumo. | Cinco principais inicialmente, expansão explícita, participação e custo, medição por ID, nome como link para o imóvel/aparelhos. Tarifa desconhecida aparece como tal. |
| Insights | Valores estimados, lacunas e ausência de leituras precisavam permanecer explícitos. | Textos e avisos preservados, sem comparação medida/estimada sem cobertura suficiente. Estado de leitura antiga destacado no indicador. |
| WattStatus AI | Chamada automática prejudicava o caminho crítico. | Continua sob ação do usuário; botão contextual do gráfico abre o assistente. As ações ficam indisponíveis sem escopo quando há vários imóveis. Nenhum serviço generativo foi usado nos testes. |
| Navegação e sidebar | Menu ativo e drawer móvel continuaram legíveis nos tamanhos testados. | Links do ranking, adição de aparelho e integração verificados; nenhuma mudança ampla na navegação. |
| Vazio, erro e parcial | Conta nova sugeria integração cedo; erro de histórico poderia parecer zero medido; textos de intervalo sugeriam apenas diferença de contadores. | Primeiro aparelho é a ação principal, integração é opcional; erro diz que medição está indisponível enquanto a estimativa continua; descrição cobre leituras por intervalo. Leituras parciais e sem tarifa foram capturadas. |

Os cálculos de consumo não foram modificados. Testes existentes confirmam isolamento por ID de aparelhos com nomes iguais, tarifa, propriedades, períodos, fuso horário e separação entre medido e estimado. Um teste novo cobre o reconhecimento de tarifa ausente sem apresentar custo zero como custo conhecido.

## Validação visual e funcional

Capturas antes: `artifacts/dashboard-real-baseline-{empty,many,multi,history,partial,stale}-1440.png`. Capturas finais: `artifacts/dashboard-real-final3-{empty,many,multi,history,partial,stale}-1440.png`. Há capturas `artifacts/dashboard-qa-*.png` para 360, 390, 768, 1024, 1440 e 1920 px, temas claro e escuro, além de erro de histórico e tarifa ausente. `artifacts/dashboard-qa-results.json` e `dashboard-qa-interactions.json` registram as verificações. As dez combinações principais não tiveram erro JavaScript nem largura de documento acima do viewport. Foram exercitados expansão do ranking, troca de imóvel e mês, retorno ao mês atual, atualização, tooltip, explicação do gráfico, link para o aparelho e ação de adicionar aparelho. Um erro de rede foi induzido apenas no teste do estado de erro; o benchmark principal não usou mocks nem falhas induzidas.

Frontend: 47 testes, TypeScript e build passaram. ESLint: zero erros e 13 avisos preexistentes. Backend com `TEST_MONGO_URL` local: 198 testes passaram, zero pulados. Na primeira execução completa, um teste de capacidade com resposta 429 obteve 44 em vez de 45 leituras; passou em 10 repetições isoladas e na segunda execução completa. A falha intermitente não foi reproduzida ou atribuída com segurança a um defeito; o registro permanece como limite da validação. O servidor local e o banco descartável não medem cold start ou rede de produção.

Nenhuma alteração foi feita em onboarding, landing, produção, `README.md` ou `docs/HARDENING_PRODUCAO.md` (estes dois arquivos já estavam modificados pelo usuário).
