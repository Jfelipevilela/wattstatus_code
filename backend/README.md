# WattStatus Backend

Node.js/Express API com JWT, calculos de consumo e integracoes plugaveis. Agora o backend roda como Function da Netlify (serverless) e usa MongoDB por padrao para persistir usuarios, aparelhos e tokens.

## Configuracao rapida
1. Entre na pasta `backend` e copie o `.env.example` para `.env`, preenchendo `JWT_SECRET`, `MONGO_URL`, `MONGO_DB_NAME` e os tokens de integracao (SmartThings e LG ThinQ).
2. Instale dependencias: `npm install` (raiz) e, se necessario, `npm install --prefix backend` para preparar as deps da function.
3. Ambiente de desenvolvimento classico: `npm run dev` (porta padrao 4000). Build/start: `npm run build` e `npm start`.
4. Netlify: o arquivo `netlify.toml` ja direciona `/api/*` para `/.netlify/functions/api`. Defina as variaveis de ambiente no painel da Netlify e o build command cuidara de instalar o backend antes de gerar o front.

## Endpoints principais
- `GET /health` e `/api/...` (via Function `api`) — mesmas rotas do Express original.
- `POST /api/auth/register` - cria usuario (valida nome/email/senha) e retorna JWT.
- `POST /api/auth/login` - autentica e retorna JWT.
- `GET /api/auth/me` - dados do usuario logado (Authorization: Bearer).
- `POST /api/calculations/appliance` - calcula consumo/custo usando a mesma formula do front; retorna status normal/warning/critical.
- `GET /api/calculations/tariffs` - mapa de tarifas por estado.
- `GET/POST/PUT/DELETE /api/appliances` - CRUD que recalcula consumo/custo e persiste no MongoDB.
- `GET /api/integrations` - lista integracoes registradas e se estao configuradas.
- `GET /api/integrations/:provider/devices` - lista dispositivos da integracao (SmartThings real, LG ThinQ demo se nao houver credenciais).
- `GET /api/integrations/:provider/devices/:deviceId/status` - status do dispositivo.
- `POST /api/integrations/:provider/devices/:deviceId/commands` - envia comando `{ capability, command, arguments?, component? }`.

## Estrutura
- `src/modules/auth` - registro/login com JWT e bcrypt.
- `src/modules/calculations` - logica de consumo/custo e tarifas (espelha o front).
- `src/modules/appliances` - CRUD persistido no MongoDB (via `MongoDatabase`).
- `src/modules/integrations` - sistema de plugins; SmartThings real, LG ThinQ demo/real; pronto para adicionar novos provedores.

## Notas
- Localmente ainda e possivel usar o servidor Express (`npm run dev`); em producao a mesma app roda na Function `backend/netlify/functions/api.ts` usando `serverless-http`.
- LG ThinQ roda em modo demo se nao houver credenciais validas; substitua os tokens e endpoints conforme sua conta de desenvolvedor.

## Histórico energético e sessões (auditoria 2026)

`MongoDatabase.init()` cria índices para `energy_samples` e `sessions`. Cada consulta autenticada a `GET /api/integrations/smartthings/devices/:deviceId/status` registra uma amostra imutável apenas quando SmartThings retorna `energyMeter.energy` com unidade `Wh` ou `kWh`. Consultas a `GET /api/energy/history?start=<ISO>&end=<ISO>[&applianceId=<UUID>]` devolvem intervalos derivados de duas amostras acumuladas. `start` é inclusivo, `end` exclusivo; máximo 366 dias. Use limites ISO calculados no fuso do usuário. Contador reduzido não gera consumo negativo. A tarifa da amostra final fica congelada no histórico. Intervalos sem coleta não são preenchidos.

JWTs carregam `jti`; a coleção `sessions` confirma cada requisição e logout remove a sessão. Cookies HTTP-only duram 12 horas. Mutações por cookie exigem `Origin` aceito. Configure `FRONTEND_ORIGIN` para frontend em outra origem. Frontend na mesma origem Netlify funciona sem CORS adicional. Rate limiting adicional protege cadastro e login, mas é local à instância Express; em funções serverless, a aplicação precisa de limitador compartilhado para garantia global.

Para testar com MongoDB 7 isolado: inicie uma instância local de teste, defina `TEST_MONGO_URL=mongodb://127.0.0.1:<porta>` e execute `npm test`. A suíte cria banco com nome aleatório e remove apenas esse banco ao terminar. Sem a variável, teste MongoDB aparece como `SKIP`. Não use URL de produção. Testes SmartThings usam respostas simuladas; nenhum dispositivo físico foi validado.
