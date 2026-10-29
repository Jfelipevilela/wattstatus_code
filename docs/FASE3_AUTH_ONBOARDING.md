# Fase 3 — autenticação e primeiro acesso

## Diagnóstico visual

A landing usa Manrope, fundo `#071411`, superfícies `#10241D` e `#163329`, acento `#45E0A4`, texto claro e composição arquitetônica contida. O login antigo usava um painel azul com brilho e gráfico de valores fictícios, separado de um formulário com aparência do aplicativo. O cadastro repetia o formulário, mas ficava longo no celular, mostrava apenas erros globais e apontava para `/termos` e `/privacidade`, rotas inexistentes. Ambos causavam uma quebra de identidade ao sair da landing.

O novo layout compartilha os tokens da landing e usa a marca original, uma área editorial discreta no desktop e uma introdução compacta no celular. O formulário mantém labels, 52 px de altura, autofill, foco visível, erros associados por `aria-describedby`, retorno ao primeiro campo inválido, controle de senha de 44 px e estado de envio imediato. A autenticação continua usando `AuthProvider`, cookie de sessão, CSRF e a validação do servidor. O cadastro conserva a senha mínima de 15 caracteres; a indicação de força é apenas orientação. Não foram adicionados login social, recuperação de senha fictícia, estatísticas inventadas nem módulos 3D.

## Jornada implementada

Após cadastro, `/onboarding` oferece começar, explorar ou continuar mais tarde. A jornada usa o imóvel padrão já criado pela API, permite editar ou mantê-lo, salva uma tarifa de referência por estado ou uma tarifa informada, deixa escolher um preset existente e ajustar potência, horas e dias, e só persiste o aparelho após confirmação. Se o imóvel tiver ambientes, o aparelho pode ser associado a um deles. A primeira projeção usa `getMonthlyEstimate`, indica período e premissas e separa estimativa de medição. A última etapa aponta para dashboard, aparelhos, imóvel/maquete, SmartThings, WattStatus AI e relatórios reais.

O progresso (`in_progress`, `later`, `complete` e etapa 0–5) fica nas preferências do usuário no MongoDB, com a mesma consulta que já carregava as preferências. O dashboard oferece retomada quando há progresso pendente. Contas existentes não são redirecionadas automaticamente. Uma conta com aparelhos e sem marcador começa pela estimativa apenas se abrir a rota voluntariamente. A persistência é isolada por `userId`, sem sobrepor tema ou tarifa.

## Homologação local

- Chrome real, backend local e MongoDB descartável: cadastro sintético, aceite explícito, imóvel padrão, tarifa SP de referência, geladeira adicionada, estimativa de 108,00 kWh e R$ 88,56, recarga e retomada, conclusão e totais equivalentes no dashboard.
- Larguras 360, 390, 768, 1024, 1440 e 1920 px: login, cadastro e onboarding sem rolagem horizontal. Capturas antes/depois e etapas do onboarding estão disponíveis **somente no computador local** em `artifacts/auth-phase3-*.png`; não são arquivos do repositório.
- Campos vazios, e-mail inválido, foco no erro, mostrar/ocultar senha, aceite obrigatório, envio por Enter, resposta lenta e falha de API foram exercitados no navegador. A ordem de tabulação no login foi e-mail, senha, mostrar senha, Entrar. Dois eventos de submit durante uma resposta lenta geraram apenas uma chamada de login. Uma senha incorreta manteve o usuário no login; login posterior recuperou a sessão e mostrou o aparelho e a estimativa salvos. Usuários autenticados acessando `/login` e `/signup` foram encaminhados ao dashboard. O onboarding também foi inspecionado em tema escuro a 390 px. A opção "Continuar mais tarde" exibiu a retomada no dashboard e voltou à etapa salva.
- Cinco navegações frias por rota no Vite preview de produção: mediana observada do início da navegação até o `h1` de 488 ms no login e 520 ms no cadastro; JS transferido registrado pelo Chrome: 126.052 e 130.235 bytes. Nenhum recurso Three.js, casa 3D ou mobiliário 3D foi carregado nas rotas. Os números incluem variação do ambiente local e **não constituem uma comparação controlada com o código anterior**. Amostras em `artifacts/auth-phase3-perf.json`.
- `tsc --noEmit`, build frontend e backend, ESLint (0 erros), 47 testes frontend e 199 testes backend com MongoDB local descartável passaram. Os avisos de Fast Refresh do ESLint já pertencem a componentes compartilhados existentes.

## Bloqueio para publicação

Os textos aprovados de termos de uso e política de privacidade ainda não existem. O cadastro está funcional para homologação local, conforme decisão do proprietário, e avisa isso diretamente no formulário. Não há links para documentos ausentes. **Antes de publicar o cadastro, obter aprovação jurídica dos textos, disponibilizar as páginas e rever a redação e o registro do aceite.**
