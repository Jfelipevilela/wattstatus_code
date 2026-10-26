# Landing pública (Emerald Dark)

Página `/` antes do login. Tudo vive em `src/components/landing/`; a rota continua sendo `src/pages/Index.tsx`. Nenhuma chamada autenticada nem chamada à IA é feita a partir da landing.

## Estrutura

| Arquivo | Papel |
|---|---|
| `content.ts` | Textos, cômodos da casa demonstrativa, links de navegação |
| `landing.css` | Tokens Emerald Dark (`--l-*`) e utilitários da landing; não altera o tema do app |
| `LandingHeader.tsx`, `LandingFooter.tsx` | Navegação própria da landing (o `Navbar`/`Footer` do app não são usados aqui) |
| `HeroSection.tsx` | Texto do hero, pôster, modo leve, seletor de cômodos, painel contextual |
| `HeroHouse3D.tsx` | Cena React Three Fiber (carregada sob demanda) |
| `house/layout.ts`, `house/textures.ts` | Arquitetura da casa e texturas procedurais (nada é baixado) |
| `HouseIllustration.tsx` | Casa em SVG: modo leve, sem WebGL e cartões |
| `FeatureShowcase.tsx`, `PlatformPreview.tsx`, `AIPresentation.tsx`, `HowItWorks.tsx`, `FinalCTA.tsx` | Seções |
| `dataStates.ts` | Vocabulário medido / estimado / parcial / sem dados |

Os móveis da casa vêm do gerador do Living Energy (`src/components/floorplan/three/furniture.ts`). Mudanças na API `furnitureFor` afetam a landing.

## Dados demonstrativos

- A casa 3D é ilustrativa e não mostra consumo. O painel de cômodo diz isso.
- Gráfico de estados e simulador do showcase não têm valores de energia nem dinheiro; o simulador só compara horas de uso com uma meta.
- A conversa da IA é texto fixo, marcado como "Exemplo ilustrativo".
- As telas em `public/landing/app-*.webp` são capturas reais do app feitas com uma conta de demonstração local e dados sintéticos (ver abaixo). A legenda na página diz isso.

## Modos do hero

| Situação | Comportamento |
|---|---|
| Dispositivo capaz | Pôster estático aparece na hora; cena 3D carrega no primeiro momento ocioso e entra por cima |
| Economia de dados (`saveData`), `deviceMemory` ≤ 2 GB ou ≤ 2 núcleos | Começa no modo leve (SVG interativo) com botão "Ver em 3D" |
| Escolha do visitante | Botão "Modo leve" na barra da cena; preferência em `localStorage` (`wattstatus-landing-3d`) |
| Sem WebGL | SVG interativo, sem oferta de 3D |
| Falha ao baixar o chunk 3D ou perda de contexto WebGL | Volta ao SVG com "Tentar novamente" |

Em todos os modos: seletor de cômodos em HTML (teclado e toque), destaque do cômodo e painel contextual.

## Performance

Inicialização da cena em `HeroHouse3D.tsx`:

1. O chunk 3D começa a baixar logo após a primeira pintura.
2. A cena monta no primeiro momento ocioso, com `frameloop="never"`.
3. `renderer.compileAsync` compila os shaders antes do primeiro quadro.
4. O primeiro quadro sai sem sombras; o mapa de sombras entra no momento ocioso seguinte e as sombras de contato em outro.
5. O loop para quando o hero sai da tela ou a aba fica oculta; DPR limitado e reduzido pelo `PerformanceMonitor`.

Marcas `performance` para medir em qualquer navegador: `hero-3d-ready`, `hero-3d-first-frame`, `hero-3d-shadows`.

## Regenerar pôsteres

Sempre que a cena mudar (câmera, materiais, luzes), com o app rodando:

```
npm i --no-save playwright-core
node scripts/landing/render-posters.mjs --url=http://localhost:8080/ [--chrome=<caminho do chrome>]
```

Gera `public/landing/hero-poster.webp` e `hero-poster-mobile.webp` (conversão WebP via Python + Pillow; os PNG ficam em `tmp/landing-posters/`).

## Regenerar as capturas da plataforma

Usa o backend real contra um MongoDB local descartável. Nunca aponte para um banco compartilhado ou de produção; o script recusa endereços que não sejam `localhost`/`127.0.0.1`.

```
npm run build
npm --prefix backend ci && npm --prefix backend run build
docker run -d --rm --name ws-landing-demo -p 127.0.0.1:27117:27017 mongo:7
DEMO_MONGO_URL=mongodb://127.0.0.1:27117 node scripts/landing/demo-server.cjs
# em outro terminal, com email/senha/propertyId impressos acima:
node scripts/landing/capture-screens.mjs --email=demo@example.test --password=<senha> --property=<id>
# encerrar: digite "quit" no servidor (apaga o banco) e: docker stop ws-landing-demo
```

A conta criada é comum (sem administração) e a senha é aleatória a cada execução.

## Integração

- Arquivos alterados fora de `src/components/landing/`: apenas `index.html` (título, descrição, Open Graph, fonte Manrope) e `src/pages/Index.tsx`.
- Nenhuma dependência nova em `package.json`. `playwright-core` só é instalado (sem salvar) para os scripts acima.
- `Navbar` e `Footer` antigos continuam em uso nas demais páginas públicas (`/sobre`).
- Pendente fora do escopo da landing: o cadastro (`SignUp.tsx`) aponta para `/termos` e `/privacidade`, rotas que não existem e hoje mostram a página 404. Os textos legais precisam vir do responsável jurídico antes da publicação.
