# WattStatus Living Energy 3D

Organiza o consumo de energia por **imóvel → pavimento → ambiente → aparelho** e mostra cada imóvel numa planta 2D/3D gerada a partir dos ambientes reais do usuário.

## Visão geral da arquitetura

| Camada | Onde | Responsabilidade |
| --- | --- | --- |
| API | `backend/src/modules/properties/` | CRUD de imóveis, pavimentos e ambientes, layout da planta, resumo e energia por imóvel |
| Persistência | `backend/src/storage/mongo-db.ts` | Coleções `properties`, `property_floors`, `property_rooms`; campos `propertyId`/`roomId` em `appliances` e `energy_samples` |
| Medições | `backend/src/modules/energy/energy-history.ts` | Guarda o local do aparelho no momento da leitura e marca intervalos que atravessam uma mudança de local |
| Agregação (frontend) | `src/lib/property-energy.ts` | Soma estimado e medido por ambiente/imóvel, sem contar nada duas vezes |
| Planta | `src/components/floorplan/` | `FloorPlan2D` (SVG, edição), `FloorPlan3D` (React Three Fiber, carregado sob demanda), `FloorPlanViewer` (alternância, fallback, legenda) |
| Telas | `src/pages/Properties.tsx`, `PropertyDetail.tsx`, `RoomDetails.tsx` | Meus imóveis, imóvel (Planta, Ambientes, Aparelhos, Consumo, Configurações) e ambiente |

A lógica de negócio fica fora dos componentes 3D: a cena só recebe ambientes, aparelhos e agregados prontos.

## Modelo de dados

```
properties        { id, userId, name, type, city?, state?, country?, address?, description?, icon?, color?,
                    timezone, isPrimary, tariffState?, tariffValue?, legacyDefault?, createdAt, updatedAt, archivedAt? }
property_floors   { id, userId, propertyId, name, level, sortOrder, createdAt, updatedAt }
property_rooms    { id, userId, propertyId, floorId, name, type, icon?, color?, sortOrder,
                    layout { x, y, width, depth } (metros), createdAt, updatedAt }
appliances        + propertyId, roomId (null = "Sem ambiente")
energy_samples    + propertyId, roomId (local do aparelho na captura; ausente em leituras antigas)
```

Índices novos: `properties.id` (único), `properties {userId, archivedAt}`, `properties {userId}` único parcial para `legacyDefault: true` (um imóvel padrão por usuário, mesmo com acessos simultâneos), `property_floors {userId, propertyId}`, `property_rooms {userId, propertyId, floorId}`, `appliances {userId, propertyId, roomId}`, `energy_samples {userId, propertyId, capturedAt}`.

## Endpoints

Todos exigem autenticação e CSRF nas mutações. Os ids do caminho só são procurados dentro dos registros do usuário: id de outro usuário ou id malformado responde **404**.

| Método | Caminho | Uso |
| --- | --- | --- |
| GET | `/api/properties` (`?archived=1`) | Lista; cria o imóvel padrão na primeira chamada |
| POST | `/api/properties` | Cria (com pavimento "Térreo") |
| GET / PATCH / DELETE | `/api/properties/:id` | Ler, editar (`isPrimary`, `archived`), excluir (`moveAppliancesTo` obrigatório se houver aparelhos) |
| GET | `/api/properties/:id/summary` | Estimado por ambiente + "Sem ambiente" + totais |
| GET | `/api/properties/:id/energy?start&end[&roomId]` | Intervalos medidos registrados no imóvel; leituras sem local vêm à parte em `unlocated` |
| GET / POST | `/api/properties/:id/floors` | Pavimentos |
| PATCH / DELETE | `/api/properties/:id/floors/:floorId` | Excluir só sem ambientes e se houver outro pavimento |
| GET / POST | `/api/properties/:id/rooms` | Ambientes; sem `layout`, o ambiente é posicionado automaticamente |
| GET / PATCH / DELETE | `/api/properties/:id/rooms/:roomId` | Excluir move os aparelhos para "Sem ambiente" ou para `moveAppliancesTo` |
| GET | `/api/properties/:id/rooms/:roomId/energy` | Medido do ambiente |
| GET / PUT | `/api/properties/:id/layout` | Lê/salva posições e dimensões (até 200 ambientes por chamada) |
| PUT | `/api/appliances/:id` | Aceita `propertyId` e `roomId`; o par é validado contra o dono |

Validações: Zod em todos os corpos, limites de geometria (0–200 m de posição, 1–40 m de lado, nada fora da área), cor `#rrggbb`, fuso IANA válido, tarifa entre 0 e 10 R$/kWh.

## Cálculos

- **Estimado por aparelho:** `potência × horas/dia × min(dias, dias do mês) ÷ 1000`; custo com a tarifa **do próprio aparelho**. Nunca há média de tarifas.
- **Ambiente:** soma dos aparelhos com `roomId` daquele ambiente.
- **Imóvel:** soma de todos os aparelhos do imóvel, incluindo "Sem ambiente". Por construção, ambientes + "Sem ambiente" = imóvel.
- **Todos os imóveis:** soma dos imóveis; cada aparelho pertence a um só imóvel. Aparelhos antigos sem `propertyId` contam no imóvel principal.
- **Tarifas:** cada aparelho guarda a sua tarifa. A tarifa do imóvel é a sugestão usada ao cadastrar ou importar aparelhos nele; a do perfil continua como último recurso. Valores por estado são de referência, não tarifas oficiais vigentes.
- **Medido:** fica sempre separado do estimado e nunca é preenchido com estimativa.

## Fuso horário

Cada imóvel guarda um fuso IANA (padrão `America/Sao_Paulo`). `src/lib/timezone.ts` converte "mês X no fuso do imóvel" em instantes UTC, considerando horário de verão e dias cuja meia-noite não existe.

- **Imóvel e ambiente:** "este mês", os limites da consulta de medições e os meses do gráfico usam o fuso do imóvel.
- **Visão geral com um imóvel selecionado:** mesmo fuso do imóvel; a consulta busca um dia a mais em cada ponta e depois separa por mês, para não perder leituras de imóveis em outro fuso.
- **Visão geral em "Todos os imóveis" e Relatórios:** continuam no fuso do navegador, como antes. Somar imóveis em fusos diferentes num único "mês" não tem um corte único correto.
- **Intervalos que cruzam a virada do mês** entram no mês em que a leitura terminou (regra que já existia, agora aplicada no fuso escolhido).
- **Dados antigos:** nada foi reprocessado. As leituras guardam instantes UTC; só a forma de agrupar por mês muda, e apenas nas telas de imóvel.

## Histórico ao mover aparelhos

Cada nova leitura grava `propertyId` e `roomId` do aparelho naquele momento. Ao montar os intervalos:

- leituras do mesmo local geram intervalo daquele ambiente;
- se o aparelho mudou de ambiente entre duas leituras acumuladas, o intervalo é real mas fica **sem ambiente** e com `locationChanged: true` (mantém o imóvel se os dois lados concordarem). Ele entra no total do imóvel e aparece como "não atribuído", sem divisão arbitrária;
- leituras de antes desta versão não têm local e **não são atribuídas** a nenhum imóvel ou ambiente. Aparecem como `unlocated`;
- mover ou excluir ambientes nunca altera leituras antigas.

As projeções dos meses anteriores continuam usando o cadastro atual e são rotuladas como estimativa.

## Planta 2D/3D

- **Layout automático:** ao criar um ambiente sem posição, o servidor procura o primeiro espaço livre varrendo linhas de 1 m numa largura de 12 m. É determinístico e não move ambientes já posicionados.
- **3D:** `@react-three/fiber@8.18` + `drei@9.122` + `three@0.170` (compatíveis com React 18). Câmera ortográfica isométrica, `frameloop="demand"` (só renderiza quando algo muda), geometrias simples (caixas e esferas), rótulos HTML, marcadores por aparelho, foco suave no ambiente selecionado (instantâneo com `prefers-reduced-motion`), zoom, pan, rotação limitada e botão de restaurar vista. O pacote 3D (~230 kB gzip) só é baixado quando o usuário abre a vista 3D.
- **Fallback:** sem WebGL, com perda de contexto ou erro na cena, a tela mostra a planta 2D com as mesmas informações e um aviso.
- **2D:** SVG com seleção, marcadores, rótulos, mapa de consumo e **edição**: arrastar move, o canto verde redimensiona, setas movem 0,5 m e Shift+setas redimensionam. A edição é salva com "Salvar planta".
- **Mapa de consumo:** métrica explícita (estimado do mês ou medido no período), legenda em texto e gradiente, e ambientes sem dado hachurados com o rótulo "sem medição"/"sem aparelhos" — ausência de dado nunca aparece como consumo baixo.
- **Mobile:** detalhes do ambiente abrem num painel inferior; a lista de ambientes substitui o painel lateral.

## SmartThings

A integração, a autenticação e a criptografia dos tokens não mudaram. Na importação o usuário escolhe imóvel e ambiente; o nome do cômodo na SmartThings só pré-seleciona um ambiente do WattStatus com o mesmo nome. A coleta programada continua opt-in e passa a gravar o local de cada leitura.

## Tokens visuais

`src/components/floorplan/tokens.ts` concentra as cores da planta (placa, paredes, seleção, ausência de dado, paleta dos ambientes, rampa do mapa de calor e marcadores). O 3D precisa de cores literais, então 2D e 3D leem dali. Para aplicar a identidade final, troque esses valores. O verde principal continua vindo de `--primary` e `energy-*` do Tailwind.

## Testes

- `backend/tests/properties.test.cjs`: imóvel padrão idempotente (inclusive concorrente), layout determinístico, isolamento entre usuários, rotas HTTP com ids estrangeiros/malformados, totais por ambiente sem duplicar, exclusões preservando aparelhos, validação de geometria, movimentação de aparelhos, intervalos com mudança de local.
- `backend/tests/mongo-properties.test.cjs` (requer `TEST_MONGO_URL` local): índice único do imóvel padrão sob concorrência, snapshot de local nas medições, filtro por ambiente, exclusão de ambiente sem perder medições.
- `tests/property-energy.test.cjs`: soma ambientes + sem ambiente = imóvel, imóveis = total, medido separado, mapa de calor tratando ausência como desconhecido, tipo de ambiente pelo nome e cores distintas.
- `tests/timezone.test.cjs`: virada de mês em fusos diferentes, horário de verão de Nova York, meia-noite inexistente no Chile, Índia +5:30, intervalos que cruzam o mês, fuso inválido.
