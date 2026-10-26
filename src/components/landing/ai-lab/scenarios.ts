// Content of the WattStatus AI demonstration. Pure data: what each kind of
// information means, and three illustrative investigations. Nothing here is
// sent anywhere or computed from a visitor's data.
//
// The five stages describe how the product works at a high level (question,
// available context, evidence, explanation, possible actions). They are not
// the internal reasoning of a model.

export type NodeId = "history" | "appliances" | "rooms" | "quality" | "comparisons" | "simulations";

export interface KnowledgeNode {
  id: NodeId;
  label: string;
  short: string;
  detail: string;
}

export const NODES: KnowledgeNode[] = [
  {
    id: "history",
    label: "Histórico",
    short: "Consumo por período",
    detail: "Leituras e estimativas organizadas por dia e por mês. É a base para comparar períodos e para a previsão do mês.",
  },
  {
    id: "appliances",
    label: "Aparelhos",
    short: "Potência e horas de uso",
    detail: "Cada aparelho cadastrado informa potência, horas de uso e dias por mês. Aparelhos conectados também trazem medições.",
  },
  {
    id: "rooms",
    label: "Ambientes",
    short: "Onde cada aparelho está",
    detail: "Os ambientes do imóvel agrupam aparelhos, o que permite comparar o consumo da sala, da cozinha ou do quarto.",
  },
  {
    id: "quality",
    label: "Qualidade",
    short: "Medido, estimado, parcial",
    detail: "O WattStatus diferencia dados medidos, estimados, parciais e ausentes, além de considerar a atualização das leituras quando essa informação está disponível.",
  },
  {
    id: "comparisons",
    label: "Comparações",
    short: "Entre períodos e aparelhos",
    detail: "Comparar meses ou aparelhos só faz sentido entre dados do mesmo tipo. Quando falta base, a comparação é apresentada como limitação.",
  },
  {
    id: "simulations",
    label: "Simulações",
    short: "E se o uso mudar?",
    detail: "Simula mudanças nas horas de uso de um aparelho e estima o impacto a partir da potência, do tempo de uso e da tarifa cadastrada.",
  },
];

export type Stage = "question" | "context" | "evidence" | "explanation" | "action";
export const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "question", label: "Pergunta" },
  { id: "context", label: "Contexto" },
  { id: "evidence", label: "Evidências" },
  { id: "explanation", label: "Explicação" },
  { id: "action", label: "Ações" },
];

export type ScenarioId = "spending" | "cooling" | "trust";

// An action either changes what this section shows, or navigates to a real
// route or anchor. No action pretends to run anything.
export type Action =
  | { label: string; kind: "node"; node: NodeId }
  | { label: string; kind: "scenario"; scenario: ScenarioId }
  | { label: string; kind: "anchor"; href: string }
  | { label: string; kind: "route"; to: string };

export interface Evidence {
  node: NodeId;
  need: string;
  limitation: string;
}

export interface Scenario {
  id: ScenarioId;
  tab: string;
  question: string;
  contextNodes: NodeId[];
  evidence: Evidence[];
  explanation: string;
  actions: Action[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "spending",
    tab: "Investigar consumo",
    question: "Quais aparelhos podem estar aumentando meus gastos?",
    contextNodes: ["history", "appliances", "quality", "comparisons"],
    evidence: [
      { node: "history", need: "Consumo de pelo menos dois períodos", limitation: "Sem um período anterior, não há mudança para explicar." },
      { node: "appliances", need: "Potência e horas de uso de cada aparelho", limitation: "Horas de uso informadas podem não refletir o uso real." },
      { node: "quality", need: "Origem de cada número: medido ou estimado", limitation: "Estimativas não comprovam o que mudou de fato." },
    ],
    explanation:
      "O WattStatus pode comparar períodos, analisar aparelhos cadastrados e verificar quais mudanças são sustentadas pelos dados disponíveis. Sem informações suficientes, ele apresenta as limitações em vez de afirmar uma causa.",
    actions: [
      { label: "Comparar períodos", kind: "node", node: "comparisons" },
      { label: "Investigar aparelhos", kind: "node", node: "appliances" },
      { label: "Consultar a qualidade das medições", kind: "scenario", scenario: "trust" },
    ],
  },
  {
    id: "cooling",
    tab: "Planejar economia",
    question: "Como posso reduzir o consumo do ar-condicionado?",
    contextNodes: ["appliances", "simulations", "quality", "rooms"],
    evidence: [
      { node: "appliances", need: "Potência e horas de uso do ar-condicionado", limitation: "Sem esses dados, não há base para simular." },
      { node: "simulations", need: "Novas horas de uso a testar", limitation: "A simulação estima o impacto; não é uma medição." },
      { node: "quality", need: "Tarifa cadastrada e origem dos dados", limitation: "O resultado depende da potência, das horas, da tarifa e da qualidade dos dados." },
    ],
    explanation:
      "O WattStatus pode simular mudanças nas horas de uso do ar-condicionado e estimar o impacto energético com base nas informações disponíveis. Um plano de economia acompanha as mudanças escolhidas ao longo do mês.",
    actions: [
      { label: "Explorar simulação", kind: "anchor", href: "#recursos" },
      { label: "Conhecer planos de economia", kind: "route", to: "/signup" },
      { label: "Ver aparelhos", kind: "node", node: "appliances" },
    ],
  },
  {
    id: "trust",
    tab: "Qualidade das medições",
    question: "Posso confiar nos dados de consumo dos meus aparelhos?",
    contextNodes: ["quality", "history", "appliances", "comparisons"],
    evidence: [
      { node: "quality", need: "Estado de cada aparelho: medido, estimado, parcial ou sem dados", limitation: "Estimado vem do cadastro, não de um medidor." },
      { node: "history", need: "Atualização das leituras dos aparelhos conectados", limitation: "Leituras atrasadas ou ausentes deixam lacunas no período." },
      { node: "comparisons", need: "Dados do mesmo tipo nos dois lados da comparação", limitation: "Comparar medido com estimado pode enganar." },
    ],
    explanation:
      "O WattStatus considera a origem e a atualização das informações disponíveis. Leituras atrasadas ou ausentes podem limitar conclusões sobre o consumo recente.",
    actions: [
      { label: "Entender medições", kind: "node", node: "quality" },
      { label: "Explorar qualidade dos dados", kind: "anchor", href: "#recursos" },
      { label: "Conhecer previsões", kind: "node", node: "history" },
    ],
  },
];

export const DISCLAIMER = "Demonstração ilustrativa — as análises reais dependem dos dados cadastrados e das medições disponíveis.";
