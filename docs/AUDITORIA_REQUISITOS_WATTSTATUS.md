# Auditoria de requisitos WattStatus

Roteiro de validação publicado em `docs/CHECKLIST_HOMOLOGACAO_WATTSTATUS.md`. Testes físicos, Netlify publicada e requisito RNF-002 permanecem pendentes até execução nesse ambiente.

Base: `dev_V1` (`d53cb07`). Especificação acadêmica consultada em 22/10/2026. Status indicam comportamento comprovado nesta branch, sem validação em produção ou dispositivo físico.

| ID | Requisito | Status | Evidência no código | Teste e resultado | Limitações |
|---|---|---|---|---|---|
| RF-001 | Cadastrar aparelhos | Parcial | `backend/src/modules/appliances/` | Build backend e criação MongoDB em `mongo-energy.test.cjs` passaram | Falta teste HTTP de todas as entradas inválidas. |
| RF-002 | Editar aparelhos | Parcial | `appliances.service.ts` | Edição e tarifa histórica em `mongo-energy.test.cjs` passaram | Falta suíte completa de API. |
| RF-003 | Calcular consumo estimado | Implementado | `calculation.service.ts`, `src/lib/energy.ts` | `energy.test.mjs`, `tariff.test.cjs` passaram | Estimativa depende dos dados informados. |
| RF-004 | Calcular custo estimado | Implementado | `calculation.service.ts` | `tariff.test.cjs` passou | Não equivale à conta da distribuidora. |
| RF-005 | Tarifa estadual ou manual | Parcial | `ApplianceCalculator.tsx`, `user-settings.routes.ts`, `mongo-db.ts` | Cálculo em `tariff.test.cjs`; tarifa congelada em `mongo-energy.test.cjs` passaram | Cadastro antigo usa referência estadual até edição. |
| RF-006 | Relatórios | Parcial | `ReportsTab.tsx`, `measured.ts` | Agrupamento em `measured.test.mjs` passou | Medição representa apenas intervalos coletados. |
| RF-007 | Dashboard | Parcial | `Dashboard.tsx`, `EnergyHistoryPanel.tsx` | Build, tipos e agrupamento passaram | UX não validada com usuários; tendência medida depende de coleta. |
| RF-008 | Histórico energético | Parcial | `energy-history.ts`, `energy.routes.ts`, `energy-collector.ts`, `mongo-db.ts` | MongoDB isolado, duplicatas, concorrência do coletor, reinício, usuário, aparelho e tarifa passaram | Coleta agendada exige ativação global e individual e validação em Netlify publicada com dispositivo físico; lacunas continuam possíveis. |
| RF-009 | Exportar PDF | Parcial | `report-pdf.ts`, `ReportsTab.tsx` | `report-pdf.test.cjs` passou; páginas renderizadas e inspecionadas | Não houve revisão visual com dados reais ou todos os navegadores. |
| RF-010 | Autenticação | Implementado | `auth.service.ts`, `auth.routes.ts`, `auth-middleware.ts` | Registro, revogação e acesso negado após logout no MongoDB isolado passaram | JWTs antigos sem `jti` exigem novo login. |
| RNF-001 | Interface simples | Não comprovado | Componentes React | Build passou | Falta teste de usabilidade. |
| RNF-002 | Telas em menos de 3 s | Não comprovado | Build Vite | Sem medição representativa | Rotas passaram a carregar sob demanda; tamanho do chunk principal caiu de cerca de 1,12 MB para 346 KB antes de gzip. Falta medição de tempo real. |
| RNF-003 | Segurança e controle de acesso | Parcial | Sessões MongoDB, CSRF, CORS, rotas autenticadas e coletor interno Netlify | Testes com duas contas e MongoDB isolado passaram | Rate limit em memória não é distribuído entre instâncias Netlify. Auditoria npm do frontend ainda aponta 5 vulnerabilidades altas e 3 moderadas na cadeia Tailwind 3; migração para Tailwind 4 requer revisão visual. |
| RNF-004 | Navegadores modernos | Não comprovado | Vite/React | Build passou | Falta matriz Chrome, Firefox, Edge e Safari. |
| RNF-005 | Arquitetura para crescimento | Parcial | Módulos backend e índices MongoDB | Build backend e teste MongoDB passaram | Adaptadores PostgreSQL/locais legados permanecem. |

## Dados energéticos e limites

`energy_samples` guarda amostras imutáveis de `energyMeter.energy` somente quando SmartThings retorna unidade `Wh` ou `kWh` e o usuário consulta status. `Wh` é dividido por 1000. Uma amostra isolada não gera consumo de intervalo. Diferenças entre contadores consecutivos geram intervalos; contador reduzido indica reinicialização e não produz consumo negativo. Amostras repetidas no mesmo minuto com mesmo valor são deduplicadas por `sampleKey`. Leituras iguais posteriores representam intervalo medido de zero. O custo usa tarifa copiada para a amostra final. Alterar potência ou tarifa atual não reescreve amostras.

O agrupamento mensal e diário da interface usa fuso local do navegador. API armazena instantes UTC e recebe limites ISO com offset do navegador. Intervalos sem duas leituras não são preenchidos. Um intervalo que atravessa competências é atribuído ao mês de sua segunda leitura; isso não equivale a medição completa daquele mês. A função agendada Netlify faz coleta por lotes quando ativada globalmente e por usuário. Sua execução em produção e cobertura real ainda exigem homologação.

Os índices novos são criados por `MongoDatabase.init()` sem apagar dados. `energy_samples`: `sampleKey` único, período por usuário/aparelho e série por usuário/provedor/dispositivo. `sessions`: `id` único e TTL por `expiresAt`. `appliances.importKey` único apenas quando presente, preservando registros legados.

## Segurança e segredos

- SmartThings usa cliente novo por requisição e credencial do usuário autenticado. Status e comandos verificam dispositivo. Respostas de erro não expõem token. Importação duplicada é rejeitada.
- Sessões têm identificador `jti` persistido. Logout revoga a sessão; token expirado ou revogado recebe 401. Cookies HTTP-only expiram em 12 horas.
- Mutação autenticada por cookie exige `Origin` aceitável. Produção restringe CORS a `FRONTEND_ORIGIN`; acesso de mesma origem continua permitido. Login e cadastro têm limite adicional de tentativas.
- `backend/.env` foi retirado do índice, mas o commit `9e45baa` contém tipos de segredos `DATABASE_URL`, `JWT_SECRET`, `LG_CLIENT_ID`, `LG_CLIENT_SECRET`, `LG_REFRESH_TOKEN` e `MONGO_URL`. Nenhum valor foi impresso na auditoria. Confirmar se cada valor foi real antes de rotacionar. Criar credenciais substitutas, configurá-las em Netlify e serviços dependentes, validar, então revogar antigas. Trocar `JWT_SECRET` invalida sessões; trocar `SMARTTHINGS_TOKEN_SECRET` sem migração impede decifrar tokens armazenados. Não reescrever histórico sem procedimento coordenado.

## Validação executada

- Backend: 8 testes passaram com MongoDB `mongo:7` isolado em Docker. `npm audit` backend: 0 vulnerabilidades após atualização de dependências. Incluem isolamento entre usuários, deduplicação, contador, reinício, tarifa, sessão e API SmartThings simulada.
- Frontend: 9 testes passaram. PDF longo gerou páginas com orientação consistente; amostra foi renderizada e inspecionada. jsPDF, React Router e Vite foram atualizados. Auditoria npm frontend: 0 críticas, 5 altas e 3 moderadas remanescentes na cadeia Tailwind 3.
- Build frontend/backend, tipos frontend e lint passaram. Lint manteve 11 avisos de Fast Refresh em componentes compartilhados; não são falhas de produção.
- Dispositivo físico, latência de produção, navegadores e deploy não foram validados.

## Referência acadêmica

O Documento de Especificação de outubro de 2026 declara RF-001 a RF-010 como implementados, mas esta matriz usa evidência do código e testes. Referências a `RNF-006` devem ser corrigidas: a lista principal contém apenas RNF-001 a RNF-005. Veja `docs/ALTERACOES_DOCUMENTO_ACADEMICO.md`. O Google Doc não foi alterado.
