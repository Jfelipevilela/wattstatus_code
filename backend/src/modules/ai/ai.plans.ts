// Savings plans: a target monthly cost turned into per-appliance actions.
// Every value comes from simulateForAppliance; each appliance appears at most
// once, so savings never add up twice, and the plan never claims more than
// the reference consumption.
import {
  ApplianceFacts, PropertySnapshot, simulateForAppliance, simulateReplacement, money, EnergyDataSource,
} from "./ai.engine";

export type Effort = "baixo" | "medio" | "alto";
export interface PlanAction {
  applianceId: string;
  applianceName: string;
  roomName: string | null;
  kind: "reduce_hours";
  fromHours: number;
  toHours: number;
  monthlyKWh: number;
  monthlyCost: number;
  // Lower bound for compressor appliances (cycle not measured).
  conservativeCost: number;
  effort: Effort;
  source: EnergyDataSource;
}
export interface PlanIdea {
  applianceId: string;
  applianceName: string;
  kind: "replacement";
  note: string;
  monthlyCost: number;
}
export interface SavingsPlan {
  version: "plan-1";
  propertyId: string;
  target: number;
  statedCurrent: number | null;
  reference: number;
  gap: number;
  reachable: boolean;
  achieved: number;
  achievedConservative: number;
  remaining: number;
  actions: PlanAction[];
  ideas: PlanIdea[];
  excluded: Array<{ applianceId: string; applianceName: string; reason: string }>;
  assumptions: string[];
  uncertainty: string[];
}

export interface PlanOptions {
  protectedIds?: string[];
  maxReduction?: number;
  minHours?: Record<string, number>;
  statedCurrent?: number | null;
}

const effortOf = (cutHours: number, fromHours: number): Effort => {
  const share = fromHours > 0 ? cutHours / fromHours : 1;
  if (cutHours <= 1 && share <= 0.25) return "baixo";
  if (share <= 0.35) return "medio";
  return "alto";
};

// Greedy by savings per hour cut (most impact for least effort), each
// appliance used once, capped by the user's limits.
export const buildSavingsPlan = (snapshot: PropertySnapshot, target: number, options: PlanOptions = {}): SavingsPlan => {
  const { protectedIds = [], maxReduction = 0.3, minHours = {}, statedCurrent = null } = options;
  const reference = snapshot.totals.estimatedCost;
  const gap = Math.max(0, reference - target);
  const excluded: SavingsPlan["excluded"] = [];
  const candidates: Array<{ item: ApplianceFacts; action: PlanAction }> = [];
  for (const item of snapshot.appliances) {
    if (protectedIds.includes(item.id)) { excluded.push({ applianceId: item.id, applianceName: item.name, reason: "preservado por você" }); continue; }
    if (item.essential) { excluded.push({ applianceId: item.id, applianceName: item.name, reason: "essencial ou de funcionamento contínuo" }); continue; }
    if (!(item.power > 0) || !(item.usageHours > 0) || item.estimatedCost <= 0) continue;
    const floor = Math.max(0, minHours[item.id] ?? 0);
    const cut = Math.min(item.usageHours - floor, Math.max(1, Math.round(item.usageHours * maxReduction * 2) / 2));
    if (cut <= 0) { excluded.push({ applianceId: item.id, applianceName: item.name, reason: `mínimo de conforto de ${floor} h por dia` }); continue; }
    const sim = simulateForAppliance(item, item.usageHours - cut, snapshot.period.daysElapsed);
    if (sim.savings.monthlyCost <= 0) continue;
    const conservative = sim.scenarios.find((scenario) => scenario.label === "conservador")?.cost ?? sim.savings.monthlyCost;
    candidates.push({
      item,
      action: {
        applianceId: item.id, applianceName: item.name, roomName: item.roomName, kind: "reduce_hours",
        fromHours: item.usageHours, toHours: item.usageHours - cut,
        monthlyKWh: sim.savings.monthlyKWh, monthlyCost: sim.savings.monthlyCost, conservativeCost: conservative,
        effort: effortOf(cut, item.usageHours), source: sim.source,
      },
    });
  }
  // Most savings per hour of change first; ties by total saving.
  candidates.sort((a, b) =>
    b.action.monthlyCost / (b.action.fromHours - b.action.toHours) - a.action.monthlyCost / (a.action.fromHours - a.action.toHours) ||
    b.action.monthlyCost - a.action.monthlyCost);
  const actions: PlanAction[] = [];
  let achieved = 0, achievedConservative = 0;
  for (const { action } of candidates) {
    if (achieved >= gap) break;
    actions.push(action);
    achieved += action.monthlyCost;
    achievedConservative += action.conservativeCost;
  }
  // Never more than the reference itself.
  achieved = Math.min(achieved, reference);
  achievedConservative = Math.min(achievedConservative, achieved);

  // Ideas that need an investment are listed, never counted toward the goal.
  const ideas: PlanIdea[] = [];
  for (const item of snapshot.appliances.filter((entry) => entry.cyclic && entry.power >= 100 && entry.estimatedCost >= 20).slice(0, 2)) {
    const sim = simulateReplacement({ currentPowerW: item.power, newPowerW: Math.round(item.power * 0.7), hours: item.usageHours, daysPerMonth: item.days, rate: item.rate, cyclic: true });
    if (sim.monthlyCost < 1) continue;
    ideas.push({ applianceId: item.id, applianceName: item.name, kind: "replacement", monthlyCost: sim.monthlyCost, note: "Troca por modelo 30% mais eficiente (hipotético). Depende de investimento; não entra na soma do plano." });
  }

  const uncertainty = [
    "Economia simulada pelo cadastro; o resultado real depende do uso.",
  ];
  if (actions.some((action) => action.conservativeCost < action.monthlyCost)) {
    uncertainty.push(`Aparelhos de ciclo podem economizar menos: no cenário conservador o plano soma R$ ${money(achievedConservative).toFixed(2).replace(".", ",")}.`);
  }
  if (statedCurrent !== null && Math.abs(statedCurrent - reference) / Math.max(1, reference) > 0.15) {
    uncertainty.push(`Você informou R$ ${money(statedCurrent).toFixed(2).replace(".", ",")}, mas o cadastro estima R$ ${money(reference).toFixed(2).replace(".", ",")}. O plano usa o valor do cadastro; a diferença pode vir de aparelhos não cadastrados, impostos ou bandeiras.`);
  }
  return {
    version: "plan-1",
    propertyId: snapshot.property.id,
    target,
    statedCurrent,
    reference,
    gap,
    reachable: achieved >= gap,
    achieved,
    achievedConservative,
    remaining: Math.max(0, gap - achieved),
    actions,
    ideas,
    excluded,
    assumptions: [
      "Valor de referência: custo estimado pelas potências, horas e tarifas cadastradas.",
      `Cada aparelho entra no plano uma vez, com corte de até ${Math.round(maxReduction * 100)}% das horas (mínimo de 1 h).`,
      "Aparelhos essenciais, preservados por você ou no mínimo de conforto não entram no corte.",
    ],
    uncertainty,
  };
};

export type ActionStatus = "pending" | "applied" | "skipped";
// Progress of a saved plan against the current registration: an action counts
// as done when the registered hours are at or below the planned hours, or
// when the user marked it.
export const planProgress = (
  plan: { actions: Array<PlanAction & { status?: ActionStatus }> },
  snapshot: PropertySnapshot,
) => plan.actions.map((action) => {
  const item = snapshot.appliances.find((entry) => entry.id === action.applianceId);
  const registered = item ? item.usageHours <= action.toHours : false;
  return {
    applianceId: action.applianceId,
    applianceName: action.applianceName,
    status: action.status ?? "pending",
    registeredHours: item?.usageHours ?? null,
    registeredAtTarget: registered,
    expectedMonthlyCost: action.monthlyCost,
    missing: !item,
  };
});

// "de R$ 350 para R$ 250", "reduzir para R$ 250", "economizar R$ 80".
export const parsePlanRequest = (text: string, reference: number) => {
  const amounts = [...text.toLowerCase().matchAll(/r\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g)]
    .map((match) => Number(match[1].replace(/\./g, "")) + (match[2] ? Number(`0.${match[2]}`) : 0));
  if (!amounts.length) return null;
  const t = text.toLowerCase();
  if (amounts.length >= 2 && /\bde\b[^.]*\bpara\b/.test(t)) return { statedCurrent: amounts[0], target: amounts[1] };
  if (/(economizar|reduzir em|cortar|baixar em|diminuir em)/.test(t) && !/(no maximo|no máximo|para r\$|meta)/.test(t)) {
    return { statedCurrent: null, target: Math.max(0, reference - amounts[0]) };
  }
  return { statedCurrent: null, target: amounts[amounts.length - 1] };
};
