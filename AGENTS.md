# WattStatus — instruções permanentes para o Codex

## Aplicação automática das skills

Por solicitação do responsável pelo projeto, em TODA tarefa de criação ou alteração
de código, aplique as regras abaixo sem depender de menção manual às skills.
Leia integralmente o SKILL.md das skills pertinentes antes da implementação;
carregue as referências necessárias à tarefa. Não use leituras parciais com
`-TotalCount`, `Select-Object -First`, `head` ou saída truncada como substituto da
leitura completa. Se precisar dividir a leitura, cubra todas as partes sem lacunas. As skills estão em `.agents/skills/<nome>/SKILL.md`.

- Sempre: `security-review`. Planeje a mudança considerando segurança e revise o
  diff produzido antes de concluir. Verifique também correção, legibilidade,
  manutenção, tratamento de erros, regressões e testes adequados ao comportamento.
- Toda criação ou alteração visual de frontend, páginas e componentes:
  `frontend-design` e `landing-page-design` (Elaya) são obrigatórias e prioritárias
  para direção de arte e composição. Leia ambas integralmente antes de desenhar.
  Use `shadcn` para a implementação dos componentes, não como direção estética.
- Landing pages e páginas de divulgação: aplique também a estratégia e a estrutura
  de conteúdo de `landing-page-design`, com conteúdo verdadeiro do WattStatus.
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
A base visual obrigatória do WattStatus é o VERDE como cor principal de marca,
ligada ao meio ambiente e ao consumo sustentável. Preserve o nome, o significado da
marca e a coerência entre telas, com contraste acessível e uso funcional das cores
de estado. O verde não exige fundo preto, brilho neon ou a mesma tonalidade atual.
Há autorização para melhorar ou redesenhar a composição das telas solicitadas:
layout, tipografia, espaçamento, superfícies, gráficos e apresentação dos componentes
podem mudar substancialmente para obter um resultado melhor. Não preserve um layout
fraco apenas porque ele já existe. Preserve contratos, dados, fluxos e funcionalidades;
a aparência atual dos componentes não é uma restrição de design. A liberdade visual
vale para o escopo solicitado, sem iniciar uma reformulação global não pedida.
Priorize acessibilidade, comportamento correto, responsividade e desempenho.
O projeto usa React 18, TypeScript, Vite, Tailwind 3 e componentes shadcn/Radix;
confirme versões e APIs no código e no lockfile antes de aplicar exemplos mais novos.
Adapte as skills ao tipo de tela: no dashboard, aplique os princípios visuais da
Elaya (tipografia, espaçamento, alinhamento, superfícies, estados e acabamento), sem
importar hero, FAQ, provas sociais, CTA de venda ou tagline de landing page. Na landing,
aplique a estratégia de página pertinente. Não invente clientes, depoimentos, preços,
resultados ou métricas para preencher uma composição. Resolva conflitos de direção
visual entre skills pelo objetivo da tela, pela marca verde e pela qualidade do
resultado; registre brevemente a decisão. Compatibilidade técnica não obriga a
manter estética genérica ou componentes sem personalização.
Não execute sintaxe especial de outro agente como se fosse comando suportado pelo
Codex; obtenha o contexto equivalente com as ferramentas realmente disponíveis.

## Processo obrigatório de design e revisão estética

Esta seção se aplica a tarefas com impacto visual. Não exige redesign em tarefas
exclusivamente de backend, correção de lógica ou texto sem efeito na composição.

1. **Entender e olhar.** Leia integralmente `frontend-design` e
   `landing-page-design`; inspecione a tela atual e os componentes pertinentes.
   Em animações de demonstração ou mockups, leia também `design-to-motion`
   integralmente. Use o contexto do produto; não repita perguntas já respondidas.
2. **Definir a direção antes do código.** Declare em poucas linhas o objetivo da
   tela, a informação/ação principal, o conceito de composição, a hierarquia
   tipográfica, a paleta com verde e neutros e a adaptação para celular. Em uma
   tela nova ou redesign relevante, compare internamente ao menos duas composições
   e explique a escolha. Isso não cria uma etapa adicional de aprovação quando o
   pedido já autoriza implementar e o contexto basta para decidir.
3. **Compor para o conteúdo.** Crie uma hierarquia clara; diferencie resumo,
   comparação, edição e detalhe. Evite empilhar painéis idênticos ou apenas trocar
   cores e raios de um template. Dimensione espaços e componentes pelo volume e
   importância da informação. Em gráficos, use nomes compreensíveis, unidades,
   legendas, escalas e contraste; números como 1/2/3 não substituem nomes úteis.
   Use movimento com propósito e respeite movimento reduzido e desempenho.
4. **Implementar com acabamento.** Reutilize lógica e primitivas acessíveis quando
   úteis, personalizando sua apresentação. Trabalhe estados de foco, hover,
   carregamento, vazio e erro. Preserve o comportamento e as proteções de segurança.
5. **Revisar imagens, não apenas testes.** Abra a tela implementada, capture e
   inspecione screenshots de desktop e celular. Avalie composição, hierarquia,
   legibilidade, respiro, alinhamento, densidade, contraste, gráficos e consistência
   com a marca. Teste também teclado, overflow e os estados alterados. Não trate
   captura salva, ausência de overflow ou build aprovado como aprovação estética.
6. **Corrigir e conferir novamente.** Corrija problemas visuais concretos antes
   de concluir e faça nova captura após alterações visuais. Evite ciclos cosméticos
   sem objetivo. Se a primeira revisão não indicar correções, registre por que a
   tela atende à direção definida, sem inventar uma alteração para cumprir tabela.
7. **Entregar evidência.** Resuma a direção aplicada, quais skills foram lidas,
   ajustes surgidos na revisão e capturas finais. Diferencie validação funcional
   de avaliação estética. Se navegador/captura estiver indisponível, declare a
   limitação e não afirme que houve verificação visual.

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

Evidências de testes (capturas, vídeos, traces e relatórios temporários) ficam em artifacts/ ou tmp/, sem versionamento. Assets utilizados pelo site continuam em public/ ou src/assets/. Os arquivos Markdown de docs ficam somente locais, conforme orientação do responsável.
