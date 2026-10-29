# Dashboard 2.0: auditoria local (29/10/2026)

## Ambiente e limites da medição

Branch inicial `main`, HEAD `738c742`. A aplicação foi aberta em Chrome headless com Vite local e respostas de API controladas. Capturas: `artifacts/dashboard-before-1440.png`, `artifacts/dashboard-before-390.png`, `artifacts/dashboard-after-1440.png` e `artifacts/dashboard-after-390.png`. A rodada inicial fez oito chamadas de API (`auth/me`, preferências, aparelhos, imóveis, histórico, insights, analytics, uso SmartThings); após as mudanças fez cinco. Os tempos observados no servidor de desenvolvimento variaram de 0,7 a 3,5 s e incluem a compilação do Vite. Não são valores de produção nem comprovam ganho de latência de login. O backend local não iniciou: `MongoServerSelectionError` após 5 s; não foi possível medir consultas reais ou cold start da Netlify.

## Matriz de achados

| Componente | Problema comprovado | Impacto | Ação | Prioridade |
| --- | --- | --- | --- | --- |
| Login e AuthProvider | Fluxo inclui CSRF antes do POST e três limitadores persistidos em sequência; não há MongoDB disponível para medir as etapas | Latência ainda não atribuível com segurança | Antecipar a solicitação CSRF quando o usuário interage com o formulário, sem mudar validação; medir com banco descartável antes de otimizar backend | Alta |
| Dashboard e hooks | O primeiro acesso disparava oito endpoints, inclusive IA e duas consultas de integração sem dispositivos | Trabalho de rede sem utilidade imediata | IA sob demanda e integração apenas com aparelho conectado | Alta |
| Histórico e período | `keepPreviousData` mantinha leituras do período anterior sob novo título | Leitura potencialmente enganosa | Removido o placeholder entre períodos | Alta |
| Imóveis | Lista de aparelhos podia chegar antes da lista de imóveis | Um escopo na URL podia mostrar momentaneamente o total geral | Aguardar ambos para apresentar os indicadores | Alta |
| EnergyHero | Superfície azul fixa no tema claro; custo e consumo estimados ao lado do medido | Hierarquia e tema inconsistentes | Superfícies do tema, rótulos de origem e horário da última leitura | Alta |
| EnergyInsights | Comparação medido versus estimado não verificava cobertura do mês; insight de 100% com um aparelho | Conclusão sem base e informação óbvia | Comparação removida; insight só com mais de um aparelho | Alta |
| ConsumptionDistribution | Uma rosca de 100% repetia o ranking de um único aparelho | Ocupa espaço sem ajudar a comparar | Omitida com um aparelho | Média |
| ConsumptionTrendChart | Projeção de seis meses é calculada com o cadastro atual, não histórico da época | Pode ser confundida com leitura histórica | Descrição atual já distingue projeção; manter ressalva visível | Alta |
| ApplianceRanking | Barras e custo são estimados; duas unidades com o mesmo nome recebiam a soma medida de ambas | Valor medido atribuído ao aparelho errado | Leituras agora associadas por ID; teste de regressão com nomes iguais | Alta |
| MeasuredDetails | Não mostrava a hora da última leitura | Não permite avaliar atualização | Horário adicionado | Alta |
| AIInsights | Chamada de análise no primeiro carregamento; bloco competia com as métricas | Rede e distração | Abrir análises por ação explícita | Alta |
| IntegrationUsage | Dois endpoints chamados sem dispositivo conectado; períodos diferentes do filtro mensal | Rede inútil e possível confusão de escopo | Montagem condicionada; texto atual informa período independente | Alta |
| SummaryEmptyState | Estado inicial já orienta cadastrar aparelho, mas sugere SmartThings cedo | Entrada ainda pouco guiada | Evoluir jornada opcional após validar as etapas anteriores | Média |
| Sidebar | Identifica rota ativa e tem drawer mobile; convite à integração ocupa área fixa | Pode competir com a navegação | Preservada nesta rodada; validar uso com usuários | Baixa |
| Loading e erros | Estado de imóvel ainda não bloqueava métricas; badge dizia estimativa enquanto consultava medição | Números apresentados sem contexto completo | Espera por imóveis e status “Verificando medições” | Alta |

## Pendências funcionais confirmadas

- `README.md` contém marcadores de conflito, mas já estava modificado antes desta tarefa e foi preservado.
- `/termos` e `/privacidade` têm links em `Footer` e `SignUp`, sem rotas em `App.tsx`. Não foram criados textos jurídicos.
- `TODO.md` está fora do controle de versão; a atualidade de cada item não foi verificada.

## Verificações

- Frontend: TypeScript, build e 46 testes passaram. ESLint: zero erros, 13 avisos preexistentes.
- Backend: build e 153 testes passaram; 45 testes foram pulados pela suíte existente, incluindo cenários dependentes de MongoDB.
- Navegador: capturas em 390 e 1440 px com API simulada. Sem rolagem horizontal involuntária em 360, 390, 768, 1024, 1440 e 1920 px. Estados de erro e medição parcial ainda precisam de homologação visual.
- A troca de mês foi exercitada com a nova resposta de histórico atrasada em 600 ms; os 9,0 kWh do mês anterior desapareceram durante o carregamento. O formulário de login obteve CSRF antes do clique em Entrar no teste com API simulada.
