// Controlled tool orchestration for multi-step investigations. Tools are pure
// functions over a snapshot already loaded for the signed-in user: they never
// query the database, never take ids from the model, and each runs at most
// once per investigation, inside an explicit budget.
import { z } from "zod";
import {
  PropertySnapshot, EnergyDataSource, comparePeriods, detectAnomalies, measuredSource, kwh, money, brlRate,
} from "./ai.engine";
import { buildSavingsPlan, PlanOptions, SavingsPlan } from "./ai.plans";

export const TOOL_NAMES = [
  "period_comparison", "top_consumers", "measurement_coverage", "appliance_changes",
  "registration_changes", "room_breakdown", "anomalies", "savings_plan",
] as const;
export type ToolName = typeof TOOL_NAMES[number];

export interface Finding {
  id: string;
  tool: ToolName;
  text: string;
  evidence: EnergyDataSource;
  // high: measured and comparable; medium: estimated from the registration; low: weak signal.
  confidence: "alta" | "media" | "baixa";
  applianceId?: string;
  roomId?: string;
}
export interface ToolStep { tool: ToolName; ok: boolean; ms: number; findings: Finding[]; skipped?: string }
export interface InvestigationBudget { maxCalls: number; maxMs: number; maxDepth: number }
export const DEFAULT_BUDGET: InvestigationBudget = { maxCalls: 8, maxMs: 1500, maxDepth: 2 };

export interface ToolContext {
  snapshot: PropertySnapshot;
  planTarget?: number | null;
  planOptions?: PlanOptions;
  // Outputs of earlier steps, for the tools that build on them.
  results: Map<ToolName, Finding[]>;
  plan?: SavingsPlan;
}

// Tools that read earlier results sit one level deeper.
const DEPTH: Record<ToolName, number> = {
  period_comparison: 1, top_consumers: 1, measurement_coverage: 1, appliance_changes: 1,
  registration_changes: 1, anomalies: 1, savings_plan: 1, room_breakdown: 2,
};

const pct = (value: number) => `${Math.round(value * 100)}%`;

const TOOLS: Record<ToolName, (ctx: ToolContext) => Finding[]> = {
  period_comparison: ({ snapshot }) => {
    const comparison = comparePeriods(snapshot);
    if (comparison.status !== "ok" || comparison.change === null) {
      return [{ id: "period:none", tool: "period_comparison", evidence: "unavailable", confidence: "baixa",
        text: `Não há medições suficientes para comparar com o mês anterior (${comparison.currentDays} dia(s) medidos neste mês, ${comparison.previousDays} no anterior).` }];
    }
    const direction = Math.abs(comparison.change) < 0.05 ? "estável" : comparison.change > 0 ? "maior" : "menor";
    return [{
      id: "period:measured", tool: "period_comparison", evidence: comparison.source, confidence: comparison.source === "measured" ? "alta" : "media",
      text: `A média diária medida neste mês é ${kwh(comparison.currentPerDay!)} kWh, ${direction === "estável" ? "estável em relação ao" : `${pct(Math.abs(comparison.change))} ${direction} que o`} mês anterior (${kwh(comparison.previousPerDay!)} kWh/dia).`,
    }];
  },
  top_consumers: ({ snapshot }) => snapshot.appliances.filter((item) => item.estimatedCost > 0).slice(0, 3).map((item, index) => ({
    id: `top:${item.id}`, tool: "top_consumers", evidence: "estimated", confidence: "media", applianceId: item.id, roomId: item.roomId ?? undefined,
    text: `${index + 1}º maior custo estimado: ${item.name} (R$ ${brlRate(money(item.estimatedCost))} por mês, ${pct(item.share)} do imóvel).`,
  })),
  measurement_coverage: ({ snapshot }) => {
    const { measuredApplianceCount, applianceCount, coverage } = snapshot.totals;
    return [{
      id: "coverage", tool: "measurement_coverage", evidence: measuredSource(snapshot), confidence: "alta",
      text: measuredApplianceCount
        ? `${measuredApplianceCount} de ${applianceCount} aparelhos têm leituras neste mês, cerca de ${pct(coverage)} do consumo estimado.`
        : `Nenhum dos ${applianceCount} aparelhos tem leitura neste mês: as conclusões dependem do cadastro.`,
    }];
  },
  appliance_changes: ({ snapshot }) => {
    const out: Finding[] = [];
    for (const item of snapshot.appliances) {
      if (item.measuredKWh === null || item.previousMeasuredKWh === null || item.measuredDays < 3 || item.previousMeasuredDays < 7) continue;
      const now = item.measuredKWh / item.measuredDays;
      const before = item.previousMeasuredKWh / item.previousMeasuredDays;
      if (before <= 0) continue;
      const change = (now - before) / before;
      if (Math.abs(change) < 0.2 || Math.abs(now - before) < 0.3) continue;
      out.push({
        id: `change:${item.id}`, tool: "appliance_changes", evidence: "measured", confidence: "alta", applianceId: item.id, roomId: item.roomId ?? undefined,
        text: `${item.name}: média medida de ${kwh(now)} kWh/dia neste mês contra ${kwh(before)} kWh/dia no anterior (${change > 0 ? "+" : "−"}${pct(Math.abs(change))}).`,
      });
    }
    return out.sort((a, b) => (b.text.includes("+") ? 1 : 0) - (a.text.includes("+") ? 1 : 0));
  },
  registration_changes: ({ snapshot }) => {
    const previousStart = new Date(new Date(snapshot.period.start).getTime() - snapshot.period.previousDays * 86400000).toISOString();
    return snapshot.appliances
      .filter((item) => item.createdAt >= previousStart && item.estimatedCost > 0)
      .slice(0, 3)
      .map((item) => ({
        id: `new:${item.id}`, tool: "registration_changes", evidence: "estimated", confidence: "media", applianceId: item.id, roomId: item.roomId ?? undefined,
        text: `${item.name} foi cadastrado recentemente (${item.createdAt.slice(0, 10)}) e soma R$ ${brlRate(money(item.estimatedCost))} por mês à estimativa.`,
      }));
  },
  room_breakdown: ({ snapshot, results }) => {
    const involved = new Set([...(results.get("appliance_changes") ?? []), ...(results.get("top_consumers") ?? [])].map((finding) => finding.roomId).filter(Boolean));
    const rooms = snapshot.rooms.filter((room) => room.applianceCount > 0 && (involved.size === 0 || involved.has(room.id))).slice(0, 2);
    return rooms.map((room) => ({
      id: `room:${room.id}`, tool: "room_breakdown", evidence: "estimated", confidence: "media", roomId: room.id,
      text: `${room.name} responde por ${pct(room.share)} do custo estimado (R$ ${brlRate(money(room.estimatedCost))} por mês).`,
    }));
  },
  anomalies: ({ snapshot }) => detectAnomalies(snapshot).slice(0, 3).map((anomaly) => ({
    id: `anomaly:${anomaly.id}`, tool: "anomalies", applianceId: anomaly.applianceId,
    evidence: anomaly.kind === "measurement_gap" ? "unavailable" : "measured",
    confidence: anomaly.kind === "measurement_gap" ? "baixa" : "alta",
    text: `${anomaly.title}: ${anomaly.detail}`,
  })),
  savings_plan: (ctx) => {
    if (ctx.planTarget === null || ctx.planTarget === undefined) return [];
    ctx.plan = buildSavingsPlan(ctx.snapshot, ctx.planTarget, ctx.planOptions);
    const plan = ctx.plan;
    if (plan.gap <= 0) return [{ id: "plan:ok", tool: "savings_plan", evidence: "estimated", confidence: "media", text: `O custo estimado (R$ ${brlRate(money(plan.reference))}) já está dentro da meta.` }];
    return [{
      id: "plan", tool: "savings_plan", evidence: "simulated", confidence: "media",
      text: plan.reachable
        ? `Um plano com ${plan.actions.length} mudança(s) soma cerca de R$ ${brlRate(money(plan.achieved))} por mês, o que cobre a redução de R$ ${brlRate(money(plan.gap))}.`
        : `As mudanças permitidas somam R$ ${brlRate(money(plan.achieved))} por mês; faltam R$ ${brlRate(money(plan.remaining))} para a meta sem mexer em aparelhos protegidos.`,
    }];
  },
};

// Deterministic plan for a question; a model may propose one instead, but it
// is validated against the same whitelist and budget.
export const defaultPlan = (hasTarget: boolean): ToolName[] => [
  "measurement_coverage", "period_comparison", "appliance_changes", "registration_changes",
  "top_consumers", "room_breakdown", "anomalies", ...(hasTarget ? ["savings_plan" as const] : []),
];

// Names are free strings here; sanitizePlan keeps only whitelisted tools.
export const modelPlanSchema = z.object({ tools: z.array(z.string().max(40)).min(1).max(12) }).strict();

export const sanitizePlan = (tools: readonly string[], budget: InvestigationBudget, hasTarget: boolean): ToolName[] => {
  const unique: ToolName[] = [];
  for (const name of tools) {
    if (!(TOOL_NAMES as readonly string[]).includes(name)) continue;
    const tool = name as ToolName;
    if (unique.includes(tool) || DEPTH[tool] > budget.maxDepth) continue;
    if (tool === "savings_plan" && !hasTarget) continue;
    unique.push(tool);
  }
  // Coverage always runs: no conclusion is shown without knowing data quality.
  if (!unique.includes("measurement_coverage")) unique.unshift("measurement_coverage");
  return unique.slice(0, budget.maxCalls);
};

export interface Investigation {
  steps: ToolStep[];
  findings: Finding[];
  conclusion: string;
  insufficient: boolean;
  plan?: SavingsPlan;
  budget: InvestigationBudget & { callsUsed: number; msUsed: number };
}

export const runInvestigation = (
  snapshot: PropertySnapshot,
  tools: ToolName[],
  options: { budget?: InvestigationBudget; planTarget?: number | null; planOptions?: PlanOptions; now?: () => number } = {},
): Investigation => {
  const budget = options.budget ?? DEFAULT_BUDGET;
  const clock = options.now ?? (() => performance.now());
  const started = clock();
  const ctx: ToolContext = { snapshot, planTarget: options.planTarget, planOptions: options.planOptions, results: new Map() };
  const steps: ToolStep[] = [];
  // Run shallow tools first so deeper ones see their results.
  const ordered = [...tools].sort((a, b) => DEPTH[a] - DEPTH[b]);
  for (const tool of ordered) {
    if (steps.length >= budget.maxCalls) { steps.push({ tool, ok: false, ms: 0, findings: [], skipped: "limite de chamadas" }); continue; }
    if (clock() - started > budget.maxMs) { steps.push({ tool, ok: false, ms: 0, findings: [], skipped: "limite de tempo" }); continue; }
    const t0 = clock();
    try {
      const findings = TOOLS[tool](ctx);
      ctx.results.set(tool, findings);
      steps.push({ tool, ok: true, ms: clock() - t0, findings });
    } catch {
      steps.push({ tool, ok: false, ms: clock() - t0, findings: [], skipped: "falha" });
    }
  }
  const findings = steps.flatMap((step) => step.findings);
  const measuredChange = ctx.results.get("period_comparison")?.find((finding) => finding.id === "period:measured");
  const changes = ctx.results.get("appliance_changes") ?? [];
  const registrations = ctx.results.get("registration_changes") ?? [];
  let conclusion: string;
  let insufficient = false;
  if (measuredChange && changes.length) {
    conclusion = `As leituras mostram onde a mudança se concentra: ${changes.slice(0, 2).map((finding) => finding.text.split(":")[0]).join(" e ")}. Isso indica onde olhar primeiro; os dados não provam a causa.`;
  } else if (measuredChange) {
    conclusion = "As leituras mostram a variação total, mas nenhum aparelho medido concentra a mudança. Aparelhos sem medição podem estar envolvidos.";
  } else if (registrations.length) {
    conclusion = `Não há medições para confirmar um aumento real. No cadastro, a estimativa subiu com ${registrations.map((finding) => finding.text.split(" foi")[0]).join(" e ")}.`;
  } else {
    insufficient = true;
    conclusion = "Não tenho informações suficientes para determinar o motivo: não há medições comparáveis nem mudanças recentes no cadastro. Mostro abaixo os maiores custos estimados.";
  }
  return {
    steps, findings, conclusion, insufficient, plan: ctx.plan,
    budget: { ...budget, callsUsed: steps.filter((step) => step.ok).length, msUsed: clock() - started },
  };
};
