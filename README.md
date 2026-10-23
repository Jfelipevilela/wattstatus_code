# WattStatus

Plataforma web para monitoramento de consumo de energia, cÃ¡lculo de custos, gestÃ£o de aparelhos e integraÃ§Ã£o com dispositivos IoT (ex.: SmartThings), com foco em acompanhamento residencial e tomada de decisÃ£o.

## VisÃ£o Geral

O WattStatus permite:

- cadastrar e autenticar usuÃ¡rios;
- adicionar, editar e excluir aparelhos elÃ©tricos;
- calcular consumo mensal e custo estimado por aparelho;
- visualizar dashboard com indicadores e grÃ¡ficos;
- gerar relatÃ³rios e exportar em PDF;
- integrar dispositivos SmartThings para leitura/status e importaÃ§Ã£o;
- receber notificaÃ§Ãµes padronizadas de sucesso/erro no site.

## Funcionalidades do Site

### Ãrea pÃºblica

- `PÃ¡gina inicial` (`/`)
- `Login` (`/login`)
- `Cadastro` (`/signup`)
- `Sobre` (`/sobre`)

### Ãrea autenticada (rotas protegidas)

- `Dashboard` (`/dashboard`)
- `RelatÃ³rios` (`/relatorios`)
- `Calculadora` (`/calculadora`)
- `Aparelhos` (`/aparelhos`)
- `Anomalias` (`/anomalias`)
- `Dicas` (`/dicas`)
- `Apps` (`/apps`)
- `IntegraÃ§Ã£o SmartThings` (`/integracoes/smartthings`)

## Tecnologias Utilizadas

### Frontend

- React + TypeScript
- Vite
- React Router
- Tailwind CSS
- shadcn/ui (Radix UI)
- Recharts (grÃ¡ficos)
- jsPDF / html2canvas (relatÃ³rios)
- React Hook Form + Zod (formulÃ¡rios e validaÃ§Ã£o)

### Backend

- Node.js + Express
- TypeScript
- MongoDB (persistÃªncia principal)
- JWT (autenticaÃ§Ã£o)
- Zod (validaÃ§Ã£o)
- IntegraÃ§Ãµes plugÃ¡veis (SmartThings / LG ThinQ)
- Deploy serverless via Netlify Functions

## Arquitetura (Resumo)

- `Frontend` (raiz do projeto) consome a API via `/api/...`.
- `Backend` fica em `backend/` e pode rodar:
  - localmente como servidor Express (`backend/src/server.ts`);
  - em produÃ§Ã£o via Netlify Function (`backend/netlify/functions/api.ts`).
- O frontend usa `VITE_API_BASE_URL` quando definido; caso contrÃ¡rio, usa `window.location.origin` (Ãºtil em Netlify com rewrite).

## Estrutura do Projeto

```text
wattstatus_code/
â”œâ”€ src/                         # Frontend (React/Vite)
â”‚  â”œâ”€ pages/                    # PÃ¡ginas do site
â”‚  â”œâ”€ components/               # Componentes visuais e de domÃ­nio
â”‚  â”œâ”€ hooks/                    # Hooks (auth, aparelhos, preferÃªncias etc.)
â”‚  â”œâ”€ lib/                      # API client, utils, tratamento de erro
â”‚  â””â”€ types/                    # Tipos compartilhados do front
â”œâ”€ backend/                     # API Express/Netlify Function
â”‚  â”œâ”€ src/
â”‚  â”‚  â”œâ”€ modules/               # Auth, appliances, calculations, integrations...
â”‚  â”‚  â”œâ”€ middleware/            # Auth, error-handler
â”‚  â”‚  â”œâ”€ storage/               # Mongo/local/postgres adapters
â”‚  â”‚  â””â”€ config/                # VariÃ¡veis e tarifas
â”‚  â””â”€ netlify/functions/api.ts  # Wrapper serverless
â”œâ”€ netlify.toml                 # Build/rewrite para Netlify
â””â”€ README.md                    # Esta documentaÃ§Ã£o
```

## Requisitos

- Node.js 18+ (recomendado)
- npm
- MongoDB (local ou remoto) para persistÃªncia completa

## ConfiguraÃ§Ã£o Local (Frontend + Backend)

## 1. Instalar dependÃªncias

No diretÃ³rio raiz:

```bash
npm install
```

No backend:

```bash
cd backend
npm install
```

## 2. Configurar variÃ¡veis de ambiente

### Frontend (`.env` na raiz)

Use o arquivo `.env.example` como base:

```env
VITE_API_BASE_URL=http://localhost:4000
```

ObservaÃ§Ã£o:

- em produÃ§Ã£o (Netlify), esse valor pode ser omitido se o frontend e a API estiverem no mesmo domÃ­nio com rewrite de `/api/*`.

### Backend (`backend/.env`)

Crie manualmente um arquivo `backend/.env` com as variÃ¡veis abaixo (nÃ£o existe `.env.example` no backend neste momento):

```env
PORT=4000
JWT_SECRET=sua-chave-jwt

MONGO_URL=mongodb://localhost:27017
MONGO_DB_NAME=wattstatus

# Opcionais (integraÃ§Ãµes)
SMARTTHINGS_TOKEN=
SMARTTHINGS_TOKEN_SECRET=
LG_CLIENT_ID=
LG_CLIENT_SECRET=
LG_REFRESH_TOKEN=

# Opcionais / fallback
DATABASE_URL=postgres://user:password@localhost:5432/wattstatus
TARIFFS_API_URL=
```

Notas:

- `MONGO_URL` e `MONGO_DB_NAME` sÃ£o os principais para persistÃªncia.
- `JWT_SECRET` Ã© obrigatÃ³rio para autenticaÃ§Ã£o segura.
- Credenciais de integraÃ§Ã£o sÃ£o opcionais (alguns fluxos funcionam em modo parcial/demo).

## 3. Executar o backend

Em um terminal:

```bash
cd backend
npm run dev
```

Backend padrÃ£o: `http://localhost:4000`

Health check:

- `GET http://localhost:4000/health`
- `GET http://localhost:4000/api/health`

## 4. Executar o frontend

Em outro terminal (raiz do projeto):

```bash
npm run dev
```

Frontend padrÃ£o (Vite): `http://localhost:5173`

## Scripts

### Raiz (frontend)

- `npm run dev` - inicia frontend em desenvolvimento
- `npm run build` - build de produÃ§Ã£o do frontend
- `npm run build:dev` - build em modo development
- `npm run preview` - preview local do build
- `npm run lint` - lint do frontend

### Backend (`backend/`)

- `npm run dev` - inicia API Express com reload
- `npm run build` - compila TypeScript
- `npm run start` - executa build compilado

## Rotas Frontend (Resumo)

### PÃºblicas

- `/`
- `/login`
- `/signup`
- `/sobre`

### Protegidas (exigem autenticaÃ§Ã£o)

- `/dashboard`
- `/relatorios`
- `/calculadora`
- `/aparelhos`
- `/anomalias`
- `/dicas`
- `/apps`
- `/integracoes/smartthings`

## Endpoints de API (Principais)

### SaÃºde

- `GET /health`
- `GET /api/health`

### AutenticaÃ§Ã£o

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### AÃ§Ãµes autenticadas

- `GET/POST/PUT/DELETE /api/appliances`
- `GET /api/calculations/tariffs`
- `POST /api/calculations/appliance`
- `GET /api/integrations`
- `GET /api/integrations/:provider/devices`
- `GET /api/integrations/:provider/devices/:deviceId/status`
- `POST /api/integrations/:provider/devices/:deviceId/commands`
- `GET/PUT /api/user-settings`
- `GET /api/analytics/usage`

## Fluxos do UsuÃ¡rio (Resumo)

## Cadastro e login

1. Acesse `/signup` para criar a conta.
2. FaÃ§a login em `/login`.
3. ApÃ³s autenticar, o usuÃ¡rio Ã© redirecionado para `/dashboard`.

## Adicionar aparelho

VocÃª pode adicionar aparelhos por:

- `Calculadora` (`/calculadora`) com cÃ¡lculo de consumo/custo;
- `Aparelhos` (`/aparelhos`) via fluxo de cadastro/ediÃ§Ã£o;
- importaÃ§Ã£o via SmartThings (quando houver leitura disponÃ­vel).

## Editar e excluir aparelho

- EdiÃ§Ã£o: modal de ediÃ§Ã£o com recÃ¡lculo e persistÃªncia.
- ExclusÃ£o: diÃ¡logo de confirmaÃ§Ã£o antes de remover.
- O site exibe notificaÃ§Ãµes padronizadas de sucesso/erro nesses fluxos.

## RelatÃ³rios

- GeraÃ§Ã£o de relatÃ³rio mensal por mÃªs/ano;
- filtro por aparelho;
- exportaÃ§Ã£o em PDF.

## IntegraÃ§Ã£o SmartThings

- PÃ¡gina dedicada em `/integracoes/smartthings`;
- cadastro do token;
- listagem de dispositivos;
- leitura de status/energia (quando disponÃ­vel);
- comando ligar/desligar (dispositivos compatÃ­veis);
- importaÃ§Ã£o de dispositivo como aparelho do WattStatus.

## NotificaÃ§Ãµes do Site

O sistema possui notificaÃ§Ãµes visuais padronizadas para:

- erros de API/rede (tratamento global);
- validaÃ§Ãµes de formulÃ¡rio;
- aÃ§Ãµes concluÃ­das com sucesso (ex.: login, cadastro, relatÃ³rios, aparelhos).

As mensagens foram padronizadas em portuguÃªs e o design Ã© consistente em todo o site.

## Deploy (Netlify)

O projeto jÃ¡ possui `netlify.toml` configurado para:

- build do frontend;
- instalaÃ§Ã£o prÃ©via do backend;
- publicaÃ§Ã£o de `dist`;
- funÃ§Ã£o serverless em `backend/netlify/functions`;
- rewrite de `/api/*` para a function.

Trecho importante:

- `/api/*` -> `/.netlify/functions/api/api/:splat`

## Troubleshooting

## PowerShell bloqueando `npm.ps1`

Em algumas mÃ¡quinas Windows, `npm` pode falhar por polÃ­tica de execuÃ§Ã£o.

Use:

```bash
npm.cmd run dev
npm.cmd run build
```

## Frontend nÃ£o conecta na API

Verifique:

- backend rodando em `http://localhost:4000`;
- variÃ¡vel `VITE_API_BASE_URL` na raiz;
- console do navegador para erros de CORS/rede.

## MongoDB

Se a API subir mas falhar em rotas autenticadas/persistÃªncia:

- confirme `MONGO_URL`;
- confirme `MONGO_DB_NAME`;
- valide conectividade com o banco (local ou cloud).

## DocumentaÃ§Ã£o complementar

- Backend: `backend/README.md`

## ObservaÃ§Ãµes

- O projeto possui pÃ¡ginas e textos ainda em evoluÃ§Ã£o (hÃ¡ trechos legados com problemas de encoding em partes antigas da interface).
- O backend suporta integraÃ§Ãµes plugÃ¡veis e estÃ¡ preparado para expansÃ£o de provedores IoT.


## Auditoria de outubro de 2026

Consulte [matriz de requisitos](docs/AUDITORIA_REQUISITOS_WATTSTATUS.md) e [correções propostas ao documento acadêmico](docs/ALTERACOES_DOCUMENTO_ACADEMICO.md). Esta branch registra amostras energéticas SmartThings em `energy_samples`; não inventa dados anteriores à coleta. O dashboard e os relatórios mostram estimativas e medições separadas. A coleta acontece quando o status do dispositivo é consultado, sem processo contínuo em Netlify.

### Ambiente

Use `backend/.env.example` como referência local. Configure `MONGO_URL`, `MONGO_DB_NAME`, `JWT_SECRET`, `SMARTTHINGS_TOKEN_SECRET` e `FRONTEND_ORIGIN` no Netlify. Os dois segredos são obrigatórios em produção. `FRONTEND_ORIGIN` permite CORS para o frontend configurado; requisições de mesma origem continuam aceitas. `SMARTTHINGS_TOKEN` global não autentica usuários. Mantenha `SMARTTHINGS_TOKEN_SECRET` estável para decifrar tokens existentes. Sessões anteriores a esta branch não possuem `jti` e exigem novo login.

`backend/.env` saiu do índice Git, mas aparece no histórico. Identifique valores reais e rotacione segredos com procedimento coordenado, sem registrar seus valores. Não inclua `.env` em commits futuros.

### Banco de dados e coleta

`MongoDatabase.init()` cria índices em `energy_samples`, `sessions` e `appliances.importKey`. Não apaga registros existentes. A amostra inclui usuário, aparelho vinculado quando houver, provedor, dispositivo, instante UTC, contador kWh e tarifa capturada. Diferenças entre amostras consecutivas formam intervalos. Reinicialização de contador não gera consumo negativo. A ausência de segunda leitura aparece como ausência de dado medido. Alterações no cadastro atual não reescrevem amostras históricas.

A tarifa pessoal é informada em R$/kWh no cadastro ou edição de aparelho e armazenada em `user_settings` e `appliances.tariffValue`. Aparelhos antigos usam referência estadual até edição. Importação SmartThings exige potência fornecida pelo dispositivo, tarifa salva e não aceita dispositivo duplicado.

### Endpoints principais

- `GET /api/energy/history?start=<ISO>&end=<ISO>[&applianceId=<UUID>]`: intervalos energéticos do usuário autenticado; máximo de 366 dias. Limites ISO devem representar a competência no fuso do usuário.
- `GET /api/integrations/smartthings/devices/:deviceId/status`: consulta status e registra amostra somente se `energyMeter.energy` tiver unidade `Wh` ou `kWh` válida.
- `POST /api/integrations/smartthings/token`: salva ou revoga token por usuário. Token não retorna ao frontend após salvo.
- `POST /api/auth/logout`: remove sessão MongoDB; JWT correspondente deixa de funcionar.

### Testes e publicação

Na raiz, execute `npm ci`, `npm test`, `npm run build`, `npm run lint` e `npx tsc --noEmit -p tsconfig.app.json`. Em `backend`, execute `npm ci` e `npm test`. Para teste MongoDB real, inicie instância local isolada e defina `TEST_MONGO_URL=mongodb://127.0.0.1:<porta>` antes de `npm test`; sem essa variável, o teste MongoDB é explicitamente ignorado.

`netlify.toml` compila backend e frontend e publica `dist`. Valide as variáveis e a inicialização dos índices em ambiente de prévia. Use duas contas de teste e dispositivo físico compatível antes de considerar revisão de deploy. Não houve merge ou deploy nesta auditoria. RNF-002 ainda requer medição de desempenho reproduzível.

### Dependências e desempenho

As páginas agora usam carregamento sob demanda. No build local, o chunk principal caiu de cerca de 1,12 MB para 346 KB antes de gzip; isso não comprova RNF-002. jsPDF e React Router foram atualizados e passaram build/testes. `npm audit` backend mostrou 0 vulnerabilidades. No frontend, restaram 5 altas e 2 moderadas ligadas à cadeia Tailwind CSS 3; a correção automática exige migração major para Tailwind 4 e revisão visual, ainda pendente.
