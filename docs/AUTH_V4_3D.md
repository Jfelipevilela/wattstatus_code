# Auth V4 — casa 3D compartilhada

## Arquitetura

A landing, o login e o cadastro usam a mesma `HeroHouse3D` e a mesma montagem de geometria, móveis, materiais, luzes e piscina. `PersistentHouseHost` fica sob o `BrowserRouter`, fora das rotas públicas, e posiciona um único Canvas sobre o espaço reservado pela página ativa. Em navegação SPA entre `/`, `/login` e `/signup`, o elemento Canvas e seu `WebGLRenderingContext` permanecem os mesmos. No acesso direto ou no refresh, o navegador cria uma nova instância. Ao entrar em rotas privadas, o host desmonta a cena.

`HouseStage` conserva as interações completas da landing. Na autenticação, desativa marcadores, seleção e rotação manual; o ponteiro produz apenas a resposta 3D discreta da cena. A câmera usa enquadramentos de login e cadastro, com interpolação entre eles. Ao sair da landing, ajusta imediatamente a projeção e a distância segura antes de animar a área do Canvas, evitando que a casa atravesse a borda direita. O formulário fica acima da cena durante essa transição.

No desktop, um acesso direto mostra o pôster existente enquanto o módulo 3D carrega após a primeira pintura. Em mobile até 1100 px, o formulário não monta o host 3D nem baixa os módulos da cena. Preferência por economia de dados, modo leve, ausência ou perda de WebGL mantêm o pôster; movimento reduzido mantém a cena estática e elimina a transição do host. A renderização pausa quando a área sai da viewport ou a aba fica oculta.

## Validação local

- TypeScript e build: passaram. ESLint: 0 erros, 13 avisos preexistentes. Testes de frontend: 47 passaram.
- Cadastro e login reais no navegador com backend local e banco temporário: 9 verificações passaram, incluindo validação de campos, pendência jurídica, prevenção de envio duplicado, sessão, senha incorreta e ida ao dashboard. O Canvas é removido no dashboard.
- Seis sequências SPA: 1 Canvas, mesmo elemento e mesmo contexto WebGL, sem download repetido dos dois módulos da cena. Navegação direta e refresh de login e cadastro, modo leve, perda de contexto e fallback sem WebGL também foram exercitados. O navegador headless manteve a aba em estado `visible` ao alternar abas; a pausa em segundo plano depende do evento `visibilitychange` e não foi confirmada em uma janela real.
- Larguras 360, 390, 768, 1024, 1440 e 1920 px: sem rolagem horizontal; o botão de cadastro permanece alcançável por rolagem vertical. Até 1024 px, não houve download da cena.
- Capturas de quadros intermediários em 1920 × 955, capturas desktop/mobile e vídeo da navegação estão somente em `artifacts/`, conforme `AGENTS.md`.

## Medições

Medições locais em Chrome headless com SwiftShader, build de produção, sem simular um dispositivo físico. Valores são medianas de amostras para acesso direto com cache frio, salvo quando indicado.

| Medida | Auth V3 | Auth V4 |
| --- | ---: | ---: |
| Formulário visível, login | 446 ms | 416 ms |
| Formulário visível, cadastro | 449 ms | 415 ms |
| JS transferido antes da cena, login | 125.906 B | 126.482 B |
| JS transferido antes da cena, cadastro | 130.088 B | 130.661 B |
| Primeiro frame 3D, login | não havia | 797 ms |
| Primeiro frame 3D, cadastro | não havia | 859 ms |
| JS total com cena, login | não havia | 372.001 B |
| JS total com cena, cadastro | não havia | 376.180 B |

No acesso direto V4, LCP mediano foi 648 ms no login e 720 ms no cadastro; CLS ficou abaixo de 0,00007. Foram observadas 3–4 long tasks por amostra. A navegação SPA, incluindo a acomodação visual do host, levou 1.674 ms da landing ao login, 1.762 ms do login ao cadastro e 928 ms no retorno ao login em uma execução. As requisições dos módulos 3D permaneceram em duas durante essas rotas. A comparação de tempo de formulário indica apenas o resultado deste ambiente; o custo total de JS e GPU aumenta quando o 3D é exibido. FPS real e memória GPU não são mensuráveis com confiança nesse navegador de teste; dependem do dispositivo e do driver.

As evidências locais incluem `auth-v4-routes.json`, `auth-v4-conditions.json`, `auth-v4-regression.json`, `auth-v4-perf.json`, `auth-v4-navigation-perf.json`, `auth-v4-transitions.webm` e `auth-v4-transition-login-*.png` em `artifacts/`. Esses arquivos não integram o Git.
