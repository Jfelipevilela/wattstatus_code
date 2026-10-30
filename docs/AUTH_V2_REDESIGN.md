# Auth V2 — direção arquitetônica

Validação local em 30/10/2026. O layout anterior foi capturado antes das alterações em `artifacts/auth-v2-before-{login,signup}-{360,390,768,1024,1440,1920}.png`. A versão final está em `artifacts/auth-v2-after-{login,signup}-{360,390,768,1024,1440,1920}.png`. Essas capturas são evidências locais ignoradas pelo Git.

O desktop passou do painel verde de quase metade da tela para uma composição assimétrica: formulário à esquerda, sem card externo, e a residência real do pôster da landing à direita. A casa linear foi removida. Login e cadastro compartilham campos e tokens da landing, com título e ritmo vertical próprios. A V2 inicial ocultava o pôster em até 900 px e usava `public/landing/hero-poster.webp` (26.560 bytes), como background estático; não havia Three.js no bundle da autenticação.

| Verificação | Resultado |
|---|---|
| Chrome em 360, 390, 768, 1024, 1440 e 1920 px, ambas as rotas | Sem scroll horizontal; logo e formulário íntegros |
| Requisição do pôster em 360, 390 e 768 px | Ausente nas seis navegações |
| Requisição do pôster em 1024, 1440 e 1920 px | Presente; asset da landing reutilizado |
| Cadastro vazio/inválido, foco no erro, força da senha, checkbox | Aprovado em navegador real |
| Mostrar/ocultar senha, cadastro válido, envio duplo, onboarding e sessão recarregada | Aprovado em navegador real com MongoDB descartável |
| Senha incorreta, login por Enter, dashboard, redirecionamento de conta autenticada | Aprovado em navegador real |
| TypeScript, lint, build e testes frontend | Aprovados; 47/47 testes |
| Preview de produção, cinco navegações frias, mediana até `h1` | Login 415 ms; cadastro 421 ms, medição local |
| JS transferido no Chrome | Login 125.594 bytes; cadastro 129.772 bytes; sem chunks Three.js |

O desempenho depende da máquina e da carga local. Os valores da Fase 3 foram 488/520 ms e 126.052/130.235 bytes nas mesmas rotas, mas não constituem um experimento pareado. O cadastro continua restrito à homologação local: Termos e Privacidade aguardam aprovação e as páginas provisórias estão identificadas como tal.

## Polimento final

Capturas da V2 antes do polimento: `artifacts/auth-polish-before-{login,signup}-{390,1440}.png`. Capturas finais: `artifacts/auth-v2-polish-{login,signup}-{360,390,768,1024,1440,1920}.png`. Todas são locais e ignoradas pelo Git.

A linha e o contador `01 / 01` saíram da legenda. O cadastro ganhou maior proporção de largura para o formulário, imagem menos dominante e rolagem vertical natural. Inputs focados usam uma única borda; aviso jurídico e links ficaram mais legíveis. O pôster original da landing ficou intacto. A imagem anterior tinha 1600×909 px em apenas 26.560 bytes e parecia suave no painel grande. `public/auth/house-poster.jpg` é uma captura estática em alta resolução **da mesma residência 3D da landing**, feita com o controle de afastar uma vez para incluir telhado, árvores e piscina. Não é outra casa nem um novo modelo; o arquivo tem 2000×1800 px e 192.409 bytes. É carregado só a partir de 1101 px. A autenticação continua sem Three.js.

Chrome em 360, 390, 768, 1024, 1440 e 1920 px: sem rolagem horizontal. O cadastro também foi verificado em 360×640, 390×667, 768×600, 1024×600 e 1440×700: botão e rodapé permanecem alcançáveis ao rolar. Login e cadastro reais com MongoDB local passaram em nove verificações funcionais, incluindo erro, teclado, sessão e envio duplicado. TypeScript, build, lint sem erros e 47/47 testes frontend passaram. No preview de produção, mediana local de cinco navegações até `h1`: 507 ms no login e 450 ms no cadastro; JS transferido 125.576/129.757 bytes, sem Three.js. Esses tempos são observações locais, não uma comparação controlada entre commits.
