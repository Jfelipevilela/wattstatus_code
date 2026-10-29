# Fase 4 — auditoria técnica para homologação

Data: 29/10/2026. Base inicial: `main` em `1cfaf5c`. Esta auditoria descreve o código e ensaios locais com usuários sintéticos e MongoDB descartável. Não equivale a parecer jurídico, teste de provedor real ou homologação da Netlify.

## Inventário técnico para Termos e Privacidade

Em todas as linhas, o titular autenticado acessa seus próprios dados pela API; operadores com acesso ao banco e à plataforma podem ter acesso técnico. Os controles no código incluem autenticação por sessão, consultas filtradas por `userId`, CSRF para mutações, CORS restrito, validação de entrada e TLS esperado na hospedagem. O acesso efetivo, backups, suboperadores, localização do armazenamento e prazos operacionais dependem da infraestrutura ainda não configurada. As hipóteses abaixo são **perguntas para validação jurídica**, não bases legais adotadas.

| Categoria e finalidade observada | Armazenamento e acesso adicional | Terceiros e retenção conhecida | Lacuna e hipótese para o jurídico |
|---|---|---|---|
| Nome e e-mail para conta e identificação no app | `users` no MongoDB; backend de autenticação | Netlify processa a requisição; MongoDB do ambiente armazena. Sem TTL no código | Verificação do e-mail, correção, exclusão integral e prazo após encerramento; avaliar execução do serviço solicitado |
| Credenciais e sessão para login, proteção e limites | `users.passwordHash` com scrypt; `auth_sessions` e `auth_limits` com TTL; cookies de sessão e CSRF. O cookie de sessão é HttpOnly, SameSite=Lax e, em produção, Secure/`__Host-` | Sessão: 12 h; CSRF: 2 h; índices TTL retiram registros expirados posteriormente. Provedor de hospedagem recebe IP para a requisição | Política de segurança, prazo de logs de acesso, verificação de e-mail e recuperação de conta; avaliar execução do serviço e segurança |
| Imóveis, endereço opcional, cidade, estado, fuso, andares, ambientes e planta para organização e cálculo | `properties`, `property_floors`, `property_rooms` com `userId`; sem TTL | MongoDB do ambiente; sem envio externo identificado nesse fluxo | Prazo, exclusão e exportação; avaliar execução do serviço solicitado |
| Aparelhos, potência, horas/dias de uso, tarifa, vínculo ao ambiente e identificador de dispositivo para estimativa e integração | `appliances`, `user_settings`, `integration_usage` e `integration_usage_history`; sem TTL | Samsung SmartThings se o usuário conectar; tarifa externa somente se `TARIFFS_API_URL` for configurada | Definir necessidade de cada campo, período histórico e comunicação da estimativa; avaliar execução do serviço |
| Leituras, contador e histórico energético para consumo medido, comparações e relatórios | `energy_samples` por usuário e aparelho; `energy_collection` e `energy_collection_runs` (última com TTL de 30 dias); sem TTL das amostras | Samsung SmartThings quando conectado; MongoDB | Prazo de leitura, precisão, falha de medidor e exclusão; avaliar execução do serviço |
| Tokens e estado de integração para conectar, importar, atualizar e revogar | `integration_tokens` no MongoDB, criptografados com AES-GCM por segredo do ambiente, indexados por usuário/provedor; uso e histórico em coleções próprias | OAuth/API da Samsung SmartThings quando ativados; sem prazo automático conhecido para token e uso | Política de revogação, rotação de chave, eliminação e escopos efetivos; avaliar execução do serviço e tratamento por terceiro |
| Preferências, conversas, recomendações, planos e alertas de IA para respostas e acompanhamento | `ai_user_preferences`, `ai_conversations`, `ai_recommendation_states`, `ai_savings_plans`, `ai_alerts`, `ai_usage_metrics`; consultas por `userId`; `/api/ai/data` apaga dados desse módulo, não a conta inteira | Anthropic somente com IA generativa ativada e chave; desligada nesta fase. Conversas: retenção escolhida de 0/7/30/90 dias, padrão 30; métricas: TTL de 90 dias por padrão configurável; alertas: TTL 90 dias. Preferências, estados e planos sem TTL | Definir transparência das chamadas ao modelo, política de exclusão, minimização de prompts e retenção real do provedor; avaliar execução do serviço e tratamentos opcionais separadamente |
| Logs de aplicação e telemetria para diagnóstico, segurança, limites e custos | Saída estruturada do backend com `requestId`, rota, código, duração e, às vezes, `userId`; redator remove credenciais. Métricas de uso de IA no MongoDB | Netlify e serviço de observabilidade se configurado; retenção dos logs da plataforma desconhecida | Definir acesso, retenção, exportação, IP e suboperadores; avaliar interesse legítimo ou outra hipótese adequada com o jurídico |
| Recursos externos de interface | A página Sobre carrega imagem de `futurosolar.com.br`; a CSP também permite imagens de Unsplash | Esses hosts podem receber IP e metadados de navegação | Decidir hospedagem local da imagem, necessidade de cada domínio e informar o jurídico |

**Retenção e eliminação:** TTL do MongoDB é assíncrono e não assegura exclusão imediata nem cobre backups. Não foi encontrado fluxo completo de exportação ou exclusão de conta/dados; há apenas exclusão de dados da IA e operações pontuais. A política, o processo de atendimento ao titular, os prazos e a responsabilidade por backups precisam de decisão operacional e jurídica. A [ANPD descreve direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares) e suas [orientações sobre hipóteses legais](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_hipoteses_legais_tratamento_de_dados_pessoais_legitimo_interesse); a escolha para este produto continua pendente.

### Documentos e aceite

`/termos` e `/privacidade` existem como páginas acessíveis, responsivas e explicitamente provisórias. **Nenhum texto jurídico aprovado foi fornecido.** O cadastro local mostra a pendência e exige confirmação não pré-marcada do aviso de homologação. O frontend envia o valor real dessa ação; o backend não grava mais `termsAcceptedAt` para novos usuários. O nome do campo de API `acceptTerms` ficou por compatibilidade durante a fase local e **não constitui aceite de termos**. Registros antigos podem conter `termsAcceptedAt` sem documento correspondente; exigir decisão de reconciliação antes de interpretar esse campo.

Antes de usuários reais: aprovar os documentos, identificar suas versões, apresentar o texto efetivo, definir se e quando cada ação afirmativa é necessária e gravar só `userId`, versões exibidas, horário e evidência mínima quando apropriado. Ciência da política não deve ser tratada como consentimento geral. Consentimentos opcionais exigem escolhas separadas. Definir regra para usuários existentes sem bloqueio automático enquanto a política de atualização não for aprovada.

## Segurança e isolamento

- `remote-check.mjs` em HTTP local: 20 verificações obrigatórias aprovadas, incluindo cadastro, CSRF, origem externa, sessão/logout, administração negada ao usuário comum, streaming/cancelamento, limite de IA e SmartThings sem integração. `Secure`/`__Host-` não se aplica ao ensaio HTTP; cabeçalhos de Netlify e administrador com concessão ficaram sem verificação neste ensaio.
- Duas contas sintéticas no Chrome e em HTTP direto: 18/18 verificações. B não leu ou alterou imóvel/aparelho de A, não leu histórico, conversa ou plano de A e não recebeu configurações de A. A interface de B também não mostrou imóvel, aparelho nem histórico de A.
- Revisão de código: scrypt para senhas, sessão revogável, CSRF, limites por IP/conta/globais, admin por concessão no MongoDB, validação Zod, corpo JSON limitado a 100 kB, CORS configurado, Helmet e headers de `netlify.toml`, tokens SmartThings cifrados e logs com redação. E-mail não verificado e ausência de recuperação de conta são decisões pendentes para operação com usuários reais.
- `npm audit --omit=dev` reportou **1 vulnerabilidade alta em Zod em cada lockfile**, [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), faixa `<4.6.6`. A correção sugerida é mudança principal de Zod 3 para 4 e requer adaptação/testes; o limite JSON de 100 kB reduz a entrada por requisição, mas não fecha o alerta. Resolver ou documentar avaliação formal antes da publicação.

## Energia, IA e SmartThings

Os 47 testes frontend cobrem separação entre medição e estimativa, parcial sem custo inventado, leituras acumuladas, mês/fuso, imóvel, nomes iguais identificados por ID, cache e PDF. A suíte backend cobre coleta, falha/atraso/ausência de medidor, limites de capacidade, tarifa e isolamento. A interface de dashboard e relatórios diferencia origem e ausência de dados. Não houve leitura real de concessionária ou medidor; tarifas estaduais são referências configuradas, não promessa de tarifa vigente.

IA generativa ficou desligada. O ensaio HTTP confirmou resposta determinística, streaming, cancelamento, `429` sem perda da sessão e nenhuma chamada a modelo pago. Testes existentes cobrem indisponibilidade, timeout, leitura parcial/atrasada, ausência de histórico e orçamento. O código contém limites diário por usuário, mensal global, concorrência, tokens de saída e teto de custo configurável (padrão `0` significa teto financeiro desativado). Provedor real, faturamento e streaming na Netlify permanecem sem homologação.

SmartThings: testes simulados cobrem OAuth com state vinculado ao usuário, refresh/expiração, reconexão após rejeição, isolamento, falhas 401/404/429, dispositivo sem leitura, fila e comando indisponível. Ensaio local confirmou que comando sem integração é recusado. Conexão, importação, revogação, equipamento offline/sem medição e comandos dependem de conta/dispositivo Samsung real para homologação final. Credenciais de produção não foram usadas.

## Ambiente, UX e desempenho

`netlify.toml` mantém build com instalações separadas e functions; nenhuma mudança de hospedagem foi feita. `preflight-env.mjs` aprovou 15 verificações de configuração **sintética** local: ambiente production para cookies, segredos distintos, banco/nome separados, origem HTTPS de homologação e IA/coleta/alertas/OAuth desligados. Comparação de hashes com segredos de produção: **não verificada**. Site, branch remota, banco externo, domínio, permissões, backups e deploy: **não criados**. Seguir `HOMOLOGACAO_NETLIFY.md` após autorização.

Chrome local em 390 e 1440 px: landing, cadastro, login e páginas provisórias sem overflow; cadastro → onboarding e login → dashboard; dashboard, imóveis, aparelhos, relatórios, preferências da IA e SmartThings abriram em 390 px sem erro de página ou de console. O link `/suporte` inexistente foi retirado do rodapé Sobre. Navegação de ambiente individual, dispositivo real e PDF gerado no navegador nesta rodada: não verificados; há testes de API/PDF e ensaios anteriores descritos na Fase 3. Capturas e relatórios brutos estão apenas em `artifacts/`, ignorado pelo Git.

Build frontend e backend, TypeScript e lint passaram (0 erros; avisos de Fast Refresh preexistentes). Frontend: 47/47. Backend com MongoDB descartável: 198/199 na execução conjunta; teste de capacidade de `429` falhou por 44 versus 45 leituras e passou 1/1 ao repetir isoladamente. Repetir sob carga controlada antes de publicar. `remote-check`: 20 obrigatórias aprovadas. Bundle de entrada: 194,49 kB bruto; rotas legais são lazy loaded. Cinco navegações frias no preview local tiveram mediana até `h1` de 981 ms no login e 1.065 ms no cadastro, versus 488/520 ms reportados na Fase 3; JS transferido ~126/130 kB, praticamente estável. O ambiente executava também backend/Mongo e testes de capacidade; **não há comparação controlada** para afirmar regressão. Repetir em máquina e condições equivalentes antes do aceite de desempenho.

## Checklist de liberação

| Item | Estado | Evidência ou próximo passo |
|---|---|---|
| Build, tipos, lint e frontend | **Aprovado** | Builds, `tsc`, 47 testes, 0 erro de lint |
| Isolamento entre contas local | **Aprovado** | 18/18 HTTP e interface; 20 verificações HTTP obrigatórias |
| Identidade visual e aviso jurídico provisório | **Aprovado** | Chrome 390/1440 px e rotas reais |
| Texto de Termos e Privacidade para usuários reais | **Bloqueante** | Redação e aprovação jurídica inexistentes |
| Aceite versionado e registros legados | **Bloqueante** | Implementar após textos aprovados; rever `termsAcceptedAt` anterior |
| Vulnerabilidade alta em Zod | **Bloqueante** | Atualizar com migração/testes ou obter avaliação técnica formal |
| Exclusão/exportação integral e política de retenção | **Pendente** | Definir processo, backups e implementar conforme decisão jurídica |
| Teste backend de capacidade em execução conjunta | **Pendente** | 1 falha intermitente; repetição isolada passou |
| Desempenho comparável à Fase 3 | **Não verificado** | Medição local contaminada por carga; repetir controlado |
| IA determinística e SmartThings simulado | **Aprovado** | Testes e ensaio local sem chamadas pagas |
| IA generativa e SmartThings reais | **Não verificado** | Exigem credenciais/contas de homologação e autorização |
| Netlify, MongoDB e cookies/headers em HTTPS reais | **Não verificado** | Site e banco isolados ainda não criados; executar checklist de homologação |
| Credenciais distintas da produção | **Não verificado** | Preflight sintético passou; comparar hashes com operador |
| Publicação para usuários reais | **Bloqueante** | Depende dos bloqueios jurídicos e de segurança, além da homologação real |

**Decisão atual:** código preparado para continuar testes locais controlados; publicação para usuários reais não aprovada.
