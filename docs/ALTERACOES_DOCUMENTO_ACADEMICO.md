# Alterações recomendadas ao documento acadêmico

Referência: Documento de Especificação de Projeto Integrador WattStatus, versão de outubro de 2026. Este arquivo registra correções propostas; o Google Doc não foi editado.

## Quadro 11 — requisitos funcionais

Substituir a coluna “Status” universalmente “Implementado” pela classificação e evidência de `AUDITORIA_REQUISITOS_WATTSTATUS.md`. Em especial:

- RF-005: “Parcial. A tarifa manual é validada e salva por usuário; aparelhos antigos permanecem com referência estadual até edição. Não há fonte oficial em tempo real.”
- RF-006: “Parcial. Relatórios mostram estimativas e intervalos IoT persistidos separadamente. Períodos sem duas leituras não possuem consumo medido.”
- RF-007: “Parcial. O dashboard separa projeção mensal de medições por intervalo. A experiência ainda requer validação com usuários.”
- RF-008: “Parcial. A coleção `energy_samples` persiste amostras SmartThings e permite consultar intervalos. A coleta ocorre quando status é consultado; não existe monitoramento contínuo.”
- RF-009: “Parcial. PDF inclui estimativas e medições separadas, paginação e totais. Falta validação com dados reais e navegadores.”
- RF-010: “Implementado em API com registro, login, sessão MongoDB e revogação no logout; JWTs anteriores exigem novo login.”

## Seções 1.1, 4 e 17.3

Trocar “monitoramento em tempo real” e “SmartThings validado de ponta a ponta” por “consulta sob demanda a dispositivos SmartThings e registro das leituras energéticas que o dispositivo disponibilizar”. Manter alegações de validação física apenas se houver evidência documentada fora deste repositório. Tempo ligado deve ser descrito em duração, sem conversão automática em kWh.

## Seções 18.1 e 18.2

Descrever coleções efetivas `users`, `appliances`, `user_settings`, `integration_tokens`, `integration_usage`, `integration_usage_history`, `energy_samples` e `sessions`. A coleção `ConsumptionHistory` mencionada no texto não existe com esse nome. `energy_samples` guarda contador acumulado com data, usuário, dispositivo, aparelho vinculado quando houver e tarifa capturada; intervalos são derivados de amostras consecutivas. Não afirmar que meses anteriores foram medidos.

## Quadro 12 e referências cruzadas

RNF-002 permanece não comprovado sem medição reproduzível de carregamento abaixo de três segundos. RNF-003 é parcial, porque rate limiting distribuído e validação externa ainda faltam. RNF-004 exige testes de navegador. A lista principal contém RNF-001 a RNF-005; revisar citações a `RNF-006` e corrigir numeração ou redigir novo requisito com critério verificável.

## Cronograma e validações

Separar “implementado”, “testado com mocks”, “testado com MongoDB isolado” e “validado em dispositivo físico”. A suíte local usou MongoDB 7 em Docker e respostas SmartThings simuladas. Não atribuir a ela resultados de produção, usuários reais ou hardware.
