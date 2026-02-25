# WattStatus

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
- `Login` (`/login`)
- `Cadastro` (`/signup`)
- `Sobre` (`/sobre`)

### Área autenticada (rotas protegidas)

- `Dashboard` (`/dashboard`)
- `Relatórios` (`/relatorios`)
- `Calculadora` (`/calculadora`)
- `Aparelhos` (`/aparelhos`)
- `Anomalias` (`/anomalias`)
- `Dicas` (`/dicas`)
- `Apps` (`/apps`)
- `Integração SmartThings` (`/integracoes/smartthings`)

## Tecnologias Utilizadas

### Frontend

- React + TypeScript
- Vite
- React Router
- Tailwind CSS
- shadcn/ui (Radix UI)
- Recharts (gráficos)
- jsPDF / html2canvas (relatórios)
- React Hook Form + Zod (formulários e validação)

### Backend

- Node.js + Express
- TypeScript
- MongoDB (persistência principal)
- JWT (autenticação)
- Zod (validação)
- Integrações plugáveis (SmartThings / LG ThinQ)
- Deploy serverless via Netlify Functions

## Arquitetura (Resumo)

- `Frontend` (raiz do projeto) consome a API via `/api/...`.
- `Backend` fica em `backend/` e pode rodar:
  - localmente como servidor Express (`backend/src/server.ts`);
  - em produção via Netlify Function (`backend/netlify/functions/api.ts`).
- O frontend usa `VITE_API_BASE_URL` quando definido; caso contrário, usa `window.location.origin` (útil em Netlify com rewrite).

## Estrutura do Projeto

```text
wattstatus_code/
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
```

## Requisitos

- Node.js 18+ (recomendado)
- npm
- MongoDB (local ou remoto) para persistência completa

## Configuração Local (Frontend + Backend)

## 1. Instalar dependências

No diretório raiz:

```bash
npm install
```

No backend:

```bash
cd backend
npm install
```

## 2. Configurar variáveis de ambiente

### Frontend (`.env` na raiz)

Use o arquivo `.env.example` como base:

```env
VITE_API_BASE_URL=http://localhost:4000
```

Observação:

- em produção (Netlify), esse valor pode ser omitido se o frontend e a API estiverem no mesmo domínio com rewrite de `/api/*`.

### Backend (`backend/.env`)

Crie manualmente um arquivo `backend/.env` com as variáveis abaixo (não existe `.env.example` no backend neste momento):

```env
PORT=4000
JWT_SECRET=sua-chave-jwt

MONGO_URL=mongodb://localhost:27017
MONGO_DB_NAME=wattstatus

# Opcionais (integrações)
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

- `MONGO_URL` e `MONGO_DB_NAME` são os principais para persistência.
- `JWT_SECRET` é obrigatório para autenticação segura.
- Credenciais de integração são opcionais (alguns fluxos funcionam em modo parcial/demo).

## 3. Executar o backend

Em um terminal:

```bash
cd backend
npm run dev
```

Backend padrão: `http://localhost:4000`

Health check:

- `GET http://localhost:4000/health`
- `GET http://localhost:4000/api/health`

## 4. Executar o frontend

Em outro terminal (raiz do projeto):

```bash
npm run dev
```

Frontend padrão (Vite): `http://localhost:5173`

## Scripts

### Raiz (frontend)

- `npm run dev` - inicia frontend em desenvolvimento
- `npm run build` - build de produção do frontend
- `npm run build:dev` - build em modo development
- `npm run preview` - preview local do build
- `npm run lint` - lint do frontend

### Backend (`backend/`)

- `npm run dev` - inicia API Express com reload
- `npm run build` - compila TypeScript
- `npm run start` - executa build compilado

## Rotas Frontend (Resumo)

### Públicas

- `/`
- `/login`
- `/signup`
- `/sobre`

### Protegidas (exigem autenticação)

- `/dashboard`
- `/relatorios`
- `/calculadora`
- `/aparelhos`
- `/anomalias`
- `/dicas`
- `/apps`
- `/integracoes/smartthings`

## Endpoints de API (Principais)

### Saúde

- `GET /health`
- `GET /api/health`

### Autenticação

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Ações autenticadas

- `GET/POST/PUT/DELETE /api/appliances`
- `GET /api/calculations/tariffs`
- `POST /api/calculations/appliance`
- `GET /api/integrations`
- `GET /api/integrations/:provider/devices`
- `GET /api/integrations/:provider/devices/:deviceId/status`
- `POST /api/integrations/:provider/devices/:deviceId/commands`
- `GET/PUT /api/user-settings`
- `GET /api/analytics/usage`

## Fluxos do Usuário (Resumo)

## Cadastro e login

1. Acesse `/signup` para criar a conta.
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
- rewrite de `/api/*` para a function.

Trecho importante:

- `/api/*` -> `/.netlify/functions/api/api/:splat`

## Troubleshooting

## PowerShell bloqueando `npm.ps1`

Em algumas máquinas Windows, `npm` pode falhar por política de execução.

Use:

```bash
npm.cmd run dev
npm.cmd run build
```

## Frontend não conecta na API

Verifique:

- backend rodando em `http://localhost:4000`;
- variável `VITE_API_BASE_URL` na raiz;
- console do navegador para erros de CORS/rede.

## MongoDB

Se a API subir mas falhar em rotas autenticadas/persistência:

- confirme `MONGO_URL`;
- confirme `MONGO_DB_NAME`;
- valide conectividade com o banco (local ou cloud).

## Documentação complementar

- Backend: `backend/README.md`

## Observações

- O projeto possui páginas e textos ainda em evolução (há trechos legados com problemas de encoding em partes antigas da interface).
- O backend suporta integrações plugáveis e está preparado para expansão de provedores IoT.

