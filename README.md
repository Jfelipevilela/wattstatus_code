# WattStatus

<<<<<<< HEAD
Plataforma web para monitoramento de consumo de energia, cálculo de custos, gestão de aparelhos e integração com dispositivos IoT (ex.: SmartThings), com foco em acompanhamento residencial e tomada de decisão.

## Visão Geral

O WattStatus permite:

- cadastrar e autenticar usuários;
- adicionar, editar e excluir aparelhos elétricos;
- calcular consumo mensal e custo estimado por aparelho;
- visualizar dashboard com indicadores e gráficos;
- gerar relatórios e exportar em PDF;
- integrar dispositivos SmartThings para leitura/status e importação;
- receber notificações padronizadas de sucesso/erro no site.

## Funcionalidades do Site

### Área pública

- `Página inicial` (`/`)
=======
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
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1
- `Login` (`/login`)
- `Cadastro` (`/signup`)
- `Sobre` (`/sobre`)

<<<<<<< HEAD
### Área autenticada (rotas protegidas)

- `Dashboard` (`/dashboard`)
- `Relatórios` (`/relatorios`)
=======
### Ãrea autenticada (rotas protegidas)

- `Dashboard` (`/dashboard`)
- `RelatÃ³rios` (`/relatorios`)
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1
- `Calculadora` (`/calculadora`)
- `Aparelhos` (`/aparelhos`)
- `Anomalias` (`/anomalias`)
- `Dicas` (`/dicas`)
- `Apps` (`/apps`)
<<<<<<< HEAD
- `Integração SmartThings` (`/integracoes/smartthings`)
=======
- `IntegraÃ§Ã£o SmartThings` (`/integracoes/smartthings`)
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

## Tecnologias Utilizadas

### Frontend

- React + TypeScript
- Vite
- React Router
- Tailwind CSS
- shadcn/ui (Radix UI)
<<<<<<< HEAD
- Recharts (gráficos)
- jsPDF / html2canvas (relatórios)
- React Hook Form + Zod (formulários e validação)
=======
- Recharts (grÃ¡ficos)
- jsPDF / html2canvas (relatÃ³rios)
- React Hook Form + Zod (formulÃ¡rios e validaÃ§Ã£o)
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

### Backend

- Node.js + Express
- TypeScript
<<<<<<< HEAD
- MongoDB (persistência principal)
- JWT (autenticação)
- Zod (validação)
- Integrações plugáveis (SmartThings / LG ThinQ)
=======
- MongoDB (persistÃªncia principal)
- JWT (autenticaÃ§Ã£o)
- Zod (validaÃ§Ã£o)
- IntegraÃ§Ãµes plugÃ¡veis (SmartThings / LG ThinQ)
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1
- Deploy serverless via Netlify Functions

## Arquitetura (Resumo)

- `Frontend` (raiz do projeto) consome a API via `/api/...`.
- `Backend` fica em `backend/` e pode rodar:
  - localmente como servidor Express (`backend/src/server.ts`);
<<<<<<< HEAD
  - em produção via Netlify Function (`backend/netlify/functions/api.ts`).
- O frontend usa `VITE_API_BASE_URL` quando definido; caso contrário, usa `window.location.origin` (útil em Netlify com rewrite).
=======
  - em produÃ§Ã£o via Netlify Function (`backend/netlify/functions/api.ts`).
- O frontend usa `VITE_API_BASE_URL` quando definido; caso contrÃ¡rio, usa `window.location.origin` (Ãºtil em Netlify com rewrite).
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

## Estrutura do Projeto

```text
wattstatus_code/
<<<<<<< HEAD
├─ src/                         # Frontend (React/Vite)
│  ├─ pages/                    # Páginas do site
│  ├─ components/               # Componentes visuais e de domínio
│  ├─ hooks/                    # Hooks (auth, aparelhos, preferências etc.)
│  ├─ lib/                      # API client, utils, tratamento de erro
│  └─ types/                    # Tipos compartilhados do front
├─ backend/                     # API Express/Netlify Function
│  ├─ src/
│  │  ├─ modules/               # Auth, appliances, calculations, integrations...
│  │  ├─ middleware/            # Auth, error-handler
│  │  ├─ storage/               # Mongo/local/postgres adapters
│  │  └─ config/                # Variáveis e tarifas
│  └─ netlify/functions/api.ts  # Wrapper serverless
├─ netlify.toml                 # Build/rewrite para Netlify
└─ README.md                    # Esta documentação
=======
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
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1
```

## Requisitos

- Node.js 18+ (recomendado)
- npm
<<<<<<< HEAD
- MongoDB (local ou remoto) para persistência completa

## Configuração Local (Frontend + Backend)

## 1. Instalar dependências

No diretório raiz:
=======
- MongoDB (local ou remoto) para persistÃªncia completa

## ConfiguraÃ§Ã£o Local (Frontend + Backend)

## 1. Instalar dependÃªncias

No diretÃ³rio raiz:
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

```bash
npm install
```

No backend:

```bash
cd backend
npm install
```

<<<<<<< HEAD
## 2. Configurar variáveis de ambiente
=======
## 2. Configurar variÃ¡veis de ambiente
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

### Frontend (`.env` na raiz)

Use o arquivo `.env.example` como base:

```env
VITE_API_BASE_URL=http://localhost:4000
```

<<<<<<< HEAD
Observação:

- em produção (Netlify), esse valor pode ser omitido se o frontend e a API estiverem no mesmo domínio com rewrite de `/api/*`.

### Backend (`backend/.env`)

Crie manualmente um arquivo `backend/.env` com as variáveis abaixo (não existe `.env.example` no backend neste momento):
=======
ObservaÃ§Ã£o:

- em produÃ§Ã£o (Netlify), esse valor pode ser omitido se o frontend e a API estiverem no mesmo domÃ­nio com rewrite de `/api/*`.

### Backend (`backend/.env`)

Crie manualmente um arquivo `backend/.env` com as variÃ¡veis abaixo (nÃ£o existe `.env.example` no backend neste momento):
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

```env
PORT=4000
JWT_SECRET=sua-chave-jwt

MONGO_URL=mongodb://localhost:27017
MONGO_DB_NAME=wattstatus

<<<<<<< HEAD
# Opcionais (integrações)
=======
# Opcionais (integraÃ§Ãµes)
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1
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

<<<<<<< HEAD
- `MONGO_URL` e `MONGO_DB_NAME` são os principais para persistência.
- `JWT_SECRET` é obrigatório para autenticação segura.
- Credenciais de integração são opcionais (alguns fluxos funcionam em modo parcial/demo).
=======
- `MONGO_URL` e `MONGO_DB_NAME` sÃ£o os principais para persistÃªncia.
- `JWT_SECRET` Ã© obrigatÃ³rio para autenticaÃ§Ã£o segura.
- Credenciais de integraÃ§Ã£o sÃ£o opcionais (alguns fluxos funcionam em modo parcial/demo).
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

## 3. Executar o backend

Em um terminal:

```bash
cd backend
npm run dev
```

<<<<<<< HEAD
Backend padrão: `http://localhost:4000`
=======
Backend padrÃ£o: `http://localhost:4000`
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

Health check:

- `GET http://localhost:4000/health`
- `GET http://localhost:4000/api/health`

## 4. Executar o frontend

Em outro terminal (raiz do projeto):

```bash
npm run dev
```

<<<<<<< HEAD
Frontend padrão (Vite): `http://localhost:5173`
=======
Frontend padrÃ£o (Vite): `http://localhost:5173`
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

## Scripts

### Raiz (frontend)

- `npm run dev` - inicia frontend em desenvolvimento
<<<<<<< HEAD
- `npm run build` - build de produção do frontend
=======
- `npm run build` - build de produÃ§Ã£o do frontend
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1
- `npm run build:dev` - build em modo development
- `npm run preview` - preview local do build
- `npm run lint` - lint do frontend

### Backend (`backend/`)

- `npm run dev` - inicia API Express com reload
- `npm run build` - compila TypeScript
- `npm run start` - executa build compilado

## Rotas Frontend (Resumo)

<<<<<<< HEAD
### Públicas
=======
### PÃºblicas
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

- `/`
- `/login`
- `/signup`
- `/sobre`

<<<<<<< HEAD
### Protegidas (exigem autenticação)
=======
### Protegidas (exigem autenticaÃ§Ã£o)
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

- `/dashboard`
- `/relatorios`
- `/calculadora`
- `/aparelhos`
- `/anomalias`
- `/dicas`
- `/apps`
- `/integracoes/smartthings`

## Endpoints de API (Principais)

<<<<<<< HEAD
### Saúde
=======
### SaÃºde
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

- `GET /health`
- `GET /api/health`

<<<<<<< HEAD
### Autenticação
=======
### AutenticaÃ§Ã£o
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

<<<<<<< HEAD
### Ações autenticadas
=======
### AÃ§Ãµes autenticadas
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

- `GET/POST/PUT/DELETE /api/appliances`
- `GET /api/calculations/tariffs`
- `POST /api/calculations/appliance`
- `GET /api/integrations`
- `GET /api/integrations/:provider/devices`
- `GET /api/integrations/:provider/devices/:deviceId/status`
- `POST /api/integrations/:provider/devices/:deviceId/commands`
- `GET/PUT /api/user-settings`
- `GET /api/analytics/usage`

<<<<<<< HEAD
## Fluxos do Usuário (Resumo)
=======
## Fluxos do UsuÃ¡rio (Resumo)
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

## Cadastro e login

1. Acesse `/signup` para criar a conta.
<<<<<<< HEAD
2. Faça login em `/login`.
3. Após autenticar, o usuário é redirecionado para `/dashboard`.

## Adicionar aparelho

Você pode adicionar aparelhos por:

- `Calculadora` (`/calculadora`) com cálculo de consumo/custo;
- `Aparelhos` (`/aparelhos`) via fluxo de cadastro/edição;
- importação via SmartThings (quando houver leitura disponível).

## Editar e excluir aparelho

- Edição: modal de edição com recálculo e persistência.
- Exclusão: diálogo de confirmação antes de remover.
- O site exibe notificações padronizadas de sucesso/erro nesses fluxos.

## Relatórios

- Geração de relatório mensal por mês/ano;
- filtro por aparelho;
- exportação em PDF.

## Integração SmartThings

- Página dedicada em `/integracoes/smartthings`;
- cadastro do token;
- listagem de dispositivos;
- leitura de status/energia (quando disponível);
- comando ligar/desligar (dispositivos compatíveis);
- importação de dispositivo como aparelho do WattStatus.

## Notificações do Site

O sistema possui notificações visuais padronizadas para:

- erros de API/rede (tratamento global);
- validações de formulário;
- ações concluídas com sucesso (ex.: login, cadastro, relatórios, aparelhos).

As mensagens foram padronizadas em português e o design é consistente em todo o site.

## Deploy (Netlify)

O projeto já possui `netlify.toml` configurado para:

- build do frontend;
- instalação prévia do backend;
- publicação de `dist`;
- função serverless em `backend/netlify/functions`;
=======
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
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1
- rewrite de `/api/*` para a function.

Trecho importante:

- `/api/*` -> `/.netlify/functions/api/api/:splat`

## Troubleshooting

## PowerShell bloqueando `npm.ps1`

<<<<<<< HEAD
Em algumas máquinas Windows, `npm` pode falhar por política de execução.
=======
Em algumas mÃ¡quinas Windows, `npm` pode falhar por polÃ­tica de execuÃ§Ã£o.
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

Use:

```bash
npm.cmd run dev
npm.cmd run build
```

<<<<<<< HEAD
## Frontend não conecta na API
=======
## Frontend nÃ£o conecta na API
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

Verifique:

- backend rodando em `http://localhost:4000`;
<<<<<<< HEAD
- variável `VITE_API_BASE_URL` na raiz;
=======
- variÃ¡vel `VITE_API_BASE_URL` na raiz;
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1
- console do navegador para erros de CORS/rede.

## MongoDB

<<<<<<< HEAD
Se a API subir mas falhar em rotas autenticadas/persistência:
=======
Se a API subir mas falhar em rotas autenticadas/persistÃªncia:
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1

- confirme `MONGO_URL`;
- confirme `MONGO_DB_NAME`;
- valide conectividade com o banco (local ou cloud).

<<<<<<< HEAD
## Documentação complementar

- Backend: `backend/README.md`

## Observações

- O projeto possui páginas e textos ainda em evolução (há trechos legados com problemas de encoding em partes antigas da interface).
- O backend suporta integrações plugáveis e está preparado para expansão de provedores IoT.
=======
## DocumentaÃ§Ã£o complementar

- Backend: `backend/README.md`

## ObservaÃ§Ãµes

- O projeto possui pÃ¡ginas e textos ainda em evoluÃ§Ã£o (hÃ¡ trechos legados com problemas de encoding em partes antigas da interface).
- O backend suporta integraÃ§Ãµes plugÃ¡veis e estÃ¡ preparado para expansÃ£o de provedores IoT.


## Auditoria de outubro de 2026

Consulte [matriz de requisitos](docs/AUDITORIA_REQUISITOS_WATTSTATUS.md) e [correções propostas ao documento acadêmico](docs/ALTERACOES_DOCUMENTO_ACADEMICO.md). Esta branch registra amostras energéticas SmartThings em `energy_samples`; não inventa dados anteriores à coleta. O dashboard e os relatórios mostram estimativas e medições separadas. A coleta acontece quando o status do dispositivo é consultado, sem processo contínuo em Netlify.

### Ambiente

Use `backend/.env.example` como referência local. Configure `MONGO_URL`, `MONGO_DB_NAME`, `JWT_SECRET`, `SMARTTHINGS_TOKEN_SECRET` e `APP_ORIGINS` no Netlify. Os dois segredos são obrigatórios em produção. `APP_ORIGINS` permite CORS somente para as origens exatas configuradas. `TRUST_PROXY_HOPS` deve refletir o proxy real. `SMARTTHINGS_TOKEN` global não autentica usuários. Mantenha `SMARTTHINGS_TOKEN_SECRET` estável para decifrar tokens existentes. Sessões anteriores à integração exigem novo login.

`backend/.env` saiu do índice Git, mas aparece no histórico. Identifique valores reais e rotacione segredos com procedimento coordenado, sem registrar seus valores. Não inclua `.env` em commits futuros.

### Banco de dados e coleta

`MongoDatabase.init()` cria índices em `energy_samples`, `sessions`, `auth_sessions`, `auth_limits`, `users.emailCanonical` e `appliances.importKey`. Não apaga registros existentes. A amostra inclui usuário, aparelho vinculado quando houver, provedor, dispositivo, instante UTC, contador kWh e tarifa capturada. Diferenças entre amostras consecutivas formam intervalos. Reinicialização de contador não gera consumo negativo. A ausência de segunda leitura aparece como ausência de dado medido. Alterações no cadastro atual não reescrevem amostras históricas.

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

As páginas agora usam carregamento sob demanda. Isso não comprova RNF-002 sem medição real. jsPDF e React Router foram atualizados e passaram build/testes. `npm audit` backend mostrou 0 vulnerabilidades. No frontend, restaram 5 altas e 3 moderadas em ferramentas de desenvolvimento, sobretudo na cadeia Tailwind CSS 3; a correção automática exige migração major para Tailwind 4 e revisão visual, ainda pendente.
# Homologação de energia

A coleta periódica SmartThings usa função agendada Netlify, desativada por padrão. Configure `ENERGY_COLLECTION_ENABLED=true` e habilite individualmente no painel SmartThings. Consulte `docs/HARDENING_PRODUCAO.md` para auditoria de dependências, medições, rotação de credenciais, testes físicos e decisão de produção.

\n
## Integração local com dev_V1

A branch `fix/audit-wattstatus-2026-integracao-dev-v1` incorpora `origin/dev_V1` localmente. Veja [relatório dos conflitos](docs/RELATORIO_CONFLITOS_DEV_V1.md). Cadastro e login exigem token CSRF obtido em `GET /api/auth/csrf`; a API responde com cookie HTTP-only. `POST /api/auth/logout` revoga a sessão persistida. Configure `APP_ORIGINS` e `TRUST_PROXY_HOPS` conforme o ambiente. O coletor agendado continua desligado por padrão. Nenhum push, merge na branch-base ou deploy foi feito nesta integração.
>>>>>>> origin/fix/audit-wattstatus-2026-integracao-dev-v1
