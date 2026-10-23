# Homologação — Living Energy 3D

Branch: `feature/living-energy-3d`. Nada foi enviado ao GitHub nem publicado.

## Verificado automaticamente (revisão de 23/10/2026)

| Verificação | Resultado |
| --- | --- |
| Frontend `npm test` | 18 testes passam (inclui fuso horário e agregações) |
| Backend `TEST_MONGO_URL=mongodb://127.0.0.1:27017 npm test` | 52 testes passam, incluindo Mongo real |
| HEAD isolado (worktree sem alterações de terceiros) | `tsc`, testes e `vite build` OK |
| Navegador — usuário antigo com 3 aparelhos sem imóvel | 1 imóvel padrão, 3 aparelhos atribuídos; recarregar não duplica |
| Navegador — imóveis | Lista sem requisição por card; tema claro |
| Navegador — 3D | Canvas renderiza, ambientes com cores distintas, marcadores dentro dos cômodos |
| Navegador — teclado | Ambiente 2D recebe foco; Enter abre o painel |
| Navegador — totais | Soma dos ambientes = total do imóvel; "Todos" = soma dos imóveis |
| Navegador — erro de rede nas medições | Mostra "indisponível", não "sem medição" |
| Navegador — celular 390 px | Toque no ambiente abre painel inferior; sem rolagem horizontal |
| Navegador — sem WebGL | Planta 2D com aviso, sem canvas |
| Navegador — erros de JavaScript | Nenhum |

Desempenho medido localmente (Chrome sem interface com renderização por software, 10 ambientes e 20 aparelhos): Meus imóveis 0,9 s e 5 requisições; imóvel em 3D 0,9 s, 7 requisições e ~10 MB de memória JS; o pacote 3D tem ~230 kB gzip e só carrega na vista 3D. Valores de máquina local; servem como referência, não como meta de produção.

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
- Visão geral em "Todos os imóveis" e Relatórios usam o fuso do navegador; telas de imóvel usam o fuso do imóvel.
- Excluir um imóvel mantém as leituras com o id antigo: elas continuam no total geral, mas não aparecem em nenhum imóvel.
- Ao estourar o limite global da API (120 requisições/min por IP), o app trata o `429` em `/api/auth/me` como sessão perdida e volta ao login. Comportamento anterior a esta funcionalidade; vale tratar antes de abrir para muitos usuários atrás do mesmo IP.
- Sem uma tela de usuário "sem imóveis": todo usuário recebe o imóvel padrão no primeiro acesso.
