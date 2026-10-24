# Coleta agendada de energia

Como a função agendada `collect-energy` escolhe e lê os dispositivos SmartThings: a correção da falha de atendimento (starvation, seções 1 a 3) e o dimensionamento da capacidade (seções 4 a 9).

## 1. Causa do bug

`claimEnergyCollection` (`backend/src/storage/mongo-db.ts`) funcionava assim:

1. Buscava até 200 aparelhos SmartThings de usuários com coleta habilitada, com `.limit(200)`, **sem ordenação**.
2. Percorria esses 200 em ordem e reservava o primeiro que tivesse uma linha vencida em `energy_collection`, ou criava a linha se ela ainda não existisse.

Os mesmos 200 aparelhos voltavam em toda chamada, porque o MongoDB devolve a ordem natural da coleção. Além de 200 dispositivos, os demais nunca entravam na janela.

Havia um efeito ainda pior: cada aparelho atendido volta a vencer depois do intervalo (30 min) e, por estar no começo da janela, é escolhido de novo antes dos que nunca foram lidos. Com 3 dispositivos por execução a cada 5 minutos, só cerca de 18 aparelhos se revezavam.

Reprodução em MongoDB real (`tests/energy-starvation-mongo.test.cjs`, 250 dispositivos, 100 execuções):

| Código | Dispositivos que receberam ao menos uma leitura |
|---|---|
| Antes (`9f73dc9`) | **18 de 250**. O teste falha. |
| Depois | **250 de 250** |

## 2. Solução: fila ordenada por `nextAt`

`energy_collection` passou a ser uma fila, com uma linha por dispositivo habilitado:

```
{ key: "<userId>:smartthings:<deviceId>", userId, deviceId, nextAt, leaseUntil, failures, createdAt }
```

### Registro (`syncEnergyCollection`)

- Roda no início de cada execução agendada.
- Busca uma página de até 500 aparelhos elegíveis (SmartThings, `integrationDeviceId` texto, dono com `energyCollectionEnabled: true`), em ordem de `_id`.
- Faz um `bulkWrite` de upserts com `$setOnInsert`. Dispositivo novo entra com `nextAt = 0`, ou seja, vencido na hora. Dispositivo existente mantém o agendamento.
- O cursor da página fica em `energy_collection_meta` e volta ao começo ao fim da lista. Todo dispositivo elegível é registrado em no máximo `ceil(dispositivos / 500)` execuções, sem janela fixa.

### Reserva (`claimEnergyCollection`)

- Um único `findOneAndUpdate({ nextAt ≤ agora, leaseUntil ≤ agora }, { leaseUntil: agora + 60 s }, { sort: { nextAt: 1, key: 1 } })`.
- Pega sempre o dispositivo **mais atrasado**. Empates são resolvidos pela chave, de forma determinística.
- Antes de devolver a reserva, confere que o dono ainda tem coleta habilitada e que o aparelho ainda existe. Se não, remove a linha e tenta a próxima (até 20 por chamada).
- Desativar a coleta ou excluir o aparelho tira o dispositivo da fila. Reativar a coleta o devolve no próximo registro, vencido na hora.

### Ordenação

Dispositivos nunca lidos (`nextAt = 0`) vêm primeiro. Depois, o mais atrasado. Um dispositivo atendido só volta à frente quando todos os vencidos antes dele forem atendidos.

### Vários workers

- A reserva é atômica, então duas execuções simultâneas nunca pegam o mesmo dispositivo. O teste faz 60 reservas concorrentes por duas conexões e obtém 60 chaves distintas.
- Se a execução cair no meio, a reserva expira em 60 s e o dispositivo volta à fila.

### Retentativa

Sem mudança: `finishEnergyCollection` faz backoff exponencial (mínimo igual ao intervalo, máximo de 6 h, até 6 falhas acumuladas). Um dispositivo com erro só atrasa o próprio `nextAt`; os outros seguem.

### Idempotência

- **Na fila**: um dispositivo atendido não vence de novo antes do intervalo.
- **Nas leituras**: o `sampleKey` (usuário, dispositivo, minuto, valor) impede leitura duplicada.

O teste de ponta a ponta faz duas execuções no mesmo instante: 2 leituras na primeira, 0 reservas na segunda, 2 amostras no total.

### Compatibilidade

Linhas antigas, que só têm `key`, continuam funcionando: o usuário e o dispositivo são lidos da chave. Os campos novos entram na linha na próxima vez que o registro passa por ela.

## 3. Índices

| Coleção | Índice | Uso |
|---|---|---|
| `energy_collection` | `{ key: 1 }` único (já existia) | upsert do registro, conclusão |
| `energy_collection` | `{ nextAt: 1, key: 1 }` (**novo**) | reserva: o `explain` mostra `IXSCAN`, 1 chave e 1 documento examinados com 300 dispositivos |
| `user_settings` | `{ energyCollectionEnabled: 1, userId: 1 }` parcial, só `true` (**novo**) | lista de usuários habilitados |

Os índices são criados por `db.init()`, na inicialização da API, como os demais. A função agendada chama `init(false)`.

**Impacto na escrita**: cada conclusão já atualizava `nextAt`; agora também atualiza a entrada do índice `{nextAt, key}`. É uma escrita de índice a mais por leitura de dispositivo. O índice parcial de `user_settings` só muda quando o usuário liga ou desliga a coleta.

## 4. Capacidade: diagnóstico

### Limites externos (documentação oficial, consultada em 24/10/2026)

**SmartThings** ([Rate Limits](https://developer.smartthings.com/docs/getting-started/rate-limits)):

- **Por dispositivo**: 12 requisições por minuto para ler estado. Ler a cada 30 minutos fica muito abaixo disso.
- **Por app instalado**: 60 requisições por minuto nas APIs de Installed Apps.
- **Por localização**: 100 requisições por minuto em Get e List Location.
- **Por token**: a documentação não define limite.
- **Ao estourar**: HTTP 429, com os cabeçalhos `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset` (segundos até o fim da janela). `Retry-After` não é documentado.

**Netlify** ([Scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/)): função agendada tem limite de 30 s de execução e não faz streaming.

### O que limitava de verdade

| Fator | Antes | Era o gargalo? |
|---|---|---|
| Teto de dispositivos por execução | 3, fixo no código (`maxDevices ≤ 3`) | **Sim**: 36 leituras por hora |
| Processamento | Sequencial, um dispositivo por vez | **Sim** |
| Chamadas externas por leitura | Lista de dispositivos com nomes de cômodos (1 + uma por localização) + estado + saúde, **a cada dispositivo** | **Sim**: 3 ou mais chamadas por leitura |
| Token | Resolvido a cada dispositivo | Pouco |
| MongoDB | ~5 operações por dispositivo, reserva por índice (1 chave examinada) | Não |
| Netlify | 30 s por execução | Teto absoluto por execução |
| Cotas SmartThings | 12/min por dispositivo; sem limite documentado por token | Não, com o limite por usuário |

## 5. Dimensionamento

### Coletor (`backend/src/modules/energy/energy-collector.ts`)

- **Pool de workers**: `concurrency` workers, cada um repetindo reservar, ler e concluir. Para ao atingir o orçamento de dispositivos (`maxDevices`), o prazo ou o fim da fila. Nunca começa um dispositivo que não termine antes do prazo (timeout da requisição + 1,5 s).
- **Uma sessão por usuário por execução**: o token é resolvido uma vez e a lista de dispositivos com medição de energia (`listEnergyDeviceIds`) é buscada uma vez, sem nomes de cômodos. Cada leitura faz só `GET /devices/{id}/status` (`getDeviceReading`), sem a chamada de saúde. Resultado: cerca de 1,2 chamada externa por leitura, contra 3 ou mais antes.
- **Concorrência por usuário** (`perUserConcurrency`): a reserva exclui usuários que já estão no limite. Se dois workers pegarem o mesmo usuário ao mesmo tempo, o segundo devolve o dispositivo sem mudar o agendamento.
- **429**: lê `X-RateLimit-Reset` (ou `Retry-After`, se vier), adia todos os dispositivos vencidos daquele usuário até o reset sem contar falha, e exclui o usuário pelo resto da execução. Os outros usuários seguem.
- **404**: dispositivo some da conta; nova tentativa em 24 h.
- **401/403/424**: token inválido; o usuário fica desativado no resto da execução e o dispositivo é tentado de novo em 6 h. O estado aparece como `error`.
- **Outras falhas**: backoff exponencial, como antes (máximo de 6 h).
- **Dispositivo sem medição de energia**: não é lido.

### Reserva e lease

- A reserva é atômica e tem um `leaseId` único.
- A conclusão só vale se o `leaseId` ainda for o mesmo. Se uma execução passar do lease e outra pegar o dispositivo, a conclusão atrasada é descartada (testado). A leitura duplicada também é barrada pelo `sampleKey`.
- Lease de `max(60 s, 3 × timeout + 10 s)`. O pior caso de um dispositivo é renovação de token + lista + leitura, todos com timeout de 4 s, abaixo de 60 s. Por isso não foi preciso renovar o lease.

### Limites rígidos (`COLLECTION_LIMITS`)

| Limite | Valor |
|---|---|
| Dispositivos por execução | 500 |
| Workers | 16 |
| Workers por usuário | 4 |
| Prazo por execução | 25 s |
| Timeout por requisição | 4 s |

O ambiente só escolhe valores dentro desses limites:

| Variável | Padrão |
|---|---|
| `ENERGY_COLLECTION_BATCH_SIZE` | 60 |
| `ENERGY_COLLECTION_CONCURRENCY` | 4 |
| `ENERGY_COLLECTION_PER_USER` | 2 |
| `ENERGY_COLLECTION_INTERVAL_MINUTES` | 30 |

### Como escolher

```
orçamento por execução ≥ dispositivos × (5 min / intervalo) × 1,25
concorrência ≥ orçamento × latência média por leitura / 20 s
```

### Capacidade medida

MongoDB 7.0.14 local, SmartThings simulada, uma execução sobre uma fila de 2.000 dispositivos (`CAPACITY`):

| Configuração | Latência simulada | Leituras por execução | Duração | Leituras por hora | Dispositivos sustentáveis em 30 min |
|---|---|---|---|---|---|
| Antiga (3, 1 worker) | 50 ms | 3 | 0,35 s | 36 | 18 |
| Padrão (60, 4, 2/usuário) | 50 ms | 60 | 1,4 s | 720 | 360 |
| Grande (200, 8, 2) | 50 ms | 200 | 2,2 s | 2.400 | 1.200 |
| Máxima (500, 16, 2) | 50 ms | 496 | 2,9 s | ~5.950 | ~2.980 |
| Antiga | 300 ms | 3 | 1,3 s | 36 | 18 |
| Padrão | 300 ms | 60 | 6,4 s | 720 | 360 |
| Grande | 300 ms | 200 | 10,8 s | 2.400 | 1.200 |
| Máxima | 300 ms | 498 | 14,1 s | ~5.980 | ~2.990 |

Com latência real de 300 ms por chamada, a configuração máxima usa cerca de 14 s dos 23 s do prazo.

### Capacidade máxima com o código atual

Cerca de 6.000 leituras por hora (500 por execução, 12 execuções por hora). Isso sustenta cerca de 3.000 dispositivos no intervalo de 30 minutos. Acima disso, o limite é o teto de 500 por execução e a duração da função agendada.

### Regime permanente

Duas horas simuladas, orçamento calculado pela fórmula (`STEADY`):

| Dispositivos | Orçamento / workers | Intervalo real p95 | Atrasados | Execução média / máxima |
|---|---|---|---|---|
| 50 | 11 / 8 | 30 min | 0 | 0,2 s / 0,25 s |
| 250 | 53 / 8 | 30 min | 0 | 0,56 s / 0,76 s |
| 500 | 105 / 8 | 30 min | 0 | 0,98 s / 1,2 s |
| 1.000 | 209 / 8 | 30 min | 0 | 1,9 s / 2,4 s |
| 5.000 | 500 (teto) / 16 | **50 min** | — | 2,9 s / 3,0 s; `capacityShort: true` |

Com 5.000 dispositivos, o intervalo planejado de 30 min não é cumprido: o teto de 500 por execução dá cerca de 50 min. A métrica sinaliza isso. Ninguém fica sem leitura, mas os dados ficam mais espaçados. Isso não deve ser confundido com monitoramento dentro do intervalo.

### Intervalo esperado em produção, com 30 minutos planejados

| Dispositivos | Orçamento por execução | Workers | Intervalo esperado |
|---|---|---|---|
| 250 | 53 (ou o padrão de 60) | 4 a 8 | 30 min |
| 500 | 105 | 8 | 30 min |
| 1.000 | 210 | 8 | 30 min |

Com a configuração padrão (60 por execução, 720 leituras por hora), o intervalo efetivo é de 30 min até 360 dispositivos. Acima disso, fica em `dispositivos / 12` minutos: cerca de 42 min com 500 e 83 min com 1.000. Para 500 ou mais, ajuste as variáveis conforme a tabela.

### Custo

- **Netlify**: o tempo de função por execução sobe de menos de 1 s para cerca de 1 a 3 s (1.000 dispositivos, 50 ms) ou cerca de 6 a 14 s (latência de 300 ms), com 12 execuções por hora.
- **MongoDB**: cerca de 5 operações por dispositivo lido, mais 5 por execução. Com 1.000 dispositivos a cada 30 min, são cerca de 10.000 operações por hora, todas por índice.
- **SmartThings**: cerca de 1,2 chamada por leitura, contra 3 ou mais antes. O custo externo por leitura caiu.

## 6. Métricas

- **Por dispositivo** (em `energy_collection`): `lastSuccessAt`, `lastIntervalMs` (intervalo real entre leituras), `lastLagMs` (atraso na fila ao ser atendido), `lastDurationMs`, `lastStatus`, `failures`.
- **Por execução** (`energy_collection_runs`, TTL de 30 dias): reservados, salvos, falhas, ignorados, `rateLimited`, chamadas externas, duração, média por dispositivo, motivo da parada e configuração.
- **`energyCollectionStats`**, em `GET /api/energy/collection-stats` (só e-mails em `AI_ADMIN_EMAILS`, sem IDs de dispositivo):
  - na fila, vencidos, atrasados (mais de um intervalo após vencer), antigos (última leitura com mais de 2 intervalos), nunca lidos, com falha;
  - idade do mais atrasado, intervalo, atraso e duração médios;
  - totais da última hora e leituras por hora necessárias;
  - **`capacityShort`**: verdadeiro quando há dispositivos atrasados, quando o mais antigo espera mais de meio intervalo ou quando o intervalo médio passa de 1,25 vez o planejado.

A cota externa consumida não é medida: a SmartThings só a informa nos cabeçalhos de 429. O coletor usa o valor de reset desses cabeçalhos para descansar o usuário.

## 7. Contrato para o WattStatus AI

`GET /api/energy/collection-status` (usuário autenticado; `MongoDatabase.energyCollectionStatus(userId, now, intervalMs)`):

```json
{ "enabled": true, "intervalMs": 1800000,
  "devices": [{ "applianceId": "...", "state": "recent|delayed|missing|disabled|error",
    "lastReadingAt": "ISO|null", "ageMs": 0, "nextAt": "ISO|null", "lastStatus": "ok|...", "failures": 0 }] }
```

| Estado | Regra |
|---|---|
| `recent` | Última leitura com até 2 intervalos |
| `delayed` | Leitura mais antiga que 2 intervalos |
| `missing` | Habilitado e nunca lido |
| `disabled` | Coleta desativada pelo usuário |
| `error` | Token inválido, dispositivo removido ou 3 falhas seguidas |

O módulo de IA não foi alterado. Integração recomendada para o agente da IA:

- incluir `getCollectionStatus` no `AIDataSource`;
- na cobertura (`measurement_coverage`, `coverage`), tratar `delayed`, `missing`, `disabled` e `error` como limitações explícitas, por exemplo "a última leitura da TV tem 3 h";
- não apresentar como atual uma leitura `delayed`.

## 8. Testes

| Arquivo | Resultado |
|---|---|
| `tests/energy-capacity-mongo.test.cjs` (novo) | 13 de 13: capacidade por configuração (2 latências); regime permanente com 50, 250, 500, 1.000 e 5.000 dispositivos; 429 com reset; 404, 401 e falhas repetidas; lease expirado com conclusão atrasada descartada; prazo curto sem reserva perdida e retomada; estados para a IA; crescimento da fila com `capacityShort`; rotas de status e métricas |
| `tests/energy-queue-mongo.test.cjs` | 18 de 18 (fila justa, de 1 a 1.000 dispositivos) |
| `tests/energy-starvation-mongo.test.cjs` | 1 de 1 (regressão de starvation) |
| `tests/energy-collector.test.cjs`, `energy-claim-mongo` | Passam (compatibilidade com clientes antigos) |
| Todos os testes Mongo | 42 de 42 |
| Backend completo | 136 passam, 0 falham, 42 pulados sem MongoDB |
| Frontend | `tsc` e ESLint sem erros, build, 45 de 45 |

## 9. Pendências

- As latências são simuladas. Medir a latência real da SmartThings em homologação (`avgDurationMs` das métricas) e ajustar orçamento e workers com a fórmula da seção 5.
- Acima de cerca de 3.000 dispositivos a 30 min, é preciso mais de uma função agendada ou uma função de fundo (background), já que o limite de 30 s da função agendada passa a mandar.
- `X-RateLimit-Remaining` não é usado para desacelerar antes do 429. O coletor reage ao 429.
- O cursor de registro é global, com páginas de 500.
- A IA ainda não consome `collection-status` (contrato na seção 7).
