# Relatórios Mensais - Implementação

## Tarefas Pendentes

### 1. Renomear e atualizar arquivos principais

- [ ] Renomear `src/pages/Indicators.tsx` para `src/pages/Reports.tsx`
- [ ] Atualizar rota no `src/App.tsx` de "/indicadores" para "/relatorios"
- [ ] Atualizar menu na sidebar `src/components/Sidebar.tsx` de "Indicadores" para "Relatórios"

### 2. Criar novo componente ReportsTab

- [ ] Criar `src/components/tabs/ReportsTab.tsx`
- [ ] Implementar seletor de mês/ano
- [ ] Adicionar botão "Gerar Relatório" com spinner de carregamento
- [ ] Criar tabela responsiva com colunas ordenáveis
- [ ] Implementar filtro por aparelho específico
- [ ] Adicionar botão de exportação em PDF

### 3. Implementar lógica de cálculo mensal

- [ ] Calcular consumo baseado no mês selecionado (dias variáveis)
- [ ] Calcular custo baseado na tarifa do estado
- [ ] Incluir total geral de consumo e custo
- [ ] Adicionar timestamp de geração do relatório

### 4. Funcionalidades avançadas

- [ ] Implementar ordenação nas colunas da tabela
- [ ] Integrar exportação em PDF com formatação adequada
- [ ] Exibir informações do cliente (nome, identificação)
- [ ] Garantir performance < 5 segundos para até 100 aparelhos

### 5. Testes e ajustes finais

- [ ] Testar geração de relatório com diferentes meses
- [ ] Verificar responsividade da tabela
- [ ] Testar exportação em PDF
- [ ] Ajustar design e UX conforme necessário
