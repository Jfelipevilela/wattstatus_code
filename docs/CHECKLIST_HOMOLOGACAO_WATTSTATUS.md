# Checklist de homologação WattStatus — 23/10/2026

Preencher em site Netlify separado, banco MongoDB separado e dispositivo real. Não registrar tokens, senhas, cookies ou URIs com credenciais como evidência. Estado inicial dos testes externos: **pendente**. `Resultado observado` deve ser preenchido durante a execução, com horário, ambiente e versão do commit.

## Preparar ambiente isolado

1. Após autorização para publicar, criar **novo site Netlify**, sem trocar domínio, branch publicada ou variáveis do site atual. Vincular o repositório e usar esta branch apenas no novo site. `netlify.toml` já define build, pasta `dist`, funções e redirecionamento `/api/*`.
2. Criar cluster ou banco MongoDB exclusivo de homologação, usuário de banco com acesso apenas a ele e política de rede adequada. Registrar apenas nome lógico do banco e identificador do ambiente. Não copiar dados nem segredos de produção.
3. Definir variáveis do **novo site**, com escopo de Functions quando forem segredos: `MONGO_URL`, `MONGO_DB_NAME`, `JWT_SECRET`, `SMARTTHINGS_TOKEN_SECRET`, `APP_ORIGINS`, `TRUST_PROXY_HOPS=0`, `NODE_ENV=production`. Usar valores exclusivos. `APP_ORIGINS` deve conter a origem exata do novo site, sem barra final. Configurar `ENERGY_COLLECTION_ENABLED=false` no primeiro deploy; `ENERGY_COLLECTION_INTERVAL_MINUTES=30` e `ENERGY_COLLECTION_BATCH_SIZE=2`. `VITE_API_BASE_URL` pode ficar vazio para chamadas da mesma origem; nunca colocar segredos em `VITE_*`.
4. Exigir conta de teste própria no WattStatus e token SmartThings de homologação com permissões mínimas. Habilitar coleta global somente após conferir login, status e banco. A opção individual permanece desativada por padrão.
5. Conferir no painel Netlify o build, função `api`, função `collect-energy` com selo `Scheduled`, redirecionamento e logs. Os [Deploy Previews não executam funções agendadas automaticamente](https://docs.netlify.com/build/functions/scheduled-functions/). Para teste manual em Deploy Preview, abrir a função desse deploy em **Cloud compute > Functions > collect-energy > Run now**. Não há URL HTTP pública para invocá-la. Com Netlify Dev local, usar `netlify functions:invoke collect-energy`, que não simula o agendamento automático.
6. Conferir `GET /api/health` e login, depois ativar coleta global e individual. Reverter `ENERGY_COLLECTION_ENABLED=false` para encerrar o ensaio. Examinar métricas e logs sem exportar credenciais. Publicação e mudança de variáveis dependem de autorização do usuário.

Variáveis da interface são incorporadas ao bundle no build; variáveis de Functions são lidas em execução. Valores por contexto no mesmo site podem ser definidos no [painel Netlify](https://docs.netlify.com/build/environment-variables/get-started/), mas o site separado reduz risco de atingir produção. Se usar Deploy Preview em vez de site separado, configurar todos os valores do contexto Preview e `APP_ORIGINS` exato daquele preview; confirmar cookies, CORS e proteção de origem antes do teste.

## Roteiro verificável

Em cada linha, registrar `aprovado`, `reprovado` ou `pendente`. Não aprovar leitura de kWh para dispositivo sem `energyMeter`.

| Item | Procedimento | Resultado esperado | Resultado observado | Status | Evidência |
|---|---|---|---|---|---|
| Isolamento Netlify | Conferir URL, site ID, branch e domínio do site de homologação | Site e domínio distintos da produção | A preencher | pendente | Captura das configurações sem segredos |
| Isolamento MongoDB | Conferir banco, usuário e índices em cluster de homologação | Nenhum dado ou usuário de produção | A preencher | pendente | Nome lógico, índices e contagens |
| Saúde e autenticação | Abrir `/api/health`, registrar conta de teste e fazer login | Saúde 200; sessão válida; origem permitida | A preencher | pendente | Códigos HTTP e horário, sem token |
| Conexão SmartThings | Salvar token da conta de teste pela interface | Integração configurada só para usuário A | A preencher | pendente | Indicador `hasToken`, sem valor |
| Listagem | Abrir página SmartThings | Dispositivos da conta A aparecem; nenhum da conta B | A preencher | pendente | Captura sem IDs sensíveis |
| Importação | Importar dispositivo com potência e tarifa válidas | Aparelho cadastrado uma vez; duplicata rejeitada | A preencher | pendente | Registro mascarado e código HTTP |
| Status | Consultar status do dispositivo | Estado e capacidades coerentes com app Samsung | A preencher | pendente | Horário e capacidades |
| Comando suportado | Enviar comando reversível permitido, depois restaurar estado | Mudança confirmada no dispositivo; erro seguro em falha | A preencher | pendente | Comando, resposta e estado final |
| Energia acumulada | Em dispositivo `energyMeter`, ler `Wh` ou `kWh` duas vezes com consumo real entre leituras | Duas amostras e intervalo calculado por diferença; primeira leitura só linha de base | A preencher | pendente | Valores arredondados, unidades e horários |
| Sem `energyMeter` | Consultar dispositivo incompatível | Nenhuma leitura kWh criada; teste de kWh fica não aplicável | A preencher | pendente | Capacidades e contagem de amostras |
| Persistência | Consultar `energy_samples` do banco de homologação | Duas amostras do usuário/dispositivo, sem duplicata no mesmo minuto e valor | A preencher | pendente | Consulta com IDs mascarados |
| Dashboard | Abrir mês da medição e mês sem leituras | Medido separado de estimado; ausência e lacunas declaradas | A preencher | pendente | Capturas e mês |
| Histórico | Consultar API e interface por período e aparelho | Intervalos só do usuário; contadores reiniciados não geram consumo negativo | A preencher | pendente | Resumo de resposta sem token |
| Relatório e PDF | Gerar relatório mensal com e sem medição | Totais separados, tarifa, origem, páginas legíveis; sem dados inventados | A preencher | pendente | PDF de teste sem dados pessoais |
| Coleta programada | Habilitar global + usuário; usar Run now; repetir imediatamente e depois de intervalo | Primeiro claim único; repetição respeita `nextAt`; status e contagens nos logs | A preencher | pendente | Métrica da função e resumo do log |
| Falha e backoff | Simular indisponibilidade temporária com conta de teste, sem afetar produção | Falha registrada sem credenciais; tentativa seguinte respeita atraso | A preencher | pendente | Contagens, horário e `nextAt` mascarado |
| Revogação | Remover token SmartThings e repetir consulta/coleta | API bloqueia nova leitura; coleta ignora integração sem token | A preencher | pendente | Códigos e contagem de amostras |
| Dois usuários | Repetir listagem, histórico e token com usuário B | B não acessa token, aparelhos ou amostras de A | A preencher | pendente | Códigos e contagens anonimizadas |
| Desativação | Desativar coleta do usuário e global; usar Run now | Nenhum novo claim ou amostra após chamadas em curso | A preencher | pendente | Contagens e horários |

## Medir desempenho no site publicado

Usar commit, navegador/versão, dispositivo, sistema, região, tipo de rede, número de aparelhos e amostras, cache frio/quente, data e horário em cada ensaio. Executar 5 repetições por cenário; registrar mediana, p95 quando houver amostra suficiente, máximo e falhas. Ferramentas: Chrome DevTools Network/Performance, Lighthouse para navegação inicial, Netlify Function Metrics/logs e MongoDB `explain('executionStats')`. Não colocar token ou URL Mongo nos registros.

| Cenário | Procedimento e métrica | Resultado observado | Status | Evidência |
|---|---|---|---|---|
| Carregamento inicial | Navegação anônima com cache frio; medir LCP, JS transferido e tempo até tela utilizável | A preencher | pendente | Export HAR sanitizado, captura Lighthouse |
| Login | Enviar conta de teste; medir duração do POST e navegação até dashboard | A preencher | pendente | Network e logs sem credenciais |
| Dashboard | Abrir com 0, 10 e 50 aparelhos, 0/200/2000 amostras; medir render, chamadas e LCP | A preencher | pendente | Trace, tamanhos, contagens |
| Histórico | Medir GET `/api/energy/history` para 1 e 12 meses, com e sem filtro de aparelho | A preencher | pendente | Tempos HTTP e MongoDB `explain` |
| Relatórios e PDF | Gerar mês vazio e mês com 50 aparelhos; medir cálculo e geração, abrir todas as páginas | A preencher | pendente | Tempo, tamanho e captura do PDF |
| SmartThings | Medir listagem, status e comando com dispositivo real; observar 429/503 | A preencher | pendente | Network e Function Metrics |
| Coletor | Run now com 0, 1 e 2 aparelhos; medir duração, sucesso, falhas e uso mensal | A preencher | pendente | Function Metrics e contagens |

RNF-002, telas abaixo de 3 segundos, permanece **pendente** até medição publicada com critério de rede e dispositivo definido. Benchmark local MongoDB não substitui navegação real.

## Rotação manual de credenciais históricas

Commit `9e45baa` contém tipos `JWT_SECRET`, `LG_CLIENT_ID`, `LG_CLIENT_SECRET`, `LG_REFRESH_TOKEN`, `DATABASE_URL` e `MONGO_URL`; valores não devem entrar em documentação. Revisar se eram reais e a quais ambientes davam acesso. Para cada integração, criar credencial substituta no provedor, configurar ambiente afetado, validar, revogar antiga e registrar data/responsável sem valor. Troca de `JWT_SECRET` encerra sessões existentes. `SMARTTHINGS_TOKEN_SECRET` cifra tokens atuais: se houver troca, planejar migração segura ou reconexão dos usuários. Não reescrever Git sem autorização. Confirmar `backend/.env` ignorado antes do push.

## Gate de revisão

- [ ] Comparar commits locais com origem e revisar diff completo.
- [ ] Confirmar árvore limpa e ausência de segredos em arquivos novos.
- [ ] Rodar testes, builds, TypeScript, lint e `npm audit --json` em frontend e backend.
- [ ] Configurar site e MongoDB isolados após autorização; completar tabela acima.
- [ ] Revisar 8 alertas de build Tailwind 3 e aprovar risco ou planejar migração separada.
- [ ] Rotacionar credenciais históricas válidas; registrar execução sem valores.
- [ ] Aprovar merge/deploy somente após homologação física e métricas publicadas.
