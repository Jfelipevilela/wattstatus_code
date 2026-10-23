# Implementação da biblioteca de aparelhos — 23/10/2026

Implementado localmente na branch `feature/add-device`, a partir de `f6be601`. Sem commit, push ou deploy. **Homologação visual, MongoDB real e hardware continuam pendentes; não considerar a entrega validada em produção.**

## 1. Auditoria inicial

Checkout inicialmente limpo. React/TypeScript/Vite, Tailwind/shadcn, Express/Zod/MongoClient, JWT/cookies/CSRF, logs estruturados com requestId e Netlify já existentes. Não havia HANDOFF_CODEX.md no checkout; foi lido integralmente o handoff disponível em Downloads (WATTSTATUS_HANDOFF_CODEX.md). Código atual prevaleceu sobre o documento antigo. A imagem citada no pedido não estava anexada; foram seguidas suas especificações conceituais/textuais, não uma reprodução visual não verificada.

Adicionar aparelho abria ApplianceCalculator em modal, com exemplos locais e cadastro/simulação manual. APIs CRUD já filtravam proprietário. A tarifa é configurável em R$/kWh. SmartThings já possui DeviceIntegration, token individual protegido, discovery/status/comandos e isolamento por conta. Histórico real usa energy_samples, deltas de contadores e tarifas capturadas. Dashboard e relatórios já separam estimado/medido, PDF usa jsPDF. Não foi necessário substituir arquitetura, auth ou integração.

Baseline: lint sem erros (11 avisos existentes), TypeScript e build frontend aprovados; após liberar sockets HTTP locais, backend com 24 aprovados, 0 falhas e 2 testes MongoDB ignorados. Na execução com sandbox, dois testes HTTP falharam por EACCES; não era falha de negócio e não foram mascarados/desativados.

## 2. Arquitetura

Camada de catálogo em backend/src/modules/catalog, schemas Zod, manifesto JSON validado, repository no MongoDatabase e rotas protegidas. ApplianceService resolve referências confiáveis, cria instância e snapshot; regras numéricas permanecem no backend. Frontend reutiliza contextos, API client, modal, cards, manual e padrões existentes. Tipos públicos compartilhados por imports somente de tipo, sem código/segredos backend no bundle.

## 3. Frontend

AddApplianceFlow controla biblioteca (padrão), SmartThings e manual. Busca com debounce/cancelamento; filtros de categoria/tipo/marca; cards de modelos, paginação, seleção explícita e estados carregando/pesquisando/vazio/erro/tentar novamente. DeviceConfigurationPanel mostra origem, região, data, potência editável quando aplicável, horas/dias ou ciclos/mês, ambiente opcional, tarifa e prévia da API. Potência ausente não vira especificação inventada. DeviceConfigurationPanel também permite editar aparelhos de catálogo sem voltar a método incorreto. SmartDeviceDiscovery não envia comandos.

Layout implementado com duas colunas apenas em desktop, uma em telas menores, largura limitada e rolagem no diálogo. Labels, IDs, status/alert, seleção textual além da cor, foco visível e botões de toque foram adicionados no código. Isso **não** substitui teste visual/teclado/mobile real, ainda pendente.

## 4. Biblioteca

Separada de aparelhos particulares. 6 categorias extensíveis e 12 entradas iniciais, marcas/modelos opcionais, genéricos identificados. Busca normalizada por tokens literais (não fuzzy/autocomplete). Filtros exatos; 12 resultados por página, máximo 48. Fonte completa documentada em DEVICE_CATALOG_PBE.md. Sem Elasticsearch, imagens comerciais, scraping ou dependência de serviço externo para pesquisar.

## 5. PBE

Curadoria manual de registros oficiais públicos: uma geladeira Samsung com referência mensal e lavadoras Newmaq 127/220 V com consumo por ciclo distinto. Fonte, região e data de verificação foram armazenadas. Nove perfis genéricos são explicitamente exemplos não oficiais. Não inferimos potência a partir de kWh nem atribuímos dados a modelos de outras regiões. Não foi identificada documentação de API PBE nas fontes consultadas; nenhuma API interna foi utilizada. Estratégias futuras para API/dataset/scraping e ENERGY STAR estão no documento específico.

## 6. MongoDB

Coleção nova device_catalog; índices para ID único, categoria/tipo/marca/modelo, tokens de busca, facets e ordenação. maxTimeMS nas consultas. Seed explícito validado/idempotente e sem exclusões; default insere apenas IDs ausentes, --update-existing é deliberado. Inicialização cria índices como no padrão já existente, mas não importa catálogo automaticamente. Não houve migração de documentos antigos nem modificação de amostras históricas. Banco vazio segue com fallback manual.

## 7. Cálculos

- POWER_TIME: W × horas × dias / 1000, com limites de entrada e zero horas permitido no domínio.
- REFERENCE_MONTHLY: kWh/mês da referência, sem escalar por horas/dias/calendário.
- PER_CYCLE: kWh/ciclo × ciclos inteiros por mês (0–1000); sem conversão semanal implícita.
- LIVE_MEASUREMENT: helper usado pelo histórico real para diferença de contadores válidos e ordenados em intervalo conhecido. Reset não gera consumo negativo. Um contador isolado não é consumo mensal.

A prévia usa API existente e os totais frontend respeitam o método/snapshot. A tarifa permanece configurável. Campos não aplicáveis não são apresentados como potência real zero nos relatórios. Ausência de telemetria preserva a última leitura verificada com seu horário antigo. Atualização do catálogo não recalcula snapshots particulares. Editar projeções não reescreve histórico medido.

## 8. Estimated vs Metered

ESTIMATED é usado nas referências e dados manuais; METERED somente quando o servidor confirma leitura energética da conta autorizada. measurement informa método, tipo acumulado, contador e horário de consulta. Cards priorizam a leitura quando disponível, mas não a somam aos totais mensais estimados nem a chamam de medição mensal/tempo real contínuo. Histórico/PDF mantêm seções separadas. Legado sem metadados recebe fallback de leitura sem migração e sem falsa prova de medição.

## 9. SmartThings

Reutilizados provider, armazenamento e rotas existentes. Novo fluxo verifica configuração, lista dispositivos e consulta status do selecionado. Importar exige token da própria conta e ownership conferido pelo backend; medição enviada pelo cliente não é aceita como verdade. O vínculo não pode ser trocado por PUT. Sem matching automático arriscado. Domínio aceita vínculo de catálogo e integração juntos; uma futura sugestão de matching precisa confirmação explícita. Não foram adicionados conectores, OAuth, comandos ou coleta automática novos.

Falha externa de autenticação continua 424; não derruba sessão WattStatus. Testes mockados cobrem conta desconectada, dispositivos de outra conta, ausência de energia, leitura em Wh, duplicidade e timeout. Dispositivo offline/hardware real e mudança de token no ambiente publicado continuam para staging.

## 10. Manual e legado

Formulário original reutilizado para cadastro/simulação, disponível no topo e após busca vazia/erro. Edição POWER_TIME legada continua no formulário anterior; catálogo/ambiente usa painel que respeita o método. Ajuste pontual evita tratar falha ao salvar preferência de tarifa como falha de cadastro já concluído. Metadados antigos de providers não habilitados são preservados na edição, sem liberar novas importações arbitrárias.

## 11. Segurança — segunda revisão

Mantidos middleware de sessão, CSRF, controle de proprietário e filtros MongoDB por userId. Novas queries validadas, sem operadores/regex arbitrários. Payloads não podem definir fonte oficial, usuário, origem nem METERED. ID de catálogo inexistente dá 404; IDs/provedor/valores inválidos são recusados. Perfil LIVE_MEASUREMENT não é aceito por cadastro/simulação pública. Contadores são lidos no servidor após ownership. importKey continua evitando duplicidade concorrente.

Limites gerais existentes e limite de catálogo 90/min preservam proteção básica; discovery segue limite HTTP geral. Logs acrescentam apenas eventos/contagens/método/ID público de catálogo, herdando requestId, sem busca, ambiente, corpo, tokens ou credenciais. Revisão corrigiu retenção da última leitura em ausência de telemetria, rótulos não aplicáveis e edição de vínculos legados. Não houve varredura de produção, pentest externo nem novos endpoints administrativos públicos. A rota __test__/start existe apenas no fixture local excluído dos entrypoints de produção.

O hook de aparelhos envia X-Wattstatus-User como vínculo de intenção nas mutações: o backend recusa 409 se um formulário pendente pertencer à identidade anterior da aba. Isso não substitui autorização nem permite escolher proprietário; o filtro continua usando somente a sessão autenticada. Cabeçalho opcional mantém compatibilidade com clientes existentes. Teste confirma que a divergência não cria registro.

## 12. LGPD

Catálogo global sem identificação do usuário; vínculo apenas na entidade particular. Ambiente opcional limitado e não logado. Nenhum contato das páginas Inmetro foi importado. Sem rastreador/imagem externa nova. O responsável deve atualizar política sobre ambiente/modelo/telemetria, finalidade, retenção e direitos, além de confirmar base legal. Revisão técnica de minimização/isolamento não é parecer jurídico nem certificação de conformidade integral.

## 13. Testes e verificação

| Comando | Resultado |
| --- | --- |
| npm test | 11 aprovados, 0 falhas; inclui renderização SSR real dos componentes, cálculos, histórico medido e PDF |
| npm test --prefix backend | 30 aprovados, 0 falhas, 3 ignorados por falta de TEST_MONGO_URL; inclui catálogo e regressões existentes |
| npx tsc --noEmit -p tsconfig.app.json | aprovado |
| npm run build --prefix backend | aprovado, inclui funções Netlify |
| npm run lint | 0 erros; 11 avisos Fast Refresh preexistentes |
| npm run build | aprovado |
| npm run catalog:seed --prefix backend | dry-run aprovado, 6 categorias e 12 produtos |
| node scripts/seed-catalog.cjs --apply --local (em backend) | tentativa real local falhou por MongoServerSelectionError; nenhum banco remoto foi usado |

Backend contém teste real novo de seed/índices/snapshot, condicionado a TEST_MONGO_URL local e isolado. Para habilitar no PowerShell, definir `$env:TEST_MONGO_URL = 'mongodb://127.0.0.1:27017'` e executar a suíte backend com MongoDB disponível. Os testes criam e removem somente bancos novos com nomes aleatórios próprios.

Controle visual Windows/Chrome falhou após recuperação; habilidade computer-use foi usada para tentar inspeção, sem conseguir observar a página. Não foram comprovadas interações reais, mobile, temas, foco ou PDF por clique. SSR testa renderização, não substitui E2E. A imagem de referência não foi entregue no contexto desta rodada.

## 14. Inventário

Criados:

- backend/scripts/seed-catalog.cjs
- backend/src/modules/catalog/catalog.types.ts
- backend/src/modules/catalog/catalog.schema.ts
- backend/src/modules/catalog/catalog.seed.ts
- backend/src/modules/catalog/catalog.routes.ts
- backend/src/modules/catalog/data/catalog.json
- backend/src/modules/calculations/consumption.ts
- backend/tests/catalog.test.cjs
- backend/tests/catalog-mongo.test.cjs
- src/components/AddApplianceFlow.tsx
- src/components/DeviceConfigurationPanel.tsx
- src/components/SmartDeviceDiscovery.tsx
- tests/catalog-ui.test.mjs
- docs/DEVICE_CATALOG_PBE.md
- docs/RELATORIO_BIBLIOTECA_APARELHOS.md

Alterados:

- backend/package.json
- backend/src/app.ts
- backend/src/types.ts
- backend/src/storage/mongo-db.ts
- backend/src/modules/appliances/appliances.schema.ts
- backend/src/modules/appliances/appliances.routes.ts
- backend/src/modules/appliances/appliances.service.ts
- backend/src/modules/calculations/calculation.schema.ts
- backend/src/modules/calculations/calculation.service.ts
- backend/src/modules/energy/energy-history.ts
- backend/tests/browser-server.js
- package.json
- src/hooks/useAppliances.ts
- src/lib/energy.ts
- src/components/ApplianceCalculator.tsx
- src/components/ApplianceCard.tsx
- src/components/EditApplianceModal.tsx
- src/components/tabs/AppliancesTab.tsx
- src/components/tabs/ReportsTab.tsx
- tests/energy.test.mjs

Removidos: nenhum. Dependências/lockfiles, autenticação, segredos e configuração de deploy não foram modificados. Prettier foi executado via npm apenas para formatar arquivos da tarefa, sem adicionar dependência ao projeto.

## 15. Ação de banco necessária

Antes de homologar: MongoDB de staging disponível, backup lógico de device_catalog se já existir, variáveis do ambiente correto e permissões de índices/escrita. Validar dry-run e executar `npm run catalog:seed --prefix backend -- --apply`. Para corrigir referências existentes, acrescentar --update-existing após revisão. A documentação PBE explica risco de lote parcial, índices incompatíveis e rollback apenas do catálogo; snapshots e dados particulares não devem ser apagados. Sem seed, a biblioteca fica vazia.

## 16. Limitações

Catálogo pequeno e curado, sem atualização automática, busca fuzzy ou matching IoT. Não inferimos modelos brasileiros por nomes internacionais. MongoDB indisponível localmente e Docker sem daemon: sem comprovação de índices/planos reais, performance/carga ou rollback. Sem hardware SmartThings, navegador visual funcional ou deploy, não se pode garantir critérios de homologação de UI e produção. Persistência de dados novos continua dependendo da configuração MongoDB real do projeto.

## 17. Próximos passos

Importar em staging; executar testes reais de MongoDB e explicar queries; testar busca/seleção/edição/manual pelo navegador, celular/desktop/teclado e temas; conferir históricos/PDF com referências e medições; testar SmartThings autorizado (online/offline, sem energia, timeout e token expirado) sem comandos perigosos. Medir custo das consultas e conexões, limites, HTTPS/IP proxy/headers Netlify. Atualizar política de privacidade. Depois ampliar curadoria e somente então avaliar API/dataset oficial, importadores e matching confirmado; IA, scraping e novos conectores ficam fora desta entrega.
