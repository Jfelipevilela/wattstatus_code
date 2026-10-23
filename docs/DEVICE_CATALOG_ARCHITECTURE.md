# Catálogo fase 2 — arquitetura e operação

## Escopo e estado

Branch de continuação: `feature/add-device`. Não há novo catálogo hardcoded no React, importação pública, scraping, scheduler de sincronização ou deploy. A quantidade de produtos não mede a conclusão desta fase.

Antes: JSON curado → seed → MongoDB; o modo de demonstração tinha busca própria em memória. Agora:

```text
arquivo local + manifesto revisado
    → leitor JSON / CSV limitado
    → CatalogSourceProvider específico
    → normalização de números, unidades e identidade
    → schema Zod + regra PBE por categoria
    → deduplicação e validação do lote inteiro
    → CatalogImportService
    → MongoDatabase.upsertCatalogRecord
    → device_catalog → API autenticada → biblioteca
```

SmartThings continua DeviceProvider; NÃO é uma fonte de catálogo. Importadores não recebem tokens SmartThings e não consultam contas de usuários.

## Providers e formatos reais

| Provider | Formatos / adaptador | Limites |
| --- | --- | --- |
| PBE | JSON `curated-v1` ou CSV `curated-csv-v1`, curados a partir de fonte oficial | Não é parser universal de exportações Inmetro; não inventa colunas oficiais. |
| ENERGY_STAR | CSV salvo do Product Finder, adaptador `energystar-refrigerator-csv-v1`; também JSON/CSV curados | Geladeiras, mercado United States, região US. Mudança de cabeçalhos exige revisão. |
| MANUFACTURER | JSON/CSV curados e manifesto com fabricante, URL, versão e datas | Conferência da origem é responsabilidade administrativa, não inferida de uma URL. |
| WATTSTATUS_GENERIC | JSON/CSV curados | `verified:false`, `official:false`, exemplos estimados, não especificações oficiais. |

PBE possui regras independentes em `import/pbe-adapters.ts`: Geladeira (referência de período), Ar-condicionado (anual ou potência), Lavadora (ciclo), TV (standby separado; potência operacional exige origem complementar). Não foram implementados parsers de planilhas oficiais de lâmpadas/ventiladores sem amostra verificável.

XLSX não é aceito nesta versão: exporte para CSV/JSON revisado. Não foi adicionada dependência de planilha, descompactador nem risco de zip bomb. Isso é uma limitação explícita, não suporte XLSX implícito.

## Fonte consultada e formato

- [Tabelas do Inmetro](https://www.gov.br/inmetro/pt-br/assuntos/regulamentacao/avaliacao-da-conformidade/programa-brasileiro-de-etiquetagem/tabelas-de-eficiencia-energetica/tabelas-de-eficiencia-energetica): ponto de partida para conferência/curadoria. Não usamos API interna não documentada.
- [ENERGY STAR — dados e ferramentas](https://www.energystar.gov/products/productstr): exportação pública CSV/Excel/XML e acesso a datasets.
- Fixture ENERGY STAR: [Whirlpool WRMF3536SV, ID 4049645](https://www.energystar.gov/productfinder/product/certified-residential-refrigerators/details/4049645/export/pdf/download). Fixture pequena para verificar formato, não sincronização integral do dataset atual.
- Fixture PBE reutiliza a referência de geladeira já curada na etapa 1; nenhum modelo fictício foi adicionado ao catálogo público pelos testes. Fixtures marcadas SYNTHETIC são apenas testes.

## Manifesto e normalização

Manifesto JSON estrito: `provider`, `adapter`, `referenceUrl`, `sourceVersion`, `retrievedAt`, `verifiedAt`; `manufacturer` obrigatório para fabricante; `numberLocale` BR/US opcional.

`verifiedAt` documenta a revisão humana da fonte, não prova verificação online feita pelo programa. O operador deve revisar modelo, variante, fonte e unidade antes de usar `--apply`. Uma URL em domínio oficial não garante por si só que todo o conteúdo do arquivo é verdadeiro.

JSON curado é array do contrato `CatalogDevice`, sem `_id` ou campos de conta. CSV curado usa cabeçalhos WattStatus (NÃO cabeçalhos oficiais PBE):

```text
id,category,subcategory,brand,model,displayName,region,method,value,unit,period,typicalPowerW,standbyPowerW,energyPerCycleKwh,voltage,capacityBtuH,registrationNumber
```

Campos inaplicáveis podem ser omitidos/vazios. CSV usa vírgula como separador; vírgula decimal deve estar entre aspas. Locale BR interpreta `40,50` e `12.000`; US interpreta `40.50`. Não adivinhamos separadores ambíguos. `402 kWh/ano`, `40,5 kWh/mês`, `127 V` e `12.000 BTU/h` são normalizados nos campos apropriados. Conflitos entre período explícito e unidade são rejeitados.

ENERGY STAR exige os cabeçalhos `ENERGY STAR Unique ID`, `Brand Name`, `Model Number`, `Annual Energy Use (kWh/yr)`, `Markets`. Modelos US não são associados automaticamente aos brasileiros.

## Schema MongoDB e proveniência

Mantemos o contrato anterior e seus opcionais:

```text
id, category, subcategory, brand?, model?, displayName, aliases, region,
variant? {voltage?, identifier?}, specifications?, active?,
energyProfile,
source {type, reference, verifiedAt, externalId?, registrationNumber?,
        sourceVersion?, retrievedAt?, lastSeenAt?, manufacturer?, official?,
        metrics? {value?, typicalPowerW?, standbyPowerW?, energyPerCycleKwh?}},
verified, isGeneric
```

`source.metrics` associa cada valor à URL HTTPS de sua origem. Por exemplo, standby PBE e potência operacional do fabricante podem coexistir sem atribuir ambos ao PBE. A interface mostra os links por métrica. Não há prioridade global por provider, nem fusão automática de registros concorrentes: fontes distintas ficam separadas por identidade; composições exigem curadoria e referência por campo.

`importFingerprint` é técnico, não retornado pela API. `lastSeenAt` avança em reimportações; timestamps de coleta não provocam atualização artificial dos valores. Mudança de versão/revisão da fonte pode atualizar metadados mesmo se o consumo for igual.

A chave considera provider, ID externo (ou ID estável do arquivo curado), marca normalizada, região e variante. IDs do seed são mantidos somente quando correspondem ao mesmo produto. 127 V e 220 V não colidem. Trocar IDs externos a cada exportação quebra identidade: o operador deve mantê-los estáveis.

O catálogo não é apagado quando um produto desaparece de um lote. `active:false` retira-o da busca/seleção sem apagar aparelhos anteriores. Catálogo não armazena userId, e-mail nem dados de sessões.

## Cálculos e compatibilidade

| Método | Significado |
| --- | --- |
| POWER_TIME | W × horas/dia × dias/mês ÷ 1000. Standby não substitui potência operacional nem é somado automaticamente. |
| REFERENCE_PERIOD MONTH | Referência mensal original, sem multiplicar por horas/dias. |
| REFERENCE_PERIOD YEAR | Valor anual preservado; projeção mensal derivada = valor/12, explicitamente rotulada. |
| REFERENCE_PERIOD DAY | Valor diário preservado; média mensal derivada = valor×365/12, convenção fixa de projeção, não medição do calendário. |
| PER_CYCLE | kWh/ciclo × ciclos por mês, inteiros de 0 a 1000. Não há conversão semanal implícita. |
| LIVE_MEASUREMENT | Telemetria real; diferença de contadores válidos ou intervalo energético Samsung já registrado. Potência instantânea sozinha não é energia medida. |

As três primeiras famílias são ESTIMATED. LIVE_MEASUREMENT fica na estrutura de medição/histórico, não no catálogo nem no payload livre de estimativa do cliente. Leituras ausentes não são zero. Contadores não viram consumo mensal. Métodos e fonte energética aparecem nos cards, configuração e relatórios/PDF.

`REFERENCE_MONTHLY` permanece SOMENTE como entrada/registro legado compatível, interpretado como REFERENCE_PERIOD/MONTH. Novos cadastros normalizam o perfil. Não há recadastro obrigatório ou migration destrutiva: nenhuma alteração em massa nos aparelhos. `energyProfile` já é o snapshot da arquitetura existente; não duplicamos um campo `energyProfileSnapshot`. Fonte é copiada junto.

Atualizar catálogo não modifica esse snapshot nem medições históricas. O comportamento anterior de estimativas históricas acompanhar o cadastro do próprio usuário permanece documentado; não foi criado histórico contábil de estimativas.

## SmartThings e matching

Endpoint autenticado `GET /api/device-catalog/match`: marca/modelo/região, categoria e tensão opcionais. Só candidatos ativos, não genéricos, com marca/modelo normalizados iguais e mesma região. Tensão incompatível é excluída. EXACT exige tensão informada e igual; sem informação suficiente o resultado é POSSIBLE. Múltiplas fontes/variantes são opções distintas. Ausência de correspondência é lista vazia (NONE).

A busca é limitada a 48 candidatos e informa truncamento; não promete unicidade global. Mesmo EXACT exige confirmação na interface. O usuário pode escolher “Nenhum destes”. Não inferimos a tensão, a região BR de um produto US ou o modelo pelo apelido do dispositivo. A tela procura candidatos BR, mas a seleção é humana.

SmartThings é consultado somente dentro da sessão autorizada. OAuth e PAT continuam suportados. `energyMeter` e relatórios Samsung podem fornecer contador/intervalo. `powerMeter` é exibido como potência atual, inclusive zero, não “consumo real”. Offline/falhas não fabricam leitura. Estimativa do modelo e telemetria são apresentadas separadamente.

## Segurança, LGPD, performance e falhas

- CLI administrativa; nenhuma API pública de importação ou de URL arbitrária. O leitor só abre arquivo local regular, não symlink.
- Máximo 10 MiB por dataset, 10 KiB de manifesto, 20 mil registros, 100 colunas, 10 mil caracteres por célula CSV. Sem execução de fórmulas, macros ou descompactação.
- Schema estrito, chaves dinâmicas limitadas, HTTPS nas referências, validação de provider/unidade/período/região. URLs são referências, NÃO são baixadas.
- Lote inteiro validado/deduplicado antes de gravar. Um registro inválido bloqueia todas as gravações daquele lote. Falha de banco durante escrita pode deixar parte dos upserts aplicada: não há transação global; reexecução é idempotente. Não rodar importações concorrentes da mesma fonte.
- Logs agregados por lote com contagens, linha e código de rejeição; não imprimem linha bruta, credenciais, caminhos nem dados de usuários. Não há log info por aparelho. Acesso/retenção dos logs continuam sujeitos à operação do backend, não aparecem na interface pública.
- Não foram adicionados dados de conta ao catálogo. Exportação/exclusão de conta e retenção de logs exigem a política do sistema inteiro; esta fase não implementa uma política LGPD completa.
- Consultas mantêm limites/índices existentes. Importador faz upserts sequenciais limitados; performance com milhares de registros, explain e concorrência precisam de medição real em staging. Teste com 100 fixtures não prova capacidade de produção.

## Operação local (raiz do repositório, PowerShell)

Sem MongoDB, demonstração com login automático já existente:

```powershell
node .\wattstatus.local\iniciar.cjs
```

Esse modo usa JsonCatalogRepository e o seed do código, não lê automaticamente datasets importados no MongoDB. A pasta continua ignorada pelo Git. Testes de contrato exercitam JSON e os métodos Mongo com double; testes reais adicionais requerem banco.

Se Docker Desktop já estiver instalado, crie uma instância dedicada somente loopback (não use banco de produção):

```powershell
docker run --name wattstatus-catalog-dev -p 127.0.0.1:27017:27017 -d mongo:7
npm run catalog:seed --prefix backend -- --apply --local
npm run catalog:validate --prefix backend -- --file tests/fixtures/catalog/pbe.json --manifest tests/fixtures/catalog/pbe.manifest.json
npm run catalog:import --prefix backend -- --file tests/fixtures/catalog/pbe.json --manifest tests/fixtures/catalog/pbe.manifest.json --apply --local
```

O exemplo Docker só se aplica se esse nome/porta estiverem livres; não encerre serviços existentes. Para novas sessões: `docker start wattstatus-catalog-dev`. Instalação do Docker/MongoDB não é automática. Os caminhos de arquivo nos comandos npm acima são relativos a `backend`, pois o npm executa nesse diretório.

Para ENERGY STAR, use um manifesto equivalente com provider ENERGY_STAR e adapter energystar-refrigerator-csv-v1 e o CSV oficial salvo. Fabricante usa provider MANUFACTURER, adapter curated-v1/curated-csv-v1 e manufacturer obrigatório. Atualize datas/URL/versão para a fonte realmente revisada; não reaproveite o manifesto PBE para outra fonte.

CLI é dry-run por padrão e não conecta ao banco; `--apply` exige `--local` e só escreve `wattstatus_catalog_dev` em 127.0.0.1:27017. Não há autorização automática para importar produção. Reimportação retorna inserted/updated/unchanged/skipped/invalid/failed e demais contadores; inválidos/falhas geram exit code 1.

Para exercitar o caminho real completo, configure SOMENTE o `.env` local do backend com MONGO_URL `mongodb://127.0.0.1:27017`, MONGO_DB_NAME `wattstatus_catalog_dev`, JWT_SECRET de desenvolvimento e APP_ORIGINS para `http://localhost:8080`. Então, em terminais separados:

```powershell
npm run dev --prefix backend
npm run dev
```

Nesse modo real, cadastre uma conta local pelo site; não existe auto-login de demonstração. Não altere credenciais/domínio de produção. `.env` permanece ignorado.

```powershell
npm run build --prefix backend
npm test --prefix backend
npm test
npm run build
npm run lint
npx --no-install tsc -p tsconfig.app.json --noEmit
```

Testes opcionais reais, somente quando MongoDB local estiver acessível:

```powershell
$env:TEST_MONGO_URL = 'mongodb://127.0.0.1:27017'
npm test --prefix backend
Remove-Item Env:TEST_MONGO_URL
```

Eles usam bancos aleatórios isolados e removem somente os bancos criados por eles. Não confundir com homologação de índices/carga em produção.

## Migração e rollback

Não é necessária migration de aparelhos: compatibilidade de leitura mantém os snapshots mensais antigos. O seed e o importador passam a gerar REFERENCE_PERIOD. A coleção aceita campos novos opcionais e o índice id único já existia.

Antes de aplicar lotes reais, faça backup lógico de device_catalog. Rollback: restaure SOMENTE os registros do catálogo daquele backup por procedimento administrativo revisado; não restaure banco inteiro, não apague appliances/energy_samples/usuários. Retornar o código antigo exige também revisar os registros REFERENCE_PERIOD, pois o código antigo não entende o método novo. Snapshots antigos permanecem válidos no código atual. Nenhum rollback automático destrutivo foi adicionado.

## Adicionar fonte/categoria

1. Obter amostra oficial verificável, conferir termos e unidade/região.
2. Criar CatalogSourceProvider/adaptador específico ou novo adapter versionado; não adivinhar colunas.
3. Normalizar com locale explícito; preservar período e fonte de cada métrica.
4. Validar modelo, categoria, variante, IDs e metadados; não misturar regiões.
5. Criar fixtures positivas, negativas, atualização e idempotência; testar contrato dos repositórios.
6. Para categoria nova, atualizar manifesto de categorias do seed, regra PBE, mapeamentos e UI; escolher método energético existente antes de criar outro.
7. Executar dry-run e revisar relatório; aplicar primeiro no MongoDB local/staging com backup.

Futuro: parsers XLSX oficiais por categoria, mais datasets ENERGY STAR, fontes adicionais de fabricantes e sincronização agendada com download allowlisted. Scraping só após necessidade comprovada, termos/robots, cache, rate limit e revisão específica. Nenhum desses recursos é anunciado como implementado.
