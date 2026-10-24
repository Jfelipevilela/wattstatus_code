import { apiRequest } from "@/lib/api";

export type EnergyDataSource = "measured" | "measured_partial" | "estimated" | "projected" | "simulated" | "unavailable";

export const SOURCE_LABEL: Record<EnergyDataSource, string> = {
  measured: "Medido",
  measured_partial: "Medição parcial",
  estimated: "Estimado",
  projected: "Projeção",
  simulated: "Simulação",
  unavailable: "Sem dados",
};

export interface WattAIContext {
  propertyId?: string;
  roomId?: string;
  applianceId?: string;
  lastIntent?: string;
  lastProposedHours?: number;
  lastReductionHours?: number;
}

export type WattAIAction =
  | { type: "open_property"; label: string; propertyId: string; roomId?: string; applianceId?: string }
  | { type: "open_simulator"; label: string; propertyId: string; applianceId: string; proposedHours?: number }
  | { type: "open_page"; label: string; path: string }
  | { type: "ask"; label: string; message: string };

export interface WattAIMetric { label: string; value: number; unit: "kWh" | "R$" | "%" | "h" | "W" | "dias"; source: EnergyDataSource; coverage?: number }

export interface Scenario { label: string; factor: number; kWh: number; cost: number }
export interface UsageSimulation {
  kind: "usage_reduction";
  source: EnergyDataSource;
  applianceId?: string;
  applianceName?: string;
  power: number;
  effectivePowerW: number;
  currentHours: number;
  proposedHours: number;
  daysPerMonth: number;
  rate: number;
  before: { kWh: number; cost: number };
  after: { kWh: number; cost: number };
  savings: { dailyKWh: number; dailyCost: number; monthlyKWh: number; monthlyCost: number; annualKWh: number; annualCost: number; percent: number };
  scenarios: Scenario[];
  assumptions: string[];
  warnings: string[];
}

export interface Recommendation {
  id: string;
  kind: string;
  title: string;
  description: string;
  reason: string;
  propertyId: string;
  roomId: string | null;
  applianceId: string | null;
  evidence: string[];
  impactMonthly: number | null;
  impactSource: EnergyDataSource;
  effort: string;
  confidence: string;
  nextStep: string;
  state?: string;
  tracking?: { status: string; change: number | null; limitations: string[] } | null;
}

export type WattAICard =
  | { type: "ranking"; title: string; source: EnergyDataSource; items: Array<{ id: string; label: string; sublabel: string | null; kWh: number; cost: number; share: number; kind: "appliance" | "room" | "property" }> }
  | { type: "simulation"; simulation: UsageSimulation | Record<string, unknown> }
  | { type: "budget"; plan: { target: number; current: number; gap: number; reachable: boolean; achieved: number; actions: Array<{ applianceId: string; applianceName: string; roomName: string | null; fromHours: number; toHours: number; monthlyCost: number }>; excluded: Array<{ applianceName: string; reason: string }> } }
  | { type: "forecast"; forecast: { source: EnergyDataSource; kWh: number | null; cost: number | null; low: number | null; high: number | null; method: string } }
  | { type: "recommendations"; items: Recommendation[] }
  | { type: "anomalies"; items: Array<{ id: string; kind: string; title: string; detail: string; severity: string }> }
  | { type: "choices"; title: string; items: Array<{ id: string; label: string; sublabel: string | null }> };

export interface WattAIResponse {
  message: string;
  intent: string;
  context: WattAIContext;
  metrics: WattAIMetric[];
  cards: WattAICard[];
  limitations: string[];
  suggestions: string[];
  actions: WattAIAction[];
  meta: { engine: string; generated: "deterministic" | "llm"; model: string | null; latencyMs: number };
}

export interface Insight { id: string; kind: string; title: string; detail: string; source: EnergyDataSource; applianceId?: string; roomId?: string }
export interface InsightsResponse {
  property: { id: string; name: string } | null;
  insights: Insight[];
  recommendations: Recommendation[];
  forecast?: { status: string; source: EnergyDataSource; cost: number | null };
}

const quiet = { skipErrorToast: true } as const;

export const wattAI = {
  chat: (body: { message: string; context?: WattAIContext; history?: Array<{ role: "user" | "assistant"; content: string }> }, signal?: AbortSignal) =>
    apiRequest<WattAIResponse>("/api/ai/chat", { ...quiet, method: "POST", body: JSON.stringify(body), signal, timeoutMs: 30000 }),
  simulate: (body: { propertyId: string; applianceId: string; proposedHours: number; daysPerMonth?: number; rate?: number }, signal?: AbortSignal) =>
    apiRequest<{ appliance: { id: string; name: string; roomName: string | null; power: number; usageHours: number; days: number; rate: number; cyclic: boolean; measured: boolean }; simulation: UsageSimulation }>(
      "/api/ai/simulate", { ...quiet, method: "POST", body: JSON.stringify(body), signal }),
  insights: (propertyId?: string) =>
    apiRequest<InsightsResponse>(`/api/ai/insights${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ""}`, quiet),
  setRecommendationState: (id: string, state: string, propertyId: string) =>
    apiRequest(`/api/ai/recommendations/${encodeURIComponent(id)}?propertyId=${encodeURIComponent(propertyId)}`, {
      ...quiet, method: "PATCH", body: JSON.stringify({ state }),
    }),
};

export const brl = (value: number, digits = 2) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
export const formatMetric = (metric: WattAIMetric) => {
  if (metric.unit === "R$") return brl(metric.value, metric.source === "projected" ? 0 : 2);
  if (metric.unit === "%") return `${metric.value}%`;
  return `${metric.value.toLocaleString("pt-BR")} ${metric.unit}`;
};

export const aiErrorMessage = (error: unknown) => {
  const status = (error as { status?: number })?.status;
  if (status === 429) return "Muitas perguntas em pouco tempo. Aguarde alguns segundos e tente de novo.";
  if (status === 0) return "Sem conexão com o servidor agora. O restante do WattStatus continua funcionando.";
  if (status && status >= 500) return "O assistente está indisponível no momento. Tente novamente em instantes.";
  return error instanceof Error ? error.message : "Não foi possível responder agora.";
};
