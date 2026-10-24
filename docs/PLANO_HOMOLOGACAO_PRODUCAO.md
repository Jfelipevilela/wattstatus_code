# Plano de homologação e publicação do WattStatus

Versão: `main` local em `1d407ef` (merge `--no-ff` de `release/wattstatus-rc1`, 36 commits sobre `6191654`). `origin/main` continua em `b456a92`. Este plano não depende de dados nem de infraestrutura de produção.

Nada aqui foi executado na Netlify nem em banco real. As seções indicam o que já foi **validado localmente** e o que **exige deploy de homologação**.

## 1. Estado técnico verificado (local, 24/10/2026)

| Item | Resultado |
|---|---|
| Instalação limpa (`npm ci` na raiz e em `backend/`, worktree isolada, sem `node_modules` compartilhado) | 480 + 162 pacotes, lockfiles coerentes, nenhum arquivo do Git alterado |
| SDK `@anthropic-ai/sdk` | 0.132.0 instalado pelo lockfile |
| Build do backend e das Functions (`tsc` + `tsconfig.functions.json`) | OK |
| Empacotamento esbuild das Functions (como a Netlify faz) | `api` 4,6 MB, `api-stream` 4,6 MB, `collect-energy` 2,2 MB. Carregam sem módulo faltando |
| Build do frontend | OK; bundle principal com 173,65 kB (57,6 kB gzip) |
| TypeScript e ESLint | 0 erros |
| Testes do frontend | 45 de 45 |
| Testes do backend | 153 passam, 0 falham, 45 pulados (exigem MongoDB) |
| Testes MongoDB (7.0.14 descartável) | 45 de 45, incluindo privilégio admin, streaming autenticado, coleta, IA e qualidade das medições |
| Ensaio do procedimento administrativo (§ 3.3) | Completo, com os resultados esperados |
| Navegador (Chrome, desktop 1440×900 e mobile 390×844), MongoDB descartável e dados sintéticos | Todos os fluxos passaram, com IA desligada e com provedor inacessível, sem erros de console |

Fluxos do navegador: cadastro, login e sessão, dashboard, explicação do gráfico, chat com etapas e botão parar, histórico, preferências, alertas, administração, relatório com PDF, imóveis, ambientes, aparelhos, maquete 3D, investigação, planos e qualidade das medições.

Nenhum arquivo não versionado é necessário: o build e os testes rodaram numa worktree recém-criada a partir do commit.

## 2. Variáveis de ambiente

Configurar no painel da Netlify, no contexto do site de homologação e com escopo **Functions** (as do frontend com escopo **Builds**). **Nunca** no repositório. `backend/.env.example` lista todas, sem valores reais.

### 2.1 Obrigatórias

| Variável | Homologação | Observação |
|---|---|---|
| `NODE_ENV` | `production` | Liga os cookies `Secure` e `__Host-` e recusa segredos fracos. Sem ela, os cookies saem sem `Secure` |
| `JWT_SECRET` | Aleatório com 32 caracteres ou mais, **exclusivo da homologação** | Trocar invalida as sessões |
| `SMARTTHINGS_TOKEN_SECRET` | Aleatório, **diferente** do `JWT_SECRET` e do de produção | Criptografa os tokens SmartThings |
| `MONGO_URL` | Cluster ou banco **separado** da produção | Usuário do banco com acesso só a esse banco |
| `MONGO_DB_NAME` | Por exemplo `wattstatus_homolog` | Nunca `wattstatus` |
| `APP_ORIGINS` | URL do site de homologação, por exemplo `https://homolog--wattstatus.netlify.app` | Sem ela vale `URL`. Para deploy preview, incluir também o `DEPLOY_PRIME_URL` do preview; caso contrário, CORS responde 403 |
| `TRUST_PROXY_HOPS` | O mesmo valor validado em produção (ver `docs/HARDENING_PRODUCAO.md`) | Define o IP usado no rate limit da função `api`. A função `api-stream` usa `context.ip` |

### 2.2 Desligadas no início da homologação

| Variável | Valor | Efeito |
|---|---|---|
| `AI_ENABLED` | `false` | Assistente responde só com o motor de cálculo. Nenhuma chamada a modelo |
| `AI_API_KEY` | vazio | |
| `ENERGY_COLLECTION_ENABLED` | `false` | A função agendada `collect-energy` retorna sem fazer nada |
| `AI_ALERTS_DELIVERY` | `off` | Nenhum alerta é enviado (não há canal validado) |
| `SMARTTHINGS_CLIENT_ID`, `SMARTTHINGS_CLIENT_SECRET` | vazios | Login com Samsung oculto; só token pessoal, e só se for testar |
| `SMARTTHINGS_REDIRECT_URI` | URL de callback da **homologação** | Quando o OAuth for ligado, o SmartApp de homologação precisa ter esse redirect |

### 2.3 Opcionais (valores padrão no código)

- **Coleta**: `ENERGY_COLLECTION_INTERVAL_MINUTES` (30), `ENERGY_COLLECTION_BATCH_SIZE` (60), `ENERGY_COLLECTION_CONCURRENCY` (4), `ENERGY_COLLECTION_PER_USER` (2). Todas limitadas por `COLLECTION_LIMITS` (500, 16, 4).
- **IA**:
  - `AI_PROVIDER` (`anthropic`), `AI_BASE_URL`, `AI_MODEL_FAST` (`claude-haiku-5-5`) e `AI_MODEL_REASONING` (`claude-sonnet-5-5`).
  - `AI_MAX_OUTPUT_TOKENS` (500), `AI_REQUEST_TIMEOUT_MS` (12000) e `AI_MAX_TOOL_CALLS` (2).
  - `AI_DAILY_USER_BUDGET` (60), `AI_MONTHLY_GLOBAL_BUDGET` (20000), `AI_MONTHLY_COST_LIMIT_USD` (0 = desligado) e `AI_MAX_CONCURRENT_REQUESTS` (4).
  - `AI_PRICE_INPUT_PER_MTOK` (0,1), `AI_PRICE_OUTPUT_PER_MTOK` (0,5) e `AI_USAGE_RETENTION_DAYS` (90).
- **Outras**: `TARIFFS_API_URL`, `SMARTTHINGS_AUTHORIZE_URL`, `SMARTTHINGS_TOKEN_URL`, `LG_*`.
- **Frontend**: `VITE_API_BASE_URL` vazio na Netlify (o app usa a própria origem e o redirect `/api/*`).

### 2.4 Descontinuada

- `AI_ADMIN_EMAILS`: **não é mais lida** (commit `30c7d96`). Remover de todos os ambientes antes de publicar. Um teste confirma que configurá-la não dá acesso.

## 3. Migração administrativa

O acesso administrativo libera `/api/ai/admin/settings`, `/api/ai/admin/usage`, `/api/energy/collection-stats` e a página `/ia/admin`. Ele vem **só** de um registro em `admin_grants` com o `userId` e `revokedAt: null`.

- Não há rota HTTP que conceda acesso.
- A concessão é feita por `backend/scripts/admin-grant.cjs`, com acesso direto ao banco.
- O cadastro não verifica e-mail, por isso o vínculo é pelo id do usuário, nunca pelo e-mail.

### 3.1 Procedimento

Todos os comandos rodam a partir de `backend/`, numa máquina de operador, com o `MONGO_URL` e o `MONGO_DB_NAME` **do ambiente-alvo**, informados na linha de comando e nunca gravados em arquivo.

1. **Identificar os administradores legítimos.** Lista aprovada por escrito pelo responsável, com o nome, o motivo e o número do chamado.
2. **Garantir a conta.** A pessoa se cadastra ou entra no app do ambiente-alvo.
3. **Conferir o id interno.**
   ```
   MONGO_URL=... MONGO_DB_NAME=... node scripts/admin-grant.cjs find --email=<e-mail>
   ```
   O resultado traz `id`, `name` e `createdAt`. O e-mail é comparado normalizado; maiúsculas e minúsculas não importam (ensaiado). Se vier mais de uma conta ou uma conta criada em data inesperada, **parar**.
4. **Validar a identidade fora do sistema.** Em chamada ou presencialmente, a pessoa entra no app enquanto o operador confere que `createdAt` e o nome batem. Uma conta criada por outra pessoa com o mesmo e-mail é o risco que o vínculo por id evita.
5. **Conceder.**
   ```
   node scripts/admin-grant.cjs grant --user-id=<uuid> --reason="<chamado e aprovação>"
   ```
   Recusa sem `--reason`, com id inválido ou com usuário inexistente (ensaiado). Grava `grantedAt`, `grantedBy` (usuário do sistema operacional) e `reason`.
6. **Confirmar no app.** A pessoa abre `/ia/admin`, que deve carregar. `/api/ai/status` responde `admin: true`.
7. **Confirmar que usuário comum recebe 403.** Com uma conta comum de teste, `/api/ai/admin/settings`, `/api/ai/admin/usage` e `/api/energy/collection-stats` devem responder 403 e `/api/ai/status` deve trazer `admin: false`.
8. **Auditar.** Rode `node scripts/admin-grant.cjs list` e guarde a saída junto ao chamado. Repetir a auditoria mensalmente e a cada mudança de equipe.
9. **Revogar.** Rode `node scripts/admin-grant.cjs revoke --user-id=<uuid> --reason="<motivo>"`. Vale na próxima requisição. Revogar de novo responde "no active grant".
10. **Recuperar o acesso** quando não houver nenhum administrador (perda de conta, revogação errada): repetir os passos 3 a 6 com um operador que tenha acesso ao banco. Não existe recuperação pela interface, por desenho.
11. **Remover `AI_ADMIN_EMAILS`** do ambiente.

### 3.2 Ordem na publicação em produção

Depois do deploy, **ninguém é administrador** até haver concessão. Execute os passos 1 a 8 contra o banco de produção imediatamente após o deploy autorizado. A coleção `admin_grants` e o índice dela são criados na inicialização. A ausência de administrador não afeta usuários comuns: só as telas de administração ficam fechadas.

### 3.3 Ensaio realizado (MongoDB descartável, app real, cookies e CSRF reais)

| Etapa | Resultado |
|---|---|
| Antes da concessão, mesmo com `AI_ADMIN_EMAILS` contendo o e-mail | 403 nos 3 endpoints; `admin: false` |
| Conta criada por terceiro com e-mail listado (`squat@`) | 403; `admin: false` |
| `find` com o e-mail em maiúsculas e minúsculas | Mesmo id |
| `grant` sem motivo, com id inválido ou com usuário inexistente | Recusados, com mensagem |
| `grant` válido | 200 nos 3 endpoints; `admin: true` |
| Usuário comum depois da concessão | 403 |
| `list` | Registro com motivo e autor, `revokedAt: null` |
| `revoke` | 403 de novo; revogar outra vez responde "no active grant" |
| Recuperação (nova concessão) | 200 de novo |
| Escrita administrativa por usuário comum (`PUT /api/ai/admin/settings`) | 403 |

Script do ensaio: `scratchpad/mongo/admin-drill.cjs`, fora do repositório; pode ser reproduzido com o mesmo roteiro.

## 4. Ambiente de homologação isolado

### 4.1 Infraestrutura

- **Site**: um site Netlify separado (por exemplo `wattstatus-homolog`), ligado ao mesmo repositório, ou um branch deploy `homolog`. Nunca o site de produção.
- **Banco**: um banco MongoDB próprio (cluster separado ou, no mínimo, outro banco com outro usuário e senha), com backup ligado. **Nunca** a base de produção nem uma cópia dela.
- **Segredos**: `JWT_SECRET` e `SMARTTHINGS_TOKEN_SECRET` gerados só para a homologação.
- **Origem e cookies**:
  - `APP_ORIGINS` com a URL exata do site de homologação;
  - `NODE_ENV=production` para os cookies `__Host-` e `Secure`;
  - testar em HTTPS, não com o cookie de uma origem em outra.
- **Funcionalidades desligadas no início**: SmartThings, coleta agendada, IA generativa e envio de alertas (§ 2.2).
- **Dados**: só sintéticos. Use contas com e-mail `@example.com`, imóveis criados pelos modelos de planta prontos e aparelhos cadastrados manualmente. Para medições de teste, use contas SmartThings de laboratório quando a coleta for ligada (§ 8).
- **Administrador de teste**: conta sintética provisionada pelo procedimento do § 3.1, nunca por variável de ambiente.

### 4.2 Deploy de homologação (quando autorizado)

1. Configurar as variáveis do § 2 no site de homologação.
2. Disparar o deploy de `main` (`1d407ef`) **no site de homologação**. O comando de build está em `netlify.toml`: `npm ci && npm ci --prefix backend && npm run build --prefix backend && npm run build`.
3. Conferir no log do build que as três Functions foram empacotadas (`api`, `api-stream` com a rota `/api/ai/chat/stream`, `collect-energy` agendada a cada 5 min).
4. Provisionar o administrador de teste (§ 3.1).
5. Executar os testes do § 6.

## 5. Streaming (`api-stream`)

### 5.1 Já validado localmente

Pelo adaptador real e pelo app real, com MongoDB descartável:

- sessão ausente: 403;
- token inválido: 401;
- origem não autorizada: 403;
- CSRF inválido: 403;
- sessão e CSRF válidos: 200 com `text/event-stream`, eventos em pedaços separados, etapas antes da resposta;
- cancelamento fecha sem erro;
- sessão encerrada: recusado;
- `Set-Cookie` preservado;
- corpo grande recusado;
- requisição sem IP de cliente recusada.

No navegador: etapas, botão parar e queda para o motor com provedor inacessível (~5 s, com retentativa de conexão), em desktop e mobile.

### 5.2 Exige deploy de homologação

| # | Verificação | Como | Esperado |
|---|---|---|---|
| S1 | Roteamento | `POST /api/ai/chat/stream` no navegador, aba Rede | Resposta vinda da função `api-stream`, não de `api` (cabeçalhos da Netlify e log da função) |
| S2 | Sem sessão | `curl -X POST https://<homolog>/api/ai/chat/stream -H "content-type: application/json" -d "{}"` | 403 `CSRF_INVALID` ou 401, JSON |
| S3 | Origem externa | Mesmo comando com `-H "origin: https://exemplo.invalid"` | 403 "Origem não autorizada" |
| S4 | Sessão e CSRF | Pergunta pelo chat do app | 200 `text/event-stream` |
| S5 | Entrega progressiva | Aba Rede › EventStream, ou `curl -N` com cookie e CSRF de teste | Eventos `stage` chegam **antes** do `response`, em momentos diferentes. Se tudo chegar junto, registrar: o chat continua funcionando, só sem progresso |
| S6 | Cancelamento | Botão "Parar" durante uma resposta | "Resposta interrompida."; log da função sem erro |
| S7 | Timeout e falha do provedor | Só na fase de IA (§ 8.2), com `AI_REQUEST_TIMEOUT_MS` baixo ou `AI_BASE_URL` inválido em homologação | Resposta do motor com a limitação "IA generativa indisponível agora" |
| S8 | Mobile | Chrome Android e Safari iOS reais | Etapas e resposta; parar funciona |
| S9 | Limites | 25 perguntas em 1 min com a mesma conta | 429 "Muitas perguntas…" na IA, **sem** perder a sessão |

## 6. Testes de homologação

### 6.1 Automáticos, antes de cada deploy (local ou CI, sem produção)

```
npm ci && npm ci --prefix backend
npm run build --prefix backend && npm run build
npx tsc -p tsconfig.app.json --noEmit && npx eslint .
npm test && npm test --prefix backend
TEST_MONGO_URL=mongodb://127.0.0.1:<porta> npm test --prefix backend   # MongoDB local descartável
```

### 6.2 Manuais no site de homologação

| Área | Verificações |
|---|---|
| Login e sessão | Cadastro, login, logout; sessão sobrevive a recarregar; 429 não desloga; cookie `__Host-wattstatus_token` com `Secure` |
| Isolamento | Duas contas: a B não vê imóveis, aparelhos, conversas, planos ou alertas da A. Trocar o id na URL de `/imoveis/:id` responde não encontrado |
| Autorização admin | § 3.1, passos 6 e 7 |
| Dashboard | Totais, gráfico de 6 meses, "Explicar este gráfico", análises da IA |
| Imóveis e ambientes | Criar com o modelo de planta pronto, editar a planta 2D, adicionar ambiente com o botão + |
| Maquete 3D | Móveis, portas, navegação entre cômodos; "Ver na planta" pela IA seleciona o cômodo e destaca o aparelho; movimento reduzido respeitado |
| Aparelhos | Cadastro, edição, mudança de cômodo; totais atualizam (invalidação de cache) |
| Relatórios | Resumo do período e PDF |
| WattStatus AI, motor de cálculo | Maiores consumidores, simulação, plano "de R$ X para R$ Y", investigação, comparação, previsão; frases de qualidade das medições |
| Histórico | Sem coleta: "sem medição" e estimativas rotuladas como tal |
| Streaming | § 5.2, S1 a S6, S8 e S9 |
| Privacidade | "Excluir meus dados da IA" remove preferências, conversas, planos e alertas |

### 6.3 Critérios de aprovação

- Todos os testes automáticos verdes no commit que será publicado.
- § 6.2 completo, sem falha de isolamento, autorização, sessão ou dados.
- S1 a S4, S6 e S9 aprovados. S5 aprovado ou com o comportamento sem progresso aceito por escrito.
- Nenhum erro 5xx recorrente nos logs das Functions por 48 h de uso de teste.
- Administrador provisionado só pelo script; `AI_ADMIN_EMAILS` ausente.
- Aprovação registrada pelo responsável, com o commit exato.

## 7. Publicação em produção (quando autorizada) e rollback

### 7.1 Antes

1. Backup do banco de produção e teste da restauração.
2. Conferir as variáveis de produção (§ 2, com os valores de produção). Remover `AI_ADMIN_EMAILS`. Manter IA, coleta e alertas **desligados**.
3. Anotar o deploy atual da Netlify (deploy ID) e o commit (`b456a92` em `origin/main`) como pontos de retorno.
4. Push de `main` para `origin/main` (passo autorizado separadamente).

### 7.2 Depois

1. Deploy, conferência das três Functions e smoke test (login, dashboard, imóvel, maquete, relatório).
2. Migração administrativa (§ 3.2).
3. Acompanhar os logs por 24 h.

### 7.3 Rollback

- **Aplicação**: em Netlify › Deploys, "Publish deploy" no deploy anterior anotado. É imediato e não mexe no banco.
- **Dados**: a versão não altera nem apaga dados existentes. Ela só acrescenta:
  - coleções: `admin_grants`, `ai_*`, `energy_collection_runs` e `energy_collection_meta`;
  - campos novos em `energy_collection`;
  - índices.

  A versão anterior ignora tudo isso, então o rollback de aplicação basta. A restauração do backup só é necessária em caso de corrupção, que não é esperada.
- **Funcionalidades**: IA, coleta e alertas desligam por variável, sem novo deploy de código (exige redeploy para valer nas Functions).
- **Git**: reverter o merge com `git revert -m 1 1d407ef` numa branch, nunca com reset.

## 8. Ativação progressiva depois da aprovação

### 8.1 Coleta energética

1. **Homologação.** Ligar `ENERGY_COLLECTION_ENABLED=true` com 1 a 3 contas SmartThings de laboratório.
2. **Medir.** Após 24 h, `GET /api/energy/collection-stats` (como admin) deve mostrar `avgDurationMs` real, `lastHour` e `capacityShort: false`.
3. **Dimensionar.** Calcular o orçamento: `BATCH_SIZE ≥ dispositivos × 5 / intervalo × 1,25` e `CONCURRENCY ≥ BATCH × latência / 20 s` (`docs/COLETA_ENERGIA.md` § 5).
4. **Produção.** Ligar primeiro para usuários que optaram pela coleta (a opção é por usuário), acompanhando `capacityShort`, `failing` e `rateLimited`.
5. **Escala.** Acima de cerca de 3.000 dispositivos a 30 min, planejar várias funções ou uma função de fundo.

### 8.2 IA generativa

1. **Homologação.** Chave de um workspace de homologação com orçamento baixo: `AI_DAILY_USER_BUDGET=20` e `AI_MONTHLY_COST_LIMIT_USD=5`.
2. **Homologação real.** Rodar `backend/tests/homolog/ai-live.homolog.cjs` com `AI_LIVE_API_KEY`, `AI_LIVE_CONFIRM=consumir-creditos` e `AI_LIVE_MAX_USD=0.05`. A suíte confere os IDs de modelo, o timeout, o cancelamento, o truncamento e a guarda.
3. **Ligar em homologação.** `AI_ENABLED=true`; acompanhar `/ia/admin`: custo, reescritas recusadas pela guarda e erros.
4. **Produção, gradual.** Ligar com teto mensal em dólares e limite diário baixo; o painel admin permite desligar ou baixar limites sem redeploy.
5. **Chave.** Só nas variáveis da Netlify, rotacionar ao fim da homologação.

### 8.3 Alertas

Continuam desligados até haver canal validado (push, e-mail) e agendamento de `sweepAlerts`. A avaliação dentro do app (aba Alertas) já funciona por consentimento.

## 9. Riscos de publicação

| Risco | Mitigação |
|---|---|
| Ninguém é admin logo após o deploy | § 3.2, logo após o deploy; não afeta usuários comuns |
| Esquecer `NODE_ENV=production` nas Functions | Item obrigatório do § 2.1; cookie verificado no § 6.2 |
| `APP_ORIGINS` sem a origem do deploy preview | 403 de CORS; incluir a URL do preview ao testar previews |
| SSE entregue de uma vez pela plataforma | O chat funciona igual, só sem progresso (S5) |
| Latência real da SmartThings maior que a simulada | Medir antes de ligar a coleta (§ 8.1) |
| Custo da IA | Desligada por padrão; tetos diário, mensal e em dólares; desligamento pelo admin |
| Mudança grande (36 commits) | Rollback de aplicação imediato; dados só acrescentados |
| Funções de 4,6 MB | Dentro dos limites da Netlify; acompanhar o cold start nos logs |
| Uso de `TRUST_PROXY_HOPS` errado | Manter o valor validado; conferir no log do rate limit que os IPs são de clientes distintos |

## 10. Pendências conhecidas

- Chamada real a um provedor de IA nunca executada (§ 8.2).
- Entrega progressiva do SSE na Netlify real não verificada (S5).
- Latência real da SmartThings não medida.
- Alertas sem agendador e sem canal.
- 13 avisos de ESLint antigos (nenhum erro).
