# Coleta agendada de energia

Como a função agendada `collect-energy` escolhe os dispositivos SmartThings a ler, e a correção da falha de atendimento (starvation) encontrada na revisão de integração.

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

## 4. Capacidade medida

MongoDB 7.0.14 local e descartável. Cada execução tem 3 dispositivos, de 5 em 5 minutos, com intervalo de 30 minutos (`tests/energy-queue-mongo.test.cjs`, `QUEUE_BENCH`):

| Dispositivos | Execuções até atender todos | Tempo simulado | Tempo médio por execução (registro + 3 reservas e conclusões) |
|---|---|---|---|
| 1 | 1 | 5 min | 82 ms (primeira, com aquecimento) |
| 50 | 17 | 1,4 h | 22 ms |
| 199 | 67 | 5,6 h | 26 ms |
| 200 | 67 | 5,6 h | 25 ms |
| 201 | 67 | 5,6 h | 22 ms |
| 250 | 84 | 7,0 h | 26 ms |
| 500 | 167 | 13,9 h | 26 ms |
| 1.000 | 334 | 27,8 h | 33 ms |

Consultas ao banco por execução com 3 dispositivos: cerca de 20.

- **Registro**: 5 operações (usuários habilitados, cursor, página de aparelhos, `bulkWrite`, atualização do cursor).
- **Cada dispositivo**: 5 operações (reserva, configuração, aparelho, leitura e escrita da conclusão).

Às chamadas ao banco somam-se as chamadas à SmartThings.

### Limite real

O gargalo não é o banco, e sim a vazão configurada: `maxDevices` é limitado a 3 por execução em `energy-collector.ts`, e a execução tem prazo de 23 s.

- Com 3 dispositivos a cada 5 minutos, a capacidade é de 36 leituras por hora.
- Com intervalo de 30 minutos, isso sustenta no máximo 18 dispositivos no intervalo nominal.
- Acima disso, a fila continua justa: todos são atendidos em rodízio, e o intervalo efetivo de cada dispositivo passa a ser `dispositivos / 36` horas. Com 1.000 dispositivos, isso dá cerca de 28 h.
- Nenhum dispositivo fica esquecido. A frequência é limitada pela capacidade, não pela seleção.

Para aumentar a frequência:

- elevar `ENERGY_COLLECTION_BATCH_SIZE` e o teto de 3 no código;
- ou agendar com mais frequência.

Os dois respeitando os limites de requisições da SmartThings. Essa decisão de capacidade não foi tomada aqui.

## 5. Testes

| Arquivo | O que prova |
|---|---|
| `tests/energy-starvation-mongo.test.cjs` | Regressão: 250 dispositivos; falha no código antigo (18 de 250), passa no novo |
| `tests/energy-queue-mongo.test.cjs` | Todos atendidos para 1, 50, 199, 200, 201, 250, 500 e 1.000 dispositivos, sem atender ninguém duas vezes antes de todos quando a rodada cabe no intervalo. Também cobre: dispositivo não vencido; erro com backoff sem bloquear os outros; dois workers simultâneos; ativação, desativação durante o processamento e reativação; dispositivo novo sem registro; aparelho excluído; intervalos diferentes; recuperação após interrupção; linhas antigas; coleta de ponta a ponta sem leitura duplicada; `explain` com índice |
| `tests/energy-claim-mongo.test.cjs` | Usuários sem opt-in não bloqueiam a coleta (ajustado: registra a fila antes de reservar) |
| `tests/energy-collector.test.cjs` | Comportamento existente do coletor, inalterado |

Todos exigem `TEST_MONGO_URL` apontando para um MongoDB local e isolado. Sem ele, são pulados.

## 6. Pendências

- A capacidade de 3 dispositivos por execução é o limite efetivo acima de 18 dispositivos (seção 4).
- O cursor de registro é global. Usuários com milhares de aparelhos não atrasam os outros na reserva, mas no registro todos dividem a mesma página de 500.
- Linhas de dispositivos removidos só saem da fila quando chegam à frente dela. O custo é uma reserva descartada.
