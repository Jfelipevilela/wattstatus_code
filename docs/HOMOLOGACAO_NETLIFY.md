# Homologação na Netlify: guia de execução

Complementa `docs/PLANO_HOMOLOGACAO_PRODUCAO.md`, que traz os critérios, a ativação progressiva e os riscos gerais. Este guia é o passo a passo operacional. **Nada aqui foi executado na Netlify.** Cada etapa que cria recursos, faz deploy ou gasta créditos precisa de autorização explícita.

Base: `main` local em `44db892`, por fast-forward de `chore/homologation-prep`.

## Ferramentas (em `scripts/homolog/`)

Todas recusam o host de produção (`wattstatus.netlify.app`, ou a lista em `WATTSTATUS_PROD_HOSTS`) e nunca imprimem segredos.

| Script | Uso | Ensaio local |
|---|---|---|
| `gen-secrets.mjs` | Gera `JWT_SECRET` e `SMARTTHINGS_TOKEN_SECRET` novos no terminal, sem gravar arquivo | OK |
| `preflight-env.mjs <arquivo>` | Valida as variáveis antes de colar na Netlify. Imprime só os nomes e os resultados. Com `--prod-fingerprints=` prova, por sha256, que nenhum segredo de produção foi reutilizado | Arquivo correto: 16/16 OK. Arquivo com 11 erros, incluindo segredo de produção reutilizado: todos os 11 detectados |
| `seed-synthetic.mjs --base=` | Cria usuários `@example.com`, imóvel, ambientes e aparelhos pela API pública | Contas criadas; recusa a URL de produção |
| `remote-check.mjs --base=` | Segurança e streaming contra o site; relatório JSON | Servidor real com `NODE_ENV=production`: 22 de 22 aprovados, incluindo o administrador de teste |

## 1. Checklist de configuração da Netlify

1. [ ] **Site novo e separado** (Add new site › Import from Git, mesmo repositório), por exemplo `wattstatus-homolog`. Nunca usar branch deploy do site de produção, porque compartilharia as variáveis do contexto de produção.
2. [ ] **Branch de produção do site de homologação**: uma branch local `homolog` apontando para o commit aprovado. O push dela exige autorização.
3. [ ] **Build** (vem do `netlify.toml`, não alterar): comando `npm ci && npm ci --prefix backend && npm run build --prefix backend && npm run build`; publicação em `dist`; Functions em `backend/netlify/functions`; bundler `esbuild`.
4. [ ] **Versão do Node** do build igual à usada localmente (20 ou superior). Definir `NODE_VERSION` no ambiente de build, se necessário.
5. [ ] **Variáveis** (§ 2), escopo Functions para o backend, validadas com `preflight-env.mjs`.
6. [ ] **Funções agendadas**: `collect-energy` existe e roda a cada 5 min, mas retorna sem fazer nada enquanto `ENERGY_COLLECTION_ENABLED` for diferente de `true`. Não é preciso desativá-la no painel.
7. [ ] **Notificações e alertas**: nenhum canal configurado; `AI_ALERTS_DELIVERY=off`.
8. [ ] **Proteção de acesso ao site (opcional, recomendada)**: senha de site da Netlify ou restrição por equipe, para que só testadores acessem.
9. [ ] **Deploy** (com autorização): conferir no log que `api`, `api-stream` (rota `/api/ai/chat/stream`) e `collect-energy` (agendada) foram empacotadas.

## 2. Variáveis (sem valores)

Validar com `node scripts/homolog/preflight-env.mjs <arquivo-local-fora-do-repositório>` antes de colar na Netlify.

| Variável | Escopo | Valor na fase inicial |
|---|---|---|
| `NODE_ENV` | Functions | `production` |
| `JWT_SECRET` | Functions | `gen-secrets.mjs` (exclusivo) |
| `SMARTTHINGS_TOKEN_SECRET` | Functions | `gen-secrets.mjs` (exclusivo e diferente) |
| `MONGO_URL` | Functions | Usuário e cluster só da homologação (§ 4) |
| `MONGO_DB_NAME` | Functions | `wattstatus_homolog` |
| `APP_ORIGINS` | Functions | `https://<site-homolog>.netlify.app` (§ 3) |
| `TRUST_PROXY_HOPS` | Functions | Mesmo valor de produção (ver `docs/HARDENING_PRODUCAO.md`) |
| `AI_ENABLED` | Functions | `false` |
| `AI_API_KEY` | Functions | não definir |
| `ENERGY_COLLECTION_ENABLED` | Functions | `false` |
| `AI_ALERTS_DELIVERY` | Functions | `off` |
| `SMARTTHINGS_CLIENT_ID`, `SMARTTHINGS_CLIENT_SECRET`, `SMARTTHINGS_TOKEN` | Functions | não definir |
| `SMARTTHINGS_REDIRECT_URI` | Functions | `https://<site-homolog>/integracoes/smartthings/callback` ou vazio |
| `VITE_API_BASE_URL` | Builds | não definir (o app usa a própria origem) |
| `AI_ADMIN_EMAILS` | — | **não definir** (descontinuada) |

As demais (`AI_*` de limites e modelos, `ENERGY_COLLECTION_*` de capacidade) ficam com o padrão do código; ver `backend/.env.example`.

**Isolamento de segredos**: o dono da produção roda `node scripts/homolog/preflight-env.mjs --fingerprint <env-de-produção>` no próprio ambiente e entrega só os hashes. O operador da homologação roda `preflight-env.mjs <env-homolog> --prod-fingerprints=<hashes>`. Nenhum segredo de produção é visto ou copiado.

## 3. Domínio e origem

- Usar o domínio `*.netlify.app` do site novo; um domínio próprio (por exemplo `homolog.<domínio>`) é opcional e precisa de DNS e HTTPS automáticos.
- `APP_ORIGINS` deve conter **exatamente** a origem servida, com esquema e sem barra final.
- Para testar um deploy preview, acrescente a origem dele (`https://deploy-preview-N--<site>.netlify.app`); sem ela, o CORS responde 403.
- Cookies: com `NODE_ENV=production` eles saem como `__Host-wattstatus_token` e `__Host-wattstatus_csrf`, com `Secure`, `HttpOnly` (sessão), `SameSite=Lax` e `Path=/`. O prefixo `__Host-` impede compartilhar o cookie com subdomínios. Verificado no ensaio (C1).
- O frontend e a API ficam na mesma origem (redirect `/api/*` e a rota da `api-stream`), então não há CORS entre o site e a API.

## 4. Banco isolado

1. **Criar** um cluster (ou projeto) MongoDB separado da produção, com backup diário. Na falta disso, no mínimo um banco `wattstatus_homolog` com um usuário próprio, que tenha papel `readWrite` **só** nesse banco.
2. **Liberar a rede** só para a Netlify. Os IPs de saída das Functions não são fixos; se for preciso `0.0.0.0/0`, compense com senha forte e um usuário restrito ao banco.
3. **Não importar** dados de produção. Os dados vêm de `seed-synthetic.mjs` e dos testadores, sempre com e-mail `@example.com`.
4. **Índices e coleções**: são criados quando a API inicializa. Não há migração manual.
5. **Descartar ao final**: apagar o banco ou o cluster, e girar a senha do usuário.
6. **Verificar** com `preflight-env.mjs`, que recusa `MONGO_DB_NAME=wattstatus`.

## 5. Administrador de teste

1. Depois do deploy, criar a conta pelo site, por exemplo `admin.homolog@example.com`, com uma senha forte guardada no cofre da equipe.
2. Em uma máquina de operador, com o `MONGO_URL` e o `MONGO_DB_NAME` **da homologação** na linha de comando:
   ```
   node backend/scripts/admin-grant.cjs find --email=admin.homolog@example.com
   node backend/scripts/admin-grant.cjs grant --user-id=<id> --reason="homologação <chamado>"
   node backend/scripts/admin-grant.cjs list
   ```
3. Validar com `node scripts/homolog/remote-check.mjs --base=https://<site-homolog> --admin-email=... --admin-password=...`. O item P3 deve sair aprovado e o P1 deve mostrar 403 para o usuário comum.
4. Ao final, rodar `revoke` e guardar a saída do `list` no chamado.

O mesmo roteiro foi ensaiado localmente: concessão, 403 para usuário comum e para e-mail "grilado", revogação e recuperação. Ver `PLANO_HOMOLOGACAO_PRODUCAO.md`, § 3.3.

## 6. Validação de segurança e streaming

Execução: `node scripts/homolog/remote-check.mjs --base=https://<site-homolog> [--admin-email= --admin-password=]`.

| Id | Verificação | Local (ensaio) | Netlify real |
|---|---|---|---|
| H1 | Cabeçalhos de segurança (CSP, X-Frame-Options, nosniff, Referrer-Policy) | n/a (vêm do `netlify.toml`) | **exige deploy** |
| C1 | Cookie `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax` | OK | exige deploy |
| X1 / X2 | CSRF obrigatório; origem externa recusada | OK | exige deploy |
| S1 / S2 | Sessão ativa; logout encerra | OK | exige deploy |
| I1 | Usuário B não lê o imóvel de A (404) | OK | exige deploy |
| P1 / P2 / P3 | Administração: 403 comum, `admin=false`, admin de teste 200 | OK | exige deploy |
| G1 / R6 | IA generativa desligada; respostas determinísticas | OK | exige deploy |
| T1 | Comando SmartThings sem integração recusado (400) | OK | exige deploy |
| R1–R3 | Stream sem sessão (401), origem externa (403), CSRF inválido (403) | OK | exige deploy |
| R4 | Stream autenticado: `text/event-stream`, etapas e `response` | OK | **exige deploy** (roteamento real para a função `api-stream`) |
| R5 | Entrega progressiva (mais de 1 pedaço) | OK (4 pedaços, 154 ms entre o 1º e o último evento) | **exige deploy**: é o ponto que mais depende da plataforma |
| R7 | Cancelamento sem afetar a sessão | OK | exige deploy |
| L1 / L2 | 429 da IA sem perder a sessão | OK (429 na 19ª requisição) | exige deploy |

### Roteamento (complemento manual do R4)

No navegador, abra a aba Rede, faça uma pergunta no chat e verifique que `chat/stream` responde `text/event-stream`. No painel da Netlify, em Logs › Functions › `api-stream`, verifique que a invocação aparece **nessa** função e não em `api`.

### Timeout e fallback, sem créditos

Em uma janela de teste agendada:

1. Defina no site de homologação `AI_ENABLED=true`, `AI_API_KEY=invalida-homolog`, `AI_BASE_URL=https://10.255.255.1` e `AI_REQUEST_TIMEOUT_MS=4000`, e refaça o deploy.
2. O provedor fica inacessível e **nenhuma requisição chega a um provedor real**.
3. Verifique no chat:
   - a resposta chega em cerca de 5 s com a limitação "IA generativa indisponível agora";
   - o botão "Parar" funciona durante a espera;
   - `remote-check.mjs --allow-generative` aprova os itens R4 e R7.
4. Volte para `AI_ENABLED=false`, remova `AI_API_KEY` e `AI_BASE_URL` e refaça o deploy.

O mesmo cenário já foi validado localmente (provedor inacessível, desktop e mobile).

### Mobile

Repita o chat, o botão parar e a maquete 3D em um Android (Chrome) e um iPhone (Safari) reais, na mesma rede de testes.

### Logs

Durante o `remote-check` local, os logs do servidor não tinham JWT, senha, valor de cookie, e-mail nem URI do MongoDB. Na Netlify, confira os logs das Functions depois do `remote-check`, procurando `eyJ`, `@example.com`, `mongodb` e `Homolog-`: nenhuma ocorrência é esperada.

## 7. Rollback

| Situação | Ação |
|---|---|
| Deploy da homologação com defeito | Netlify › Deploys › "Publish deploy" no deploy anterior. Imediato, não mexe no banco |
| Variável errada | Corrigir no painel e refazer o deploy. Validar antes com `preflight-env.mjs` |
| Admin concedido por engano | `admin-grant.cjs revoke`. Vale na próxima requisição |
| Dados de teste ruins | Recriar o banco de homologação (é descartável) |
| Encerrar a homologação | Excluir o site de homologação; apagar o banco ou cluster; girar as senhas; revogar a chave de IA, se houver |

**Produção não é tocada em nenhum desses cenários**: site, banco, segredos e chaves são todos separados.

## 8. Riscos restantes

| Risco | Situação |
|---|---|
| A plataforma juntar o SSE em um pedaço só (R5) | Não verificável sem deploy. O chat funciona igual, só sem as etapas progressivas |
| IPs de saída das Functions não fixos | Liberação ampla no MongoDB de homologação. Mitigado com usuário restrito e banco descartável |
| `TRUST_PROXY_HOPS` diferente do validado | Rate limit por IP errado. Confira nos logs de `security.rate_limit_exceeded` |
| Esquecer `NODE_ENV=production` | Cookies sem `Secure`. O `preflight-env.mjs` bloqueia e o C1 detecta |
| `tokens` aparece como `[REDACTED]` no log `ai.chat` | O logger mascara qualquer chave com "token". O uso fica completo em `ai_usage_metrics` e no painel admin. Apenas cosmético |
| Latência real da SmartThings e chamada real à IA | Fora desta fase: ambas continuam desligadas |
| Volume de testes (cadastros sintéticos) | Rate limit de cadastro por IP pode bloquear o testador. Use `seed-synthetic.mjs --users` com moderação |
