# Migração para imóveis e ambientes

## O que muda nos dados

- Cada usuário passa a ter um imóvel padrão **"Meu imóvel"** com o pavimento **"Térreo"**, marcado como principal.
- Aparelhos sem `propertyId` recebem o id do imóvel principal do dono e `roomId: null` ("Sem ambiente").
- Nada é apagado. Tokens SmartThings, sessões, tarifas, estimativas e medições não são tocados.
- Leituras medidas antigas continuam como estão (sem local). Só leituras novas recebem `propertyId`/`roomId`.

## Migração automática × script manual

São o mesmo código (`PropertyService.ensureDefault`) chamado de dois lugares:

| | Migração automática | Script `migrate-properties.cjs` |
| --- | --- | --- |
| Quando | No primeiro `GET /api/properties` ou `GET /api/appliances` de cada usuário | Quando um operador executa |
| Alcance | Só aquele usuário | Todos os usuários |
| Grava | Sim (só adiciona) | Só com `--apply`; padrão é simulação |
| Backup | Não faz backup | Rode `mongodump` antes (passo 1) |

A automática nunca apaga, renomeia ou altera campos existentes: cria o imóvel e o pavimento padrão e preenche `propertyId`/`roomId` apenas em aparelhos que ainda não têm imóvel. Por isso é segura no primeiro acesso, mas **grava**. Para homologar com backup antes de qualquer gravação, rode o script com `--apply` depois do backup e antes de liberar a versão aos usuários: a automática então não encontra nada a fazer.

Proteções contra duplicação:

- o imóvel padrão é inserido com `_id` fixo `legacy-default:<userId>`, que o MongoDB sempre mantém único, mesmo sem índices;
- o índice único parcial `one_legacy_default_per_user` é uma segunda barreira;
- a atribuição só alcança aparelhos do próprio usuário sem `propertyId`, então repetir nunca move nada já organizado.

Testado com 8 primeiros acessos simultâneos num banco sem índices: um único imóvel.

## Passo a passo

1. **Backup** (obrigatório):
   ```bash
   mongodump --uri="$MONGO_URL" --db="$MONGO_DB_NAME" --out=backup-antes-imoveis
   ```
2. **Simulação** (não grava nada):
   ```bash
   cd backend
   npm run build
   node scripts/migrate-properties.cjs
   ```
   Saída: contagens de usuários sem imóvel e aparelhos sem imóvel. Nenhum nome, e-mail ou id é exibido.
3. **Aplicação**:
   ```bash
   node scripts/migrate-properties.cjs --apply
   ```
   Pode ser interrompido e executado de novo: retoma de onde parou e não duplica nada.
4. **Conferência**: rode a simulação de novo. `usersWithoutProperty` e `appliancesWithoutProperty` devem ser `0`.

Atalho: `npm run migrate:properties` faz o build e a simulação.

O script usa `MONGO_URL` e `MONGO_DB_NAME` do ambiente. Variáveis exportadas no terminal têm prioridade sobre o `.env`, então confira o banco de destino antes do `--apply`.

## Reversão lógica

A migração só **adiciona** dados. Para voltar ao comportamento anterior sem restaurar o backup:

```js
// No mongosh, no banco do WattStatus
db.appliances.updateMany({}, { $unset: { propertyId: "", roomId: "" } });
db.properties.drop();
db.property_floors.drop();
db.property_rooms.drop();
// Opcional: remover o local das leituras novas
db.energy_samples.updateMany({}, { $unset: { propertyId: "", roomId: "" } });
```

A versão anterior do app ignora esses campos, então reverter o código sem rodar o bloco acima também funciona. Se a versão nova voltar a rodar depois, ela recria o imóvel padrão sozinha.

Se algo der errado com os dados, restaure o backup:

```bash
mongorestore --uri="$MONGO_URL" --drop backup-antes-imoveis
```

## Validado em

Banco Mongo 7 local descartável: simulação, aplicação, reaplicação (0 alterações) e nova simulação, com 3 usuários (um só com aparelhos, sem conta) e 3 aparelhos.
