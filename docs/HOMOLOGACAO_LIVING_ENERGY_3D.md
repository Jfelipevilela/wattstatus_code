# Homologação — Living Energy 3D

Branch: `feature/living-energy-3d`. Nada foi enviado ao GitHub nem publicado.

## Verificado automaticamente

| Verificação | Resultado |
| --- | --- |
| `npm run build` (frontend) | OK. Pacote 3D separado (`FloorPlan3D`, ~860 kB, ~230 kB gzip), carregado só ao abrir a vista 3D |
| `npm test` (frontend) | 12 testes passam |
| `TEST_MONGO_URL=mongodb://127.0.0.1:27017 npm test` (backend) | 47 testes passam, incluindo Mongo real |
| Migração em banco descartável | Simulação, aplicação e reaplicação idempotente conferidas |
| Navegador (Chrome sem interface, banco descartável) | Cadastro de usuário, 5 ambientes, 7 aparelhos e 2 imóveis via API; telas Meus imóveis, Planta 3D, seleção de ambiente, mapa de consumo, Planta 2D, edição, Consumo, Ambientes, celular (390 px), página do ambiente e Visão geral com filtro por imóvel. Nenhum erro de console além do 401 esperado antes do login |

## Roteiro manual

### Imóveis
- [ ] Usuário antigo entra e encontra "Meu imóvel" com todos os aparelhos em "Sem ambiente".
- [ ] Criar "Casa de férias"; ela aparece em Meus imóveis com R$ 0,00 e "sem medição".
- [ ] Tornar a casa de férias principal; o selo "Principal" muda de card.
- [ ] Arquivar um imóvel com outro ativo; tentar arquivar o último (bloqueado).
- [ ] Excluir imóvel com aparelhos exige escolher o destino; os aparelhos aparecem no destino.

### Ambientes e planta
- [ ] Criar Sala, Cozinha, Quarto, Banheiro: aparecem na planta sem sobreposição.
- [ ] Alternar 2D/3D; girar, aproximar, mover e restaurar a vista.
- [ ] Clicar num ambiente: destaque, câmera aproxima e painel mostra estimado, medido e aparelhos.
- [ ] "Editar planta": arrastar, redimensionar, usar setas; salvar e recarregar a página (posições mantidas).
- [ ] Mapa de consumo "Medido" sem medidores: todos hachurados com "sem medição".
- [ ] Criar "Primeiro andar" e um ambiente nele; alternar pavimentos.
- [ ] Excluir ambiente com aparelhos escolhendo outro ambiente como destino.
- [ ] Celular: tocar num ambiente abre o painel inferior.
- [ ] Navegador sem WebGL (ou `chrome://flags` desativando WebGL): a tela mostra a planta 2D com aviso.

### Totais
- [ ] Na aba Consumo, soma dos ambientes + "Sem ambiente" = total do imóvel.
- [ ] Na Visão geral, "Todos os imóveis" = soma dos chips de cada imóvel.
- [ ] Mover um aparelho de imóvel: some de um total e aparece no outro, sem duplicar.

### Relatórios
- [ ] Filtrar por imóvel e ambiente; a tabela e o PDF mostram só o escopo e o PDF traz o escopo na capa.

### SmartThings (precisa de hardware e conta reais)
- [ ] Importar dispositivo escolhendo imóvel e ambiente; o cômodo com mesmo nome da SmartThings vem pré-selecionado.
- [ ] Com a coleta ligada, novas leituras aparecem no ambiente correto (aba Consumo e página do ambiente).
- [ ] Mover o aparelho de ambiente entre duas coletas: o intervalo seguinte aparece como "não atribuído", e os anteriores continuam no ambiente original.
- [ ] Desconectar e reconectar a conta: aparelhos e histórico continuam.

**Não testado com hardware real:** leitura SmartThings e coleta programada. Essas partes foram validadas com dados simulados e banco Mongo local.

## Pendências e limitações conhecidas

- Plantas usam retângulos; não há paredes compartilhadas, portas nem formatos em L (escopo intencional).
- A edição da planta é feita na vista 2D; a 3D é para navegação.
- Estimativas de meses anteriores usam o cadastro atual (comportamento já existente), sempre rotuladas como estimativa.
- Leituras medidas de antes desta versão não têm local e não entram em totais por imóvel/ambiente; aparecem como "medidos antes do registro de localização".
- O pacote 3D é grande (~230 kB gzip), mas só é baixado na vista 3D.
- Endereço e fuso do imóvel são guardados, mas o fuso ainda não muda o corte dos meses (usa o fuso do navegador, como o restante do app).
