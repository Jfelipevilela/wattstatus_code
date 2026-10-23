# Hardening e preparação para homologação — 23/10/2026

Branch: `fix/audit-wattstatus-2026`. Sem merge, deploy ou validação com hardware real.

## Dependências

`npm audit --json` antes: 27 (18 altas, 7 moderadas, 2 baixas). Após `npm audit fix` sem `--force`, atualização Vite 8 e remoção de `lovable-tagger` incompatível com Vite 8: 8 (5 altas, 3 moderadas). Backend: 0. `tailwindcss-animate` foi classificado como dependência de desenvolvimento porque só participa da geração do CSS; a auditoria completa continua mostrando os 8 alertas. O tagger atuava só no modo de desenvolvimento e não integra a aplicação ou artefato de produção. Node 22.16.0 foi fixado em `.nvmrc` para satisfazer Vite 8.

| Cadeia e aviso | Antes | Depois | Impacto no WattStatus e correção |
|---|---|---|---|
| `vite`/`esbuild` — [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff), [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | Alto/moderado | Corrigido | Servidor de desenvolvimento e build; Vite 8.3.5 e plugin React SWC 4.3.3. Não há Vite no bundle servido ao navegador. |
| `rollup`, `minimatch`, `js-yaml`, `flatted`, `browserslist`, `ajv`, `eslint`, `@eslint/plugin-kit`, `@humanfs/node`, `typescript-eslint` | Alertas diretos/transitivos | Corrigidos por atualização compatível | Ferramentas de build, lint e desenvolvimento. Não recebem dados de usuários em tempo de execução. Conferir avisos novamente antes do merge. |
| `tailwindcss` 3.4.19 → `chokidar` 3.6.0 → `braces` 3.0.3 — [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Alto | Remanescente | `braces` 3 não tem versão corrigida no registro consultado; Tailwind 4 exige migração maior da configuração, plugins e CSS personalizados. Entrada de build é o código do repositório, sem seletores enviados por usuários. |
| `tailwindcss` → `micromatch` → `braces`; `tailwindcss` → `fast-glob` → `micromatch` | 2 altos | Remanescentes | Mesma causa raiz e superfície de build. `npm audit` reporta nós da cadeia separadamente. |
| `tailwindcss` → `postcss-nested` → `postcss-selector-parser`; `@tailwindcss/typography` → `postcss-selector-parser` — [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | 3 moderados | Remanescentes | Parser de CSS durante build. Migração Tailwind 4 e verificação visual são necessárias; rebaixar typography para 0.5.4 não é solução sustentável. |

As 5 altas remanescentes correspondem a `braces`, `chokidar`, `fast-glob`, `micromatch` e `tailwindcss`. As 3 moderadas correspondem a `postcss-selector-parser`, `postcss-nested` e `@tailwindcss/typography`. Nenhuma dessas bibliotecas é importada pelo frontend em tempo de execução; são ferramentas de build. A migração Tailwind 4 não foi aplicada porque o projeto usa tema extenso em `tailwind.config.ts`, plugin `tailwindcss-animate`, diretivas Tailwind 3 e classes dinâmicas. Seria necessária inspeção visual de todas as telas e estados antes da troca. Não mascarar os alertas com overrides incompatíveis.

## Coleta periódica

Netlify Scheduled Function `backend/netlify/functions/collect-energy.ts` executa a cada 5 minutos UTC apenas em deploy publicado. Não possui URL pública acionável. `ENERGY_COLLECTION_ENABLED=false` por padrão. Usuário ativa individualmente no painel SmartThings. Só são candidatos aparelhos importados com provedor SmartThings, token individual armazenado no MongoDB e capacidade `energyMeter`. O job valida a lista da conta antes de ler status; aceita apenas `energyMeter.energy` com `Wh` ou `kWh`. O primeiro contador é linha de base, sem consumo inventado.

MongoDB mantém lease atômico por usuário/dispositivo, evitando concorrência entre invocações. `sampleKey` torna escrita idempotente. Falhas aumentam backoff exponencial até 6 horas; sucesso usa `ENERGY_COLLECTION_INTERVAL_MINUTES` (mínimo 5, padrão 30). Lote máximo 3 por chamada, padrão 2, orçamento de 20 segundos; limita taxa e custo. Logs contêm apenas contagens, sem IDs ou tokens. Desativação global ou individual impede novos claims. Uma chamada já em andamento pode terminar após desativação. Há limite atual de busca de 200 aparelhos candidatos; acima disso, é necessário paginar/particionar o agendamento para evitar starvation. A captura depende de token SmartThings válido e dispositivo online.

Netlify documenta [limite de 30 segundos e execução só em deploy publicado](https://docs.netlify.com/build/functions/scheduled-functions/). SmartThings documenta [350 chamadas por minuto por dispositivo para status](https://developer.smartthings.com/docs/service-integrations/api-overview), com 429 e cabeçalho de reset. O lote atual de até 3 por invocação fica bem abaixo desse teto em operação normal; 429 recebe backoff, mas o código não interpreta `x-ratelimit-reset`. [Assinaturas por webhook](https://developer.smartthings.com/docs/service-integrations/subscribe-to-events) existem para eventos de atributo; exigiriam registro de app, endpoint validado e gestão de assinatura por conta. Não foram adotadas nesta arquitetura pequena. SSE persistente também não cabe em função de 30 segundos.

Lacunas acima de duas horas aparecem no dashboard. Diferença entre contadores acumulados representa energia consumida entre leituras; o momento do consumo dentro da lacuna permanece desconhecido.

## Segurança e credenciais

`backend/.env` está ignorado; `tmp/` também. Commit histórico `9e45baa` contém nomes `JWT_SECRET`, `LG_CLIENT_ID`, `LG_CLIENT_SECRET`, `LG_REFRESH_TOKEN`, `DATABASE_URL` e `MONGO_URL`; valores não foram exibidos. `PORT` e `MONGO_DB_NAME` não são credenciais. Podem afetar backend, LG ThinQ, MongoDB e PostgreSQL legado, conforme validade real dos valores. Frontend usa apenas `VITE_API_BASE_URL`; nenhuma referência a segredos backend foi encontrada em `src/`. `tmp/pdfs/audit-preview.pdf` contém dados sintéticos, duas páginas; varredura de texto não encontrou e-mail ou marcadores de segredo. Limpeza manual opcional: apagar a pasta `tmp/pdfs` após revisão local; não forçar a remoção neste ambiente.

Checklist de rotação manual:

1. Identificar ambiente e validade de cada valor histórico sem colar segredos em tickets ou logs.
2. Criar novos segredos JWT e credenciais LG, MongoDB/PostgreSQL nos provedores afetados.
3. Atualizar variáveis de ambiente Netlify e ambientes locais; verificar conectividade e login.
4. Revogar valores antigos após confirmar serviço com novos valores.
5. Se `SMARTTHINGS_TOKEN_SECRET` for trocado, planejar reconexão dos usuários ou migração segura dos tokens cifrados. Troca de `JWT_SECRET` invalida sessões existentes.
6. Revisar logs e acesso ao commit histórico. Reescrita do histórico exige autorização e coordenação próprias.

## Medições e testes

Windows, Node 24.16.0 local; MongoDB 7 em Docker `127.0.0.1:27019`; dados sintéticos. `benchmark-energy.cjs`: 200 amostras, 199 intervalos, 10 consultas de histórico: média 7,77 ms, máximo 11,56 ms. `explain('executionStats')`: 200 documentos examinados para 200 retornados, com uso de índice confirmado. Estes números não incluem rede externa nem carga de produção. Teste do job com MongoDB real: 1 claim entre duas execuções simultâneas; primeira amostra gera 0 intervalos. Build frontend Vite 8: 35,58 s no primeiro teste; CSS 98,76 kB, chunk base 126,57 kB, Dashboard 447,22 kB, PDF 400,46 kB antes de gzip. Chunk base caiu após atualização, mas dashboard e PDF ainda são grandes. O bundle PDF carrega sob demanda na página de relatórios. Nenhuma medição de carregamento real abaixo de 3 segundos foi feita.

Índices MongoDB: `energy_samples.sampleKey` único evita duplicata; `{userId,capturedAt,applianceId}` filtra histórico; `{userId,provider,deviceId,capturedAt:-1}` busca antecessora; `energy_collection.key` único dá exclusão concorrente; `sessions.expiresAt` remove sessões vencidas; `appliances.integrationProvider,id` localiza candidatos. `listDevices` SmartThings continua uma chamada de validação por consulta de status. Painel limita status a três chamadas simultâneas e atualiza a cada cinco minutos. Mais dispositivos exigem endpoint em lote ou cache seguro por usuário.

## Homologação física pendente

- Vincular conta SmartThings real com aparelho que anuncie `energyMeter`; conferir unidade e reset do contador.
- Ativar coleta individual e global em ambiente de homologação Netlify publicado; confirmar invocação agendada, 429/backoff e desativação.
- Comparar leituras e lacunas no dashboard e PDF com registros do dispositivo, inclusive queda de rede e troca de tarifa.
- Testar duas contas e revogação de token com dispositivos diferentes.
- Revisar layout responsivo, tema claro/escuro, Chrome, Edge, Firefox e Safari.
- Medir carregamento real do dashboard em rede móvel e desktop; RNF-002 permanece não comprovado.
- Fazer inspeção visual separada antes de qualquer migração Tailwind 4.

## Parecer e merge

Branch apta a revisão de código e homologação controlada. Produção ainda depende de rotação das credenciais históricas, validação Netlify e SmartThings reais, decisão sobre alertas Tailwind 3 e ensaios de desempenho/UX. Fazer revisão do diff e dos commits, repetir `npm ci` nas duas pastas, testes, builds, TypeScript, lint e auditorias. Fazer merge só após aprovação; nenhum deploy foi executado.
