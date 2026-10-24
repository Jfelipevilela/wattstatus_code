# WattStatus AI

Camada de inteligência energética do WattStatus. Este documento cobre a arquitetura, os cálculos, os contratos, a configuração, a segurança, os custos, os testes e o que ainda falta.

Versão atual: fase 2 (provedor pelo SDK oficial, guarda de narração ampliada, persistência validada em MongoDB, explicação de gráficos, preferências, administração, resumo nos relatórios e base de alertas).

## 1. Princípio central

O backend calcula todos os números. O modelo de linguagem, quando habilitado, só reescreve em linguagem natural uma resposta que já foi calculada. A reescrita passa por uma guarda (seção 8.1). Se a guarda encontrar qualquer número, unidade, aparelho, imóvel, período, afirmação causal, garantia ou origem de dado que não esteja nos fatos, a reescrita é descartada e o usuário recebe o texto determinístico.

Consequências:

- O assistente funciona sem nenhum provedor de IA configurado. Ele responde com o texto do motor.
- Simulador, insights, recomendações, metas, alertas, resumo de relatório e explicação de gráficos nunca dependem do modelo.
- As métricas e os cards são campos estruturados calculados pelo backend. O texto do modelo não consegue alterá-los.
- Toda métrica sai com a origem: `measured`, `measured_partial`, `estimated`, `projected`, `simulated` ou `unavailable`.

## 2. Base reutilizada do sistema

| Necessidade | O que já existia e foi reutilizado |
|---|---|
| Autenticação | `createAuthenticate` (JWT + sessão no MongoDB). Todas as rotas `/api/ai` passam por ele. |
| Estimativa mensal | `estimateMonthly` em `properties.service.ts`: mesma fórmula do frontend, tarifa por aparelho. |
| Série de 6 meses | Mesma regra do gráfico do dashboard: um aparelho conta a partir do mês em que foi criado. |
| Tarifa | `STATE_TARIFFS` e `tariffValue` do aparelho e do imóvel. |
| Imóveis, pavimentos, ambientes | `PropertyService` (com `ensureDefault` e checagem de dono). |
| Aparelhos | `ApplianceService.list`. |
| Medições | `getEnergyHistory` e `toEnergyIntervals`. |
| Rate limit | `consumeRateLimit` (janela fixa no MongoDB), também usado para os orçamentos de IA. |
| Maquete 3D | `FloorPlanViewer` e o estado `selectedRoomId`/`highlighted` de `PropertyDetail`. |
| Relatório PDF | `createReportPdf`, que ganhou uma seção opcional de resumo. |

## 3. Arquitetura

```
backend/src/modules/ai/
  ai.engine.ts        Motor determinístico: snapshot, rankings, cobertura, previsão,
                      comparação de períodos, anomalias, simulações, metas,
                      recomendações, acompanhamento, série e explicação de gráfico,
                      resumo de relatório, alertas.
  ai.orchestrator.ts  Intenção (regras pt-BR), entidades, contexto, montagem da
                      resposta, narração opcional, etapas de progresso, cancelamento.
  ai.guard.ts         Validação da reescrita do modelo contra os fatos.
  ai.provider.ts      SDK oficial @anthropic-ai/sdk, timeout, cancelamento,
                      uma retentativa com backoff, mapeamento de erros tipados.
  ai.prompts.ts       Prompts curtos (sistema, narração, classificação).
  ai.schemas.ts       Zod: requisições, preferências, configuração, ações, cards, resposta.
  ai.store.ts         MongoDB: preferências, estados de recomendação, conversas,
                      alertas, configuração de administração, métricas de uso.
  ai.routes.ts        Endpoints, limites, semáforo, streaming, administração.

src/components/wattai/
  WattAI.tsx          Provider global, botão flutuante, execução das ações.
  WattAIPanel.tsx     Chat (lazy): etapas, botão parar, histórico, sugestões por página.
  WattAICards.tsx     Métricas, cards (ranking, simulação, meta, previsão,
                      recomendações, anomalias, escolha, série, comparação) e ações.
  WattAISimulator.tsx Simulador com sliders (lazy).
  AIInsights.tsx      Seção "Análises do WattStatus AI" do dashboard.
src/pages/AIPreferences.tsx  /ia/preferencias
src/pages/AIAdmin.tsx        /ia/admin
src/lib/wattai.ts            Tipos, chamadas de API e leitor do streaming.
```

### Fluxo de uma pergunta

1. `POST /api/ai/chat/stream` (ou `/chat`) passa pela autenticação e pelo limitador `ai-user` (20 por minuto por usuário).
2. O orquestrador carrega imóveis, aparelhos e preferências do usuário autenticado. IDs de contexto que não pertencem a ele são descartados.
3. O motor monta o snapshot do mês no fuso do imóvel.
4. A intenção é classificada por regras. Perguntas fora do alcance dos dados (outros lugares, clima, anos futuros) caem em "não tenho informações suficientes". Só quando a intenção é desconhecida e o modelo está ligado, uma chamada curta escolhe uma intenção conhecida.
5. O handler calcula tudo e produz texto, métricas, cards, limitações, sugestões e ações.
6. Opcionalmente o modelo reescreve o texto, e a guarda valida a reescrita.
7. A resposta é validada por `responseSchema`. No streaming, o cliente recebe só eventos de etapa (`context`, `data`, `compute`, `narrate`) e depois um único evento `response`. Nenhum texto do modelo é enviado antes da validação.
8. Se a retenção estiver ligada, a troca é salva em `ai_conversations`.
9. Uma métrica de uso (recurso, intenção, tokens, custo estimado, latência, erro, violações da guarda, limite atingido) é gravada, sem conteúdo.

Consultas ao banco por mensagem: imóveis, aparelhos, preferências, ambientes do imóvel e histórico de medições. São 4 a 5 consultas, e o teste "queries per message stay bounded" garante o teto. A explicação de gráfico faz uma consulta a mais (histórico de 6 meses).

### Intenções

| Intenção | Equivale a |
|---|---|
| `property_summary` | resumo do imóvel ou do ambiente citado |
| `top_consumers` | maiores consumidores, por imóvel ou cômodo |
| `room_ranking` | comparação de ambientes |
| `appliance_detail` | detalhe e consumo de um aparelho |
| `compare_properties` | comparação de imóveis, cada um com a própria tarifa |
| `compare_periods` | comparação com o mês anterior por média diária |
| `coverage` | cobertura de medição |
| `forecast` | previsão do mês |
| `anomalies` | anomalias detectadas |
| `recommendations` | oportunidades de economia, inclusive por cômodo |
| `simulate_reduction` / `simulate_annual` | simulação de horas de uso |
| `simulate_replacement` | troca de equipamento |
| `budget` | plano para meta mensal |
| `explain_chart` | explicação do gráfico de 6 meses |
| `device_command` | recusa: comandos não estão habilitados |
| `unknown` | "Não tenho informações suficientes para responder isso com os seus dados" |

## 4. Cálculos

### Estimativa

`kWh = potência_W × horas_dia × min(dias_uso, dias_do_mês) / 1000`. Custo = kWh × tarifa do aparelho.

### Simulação de horas de uso

`economia_kWh_mês = (potência_W / 1000) × (horas_atuais − horas_propostas) × dias_uso`.

- As horas propostas ficam entre 0 e as horas cadastradas.
- Com 7 dias de leitura ou mais, a potência média medida substitui a nominal.
- Aparelho de ciclo (ar-condicionado, geladeira, freezer, aquecedor, bomba): o cenário central usa a potência cadastrada, a mesma base das demais estimativas do app. Um cenário conservador de 50% mostra que a economia real pode ser menor.
- Diária, mensal e anual (mensal × 12). Tarifa atual, sem projeção de bandeiras.

### Meta mensal

Algoritmo guloso sobre os aparelhos mais caros. Respeita, nesta ordem:

- aparelhos essenciais pelo nome (geladeira, freezer, bomba, roteador, alarme, câmera, equipamento médico);
- aparelhos marcados como essenciais nas preferências;
- aparelhos que o usuário protegeu na frase ("não quero diminuir o computador");
- o mínimo de horas por aparelho (preferência de conforto);
- o corte máximo por aparelho (preferência, de 10% a 50%, padrão 30%).

Se a meta não for alcançável, o motor diz isso.

### Previsão, comparação, anomalias

Sem mudança em relação à fase 1:

- **Previsão**: pelo ritmo dos últimos 7 dias, só em casa 100% medida, com faixa e backtest. Caso contrário, usa a estimativa do cadastro.
- **Comparação de períodos**: médias diárias medidas.
- **Anomalias**: mediana e MAD, aumento persistente, falha de leitura e leitura inconsistente.

### Explicação de gráfico

O cliente envia só o tipo do gráfico e os filtros (`kind`, `year`, `month`, `propertyId`). O backend recalcula a série de 6 meses com a mesma regra do dashboard e as medições do período, e gera fatos verificáveis:

- mudança da estimativa entre os dois últimos meses;
- maior mudança da série;
- comparação do medido, quando há dois meses medidos;
- aparelho de maior peso;
- anomalias.

O tipo de pergunta escolhe os fatos: "maior mudança", "período anterior", "algo incomum", "o que fazer". Uma pergunta "por que" recebe a limitação de que o gráfico mostra o que mudou, não a causa.

### Resumo do relatório

`buildReportSummary` traz o maior impacto, a comparação com o mês anterior (só com medições), a qualidade dos dados e até duas recomendações com economia simulada. Ele aparece na página de relatórios e no PDF. Sem o resumo, o PDF sai igual ao anterior.

### Alertas

`evaluateAlerts` gera candidatos determinísticos:

- meta de gasto ou de kWh com previsão acima de 90%;
- mês projetado 15% acima do anterior medido;
- aumento de 20% na média diária;
- aparelho sem leitura;
- anomalia persistente.

Cada alerta tem uma chave estável (ex.: `goal_risk:<imóvel>:<mês>`). O armazenamento recusa chave repetida e aplica um intervalo mínimo por tipo, diário ou semanal conforme a preferência.

## 5. Contrato de resposta

Validado por `responseSchema` (Zod) antes de sair.

```ts
interface WattAIResponse {
  message: string;               // texto puro, nunca HTML
  intent: string;
  context: { propertyId?; roomId?; applianceId?; lastIntent?; lastProposedHours?; lastReductionHours? };
  conversationId?: string | null;
  metrics: Array<{ label; value; unit: "kWh"|"R$"|"%"|"h"|"W"|"dias"; source; coverage? }>;
  cards: Array<ranking | simulation | budget | forecast | recommendations | anomalies | choices | trend | comparison>;
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

## 6. Endpoints

Todos ficam sob `/api/ai`, com a autenticação existente. Mutações exigem CSRF.

| Método e rota | Uso | Modelo |
|---|---|---|
| `GET /status` | IA generativa ligada, admin ou não, recursos experimentais | não |
| `POST /chat` | `{ message, context?, history?, conversationId?, chart? }` | opcional |
| `POST /chat/stream` | Igual, em Server-Sent Events: `stage`… e então `response` ou `error` | opcional |
| `GET /conversations`, `GET/DELETE /conversations/:id` | Histórico do próprio usuário | não |
| `POST /simulate` | Simulação de horas | nunca |
| `POST /budget` | Plano para meta, com as preferências | nunca |
| `GET /insights?propertyId=` | Insights, previsão, anomalias, recomendações com estado | nunca |
| `PATCH /recommendations/:id?propertyId=` | Estado da recomendação | nunca |
| `GET/PUT /preferences` | Preferências explícitas (seção 7.2) | nunca |
| `GET /alerts`, `POST /alerts/evaluate` | Alertas: só com consentimento e frequência definidos | nunca |
| `GET /report-summary?year=&month=&propertyId=` | Resumo do relatório | nunca |
| `DELETE /data` | Apaga preferências, estados, conversas, alertas e métricas do usuário | nunca |
| `GET /admin/usage?days=` | Métricas agregadas (somente `AI_ADMIN_EMAILS`) | nunca |
| `GET/PUT /admin/settings` | Configuração em tempo de execução (somente `AI_ADMIN_EMAILS`) | nunca |

## 7. Configuração

### 7.1 Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `AI_ENABLED` | `false` | `true` liga o modelo generativo. |
| `AI_PROVIDER` | `anthropic` | Único provedor implementado (SDK oficial `@anthropic-ai/sdk` 0.132.0). |
| `AI_API_KEY` | — | Chave do provedor. Só no servidor. Nunca no frontend nem no Git. |
| `AI_BASE_URL` | API pública | Só para proxies ou testes. |
| `AI_MODEL_FAST` | `claude-haiku-5-5` | Classificação e narração comum. |
| `AI_MODEL_REASONING` | `claude-sonnet-5-5` | Comparação de imóveis, metas com restrições, conversa longa. |
| `AI_MAX_OUTPUT_TOKENS` | `500` | Teto de saída por chamada. |
| `AI_REQUEST_TIMEOUT_MS` | `12000` | Timeout por chamada. |
| `AI_MAX_TOOL_CALLS` | `2` | Chamadas ao modelo por pergunta. |
| `AI_DAILY_USER_BUDGET` | `60` | Chamadas ao modelo por usuário por dia (teto). |
| `AI_MONTHLY_GLOBAL_BUDGET` | `20000` | Chamadas ao modelo em 30 dias (teto). |
| `AI_MAX_CONCURRENT_REQUESTS` | `4` | Chamadas simultâneas por instância. |
| `AI_PRICE_INPUT_PER_MTOK` / `AI_PRICE_OUTPUT_PER_MTOK` | `0.1` / `0.5` | USD por milhão de tokens (preço de tabela do Claude Haiku 5.5), só para o custo estimado. |
| `AI_USAGE_RETENTION_DAYS` | `90` | TTL das métricas de uso. |
| `AI_ADMIN_EMAILS` | — | E-mails com acesso à administração. |

Detalhes do provedor:

- Os modelos padrão vêm da lista atual do provedor e só os três modelos permitidos aparecem na administração. Confirme na sua conta que eles estão disponíveis antes de ligar.
- As chamadas usam `output_config.effort: "low"`, não enviam `temperature`, têm o `maxRetries` do SDK desligado (a retentativa é controlada pelo módulo) e tratam `stop_reason: "refusal"` e `max_tokens` como falha de narração.

Para ligar em homologação, defina `AI_ENABLED=true` e `AI_API_KEY` nas variáveis de ambiente do site no Netlify.

### 7.2 Preferências do usuário (`/ia/preferencias`)

Meta mensal de gasto e de kWh, imóvel principal da IA, aparelhos essenciais, mínimo de horas por aparelho, corte máximo por aparelho, observações de conforto (não interpretadas pela IA), categorias de recomendação, consentimento para insights proativos, frequência e categorias de alertas, retenção de conversas (não guardar, 7, 30 ou 90 dias) e exclusão de todos os dados da IA.

Só o que o usuário salva nesta página vira preferência. O schema é estrito: campos desconhecidos são recusados, e nada do que o modelo deduz é salvo. Um teste confirma que uma frase como "o computador é essencial" no chat não altera as preferências.

### 7.3 Administração (`/ia/admin`)

- **Métricas** (só agregados, nunca conversas): solicitações, chamadas ao modelo, usuários ativos, tokens de entrada e saída, custo estimado, latência média e p95, taxa de erro, limites atingidos, reescritas recusadas pela guarda, funcionalidades mais usadas, modelos usados e recomendações marcadas como aplicadas.
- **Controles**:
  - ligar ou desligar o modelo generativo;
  - escolher os modelos rápido e de raciocínio entre os permitidos;
  - reduzir o limite diário e o teto global (nunca acima do ambiente);
  - recursos experimentais: explicar gráficos, alertas, progresso em tempo real.

Comandos SmartThings aparecem bloqueados. A chave e os tetos continuam só nas variáveis de ambiente.

## 8. Segurança

### 8.1 Guarda de narração (`ai.guard.ts`)

A reescrita do modelo é recusada quando:

| Regra | Exemplo recusado |
|---|---|
| Número fora dos fatos (algarismos ou por extenso, inclusive "duzentos e cinquenta") | "R$ 300,00", "trezentos reais" |
| Valor conhecido com outra unidade | "268,80 kWh" quando o fato é R$ 268,80 |
| Percentual ou tarifa diferente | "80% da conta", "R$ 0,95/kWh" |
| Aparelho, ambiente ou imóvel que não está nos fatos | "a Geladeira custa…", "na Praia…" |
| "Medido" quando os dados são estimados | "o consumo medido do ar…" |
| Afirmação causal nova | "porque…", "causado por…" |
| Promessa de economia | "com certeza", "garantida", "vai economizar" |
| Período novo | "em setembro", "ano passado" |
| Corte em aparelho essencial | "desligue a geladeira" |
| Rascunho diz que faltam dados e a reescrita não diz | — |
| Resposta truncada, recusada ou vazia | — |

Arredondamentos honestos de um valor calculado (R$ 68,88 → R$ 69) passam.

### 8.2 Demais controles

- **Isolamento**: todas as leituras são por `userId` da sessão. Testes cobrem contexto alheio, imóvel e aparelho alheios, conversa alheia (ler, excluir, anexar), gráfico com imóvel alheio, preferências com aparelho alheio e recomendação inexistente.
- **Prompt injection**: nomes são dados, os caracteres de controle e `<>` são removidos, o prompt de sistema manda ignorar instruções nos nomes, e a guarda e as ações vêm só do handler.
- **Streaming**: o cliente nunca recebe texto do modelo antes da validação.
- **Cancelamento**: se o cliente fecha a conexão ou aperta "parar", a chamada ao modelo é abortada.
- **Segredos**: a chave fica só no servidor. A tela de administração mostra apenas se ela está configurada.
- **Comandos de dispositivo**: recusados. Escrita SmartThings continua bloqueada.
- **429 e erros do provedor**: a resposta sai do motor, com a limitação "IA generativa indisponível agora". Nunca há logout.

## 9. Custos

Medição na suíte de qualidade, com o tamanho real dos prompts (estimativa de 4 caracteres por token e 80 tokens de saída):

| Medida | Valor |
|---|---|
| Entrada média por resposta narrada | 366 tokens |
| Custo médio por resposta (Claude Haiku 5.5) | US$ 0,000077 |
| Custo por 1.000 respostas narradas | US$ 0,077 |
| Respostas sem modelo (simulador, insights, alertas, relatórios, gráficos sem narração) | US$ 0 |

São estimativas a partir do preço de tabela. Não houve chamada real ao provedor (seção 11.3). O custo real aparece em `meta.estimatedCostUsd` e na administração assim que a chave for configurada.

Controles de custo: orçamento diário por usuário e teto global (contados no MongoDB, testado), semáforo de concorrência, timeout, uma retentativa só para 429, 5xx ou conexão, histórico limitado a 4 mensagens, fatos limitados a 6.000 caracteres e `max_tokens` limitado.

## 10. Dados

| Coleção | Conteúdo | Índices e retenção |
|---|---|---|
| `ai_user_preferences` | Preferências explícitas | `userId` único |
| `ai_recommendation_states` | Estado, data de aplicação, kWh esperado | `userId + recommendationId` único |
| `ai_conversations` | Até 40 mensagens por conversa, até 30 conversas por usuário | `id` único; `userId + updatedAt`; TTL em `expiresAt` conforme a retenção escolhida |
| `ai_alerts` | Alertas gerados | `userId + key` único; `userId + kind + createdAt`; TTL de 90 dias |
| `ai_settings` | Configuração de administração (um documento) | `key` único |
| `ai_usage_metrics` | Métricas sem conteúdo | TTL `AI_USAGE_RETENTION_DAYS`; `userId + createdAt` |

Os índices são criados de forma idempotente. Nenhum dado existente é alterado.

## 11. Testes e validação

### 11.1 Automatizados

| Arquivo | Cobertura | Resultado |
|---|---|---|
| `backend/tests/ai.test.cjs` | Motor, orquestrador e API da fase 1 | 24 de 24 |
| `backend/tests/ai-guard.test.cjs` | Guarda: números por extenso, percentuais, arredondamento, unidade, tarifa, troca de aparelho e de imóvel, medido × estimado, causalidade, garantia, período, essencial, falta de dados | 11 de 11 |
| `backend/tests/ai-phase2.test.cjs` | SDK (formato da requisição, erros tipados, recusa, truncamento), retentativa, cancelamento, timeout, preferências no plano, categorias, série do gráfico, alertas, resumo, gráfico com imóvel alheio, perguntas fora dos dados, etapas, teto de consultas, streaming, conversas, preferências estritas, consentimento e deduplicação de alertas, administração, resumo de mês passado | 21 de 21 |
| `backend/tests/ai-eval.test.cjs` | Suíte de qualidade (seção 11.2) | 3 de 3 |
| `backend/tests/ai-mongo.test.cjs` | MongoDB real (seção 11.4) | 2 de 2 com `TEST_MONGO_URL` |
| Suíte backend completa | `npm test` | 113 passam, 0 falham, 6 pulados sem `TEST_MONGO_URL` |
| Frontend | `tsc`, ESLint nos arquivos novos e alterados (0 erros), `vite build`, `npm test` | 40 de 40 |

### 11.2 Suíte de qualidade

17 cenários realistas no orquestrador real:

- perguntas sequenciais com pronome;
- dois ar-condicionados;
- cômodos;
- previsão sem medição completa;
- comparação sem dados;
- dois imóveis com tarifas diferentes;
- meta com restrição;
- comando físico;
- pergunta fora dos dados;
- aparelho de outro usuário;
- injection no nome;
- contexto com imóvel alheio.

| Métrica | Resultado |
|---|---|
| Precisão factual | 100% |
| Seleção de ferramenta (intenção) | 100% |
| Contexto de conversa | 100% |
| Isolamento | 100% |
| Admitir falta de dados | 100% |
| Guarda contra modelo adversarial (11 ataques) | 11 de 11 bloqueados, reescrita fiel aceita |
| Latência do motor | p50 0,9 ms, máx. 30 ms |

### 11.3 Provedor generativo

- **Não validado com chamada real.** Não havia chave disponível neste ambiente (`ANTHROPIC_API_KEY` e `AI_API_KEY` ausentes). Nenhum modelo real foi chamado.
- **Validado**:
  - SDK oficial com cliente simulado: formato da requisição, uso, recusa, truncamento e erros tipados;
  - SDK real contra um endpoint inacessível, no navegador: a resposta cai para o motor em cerca de 2,4 s, com a limitação exibida, e o botão parar interrompe a espera.
- **Próximo passo**: com uma chave de homologação e um orçamento pequeno (ex.: `AI_DAILY_USER_BUDGET=20`), rodar a suíte de qualidade com provedor real e comparar `guardRejected` e custo na administração.

### 11.4 MongoDB real e isolado

MongoDB 7.0.14 descartável (mongodb-memory-server), banco com nome aleatório e removido ao final. Validado:

- preferências (merge e remoção com `null`);
- estados de recomendação únicos;
- conversas: anexar, limite de 40 mensagens, TTL de retenção, isolamento ao ler, anexar e excluir;
- alertas: chave única sob 5 gravações concorrentes e intervalo por tipo;
- métricas agregadas (p95, por modelo, recusas da guarda);
- configuração de administração;
- índices TTL e únicos presentes;
- leitura após reinicialização com novo cliente;
- exclusão de dados de um usuário sem afetar outro;
- orçamento diário contado no MongoDB pela API (2 chamadas ao modelo e depois resposta do motor);
- isolamento pela API.

Os testes Mongo já existentes no repositório também passaram nessa instância (3 de 3).

### 11.5 Navegador (Chrome real, Playwright)

App completo sobre o MongoDB descartável, com usuário e dados sintéticos, em desktop (1440×900) e mobile (390×844), em dois modos:

- **IA desligada**: todas as etapas passaram. Latência de ponta a ponta: chat ~48 ms, explicação de gráfico ~100 ms.
- **Provedor inacessível** (`AI_ENABLED=true` e endpoint morto): todas as etapas passaram, com fallback em ~2,4 s e o botão parar funcionando.

Etapas: explicar gráfico, chat com etapas, parar resposta, histórico de conversas, preferências (meta, essencial, consentimento, frequência), verificação de alertas, meta respeitando o aparelho essencial, administração, resumo do relatório com exportação do PDF, abertura do aparelho na maquete 3D e análise do cômodo. Nenhum erro de console.

## 12. Performance

| Medida | Antes (e0dc816) | Agora |
|---|---|---|
| Bundle principal (`index`) | 172,11 kB | 172,87 kB (+0,76 kB) |
| Chat (lazy) | 6,77 kB | 10,17 kB |
| Cards (lazy) | 8,87 kB | 10,93 kB |
| Preferências / Admin (lazy, por rota) | — | 11,95 kB / 8,99 kB |
| Consultas ao banco por mensagem | 4 | 4 (5 com gráfico) |

- O SDK do provedor fica só no backend.
- O gráfico do dashboard não é recriado: o botão fica no cabeçalho do card.
- A maquete continua usando o estado existente e não é reconstruída.

## 13. Pendências e riscos

| Item | Situação |
|---|---|
| Chamada real ao provedor | Pendente de chave de homologação e autorização de orçamento. |
| Streaming no Netlify Functions | `serverless-http` pode entregar o SSE de uma vez. O cliente funciona igual, mas sem etapas progressivas. Validar no deploy de homologação. |
| Envio de alertas | Só a base existe: avaliação, deduplicação, frequência e consentimento. Não há canal de envio nem agendamento. Recomendação: chamar a avaliação na rotina de coleta já existente. |
| Explicação de outros gráficos | Só o gráfico de 6 meses do dashboard. Os gráficos de imóvel e de relatório ainda não têm o botão. |
| SmartThings: consultas e comandos | Inalterado: sem comandos, sem consulta de capabilities pela IA. |
| Destaque de vários cômodos na maquete | Inalterado: seleção única. |
| Rótulo "Taxa de erro" | Inclui recusas da guarda e falhas do provedor; não separa as duas. |
| Concorrência entre agentes no repositório | Outra sessão editou `ai.engine.ts` (cache de formatadores) entre as fases. As mudanças foram preservadas. |
