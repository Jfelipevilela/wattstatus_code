# WattStatus — instruções permanentes para o Codex

## Aplicação automática das skills

Por solicitação do responsável pelo projeto, em TODA tarefa de criação ou alteração
de código, aplique as regras abaixo sem depender de menção manual às skills.
Leia o SKILL.md das skills pertinentes antes da implementação; carregue apenas as
referências necessárias. As skills estão em `.agents/skills/<nome>/SKILL.md`.

- Sempre: `security-review`. Planeje a mudança considerando segurança e revise o
  diff produzido antes de concluir. Verifique também correção, legibilidade,
  manutenção, tratamento de erros, regressões e testes adequados ao comportamento.
- Frontend, páginas, componentes ou redesign: `frontend-design` e `shadcn`.
  Consulte também `landing-page-design` para decisões visuais aplicáveis à tarefa.
- Landing pages e páginas de divulgação: `landing-page-design`.
- Animação de mockups, demonstrações, bento visual, vídeo ou GIF de UI:
  `design-to-motion`. Não imponha loops de demonstração aos controles do produto.
- Design, redesign e exploração visual: consulte `superdesign`. A geração no canvas
  depende de CLI, login e créditos do serviço. Instalar esta skill não autoriza
  enviar código/arquivos ao serviço nem gastar créditos. Sem autorização para esse
  fluxo, implemente localmente com as outras skills; informe a limitação pertinente
  sem bloquear a tarefa de código ou iniciar login desnecessariamente.
- Login, cadastro, senhas, sessões e segurança de autenticação: consulte
  `better-auth-best-practices`, `email-and-password-best-practices` e
  `better-auth-security-best-practices`. O backend atual usa autenticação própria
  em Express, não Better Auth. Aproveite os princípios pertinentes; APIs, plugins,
  comandos de instalação e migração do Better Auth só se aplicam quando essa
  tecnologia fizer parte da tarefa autorizada. Não migre a autenticação por efeito
  da ativação automática de uma skill.

## Prioridades e compatibilidade

As instruções explícitas do usuário e estas decisões específicas do WattStatus
prevalecem sobre sugestões genéricas ou conflitantes das skills importadas.
Preserve a identidade visual e os componentes existentes, salvo pedido de redesign.
Priorize acessibilidade, comportamento correto, responsividade e desempenho.
O projeto usa React 18, TypeScript, Vite, Tailwind 3 e componentes shadcn/Radix;
confirme versões e APIs no código e no lockfile antes de aplicar exemplos mais novos.
Não transforme telas funcionais do dashboard em páginas de marketing nem imponha
tipografia, animação ou novos componentes incompatíveis por regras de outro contexto.
Não execute sintaxe especial de outro agente como se fosse comando suportado pelo
Codex; obtenha o contexto equivalente com as ferramentas realmente disponíveis.

## Segurança em toda alteração de código

- Use a revisão da skill `security-review` como base e investigue o fluxo de dados
  e as proteções existentes antes de relatar vulnerabilidades.
- No WattStatus, revise também rotas AUTENTICADAS: login não elimina IDOR/BOLA,
  acesso cruzado entre usuários, escalada de privilégios ou falhas de autorização.
  Esta regra prevalece sobre a exclusão genérica de caminhos autenticados na skill.
- Valide entradas no servidor, preserve o isolamento por usuário e confira CSRF,
  XSS, injeções SQL/NoSQL, SSRF, CORS, cookies, sessões e limites quando pertinentes.
- Preserve as proteções documentadas em `SEGURANCA_AUTH.md`; não enfraqueça controles
  para fazer um exemplo funcionar. Nunca imprima ou versione credenciais, tokens,
  cookies, dados de produção ou o conteúdo de arquivos `.env`.
- Diferencie achados confirmados de dúvidas que exigem verificação. Não anuncie
  segurança absoluta nem confunda ausência de achados com auditoria completa.

## Implementação e validação

Inspecione o estado do Git e preserve alterações anteriores do usuário. Faça mudanças
restritas à tarefa, reutilize padrões existentes e evite refatorações sem relação.
Use npm e o package-lock existente. Antes de atualizar componentes shadcn, examine
o diff/dry-run e preserve as customizações locais.

Execute verificações proporcionais à mudança, conforme os scripts atuais:
- Frontend: `npm test`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`;
  use `npm run lint` quando pertinente e distinga problemas anteriores dos novos.
- Backend: `npm test --prefix backend` (inclui compilação e testes do backend).
- Mudanças somente em documentação/configuração de skills: valide estrutura,
  metadados, caminhos, versões e diff; não é necessário compilar o aplicativo.
- Mudanças visuais: inspecione a interface no navegador quando disponível,
  incluindo teclado, viewport móvel e estados de carregamento, vazio e erro.

Ao concluir, resuma o resultado, as verificações executadas e limitações materiais.
Não faça commit, push ou deploy apenas por instalar ou ativar uma skill.
