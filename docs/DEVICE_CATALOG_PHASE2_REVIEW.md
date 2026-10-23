# Revisão do prompt fase 2

## Resultado

O trabalho anterior estava incompleto após a interrupção da ferramenta. Esta revisão completou o caminho executável de importação, persistência, métodos de referência, telas, matching, contratos e documentação. Não afirma homologação de MongoDB real, dispositivos físicos, browser E2E ou escala de produção.

## Matriz de requisitos

| Itens do prompt | Resultado no código |
| --- | --- |
| 1–3: continuação/auditoria | feature/add-device preservada, sem recriar biblioteca ou SmartThings. Trabalho anterior não commitado foi mantido. |
| 4–13: modelo energético | REFERENCE_PERIOD DAY/MONTH/YEAR com referência original e média mensal identificada; legado mensal compatível, potência/standby separados, ciclo mensal, telemetria real fora de estimativas. |
| 14, 23: proveniência e prioridade | URLs por métrica; valores complementares não são atribuídos indiscriminadamente ao PBE. Nenhuma fusão automática nem prioridade global entre providers. |
| 15–16, 24–32: pipeline/CLI | Quatro providers, leitores locais, normalizador, validação, dedupe prévio, relatório agregado, dry-run padrão, aplicação somente explícita no MongoDB local. |
| 17–19: PBE | Adaptadores por categoria para dados curados JSON/CSV; geladeira, ar-condicionado, lavadora e TV. Não é parser universal de tabelas oficiais; XLSX não implementado. |
| 20: ENERGY STAR | Importador funcional para CSV de geladeiras salvo localmente e JSON/CSV curados; região US. Sem API online ou equivalência automática BR. |
| 21–22: fabricante/genéricos | JSON e CSV controlados; fabricante/versão/datas/fonte; generic continua estimativa explicitamente não oficial. |
| 25–30: validação/variantes/upsert | Schema estrito; marca/modelo externos obrigatórios; região, tensão e externalId na identidade; idempotência e atualização testadas; inativação sem exclusão. |
| 33: JSON vs Mongo | JsonCatalogRepository reutilizado no launcher; testes do mesmo contrato com métodos Mongo e double; contrato real adicional condicionado a MongoDB local. |
| 34–35, 62: snapshots/migração | energyProfile já é snapshot; fonte copiada; sem duplicar campo ou alterar aparelhos em massa; fallback de leitura legado; rollback documentado. |
| 36–37: matching/capabilities | Sugestões por identidade/região e tensão opcional; EXACT/POSSIBLE/lista vazia, sempre confirmação. Power-only não é energia medida; contador/intervalo Samsung separados. |
| 38–40: frontend/tarifa | Fonte/região/verificação nos cards; formulário por método; referência anual original e derivada no painel, card e relatório/PDF; tarifa existente configurável. |
| 41–45: segurança/LGPD/logs | Nenhum import endpoint público; sem download arbitrário ou scraping; arquivos/linhas limitados, Zod, logs agregados sem raw; catálogo separado de contas. Não é certificação LGPD completa do sistema. |
| 46–55: testes | Pipeline PBE/ENERGY STAR/fabricante/generic, 100 registros sintéticos, idempotência, atualização/snapshot, variantes, CSV adversarial, normalização, contratos, matching e renderização. Regressões de auth, cálculos, SmartThings, histórico, PDF e logs fazem parte das suítes existentes. |
| 56–61: documentação | DEVICE_CATALOG_ARCHITECTURE.md inclui fontes, contratos, limitações, novos providers/categorias, comandos reais e operação local. PBE atualizado com indicação de conteúdo legado. |
| 63–65: limites/segunda revisão | Sem 500 cadastros manuais, sem dados inventados no catálogo, sem misturar US/BR ou potência/energia. Pendências de homologação abaixo impedem anunciar a fase como validada em produção. |
| 66: relatório | Arquitetura, providers, schema, proveniência, snapshot, comandos, segurança, LGPD, migração e limitações estão documentados nos dois relatórios. |

## Arquivos específicos desta fase

Criados: `backend/scripts/import-catalog.cjs`; `backend/src/modules/catalog/{reference,matching,json-repository}.ts`; `backend/src/modules/catalog/import/{normalizer,providers,pbe-adapters,files,service}.ts`; `backend/src/modules/integrations/energy-reading.ts`; `backend/tests/catalog-import.test.cjs`; fixtures em `backend/tests/fixtures/catalog/`; esta revisão e `DEVICE_CATALOG_ARCHITECTURE.md`.

Adaptados: tipos/schema/seed do catálogo, métodos de MongoDatabase, rota de sugestões, cálculo backend e frontend, normalização de cadastro, biblioteca/cards/painel de configuração, descoberta SmartThings, relatórios/PDF via dados de fonte, scripts npm, testes de catálogo/Mongo/UI/energia. O launcher ignorado passou a reutilizar JsonCatalogRepository. Arquivos já alterados da fase anterior não foram descartados.

## Validação e limites

- `npm test --prefix backend`: suíte automatizada com HTTP local; os três testes que exigem MongoDB real são opcionais e ignorados sem TEST_MONGO_URL.
- `npm test`: energia, renderização React SSR, medições e PDF; não substitui navegador E2E.
- `npm run build`, `npm run build --prefix backend`, `npx --no-install tsc -p tsconfig.app.json --noEmit`: compilação.
- `npm run lint`: avisos Fast Refresh existentes não equivalem a erros.
- `npm run catalog:validate --prefix backend -- --file tests/fixtures/catalog/pbe.json --manifest tests/fixtures/catalog/pbe.manifest.json`: validação sem conectar/gravar em MongoDB.
- `node .\wattstatus.local\verificar.cjs`: teste HTTP do modo isolado após iniciar o launcher.

Pendentes: executar o contrato/importação no MongoDB real e validar índices; medir carga, conexões e performance em staging; homologar OAuth, dispositivos físicos e interação completa no navegador. Nenhum commit, deploy ou push integra esta implementação. Nenhuma migração ou importação em produção foi executada.
