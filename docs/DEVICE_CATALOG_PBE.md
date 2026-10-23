# Biblioteca de aparelhos e PBE — 23/10/2026

> Fase 2: consulte [DEVICE_CATALOG_ARCHITECTURE.md](./DEVICE_CATALOG_ARCHITECTURE.md). REFERENCE_MONTHLY no texto histórico abaixo é o legado; o método atual é REFERENCE_PERIOD. Importação de JSON/CSV curados já existe; XLSX e exportações arbitrárias não são aceitos.

## Fontes e limites

O Programa Brasileiro de Etiquetagem (PBE), do Inmetro, é a referência brasileira inicial de desempenho energético. O catálogo interessa-se apenas por informações públicas de produtos: marca, modelo, categoria, método energético, consumo declarado e referência consultável. Não copiamos contatos, endereços ou outros dados de pessoas presentes nas páginas oficiais.

Referências verificadas nesta implementação:

- [Tabelas de eficiência energética do Inmetro](https://www.gov.br/inmetro/pt-br/assuntos/regulamentacao/avaliacao-da-conformidade/programa-brasileiro-de-etiquetagem/tabelas-de-eficiencia-energetica/tabelas-de-eficiencia-energetica) e [consulta PBE](https://pbe.inmetro.gov.br/).
- [Registro 011133/2025](https://registro.inmetro.gov.br/consulta/detalhe.aspx?NumeroRegistro=011133%2F2025&pag=1): Samsung RF29DB9950QDAZ, referência mensal de 40,5 kWh. O snapshot registra o modelo exato, sem generalizar para outras geladeiras da marca.
- [Registro 007648/2023](https://registro.inmetro.gov.br/consulta/detalhe.aspx?NumeroRegistro=007648%2F2023&pag=1): lavadora Newmaq 10 kg, versões 127 V/60 Hz e 220 V/60 Hz. As referências de água fria são, respectivamente, 0,143 e 0,098 kWh/ciclo. As versões possuem condições de ensaio distintas e são entradas separadas.

`verified: true` significa que os campos curados foram conferidos na referência na data indicada, não certificação do WattStatus, garantia de disponibilidade comercial ou medição da residência. Consumo de ensaio varia conforme condições, tensão, programa e instalação. Revalidar registros periodicamente.

Não foi identificada, nas fontes consultadas, documentação pública de uma API oficial do PBE equivalente às APIs abertas de outros catálogos internacionais. Isso não prova inexistência de API. O projeto **não depende de endpoints internos não documentados**, scraping ou chamadas externas durante a busca.

## Como os dados entram hoje

Curadoria manual em `backend/src/modules/catalog/data/catalog.json`, validada por Zod em `catalog.seed.ts`. São 6 categorias e 12 referências iniciais: 3 registros oficiais descritos acima e 9 perfis genéricos. Categorias: Iluminação, Climatização, Cozinha, Lavanderia, Entretenimento e Informática.

Os genéricos reaproveitam exemplos de potência do produto ou valores explicitamente presentes no nome do perfil, como LED 9 W, notebook 65 W e ventilador 80 W. Não são especificações de marcas, médias estatísticas nem dados oficiais: `isGeneric: true`, `verified: false`, `source.type: WATTSTATUS_GENERIC`. A potência é editável no aparelho do usuário. Não há referência mensal ou por ciclo genérica inventada.

Campos: `id`, `category`, `subcategory`, `brand?`, `model?`, `displayName`, `aliases`, `energyProfile`, `source { type, reference, verifiedAt }`, `region`, `verified`, `isGeneric`. `verifiedAt` usa ISO UTC; nos genéricos representa data da curadoria do exemplo, não verificação oficial. Não guardamos imagens externas. IDs estáveis distinguem versões; não reutilizar ID para um produto de outra tensão/região.

## Arquitetura e contratos

```text
JSON curado → validação Zod → seed idempotente → device_catalog (MongoDB)
                                                ↓
                             GET /api/device-catalog (autenticado)
                                                ↓
                          Biblioteca → configuração → POST /api/appliances
                                                ↓
                         aparelho do usuário + snapshot energético
```

O repositório continua usando MongoClient, rotas Express, services e Zod; não foi introduzido Mongoose nem outro banco. `CatalogDevice` não contém proprietário ou vínculo com usuários. `ApplianceService` busca a referência no servidor: o cliente não pode substituir a fonte PBE nem o consumo oficial enviando outro objeto.

Busca: nomes, categoria traduzida, tipo, marca, modelo e aliases são normalizados para tokens literais sem acentos e em minúsculas. Todos os termos precisam ocorrer; não há autocomplete por fragmentos ou busca fuzzy. Exemplo: `TV 50`, `Samsung`, `lâmpada`. Marcas/modelos não cadastrados retornam vazio, sem inventar correspondências. Categoria/tipo/marca/modelo aceitam filtros exatos com valores da API. `page` inicia em 1, `limit` padrão 12/máximo 48, página máxima 1000. Objetos, operadores e filtros desconhecidos são recusados; nenhum regex do cliente chega ao MongoDB.

Rotas novas (todas autenticadas):

- `GET /api/device-catalog?search=TV%2050&category=entertainment&brand=Gen%C3%A9rico&page=1&limit=12`: `{ devices, total, page, limit, categories, brands, subcategories }`.
- `GET /api/device-catalog/:id`: `{ device }` ou 404.

Índices de `device_catalog`: `id` único; `{ category, subcategory, brand, model }`; `{ searchTokens, category }`; `brand`; `subcategory`; `{ displayName, id }`. Facets usam a categoria selecionada. Consulta/count/facets possuem `maxTimeMS: 3000`. Ordenação com filtro textual e grandes páginas ainda precisa de `explain()` e medição em staging; não há alegação de escala validada.

Não há cópia automática do seed em cada cold start. Banco sem seed retorna biblioteca vazia, com fallback manual. As categorias da resposta vêm do manifesto validado da versão implantada; publicar o JSON e importar seus dados de forma coordenada.

## Atualizar e importar

1. Consultar a fonte oficial pública e conferir **modelo, versão/tensão, unidade e condições**. Não inferir potência de um consumo mensal.
2. Editar o JSON: IDs estáveis, aliases úteis, região explícita e um dos perfis suportados. Registrar URL, data e verificação. Não incluir dados de pessoas nem payload bruto da página.
3. Executar `npm run catalog:seed --prefix backend` para compilar/validar, **sem gravar no banco**.
4. Fazer backup lógico do banco de staging antes de aplicar. Verificar `MONGO_URL`/`MONGO_DB_NAME` com segurança, sem copiar URIs para logs, chat ou histórico do terminal.
5. `npm run catalog:seed --prefix backend -- --apply` cria índices necessários e insere apenas IDs ausentes (`$setOnInsert`). Não remove nenhum registro.
6. Para corrigir entradas existentes após revisão: `npm run catalog:seed --prefix backend -- --apply --update-existing`. Usa `$set` por ID, sem apagar entradas fora do seed. Snapshots dos aparelhos já cadastrados não são alterados.

Para tentar uma instância **isolada local**, sem usar o banco configurado: `npm run catalog:seed --prefix backend -- --apply --local`. Destino fixo `mongodb://127.0.0.1:27017`, banco `wattstatus_catalog_dev`. Requer MongoDB acessível e permissões de leitura, escrita e criação de índices. O script fecha a conexão em sucesso/falha e pode ser repetido.

Riscos: índice existente incompatível pode impedir inicialização; importação interrompida pode inserir parte do lote (reexecutar é seguro). Não há transação global nem exclusão automática. Revisar índices em staging antes do rollout. Não alteramos documentos antigos nem criamos migração destrutiva.

Rollback: restaurar somente `device_catalog` a partir do backup lógico aprovado, ou publicar de volta o JSON anterior e rodar `--apply --update-existing` para seus IDs. A segunda opção não exclui IDs adicionados posteriormente; para retirar um item, planejar operação administrativa específica após conferir referências. Não remover `appliances`, `energy_samples`, tokens ou usuários. Os snapshots permitem manter aparelhos mesmo se sua referência sair do catálogo. Não executar restauração de banco inteiro como rollback desta feature.

## Métodos e snapshot

O aparelho mantém os campos antigos (`power`, `usageHours`, `days`, tarifa e totais), além de campos opcionais: `catalogDeviceId`, `origin`, `energyProfile`, `source`, `cyclesPerMonth`, `room`, `consumptionType`, `measurement`.

O perfil energético e a fonte são copiados como **snapshot** no cadastro. Atualizar o catálogo não muda estimativas já cadastradas. Potência ajustada vale somente para a instância do usuário; não atualiza o perfil global. Um aparelho não pode ser redirecionado por PUT para outro catálogo/dispositivo. Categorias completas, aliases e outros dados desnecessários não são duplicados.

| Método | Regra | Tipo |
| --- | --- | --- |
| POWER_TIME | W × horas/dia × dias/mês ÷ 1000; até 24 h/dia e 31 dias | ESTIMATED |
| REFERENCE_MONTHLY | kWh/mês declarado no snapshot, sem multiplicar por horas/dias | ESTIMATED |
| PER_CYCLE | kWh/ciclo × ciclos inteiros **por mês**, de 0 a 1000 | ESTIMATED |
| LIVE_MEASUREMENT | diferença de dois contadores válidos ordenados, com intervalo conhecido; reset não gera consumo negativo | METERED |

Não há conversão semanal implícita. Referência mensal não é ajustada pela duração de fevereiro porque é um mês padronizado de ensaio. Tarifa usa a configuração existente em R$/kWh; valores por estado continuam apenas sugestões editáveis. Total zero é aceito para zero horas/ciclos, sem confundir ausência de telemetria com medição zero.

`measurement` possui método LIVE_MEASUREMENT, contador acumulado, tipo de leitura e horário da consulta. Um contador isolado **não** entra nos totais mensais. O histórico real existente (`energy_samples` e intervalos) continua sendo fonte do consumo medido, com suas tarifas históricas. Estimativas atuais do cadastro continuam separadas, inclusive no PDF; não são somadas à medição como se fossem consumo adicional. Editar parâmetros muda projeções, não amostras históricas. As projeções dos meses antigos continuam sendo estimativas baseadas no cadastro atual, conforme comportamento já sinalizado pelo projeto; não foi criado histórico contábil de estimativas mensais.

Legado: sem perfil, usa POWER_TIME; sem origem, infere SmartThings/integração se houver vínculo, senão MANUAL, somente na leitura. Não há recadastro nem alteração em massa. Leituras legadas sem horário permanecem identificadas como período desconhecido.

Campos técnicos legados de providers não habilitados são preservados ao editar uso/nome; isso não libera importação nova ou consulta externa com provider arbitrário. Ausência de telemetria em uma atualização não apaga a última leitura verificada, que permanece identificada pelo horário anterior.

## SmartThings e extensão por providers

`DeviceIntegration` existente continua responsável por conexão/configuração, discovery, status e comandos. Não foi recriado OAuth nem adicionado conector real novo. O novo painel usa token **individual** guardado no servidor, consulta dispositivos e lê apenas o selecionado. Não envia comandos. Conexão segue na página `/integracoes/smartthings`.

Importar/atualizar leitura exige que o backend encontre o dispositivo na conta autorizada. O contador é lido pelo servidor; números de medição enviados pelo cliente não são fonte confiável. Autenticação externa inválida continua retornando 424 sem encerrar a sessão WattStatus. Offline/timeout/ausência de energia não viram medições fictícias. Sem telemetria energética, o usuário pode configurar uma estimativa com potência informada. Não assumimos que toda TV tenha medidor. Duplicidade de importação continua protegida por `importKey`.

O vínculo opcional `catalogDeviceId` e o vínculo de integração são independentes no domínio. Não há matching automático de marca/modelo nem aplicação automática de especificações a aparelhos IoT. Uma futura tela de sugestões deve exigir confirmação do modelo e da região antes de combiná-los. O primeiro fluxo permite configurar o dispositivo sem match de catálogo.

Para novo DeviceProvider: implementar o contrato existente, registrar no manager e acrescentar autorização/ownership e tratamento de capacidades específicos antes de habilitar rotas/UI. Não basta liberar um nome de provider no payload. Nenhum stub de Matter/Tuya/LG foi criado.

## Fontes futuras de catálogo

CatalogProvider é um produtor de referências normalizadas, não DeviceIntegration (que acessa aparelhos de uma conta). Hoje a produção de referências é o JSON curado/validado, sem classes vazias de providers.

- **API oficial PBE:** se for publicada/documentada, implementar adaptador `PbeCatalogProvider` → validação/normalização pelo schema atual → importação com IDs estáveis, fonte/data/região e revisão de mudanças. API do usuário permanece igual. Não executar importação externa em cada busca.
- **Dataset oficial CSV/XLSX/JSON:** importador fora do request HTTP, mapeamento explícito de unidades e versões, validação em dry-run, relatório de diferenças, backup e upsert idempotente em `device_catalog`. Não presumir que consumo anual/mensal/ciclo ou W são intercambiáveis.
- **ENERGY STAR:** [há APIs documentadas de produtos](https://www.energystar.gov/products/spec/energy_star_api_user_essentials_pd). Pode receber adaptador complementar, mantendo região e condições dos modelos. Não tratar modelos dos EUA como equivalentes brasileiros nem usar selo/marca de certificação sem avaliar condições de uso.
- **Scraping:** somente última alternativa, após avaliar termos, robots.txt e viabilidade jurídica/técnica. Apenas produtos públicos, sem conta autenticada, dados pessoais ou contorno de acesso. Frequência baixa, identificação do coletor, rate limit, cache, backoff, parser testado, validação, logs seguros, monitoramento de falhas e mudanças de HTML. Uma falha do importador nunca deve derrubar a biblioteca já persistida. Nenhum scraper foi implementado.

Nova categoria: adicionar `{ id, name, icon }` no manifesto e referenciá-la nos produtos; um ícone desconhecido usa fallback seguro. Nova marca/modelo: adicionar entrada com categoria existente, ID único e fonte verificada. Nova fonte: adaptar o importador ao mesmo schema, revisando enum de fonte se necessário. Depois executar dry-run, testes, seed em staging e homologação.

## Segurança e privacidade

Auth, cookies e CSRF existentes foram mantidos. Rotas de catálogo exigem sessão; aparelhos são sempre filtrados por proprietário no servidor. Limites gerais já existentes continuam ativos; catálogo acrescenta 90 chamadas/minuto por chave de IP. Busca tem debounce/cancelamento e página limitada. Discovery segue o limite HTTP geral (120/min), sem consulta de status em massa neste novo fluxo; rate limit/backoff do provider existente continua relevante. Calibrar em staging para não prejudicar redes compartilhadas.

Mutações pelo hook existente levam X-Wattstatus-User para recusar formulários pendentes de uma identidade anterior (409). O cabeçalho é apenas vínculo de intenção, nunca fonte de autorização. Clientes antigos sem esse campo continuam compatíveis; o proprietário real é sempre o usuário autenticado. Homologar também corrida entre troca de conta e nonce CSRF em duas abas.

Logs estruturados herdam requestId e contêm evento, contagem, página, método e ID público de catálogo. Não incluem busca, ambiente, payload integral, credenciais ou tokens. Erros públicos são controlados. Não há endpoint de logs nem credencial externa na resposta do catálogo.

Revisão técnica considerando [princípios de finalidade, necessidade, transparência e segurança](https://www.gov.br/saude/pt-br/acesso-a-informacao/lgpd/principios): catálogo separado sem dados de usuários; ambiente opcional limitado a 80 caracteres; vínculo apenas no aparelho autenticado; nomes/ambientes não entram em logs; sem imagem/analytics externo novo. Aparelhos podem revelar hábitos domésticos. Antes de publicação, o responsável deve atualizar a política de privacidade sobre ambiente opcional, vínculo de modelo, telemetria, finalidade, retenção e exclusão, verificando base legal e direitos dos titulares. Esta revisão técnica não certifica conformidade jurídica integral. A política de retenção/exclusão de amostras históricas existente não foi alterada.

## Validação e pendências

`npm test`: cálculos/frontend, agrupamento de medições, PDF e renderização React do fluxo/formulários (SSR, não E2E). `npm test --prefix backend`: autenticação, logs, catálogo, cálculos, isolamento, importação e testes existentes. `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`, `npm run build` e build backend completam a validação automatizada.

MongoDB local não estava disponível; importação real falhou por seleção de servidor, sem usar banco remoto. Testes que exigem TEST_MONGO_URL continuam opcionais/ignorados. Não foram comprovados índices reais, planos de consulta, persistência/rollback, carga, hardware SmartThings, HTTPS/proxy/headers Netlify ou capacidade de produção. Não houve deploy nem commit.

A ferramenta de controle visual do Windows não conseguiu capturar a janela Chrome após tentativa de recuperação. Teste SSR confirma renderização e seleção inicial no código, mas **não** comprova navegação por teclado, responsividade visual, foco, busca/cadastro pelo navegador ou exportação PDF por clique. Homologar em desktop, celular e tema claro/escuro.

Smoke test isolado: após os builds, `node backend/tests/browser-server.js`; acessar `http://127.0.0.1:4411/__test__/start` cria sessão **sintética em memória** e abre a biblioteca. Essa rota existe somente no fixture, não na aplicação de produção. Encerrar com Ctrl+C. Conferir: categoria/tipo/marca → modelo → potência/uso ou ciclos → ambiente/tarifa → prévia → adicionar → editar → dashboard/relatório; busca inexistente → manual; SmartThings desconectado → conexão; catálogo indisponível → tentar novamente/manual. Depois repetir em staging com MongoDB isolado e SmartThings de teste, sem comandos perigosos.
# Atualização fase 2

O fluxo atual e os comandos de importação estão em [DEVICE_CATALOG_ARCHITECTURE.md](./DEVICE_CATALOG_ARCHITECTURE.md). O método atual é REFERENCE_PERIOD (DAY/MONTH/YEAR). PBE aceita JSON/CSV curados versionados, não exportações arbitrárias nem XLSX. As referências e limitações da curadoria inicial continuam relevantes.

