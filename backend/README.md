# WattStatus Backend

Node.js/Express API que move as regras de autenticacao, validacao e calculos do front para o servidor e adiciona integracoes plugaveis com dispositivos inteligentes. Agora usa PostgreSQL para armazenar usuarios e aparelhos.

## Configuracao rapida
1. Entre na pasta `backend` e copie o `.env.example` para `.env`, preenchendo `JWT_SECRET`, `DATABASE_URL` e os tokens de integracoes (SmartThings e LG ThinQ).
2. Instale dependencias: `npm install`.
3. Garanta que o PostgreSQL esta acessivel e com o banco criado (conforme `DATABASE_URL`); as tabelas sao criadas automaticamente.
4. Ambiente de desenvolvimento: `npm run dev` (porta padrao 4000). Build/start: `npm run build` e `npm start`.

## Endpoints principais
- `POST /api/auth/register` - cria usuario (valida nome/email/senha) e retorna JWT.
- `POST /api/auth/login` - autentica e retorna JWT.
- `GET /api/auth/me` - dados do usuario logado (Authorization: Bearer).
- `POST /api/calculations/appliance` - calcula consumo/custo usando a mesma formula do front; retorna status normal/warning/critical.
- `GET /api/calculations/tariffs` - mapa de tarifas por estado.
- `GET/POST/PUT/DELETE /api/appliances` - CRUD que recalcula consumo/custo no backend e persiste no PostgreSQL.
- `GET /api/integrations` - lista integracoes registradas e se estao configuradas.
- `GET /api/integrations/:provider/devices` - lista dispositivos da integracao (SmartThings real, LG ThinQ demo se nao houver credenciais).
- `GET /api/integrations/:provider/devices/:deviceId/status` - status do dispositivo.
- `POST /api/integrations/:provider/devices/:deviceId/commands` - envia comando `{ capability, command, arguments?, component? }`.

## Estrutura
- `src/modules/auth` - registro/login com JWT e bcrypt.
- `src/modules/calculations` - logica de consumo/custo e tarifas (espelha o front).
- `src/modules/appliances` - CRUD persistido em `backend/data/db.json`.
- `src/modules/integrations` - sistema de plugins; SmartThings real, LG ThinQ demo/real; pronto para adicionar novos provedores.

## Notas
- Banco local em arquivo (`backend/data/db.json`). Ajuste `LocalDatabase` se quiser outro storage.
- LG ThinQ roda em modo demo se nao houver credenciais validas; substitua os tokens e endpoints conforme sua conta de desenvolvedor.
