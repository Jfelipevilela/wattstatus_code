# Auth V2 — direção arquitetônica

Validação local em 30/10/2026. O layout anterior foi capturado antes das alterações em `artifacts/auth-v2-before-{login,signup}-{360,390,768,1024,1440,1920}.png`. A versão final está em `artifacts/auth-v2-after-{login,signup}-{360,390,768,1024,1440,1920}.png`. Essas capturas são evidências locais ignoradas pelo Git.

O desktop passou do painel verde de quase metade da tela para uma composição assimétrica: formulário à esquerda, sem card externo, e a residência real do pôster da landing à direita. A casa linear foi removida. Login e cadastro compartilham campos e tokens da landing, com título e ritmo vertical próprios. Em até 900 px, a imagem não aparece e o formulário ocupa a área principal. A imagem vem de `public/landing/hero-poster.webp` (26.560 bytes), como background estático; não há Three.js no bundle da autenticação.

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
