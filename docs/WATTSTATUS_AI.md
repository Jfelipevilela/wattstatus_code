# WattStatus AI

Camada de inteligência energética do WattStatus. Este documento cobre a arquitetura, os cálculos, os contratos, a configuração, a segurança, os custos, os testes e o que ainda falta.

Versão atual: fase 3 (investigação multietapas com ferramentas controladas, planos de economia salvos e acompanhados, guarda com fatos estruturados, alertas com prioridade, estado e varredura para agendador, teto de gasto em USD e suíte de homologação real). A fase 3 está na seção 14; as seções 1 a 13 continuam valendo.

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
| `GET /admin/usage?days=` | Métricas agregadas (somente administradores com concessão no servidor) | nunca |
| `GET/PUT /admin/settings` | Configuração em tempo de execução (somente administradores com concessão no servidor) | nunca |

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
| `AI_ADMIN_EMAILS` | — | Descontinuada e ignorada. O acesso administrativo vem de `admin_grants`, provisionado por `backend/scripts/admin-grant.cjs`. |

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

## 14. Fase 3: investigação, planos, guarda estruturada e alertas

Branch `feature/watt-ai-hardening`, em worktree próprio, a partir de `c7bc152`. Arquivos alterados: só `backend/src/modules/ai/**`, componentes e páginas da IA, testes de IA e este documento. Nenhum arquivo compartilhado (`App.tsx`, `Dashboard.tsx`, `app.ts`, `mongo-db.ts`, `api.ts`) foi alterado.

### 14.1 Investigação com ferramentas controladas (`ai.tools.ts`)

Pergunta típica: "Minha conta aumentou muito. Descubra o motivo e me ajude a economizar R$ 80." A intenção `investigate` responde por "descubra", "investigue", "motivo", "por que a conta aumentou", "aumentou muito", "disparou" e "está alta".

| Ferramenta | O que faz | Evidência |
|---|---|---|
| `measurement_coverage` | Quantos aparelhos têm leitura e a cobertura do consumo. Sempre roda. | medido ou sem dados |
| `period_comparison` | Média diária medida deste mês contra o anterior | medido |
| `appliance_changes` | Por aparelho medido: kWh/dia agora contra o mês anterior, com variação mínima de 20% e 0,3 kWh/dia | medido |
| `registration_changes` | Aparelhos cadastrados desde o início do mês anterior | estimado |
| `top_consumers` | Três maiores custos estimados | estimado |
| `room_breakdown` | Ambientes dos aparelhos envolvidos (profundidade 2) | estimado |
| `anomalies` | Anomalias do motor | medido ou sem dados |
| `savings_plan` | Plano para a meta, quando há valor em reais | simulado |

Regras:

- As ferramentas são funções puras sobre o snapshot do usuário, já carregado. Não fazem consultas ao banco e não recebem IDs vindos do modelo.
- Cada ferramenta roda no máximo uma vez. Ferramentas rasas rodam antes das profundas.
- Orçamento: 8 chamadas, 1.500 ms e profundidade 2 (`DEFAULT_BUDGET`). O que passa do orçamento fica marcado como "não executada".
- Planejamento: o plano padrão é determinístico. Com o modelo ligado, uma chamada curta propõe a lista de ferramentas em JSON; `sanitizePlan` mantém só as da lista permitida, remove repetidas, respeita a profundidade e o orçamento e sempre inclui a cobertura. JSON inválido usa o plano padrão.
- Conclusão determinística:
  - com medição e mudança por aparelho: "as leituras mostram onde a mudança se concentra… os dados não provam a causa";
  - só com mudança no cadastro: "não há medições para confirmar um aumento real; no cadastro, a estimativa subiu com X";
  - sem nada: "Não tenho informações suficientes para determinar o motivo".
- O card "Evidências encontradas" mostra até 4 achados com origem e confiança. Os demais ficam recolhidos em "Mais evidências", e "Como investiguei" lista as consultas feitas.

### 14.2 Planos de economia (`ai.plans.ts`)

`buildSavingsPlan(snapshot, meta, opções)`:

- **Referência**: o custo estimado do cadastro. Se o usuário informa outro valor ("de R$ 350 para R$ 250"), a diferença aparece como incerteza e o cálculo usa o cadastro.
- **Candidatos**: aparelhos não essenciais, não protegidos e acima do mínimo de conforto. O corte é de até `maxReductionPercent` das horas (mínimo de 1 h), e cada valor vem de `simulateForAppliance`.
- **Ordenação**: economia por hora cortada, ou seja, mais impacto com menos esforço.
- **Sem dupla contagem**: cada aparelho entra uma vez, e a soma nunca passa da referência.
- **Esforço por ação**: baixo, médio ou alto, conforme as horas e a parte do uso cortadas.
- **Faixa**: aparelhos de ciclo têm cenário conservador; a soma aparece como "R$ X a R$ Y".
- **Meta inalcançável**: o plano diz quanto falta. Trocas de equipamento aparecem como ideias, fora da soma.
- **Salvar**: a ação `save_plan` envia só o imóvel e a meta. O servidor recalcula o plano e salva em `ai_savings_plans` (até 20 por usuário).
- **Acompanhamento**: cada ação fica pendente, aplicada ou ignorada. O progresso também mostra se o cadastro já está no número de horas planejado. "Aplicada" é o que o usuário declarou, não economia observada.

### 14.3 Guarda com fatos estruturados

Além das regras da seção 8.1, o orquestrador passa `claims` para a guarda:

| Regra | Fato estruturado | Exemplo recusado |
|---|---|---|
| Percentual inconsistente | Só percentuais de `share`, `coverage`, `change` ou do rascunho | "representa 70% do imóvel" |
| Direção da tendência | `trend` (up/down/flat/null), calculada pela comparação medida | "o consumo aumentou" sem tendência medida |
| Superlativo | `topName` | "a TV é o maior consumidor" |
| Medido × estimado por aparelho | `measuredNames` | "o Ar condicionado medido…" quando só a TV tem leitura |
| Restrição do usuário | `protectedNames` (essenciais, preferências, "não quero") | "reduza o Computador" |
| Recomendação fora dos dados | `actionableNames` | "troque a TV" quando o plano não inclui a TV |

O sujeito de cada afirmação é o nome mais próximo, na mesma oração, no lado esperado: antes para "é medido" e "é o maior", depois para "reduza" e "troque". Quando uma afirmação qualitativa aparece e não pode ser verificada, a reescrita é recusada e vale o texto do motor.

### 14.4 Alertas (`ai.alerts.ts`, `ai.scheduler.ts`)

| Tipo | Prioridade | Regra |
|---|---|---|
| `goal_risk` | alta | Previsão ≥ 90% da meta de R$ ou kWh |
| `consumption_increase` | alta | Média diária medida 20% acima do mês anterior |
| `appliance_anomaly` | alta | Leitura incompatível com a potência cadastrada |
| `forecast` | média | Projeção 15% acima do mês anterior medido |
| `persistent_anomaly` | média | Mediana de 7 dias 25% acima das 3 semanas anteriores |
| `missing_reading` | média | Aparelho conectado sem leitura há 48 h |
| `savings_opportunity` | baixa | Melhor redução de uso ≥ R$ 10/mês. Ignora recomendações dispensadas ou aplicadas e respeita essenciais e mínimos. |

- **Estado**: novo, lido ou dispensado (cancelado), via `PATCH /alerts/:key`. O histórico fica na aba Alertas.
- **Deduplicação**: chave única por usuário e intervalo mínimo por tipo, diário ou semanal.
- **Consentimento**: `proactiveInsights` e uma frequência diferente de "off". Categorias filtram os tipos.
- **Varredura para agendador**: `sweepAlerts({ store, data, delivery })` percorre usuários com consentimento em páginas ordenadas por `userId`, grava os alertas novos e só envia por um canal `AlertDelivery` com `ready: true` e `AI_ALERTS_DELIVERY=on`. Alertas de prioridade baixa nunca são enviados, só aparecem no app. Sem canal, nada sai do servidor.
- **Integração pendente** (arquivo compartilhado, não alterado): criar uma função agendada no Netlify, ao lado do coletor de energia, que monte `MongoAIStore(db)` e o `data` como em `app.ts` e chame `sweepAlerts`. Nenhum canal de envio foi validado.

### 14.5 Provedor: homologação

| Item | Situação |
|---|---|
| Modelos | `claude-haiku-5-5` e `claude-sonnet-5-5`, tirados da lista atual de modelos do provedor. A suíte real confere cada ID com `models.retrieve`. |
| Timeout, cancelamento | Testados com cliente simulado e com o SDK real contra endpoint inacessível |
| Retentativa | Uma, para 429, 5xx e falha de conexão. **Corrigido na fase 3**: `APIConnectionError` do SDK herda de `APIError` sem status e era tratado como não retentável. |
| Truncamento, recusa | Tratados como falha de narração; vale o texto do motor |
| Tokens e custo | `meta.inputTokens`, `meta.outputTokens` e `estimatedCostUsd` testados |
| Teto em USD | Novo `AI_MONTHLY_COST_LIMIT_USD`, que soma `estimatedCostUsd` do mês (cache de 60 s). Ao atingir o teto, a resposta sai do motor. Testado. |
| Chamada real | **Não executada**: não há chave neste ambiente. |

Suíte real pronta: `backend/tests/homolog/ai-live.homolog.cjs`. Ela não faz parte do `npm test` e só roda com `AI_LIVE_API_KEY`, `AI_LIVE_CONFIRM=consumir-creditos`, `AI_LIVE_MAX_CALLS` (padrão 12) e `AI_LIVE_MAX_USD` (padrão 0,05). Ela verifica:

- os IDs de modelo;
- uma chamada básica;
- truncamento;
- timeout;
- cancelamento;
- 4 conversas pela guarda (maiores consumidores, simulação, investigação, plano).

O relatório traz só valores de respostas reais.

### 14.6 Novos endpoints

| Rota | Uso |
|---|---|
| `POST /plans` | `{ propertyId, target, statedCurrent?, protectedApplianceIds? }`: o servidor calcula e salva |
| `GET /plans`, `GET /plans/:id` | Lista; detalhe com progresso |
| `PATCH /plans/:id/actions/:applianceId` | `{ status: pending \| applied \| skipped }` |
| `DELETE /plans/:id` | Exclui |
| `PATCH /alerts/:key` | `{ state: new \| read \| dismissed }` |
| `PATCH /recommendations/:id` | Aceita `feedback: useful \| not_useful`, com ou sem `state` |

Todas as rotas verificam o dono. Os testes cobrem plano, ação, exclusão e alerta de outro usuário (404).

### 14.7 Experiência

- Card de investigação com evidências, origem e confiança, mais "Como investiguei".
- Card de plano com esforço por ação, faixa conservadora, quanto falta e ideias fora da soma.
- Botão "Salvar este plano".
- Comparação de aparelhos ("Compare a TV e o computador").
- Retorno "Útil? Sim/Não" nas recomendações do dashboard.
- Abas Preferências, Planos e Alertas em `/ia/preferencias`, sem nova rota.

### 14.8 Validação da fase 3

| Verificação | Resultado |
|---|---|
| Testes de IA | `ai.test` 24, `ai-guard` 11, `ai-phase2` 21, `ai-phase3` 16, `ai-eval` 5: todos passam |
| Backend completo | 131 passam, 0 falham, 7 pulados sem MongoDB |
| MongoDB 7.0.14 isolado | 6 de 6 (3 de IA, incluindo planos, estados, destinatários, retorno e gasto; 3 já existentes) |
| Frontend | `tsc` e ESLint sem erros, build, 40 testes |
| Avaliação | 17 cenários com 100% em todas as métricas; investigação e planos 5 de 5; guarda v1 11 de 11; guarda v2 7 de 7, com reescrita fiel aceita |
| Ferramentas e consultas | 15 chamadas de ferramenta em 5 casos; 4 consultas ao banco por mensagem (a investigação não acrescenta nenhuma) |
| Custo estimado | 384 tokens de entrada por resposta narrada, US$ 0,000078 por resposta (Haiku 5.5, preço de tabela) |
| Navegador, IA desligada | Desktop e mobile: investigação ~0,9 s na primeira (compilação) e ~0,14 s depois; plano ~0,1 s; salvar plano, aba Planos, marcar aplicada, alertas (ler, dispensar), retorno |
| Navegador, provedor inacessível | Mesmo fluxo: investigação ~2,9 s e plano ~5 s (com a retentativa de conexão); fallback correto, sem erros de console |

Tamanho do bundle principal: 172,87 kB (base `c7bc152`, mesmo ambiente) → 173,49 kB. A ação de salvar plano carrega o cliente da IA sob demanda.

### 14.9 Pendências

- Chamada real ao provedor: rodar `ai-live.homolog.cjs` com chave de homologação e orçamento autorizado.
- Agendamento dos alertas e canal de envio (seção 14.4).
- Mesmo nome de aparelho em dois imóveis: a guarda não distingue. O snapshot é sempre de um imóvel só.
- A guarda qualitativa é heurística por proximidade na oração. Frases muito longas ou indiretas podem ser recusadas por precaução, e nesse caso vale o texto do motor.
- Histórico de investigações: as investigações ficam no histórico de conversas comum, sem filtro próprio.

## 15. Confiabilidade das medições (atualização da coleta)

Branch `feature/watt-ai-measurement-quality`, a partir de `0ade3d3` (`fix/energy-collection-fairness`, que contém a IA da fase 3 e o contrato da coleta). Nenhum arquivo do coletor foi alterado.

### 15.1 Fonte e contrato

A IA usa `MongoDatabase.energyCollectionStatus(userId, agora, intervalo)`, descrito em `docs/COLETA_ENERGIA.md`, seção 7. São dados já gravados pelo coletor; não há chamada à SmartThings durante a pergunta.

| Estado | Regra do contrato | Indicador na IA |
|---|---|---|
| `recent` | Última leitura com até 2 intervalos | Atualizado |
| `delayed` | Leitura mais antiga que 2 intervalos | Leitura atrasada |
| `missing` | Coleta habilitada e dispositivo nunca lido | Sem medição |
| `disabled` | Coleta desativada pelo usuário | Coleta desativada |
| `error` | Token inválido, dispositivo removido ou 3 falhas seguidas | Erro de coleta |

Ligação com o restante do app:

- `AIDataSource.getCollectionStatus` é opcional.
- `createAIRouter` usa `deps.limits.energyCollectionStatus` quando o data source não fornece o status. O `app.ts` já passa o `MongoDatabase` em `limits`, então **nenhum arquivo compartilhado foi alterado**.
- O intervalo vem de `ENERGY_COLLECTION_INTERVAL_MINUTES` (padrão de 30).
- **Custo**: o status só é lido quando o usuário tem algum aparelho conectado. A leitura roda em paralelo às consultas que já existiam e acrescenta 3 consultas MongoDB. Usuários só com estimativas não pagam nada a mais.

### 15.2 Uso nas respostas (`ai.freshness.ts`, `applyFreshness`)

Para o aparelho em foco (detalhe, maiores consumidores, simulação, comparação), a resposta ganha uma frase conforme o estado:

| Estado | Frase |
|---|---|
| `delayed` | "A última medição de X ocorreu há N h. Posso analisar o histórico disponível, mas não confirmar o consumo atual." |
| `disabled` | "X não está sendo monitorado automaticamente. Posso usar os dados estimados cadastrados para fazer uma simulação." |
| `error` | "Há um problema na atualização das medições de X. Os valores recentes podem estar incompletos." |
| `missing` | "X ainda não tem nenhuma medição automática; uso os dados cadastrados." |
| `recent`, pergunta sobre o consumo atual ("agora", "atual") | "Última medição de X: há N min." |
| Aparelho sem medição automática, pergunta sobre o consumo atual | Frase e limitação dizendo que não há como confirmar o consumo atual |

A idade (`há N min`, `há N h`, `há N dias`) vem do `ageMs` gravado pelo coletor.

- **Visões gerais** (cobertura, investigação, previsão, comparação, anomalias, resumo, ambientes, gráfico): os medidores atrasados ou com erro aparecem nas limitações, com a idade de cada um. A cobertura mostra a contagem por estado.
- **Distinção estimado × medido × medição parcial**: preservada. A atualização é um eixo separado: um medidor `delayed` continua contando como medido para o histórico, mas nunca como atual.
- **Indicadores na interface**: `dataQuality` vem na resposta, até 6 aparelhos, com nome, estado, rótulo, idade e data da leitura. O chat mostra cada um como um ponto colorido com o rótulo, por exemplo "TV: Leitura atrasada (há 3 h)".

### 15.3 Previsões, anomalias, alertas e investigações

- **Previsão**: se algum aparelho medido estiver `delayed`, `error` ou `missing`, o ritmo medido não é usado; a previsão vem do cadastro, com o motivo explícito. O campo novo `confidence` vale:
  - `alta`: ritmo medido, todos os medidores atualizados e backtest com WAPE até 20%;
  - `media`: ritmo medido nos demais casos;
  - `baixa`: estimativa.

  A confiança aparece nas limitações.
- **Anomalias**:
  - com medidor atrasado ou com erro, ou com leitura de retomada (um intervalo de mais de 24 h, que concentra dias de consumo num dia só), não se infere pico nem aumento persistente; aparece `measurement_quality`;
  - `measurement_gap` usa o estado do coletor quando ele existe, e as 48 h de silêncio só quando não existe.
- **Alertas**: `consumption_increase` não é emitido quando há problema de coleta. Isso evita alertas falsos.
- **Investigação**:
  - a ferramenta de cobertura lista os medidores com problema e a idade de cada um;
  - mudanças por aparelho ignoram medidores que não estão `recent`, porque não servem de evidência;
  - a conclusão avisa que uma alta ou queda recente pode ser efeito da coleta.
- **Comparação de períodos**: com leituras atrasadas ou de retomada, a resposta avisa que a diferença pode vir da coleta, não do consumo.
- **Guarda**: regra nova `currentness`. "Consumo atual", "neste momento" ou "agora consome" perto de um aparelho que não está em `recentNames` faz a reescrita ser recusada.

### 15.4 Correções feitas no caminho

- **Detecção de picos**: com histórico perfeitamente estável, o MAD é 0 e nenhum pico era detectado (z ficava em 0). Agora há uma dispersão mínima de 10% da mediana.
- **Intenção**: "Quanto a TV gasta?" não era reconhecida (a regra exigia "quanto gasta" junto). A regra agora aceita palavras entre os dois.
- **Contradição**: com o aparelho conectado e lido, mas sem consumo medido no mês, a resposta dizia "não tem medição real" e logo depois "a última medição ocorreu há 3 h". Agora diz "ainda não há consumo medido neste mês; o valor é estimado".

### 15.5 Testes

| Arquivo | O que cobre |
|---|---|
| `tests/ai-freshness.test.cjs` (13 testes) | Os 5 estados e as frases; transições recente → atrasada → erro → recente; falha temporária (1 falha) sem virar erro; aparelho sem medição e pergunta sobre o consumo atual; medição parcial preservada e cobertura por estado; previsão com medidor atrasado (estimativa, confiança baixa) contra medidores atualizados (projeção); falha de coleta não vira pico, aumento ou alerta, e leitura de retomada também não, enquanto um pico real continua detectado; investigação; guarda `currentness`; isolamento (status só do usuário, dispositivo de outro usuário ignorado, nenhuma leitura sem aparelho conectado); rota usando o `energyCollectionStatus` do banco |
| `tests/ai-freshness-mongo.test.cjs` | MongoDB real com o `energyCollectionStatus` verdadeiro: atrasada com idade de 5 h e sem contradição, erro, desativada e isolamento entre dois usuários |

Resultados:

| Verificação | Resultado |
|---|---|
| Testes de IA | 90 de 90 |
| Testes MongoDB | 43 de 43 |
| Backend completo | 149 passam, 0 falham, 43 pulados sem MongoDB |
| Frontend | `tsc` e ESLint sem erros, build, 45 de 45 |
| Bundle principal | 173,65 kB (sem mudança) |
| Navegador (desktop e mobile) | Pergunta sobre o consumo atual com leitura atrasada de 3 h mostra a frase e o indicador; cobertura com estados; as suítes de navegador anteriores (fase 2 e fase 3) passam |

### 15.6 Limitações

- O status depende do que o coletor gravou: `lastSuccessAt` só existe depois da primeira leitura feita com a fila nova. Dispositivos antigos aparecem como `missing` até a próxima coleta.
- `recent` vale até 2 intervalos, conforme o contrato: uma leitura de 50 minutos ainda conta como atualizada com intervalo de 30 minutos.
- O estado é por dispositivo e por usuário. Aparelhos sem integração não têm estado: são estimativas, sem indicador.
- `createAIRouter` espalha (`...`) o data source recebido, então ele precisa ser um objeto simples, como em `app.ts`. Uma instância de classe perderia os métodos do protótipo.

### 15.7 Refinamentos da integração final

Branch `feature/wattstatus-integration-final`. Cada problema foi reproduzido antes da correção em `tests/ai-freshness-refinements.test.cjs`.

| Problema | Antes | Correção |
|---|---|---|
| Leitura de até 2 intervalos tratada como tempo real | "Última medição: há 50 min." sem ressalva. A guarda aceitava "está consumindo agora" para aparelhos `recent` | A frase passa a ser "…há 50 min; isso não é uma medição em tempo real.". A guarda recusa "agora" e "consumo atual" para qualquer aparelho, salvo se o texto calculado disser isso. A leitura é um contador periódico, nunca potência instantânea. |
| Um medidor atrasado descartava o ritmo medido do imóvel inteiro | A previsão virava estimativa do cadastro | Se os medidores atrasados respondem por até 20% do consumo estimado, a previsão usa o método `pace_mixed`: ritmo medido dos aparelhos atualizados mais o cadastro para os atrasados. Origem `projected`, confiança média e o motivo nomeia os atrasados. Acima de 20%, continua a estimativa. |
| Histórico anterior à fila nova aparecia como "nenhuma medição" | "Medido neste mês: 190 kWh… ainda não tem nenhuma medição automática" | Quando o contrato diz `missing` mas o histórico tem leituras, o estado é derivado das leituras (`recent` ou `delayed`, com a idade) e marcado com `derived: true`. |
| 3 consultas MongoDB a mais por pergunta | — | **Mantidas.** Medido com MongoDB real e 20 dispositivos: p50 de 3,8 ms sem o estado e 4,4 ms com ele (+0,6 ms). As consultas rodam em paralelo às já existentes, usam índice e só acontecem quando há aparelho conectado. Juntá-las exigiria mudar o método do coletor para receber a lista de aparelhos da IA. O ganho é pequeno e misturaria as responsabilidades. |
