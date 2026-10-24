# WattStatus AI

Camada de inteligência energética do WattStatus. Este documento cobre a arquitetura, os cálculos, os contratos, a configuração, a segurança, os custos, os testes e o que ainda falta.

## 1. Princípio central

O backend calcula todos os números. O modelo de linguagem, quando habilitado, só reescreve em linguagem natural uma resposta que já foi calculada. Uma resposta do modelo que traga um número ausente dos fatos calculados é descartada, e o usuário recebe o texto determinístico.

Consequências:

- O assistente funciona sem nenhum provedor de IA configurado (`AI_ENABLED` ausente). Ele responde com texto gerado pelo motor.
- O simulador, os insights do dashboard e as recomendações nunca gastam tokens.
- Toda métrica sai com a origem: `measured`, `measured_partial`, `estimated`, `projected`, `simulated` ou `unavailable`.

## 2. Auditoria do sistema existente (base reutilizada)

| Necessidade | O que já existia e foi reutilizado |
|---|---|
| Autenticação | `createAuthenticate` (JWT + sessão no MongoDB). Todas as rotas `/api/ai` passam por ele. |
| Estimativa mensal | `estimateMonthly` em `properties.service.ts`: mesma fórmula do frontend, tarifa por aparelho. |
| Tarifa | `STATE_TARIFFS` e `tariffValue` do aparelho e do imóvel. |
| Imóveis, pavimentos, ambientes | `PropertyService` (com `ensureDefault` e checagem de dono). |
| Aparelhos | `ApplianceService.list` (anexa aparelhos legados ao imóvel padrão). |
| Medições | `getEnergyHistory` e `toEnergyIntervals` (intervalos com local de captura). |
| Rate limit | `consumeRateLimit` (janela fixa no MongoDB), reaproveitado para os limites de IA. |
| Maquete 3D | `FloorPlanViewer` e o estado `selectedRoomId`/`highlighted` de `PropertyDetail`. A IA só usa esse estado. |

Não há um segundo motor de cálculo. O módulo de IA importa `estimateMonthly` e aplica a mesma precedência de tarifa.

## 3. Arquitetura

```
backend/src/modules/ai/
  ai.engine.ts        Motor determinístico: snapshot, rankings, cobertura, previsão,
                      comparação de períodos, anomalias, simulações, metas,
                      recomendações, acompanhamento.
  ai.orchestrator.ts  Intenção (regras pt-BR), entidades, contexto da conversa,
                      montagem da resposta, narração opcional pelo modelo e guarda
                      de números.
  ai.provider.ts      Interface de provedor, implementação Anthropic via fetch,
                      timeout, retentativa única com backoff.
  ai.prompts.ts       Prompts curtos (sistema, narração, classificação).
  ai.schemas.ts       Zod: requisições, ações discriminadas, cards, contrato de resposta.
  ai.store.ts         MongoDB: preferências, estado das recomendações, métricas de uso.
  ai.routes.ts        Endpoints, limites, semáforo de concorrência, painel admin.

src/components/wattai/
  WattAI.tsx          Provider global, botão flutuante, execução das ações.
  WattAIPanel.tsx     Chat (carregado sob demanda).
  WattAICards.tsx     Renderização de métricas, cards e ações.
  WattAISimulator.tsx Simulador com sliders (carregado sob demanda).
  AIInsights.tsx      Seção "Análises do WattStatus AI" do dashboard.
src/lib/wattai.ts     Tipos do contrato e chamadas de API.
```

### Fluxo de uma pergunta

1. `POST /api/ai/chat` passa pela autenticação existente e pelo limitador `ai-user` (20 por minuto por usuário).
2. O orquestrador carrega imóveis, aparelhos e preferências **do usuário autenticado**. Os IDs do contexto enviados pelo cliente que não pertencem a ele são descartados.
3. O imóvel é resolvido nesta ordem: nome citado, contexto, imóvel principal das preferências, imóvel principal, primeiro imóvel.
4. O motor monta o snapshot do mês no fuso do imóvel: aparelhos, ambientes, totais, medições diárias do mês e do mês anterior.
5. A intenção é classificada por regras. Só quando a intenção é desconhecida, e o modelo está habilitado, uma chamada curta ao modelo rápido escolhe uma das intenções conhecidas.
6. O handler da intenção calcula tudo e produz texto, métricas, cards, limitações, sugestões e ações.
7. Opcionalmente o modelo reescreve o texto. Os números da reescrita são comparados com os fatos. Se algum não estiver nos fatos, a reescrita é descartada.
8. A resposta é validada por `responseSchema` antes de sair.
9. Uma métrica de uso (intenção, tokens, custo estimado, latência, erro) é gravada sem o conteúdo da conversa.

No máximo duas chamadas ao modelo por pergunta (`AI_MAX_TOOL_CALLS`): classificação e narração. Não há agentes autônomos nem ferramenta genérica de consulta.

### Ferramentas

As "ferramentas" são handlers determinísticos escolhidos pelo orquestrador, não funções que o modelo chama livremente. Isso elimina loops e o modelo nunca recebe IDs para agir.

| Intenção | Equivale a |
|---|---|
| `property_summary` | `get_property_summary`, `get_room_summary` (quando um ambiente é citado) |
| `top_consumers` | `get_top_consumers`, `list_appliances` |
| `room_ranking` | `compare_rooms` |
| `appliance_detail` | `get_appliance_details`, `get_appliance_consumption` |
| `compare_properties` | `compare_properties` (cada imóvel com a própria tarifa) |
| `compare_periods` | `compare_energy_periods`, `get_consumption_trend` |
| `coverage` | `get_measurement_coverage` |
| `forecast` | `get_energy_forecast` |
| `anomalies` | `get_detected_anomalies` |
| `recommendations` | `get_savings_opportunities`, `get_energy_insights` |
| `simulate_reduction` / `simulate_annual` | `simulate_usage_reduction` |
| `simulate_replacement` | `simulate_appliance_replacement` |
| `budget` | `simulate_monthly_budget` |
| `device_command` | Recusa: comandos não estão habilitados |

As ações de navegação (`highlight_room`, `highlight_appliance`, `navigate_to_property`, `open_simulation_result`) são as ações estruturadas da resposta. Ver seção 5.

## 4. Cálculos

### Estimativa

`kWh = potência_W × horas_dia × min(dias_uso, dias_do_mês) / 1000`. Custo = kWh × tarifa do aparelho. É a mesma fórmula do dashboard.

### Simulação de horas de uso

`economia_kWh_mês = (potência_W / 1000) × (horas_atuais − horas_propostas) × dias_uso`.

- As horas propostas ficam entre 0 e as horas cadastradas. Uma redução maior que o uso cadastrado vira desligamento total, com aviso.
- **Aparelho com medição** (7 dias de leitura ou mais): a potência média medida substitui a nominal.
- **Aparelho de ciclo** (ar-condicionado, geladeira, freezer, aquecedor, bomba): o cenário central usa a potência cadastrada, a mesma base de todas as estimativas do app. Um cenário conservador de 50% mostra que a economia real pode ser menor.
- Diária, mensal e anual (mensal × 12). Tarifa atual, sem projeção de bandeiras.

Exemplo validado no navegador: ar-condicionado de 1.400 W, 8 h para 6 h, 30 dias, R$ 0,82/kWh, resulta em 84 kWh e R$ 68,88 por mês, R$ 826,56 por ano. O conservador fica em R$ 34,44.

### Troca de equipamento

`(W_atual − W_novo)/1000 × horas × dias × tarifa`. Sem potência informada, o motor usa um modelo hipotético 30% mais eficiente e diz isso. Com preço informado ("R$ 3.000"), calcula o retorno em meses.

### Meta mensal

Algoritmo guloso sobre os aparelhos mais caros. Cada corte vai até 30% das horas (mínimo de 1 h). O plano nunca inclui aparelhos essenciais (geladeira, freezer, bomba, roteador, alarme, câmera, equipamento médico), aparelhos marcados como essenciais nas preferências, nem aparelhos que o usuário protegeu na frase ("não quero diminuir o computador"). Se a meta não for alcançável, o motor diz isso e não força números.

### Previsão do mês

- **Casa 100% medida e 5 dias completos ou mais**: total medido até ontem + média dos últimos 7 dias × dias restantes. A faixa é ±1,64 × desvio padrão × √(dias restantes). O backtest compara o WAPE do método com a média simples nos últimos 7 dias.
- **Medição parcial ou ausente**: a previsão é a estimativa do cadastro, com origem `estimated` e a razão explícita. Medição parcial nunca é tratada como total da casa.
- **Sem aparelhos**: `insufficient_data`.
- Valores de previsão aparecem arredondados para reais inteiros.

### Comparação de períodos

Compara médias diárias medidas (pelo menos 3 dias neste mês e 7 no anterior), para não misturar períodos de tamanhos diferentes. Sem medição, o motor explica que o cadastro estimado não mostra tendência.

### Anomalias

- **Pico**: z robusto (mediana e MAD × 1,4826) acima de 3,5 nos últimos 3 dias, com diferença absoluta acima de 0,5 kWh, sobre pelo menos 14 dias de histórico.
- **Aumento persistente**: mediana dos últimos 7 dias acima de 125% da mediana das 3 semanas anteriores.
- **Falha de medição**: aparelho conectado sem leitura há mais de 48 h.
- **Leitura inconsistente**: medido acima de 1,5 × (potência × 24 h × dias medidos).

O texto sempre diz que um aumento não prova desperdício.

### Períodos e fuso

O mês é calculado no fuso do imóvel (`timezone`), com tratamento de horário de verão. Os testes cobrem São Paulo, Tóquio e Nova York na transição de novembro.

## 5. Contrato de resposta

Validado por `responseSchema` (Zod) no backend antes de sair.

```ts
interface WattAIResponse {
  message: string;               // texto puro, nunca HTML
  intent: string;
  context: { propertyId?; roomId?; applianceId?; lastIntent?; lastProposedHours?; lastReductionHours? };
  metrics: Array<{ label; value; unit: "kWh"|"R$"|"%"|"h"|"W"|"dias"; source; coverage? }>;
  cards: Array<ranking | simulation | budget | forecast | recommendations | anomalies | choices>;
  limitations: string[];
  suggestions: string[];
  actions: Array<
    | { type: "open_property"; label; propertyId; roomId?; applianceId? }
    | { type: "open_simulator"; label; propertyId; applianceId; proposedHours? }
    | { type: "open_page"; label; path: "/dashboard"|"/aparelhos"|"/relatorios"|"/anomalias"|"/imoveis"|"/integracoes/smartthings" }
    | { type: "ask"; label; message }
  >;
  meta: { engine; generated: "deterministic"|"llm"; model; latencyMs; inputTokens; outputTokens; estimatedCostUsd };
}
```

O frontend só executa esses quatro tipos de ação. `open_property` navega para `/imoveis/:id?sala=&aparelho=`. `PropertyDetail` lê esses parâmetros, seleciona o pavimento e o cômodo pelo estado que a maquete já usa e destaca o marcador do aparelho. Depois remove os parâmetros da URL. A cena não é recriada.

## 6. Endpoints

Todos ficam sob `/api/ai`, com a autenticação existente. Mutações exigem CSRF, como no resto da API.

| Método e rota | Uso | Modelo |
|---|---|---|
| `GET /status` | IA generativa ligada ou não, limites | não |
| `POST /chat` | Pergunta `{ message, context?, history? }` | opcional |
| `POST /simulate` | `{ propertyId, applianceId, proposedHours, daysPerMonth?, rate? }` | nunca |
| `POST /budget` | `{ propertyId, target, protectedApplianceIds? }` | nunca |
| `GET /insights?propertyId=` | Insights, previsão, anomalias, recomendações com estado | nunca |
| `PATCH /recommendations/:id?propertyId=` | `{ state: new\|viewed\|saved\|tracking\|applied\|dismissed }` | nunca |
| `GET/PUT /preferences` | Meta mensal, imóvel principal, aparelhos essenciais, insights proativos | nunca |
| `DELETE /data` | Apaga preferências, estados e métricas do usuário | nunca |
| `GET /admin/usage?days=` | Métricas agregadas, só para e-mails em `AI_ADMIN_EMAILS` | nunca |

## 7. Configuração

| Variável | Padrão | Uso |
|---|---|---|
| `AI_ENABLED` | `false` | `true` liga o modelo generativo. Sem ele, tudo funciona de forma determinística. |
| `AI_PROVIDER` | `anthropic` | Único provedor implementado. |
| `AI_API_KEY` | — | Chave do provedor. Só no servidor (variável de ambiente do Netlify). Nunca no frontend nem no Git. |
| `AI_BASE_URL` | `https://api.anthropic.com` | Endpoint do provedor. |
| `AI_MODEL_FAST` | `claude-haiku-5-5` | Classificação e narração comum. |
| `AI_MODEL_REASONING` | `claude-sonnet-5-5` | Só para comparação de imóveis, metas com restrições ou conversa longa. |
| `AI_MAX_OUTPUT_TOKENS` | `500` | Teto de saída por chamada. |
| `AI_REQUEST_TIMEOUT_MS` | `12000` | Timeout por chamada. |
| `AI_MAX_TOOL_CALLS` | `2` | Chamadas ao modelo por pergunta. |
| `AI_DAILY_USER_BUDGET` | `60` | Chamadas ao modelo por usuário por dia. |
| `AI_MONTHLY_GLOBAL_BUDGET` | `20000` | Chamadas ao modelo no total em 30 dias. |
| `AI_MAX_CONCURRENT_REQUESTS` | `4` | Chamadas simultâneas por instância. Acima disso a resposta sai do motor. |
| `AI_PRICE_INPUT_PER_MTOK` / `AI_PRICE_OUTPUT_PER_MTOK` | `1` / `5` | USD por milhão de tokens, só para o custo estimado. Ajuste para o preço do modelo escolhido. |
| `AI_USAGE_RETENTION_DAYS` | `90` | TTL das métricas de uso. |
| `AI_ADMIN_EMAILS` | — | E-mails com acesso a `/admin/usage`, separados por vírgula. |

Para ligar a IA generativa em homologação, defina `AI_ENABLED=true` e `AI_API_KEY` nas variáveis de ambiente do site no Netlify. Não coloque a chave em arquivo versionado. Confirme os nomes de modelo disponíveis na sua conta antes de ligar.

## 8. Segurança

- **Isolamento**: o orquestrador só lê dados por `userId` da sessão. IDs de contexto, corpo ou consulta que não pertencem ao usuário são descartados ou geram 404. Testes cobrem contexto alheio, `/simulate` com imóvel alheio, `/simulate` com aparelho alheio, recomendação inexistente e preferências com aparelho alheio.
- **Prompt injection**: nomes de aparelhos, imóveis e ambientes são dados. Caracteres de controle, `<`, `>` e crase são removidos dos nomes antes de entrar em texto. O prompt de sistema manda ignorar instruções nesses campos. A guarda de números descarta qualquer reescrita com valores inventados. As ações vêm só do handler, nunca do modelo.
- **Sem HTML**: o frontend renderiza texto puro e cards tipados.
- **Segredos**: a chave do provedor fica só no servidor. O token SmartThings nunca entra no snapshot nem no prompt. Os logs registram intenção, latência e tokens, nunca o conteúdo.
- **Comandos de dispositivo**: não são executados. A intenção `device_command` responde que comandos ainda não estão habilitados. A fase de escrita SmartThings exige confirmação explícita, validação de capability e estado, e testes com dispositivos reais. Ver seção 11.
- **429 e erros do provedor**: um 429, timeout ou queda do provedor gera resposta determinística, nunca logout. O limitador `ai-user` devolve 429 sem tocar na sessão, e o frontend mostra "Muitas perguntas em pouco tempo". A correção de sessão em 429 (`sessionError` em `useAuth`) estava em andamento em outra sessão e não foi alterada aqui.

## 9. Custos

- **Camada 1, sem tokens**: simulações, metas, insights do dashboard, recomendações, anomalias, previsão e o próprio chat quando `AI_ENABLED` está desligado.
- **Camada 2, modelo rápido**: narração de respostas e classificação de perguntas fora das regras (20 tokens de saída).
- **Camada 3, modelo de raciocínio**: só para comparação de imóveis, metas com restrições ou conversa com mais de 4 trocas.
- **Controles**: orçamento diário por usuário, teto global de 30 dias, semáforo de concorrência, timeout, uma retentativa com backoff só para 429/5xx, histórico limitado a 4 mensagens de 600 caracteres, fatos limitados a 6.000 caracteres, saída limitada por `AI_MAX_OUTPUT_TOKENS`.
- **Medição**: cada resposta traz tokens e custo estimado em `meta`. `ai_usage_metrics` guarda os mesmos números sem conteúdo, com TTL.

Não foram adicionados Redis, filas nem banco vetorial. O histórico da conversa fica no `sessionStorage` do navegador (últimas 30 mensagens), então o servidor não guarda conversas. Se a retenção de conversas no servidor for necessária no futuro, use uma coleção `ai_conversations` com TTL e exclusão pelo usuário.

## 10. Dados

| Coleção | Conteúdo | Índices |
|---|---|---|
| `ai_user_preferences` | Meta mensal, imóvel principal, aparelhos essenciais, insights proativos | `userId` único |
| `ai_recommendation_states` | Estado, data de aplicação, kWh esperado | `userId + recommendationId` único |
| `ai_usage_metrics` | Recurso, intenção, tokens, custo, latência, erro | TTL em `createdAt`; `userId + createdAt` |

Os índices são criados de forma idempotente na primeira operação. Nenhum dado existente é alterado. O ID de recomendação é determinístico (`reduce_usage:<applianceId>`), o que deduplica e impede que algo aplicado ou dispensado volte como novidade.

## 11. Testes e validação

### Automatizados

- `backend/tests/ai.test.cjs`: 24 testes. Simulação com valores conhecidos, limites, cenários de ciclo, potência medida, fuso e horário de verão, parsers pt-BR, casa sem aparelhos, perguntas sequenciais com pronome ("ele"), dois ar-condicionados (desambiguação e seleção pelo cômodo), meta com restrição do usuário e aparelhos essenciais, meta inalcançável, isolamento entre usuários, comparação de imóveis com tarifas distintas, medição parcial não tratada como total, previsão com backtest, anomalias (pico, falha, histórico curto), guarda de números, prompt injection no nome, falhas do provedor (429, timeout, queda), orçamento esgotado, comando de dispositivo recusado, análise de cômodo, API (validação, ownership, estados de recomendação, acesso admin).
- Suíte completa do backend: 82 testes, 78 passam, 0 falham. Os 4 ignorados dependem de um MongoDB local, que não existe neste ambiente.
- Frontend: `tsc` sem erros, ESLint sem erros nos arquivos novos e alterados, `vite build` ok, 37 testes existentes passam.

### Navegador (Chrome real, headless, Playwright)

Fixture isolada em memória, com usuário sintético e dados sintéticos. Fluxo executado em desktop (1440×900) e mobile (390×844):

1. Cadastro de usuário e dados sintéticos (sala, quarto, escritório, 4 aparelhos).
2. Seção "Análises do WattStatus AI" no dashboard.
3. Chat: "Qual aparelho mais gasta?", depois "E se eu usar ele duas horas a menos?", depois "Quanto economizaria em um ano?". Os valores foram conferidos à mão.
4. Simulador: abre pela resposta, o slider recalcula sem chamar o modelo, Escape fecha só o simulador.
5. "Ver Ar-condicionado na planta" abre o imóvel, seleciona o Quarto na maquete 3D e destaca o marcador.
6. "Analisar consumo deste ambiente" no painel do cômodo responde sobre o Quarto.
7. Meta com restrição ("não quero diminuir o computador") deixa o computador fora do plano.

Nenhum erro de console ou de página nos dois tamanhos.

### Não validado

- Chamada real a um provedor de IA. Não há chave disponível neste ambiente. O caminho foi testado com provedor falso, incluindo falhas.
- MongoDB real para `MongoAIStore`. Os índices e consultas seguem o padrão do `mongo-db.ts`, mas foram exercitados só com duplos em memória.
- Netlify Functions em produção.
- Dados SmartThings reais.

## 12. Pendências

| Item | Situação |
|---|---|
| Streaming de respostas | Não implementado. A resposta determinística chega em milissegundos e a narração é curta. |
| "Explicar este gráfico" e resumos em relatórios | Não implementado. O endpoint de chat já aceita a pergunta. Falta o botão nos gráficos. |
| Página de preferências e painel admin visual | Só a API existe (`/preferences`, `/admin/usage`). |
| Notificações proativas | Os insights são calculados sob demanda e sem tokens. Não há agendamento nem envio, e o consentimento ainda não é pedido. |
| SmartThings: consultas de estado e capabilities pela IA | Não implementado. A IA usa só leituras já coletadas e o vínculo do aparelho. |
| SmartThings: comandos de escrita | Bloqueados de propósito até haver confirmação explícita, validação de capability e estado, auditoria e teste físico. |
| Destaque de vários cômodos ao mesmo tempo ("três ambientes mais caros") | A resposta lista os três e abre o primeiro. A maquete hoje só tem seleção única. |
| Ajuste de clima e ocupação no acompanhamento | Não implementado. A comparação antes/depois declara essa limitação. |
| Avaliação de linguagem (LLM-as-judge) | Não implementado. Os testes determinísticos cobrem números e permissões. |
