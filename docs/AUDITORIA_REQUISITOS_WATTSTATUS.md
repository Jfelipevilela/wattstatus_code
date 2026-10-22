# Auditoria de requisitos WattStatus

Base: `dev_V1` (`d53cb07`); especificação acadêmica consultada em 22/10/2026. Esta matriz descreve evidência observada no código e testes executados, não declara validação em produção.

| ID | Requisito | Status | Evidência no código | Teste | Observações |
|---|---|---|---|---|---|
| RF-001 | Cadastrar aparelhos | Parcial | `backend/src/modules/appliances/` | Não há teste de API | Fluxo existe; falta teste de persistência MongoDB. |
| RF-002 | Editar aparelhos | Parcial | `appliances.service.ts` | Não há teste de API | Atualiza cálculos; falta teste de isolamento. |
| RF-003 | Calcular consumo | Implementado | `calculation.service.ts`, `src/lib/energy.ts` | `tests/energy.test.mjs` | Cálculo estimado em kWh validado para mês e ano bissexto. |
| RF-004 | Calcular custo | Parcial | `calculation.service.ts` | `tests/energy.test.mjs` | Usa tarifa estadual de referência; tarifa pessoal ainda falta. |
| RF-005 | Selecionar ou informar tarifa | Pendente | `backend/src/config/tariffs.ts` | Tarifas estaduais em `energy.test.mjs` | Não há entrada e persistência de valor manual por usuário. |
| RF-006 | Relatórios | Parcial | `src/components/tabs/ReportsTab.tsx` | Não há teste de relatório | Estimativas retrospectivas não são histórico medido. |
| RF-007 | Dashboard | Parcial | `src/pages/Dashboard.tsx` | Não há teste de interface | Há gráficos de estimativas; métricas reais exigem histórico. |
| RF-008 | Histórico de consumo | Pendente | `integration_usage_history` guarda tempo ligado | `energy.test.mjs` cobre só projeção | Não há coleção persistente de kWh medido. |
| RF-009 | Exportar PDF | Não comprovado | `ReportsTab.tsx` usa jsPDF | Não há teste estrutural de PDF | Build passou; layout e paginação não foram validados. |
| RF-010 | Autenticação | Parcial | `auth.routes.ts`, `auth-middleware.ts` | Teste de token expirado em `backend/tests/integration-isolation.test.cjs` | Logout limpa cookie, mas JWT emitido continua válido até expirar. |
| RNF-001 | Interface simples | Não comprovado | Componentes React e navegação | Sem teste de usabilidade | Precisa de validação com usuários. |
| RNF-002 | Telas em menos de 3 s | Não comprovado | Build Vite | Sem medição representativa | Bundle principal supera 1 MB antes de gzip. |
| RNF-003 | Segurança e controle de acesso | Parcial | `auth-middleware.ts`, rotas MongoDB e SmartThings | `integration-isolation.test.cjs` | Isolamento IoT testado com mock; falta MongoDB real e revisão CSRF/CORS/sessões. |
| RNF-004 | Navegadores modernos | Não comprovado | Vite/React | Sem matriz de navegadores | Build local passou. |
| RNF-005 | Arquitetura expansível | Parcial | Módulos backend e MongoDB | Build backend | Adaptadores legados e histórico ausente exigem revisão. |

## Achados de segurança

- SmartThings reutilizava cliente singleton com token mutável. Agora cada requisição usa token do usuário autenticado e cliente novo. Lista/status/comando usam escopo do token atual. Status e comando verificam presença do dispositivo na lista desse token. Revogação apaga token persistido.
- `backend/.env` estava rastreado e aparece no histórico Git. Foi retirado do índice sem apagar arquivo local; `.gitignore` passou a ignorá-lo. **Rotacione todos os segredos potencialmente expostos** após identificar proprietários e dependências. Não reescreva histórico sem plano coordenado.
- Erros internos não devolvem nem registram objeto de exceção completo, que poderia conter headers de autorização.
- `SMARTTHINGS_TOKEN` global não é mais usado para acesso de usuários. Remover a variável do ambiente após verificar dependências externas.

## Limites e próximos passos

1. Persistir leituras energéticas em MongoDB com índice por usuário, aparelho, fonte e instante; tratar contador acumulativo, reset e duplicação. Não migrar projeções antigas como medições.
2. Implementar tarifa manual por usuário e congelar tarifa aplicada em cada registro histórico.
3. Alimentar dashboard e relatórios com leituras persistidas; rotular projeções e ausência de dados. Testar PDF.
4. Validar fluxos de autenticação, aparelhos e IoT com MongoDB isolado e dispositivos SmartThings de teste.
5. Medir RNF-002 em ambiente representativo. Corrigir lint e ampliar testes de navegador.
6. Resolver referência `RNF-006` no documento acadêmico: a lista principal contém somente RNF-001 a RNF-005. Renumerar ou remover citações sem requisito definido.

## Ajustes recomendados ao documento acadêmico

- Quadro 11: marcar RF-005 e RF-008 como pendentes; RF-006, RF-007, RF-009 e RF-010 como parciais ou não comprovados até validação correspondente.
- Seções 17.3, 18.1 e 18.2: retirar afirmações de coleta contínua, coleção `ConsumptionHistory` operacional e histórico medido até implementação e testes. Descrever `integration_usage_history` como duração ligada em milissegundos.
- Seções 1.1 e 4: qualificar “tempo real” e “SmartThings validado de ponta a ponta” com evidência de dispositivo físico, caso exista. Sem evidência, usar “integração em desenvolvimento e validação”.
- Quadro 12: RNF-002 continua não comprovado. RNF-003 depende de revisão completa de sessão, CORS e CSRF. RNF-004 requer testes reais de navegador.

Documento externo não foi alterado.
