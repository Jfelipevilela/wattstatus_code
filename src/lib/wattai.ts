import { API_BASE, ApiError, apiRequest, getCsrfToken } from "@/lib/api";

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
  | { type: "choices"; title: string; items: Array<{ id: string; label: string; sublabel: string | null }> }
  | { type: "trend"; title: string; points: Array<{ month: string; estimatedKWh: number; estimatedCost: number; measuredKWh: number | null }> }
  | { type: "comparison"; title: string; source: EnergyDataSource; items: Array<{ label: string; value: number; unit: "kWh" | "R$" | "%" }> };

export interface WattAIResponse {
  message: string;
  intent: string;
  context: WattAIContext;
  conversationId?: string | null;
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

// ---------------------------------------------------------------- phase 2

export type ChatStage = "context" | "data" | "compute" | "narrate";
export const STAGE_LABEL: Record<ChatStage, string> = {
  context: "Verificando o contexto…",
  data: "Consultando seus aparelhos e medições…",
  compute: "Calculando…",
  narrate: "Redigindo a resposta…",
};
export interface ChartRequest { kind: "consumption_trend"; propertyId?: string; year: number; month: number }
export interface ChatBody {
  message: string;
  context?: WattAIContext;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  conversationId?: string;
  chart?: ChartRequest;
}

// Streams progress stages, then the validated response. Numbers only arrive
// in the final response, after the backend has checked them.
export const streamChat = async (body: ChatBody, onStage: (stage: ChatStage) => void, signal?: AbortSignal): Promise<WattAIResponse> => {
  const response = await fetch(`${API_BASE}/api/ai/chat/stream`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": await getCsrfToken() },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, typeof data.error === "string" ? data.error : "Não foi possível responder agora.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const event = chunk.match(/^event: (\w+)/m)?.[1];
      const data = chunk.match(/^data: (.*)$/m)?.[1];
      if (!event || !data) continue;
      const parsed = JSON.parse(data);
      if (event === "stage") onStage(parsed.stage);
      if (event === "response") return parsed as WattAIResponse;
      if (event === "error") throw new ApiError(parsed.status ?? 500, parsed.error ?? "Não foi possível responder agora.");
    }
  }
  throw new ApiError(0, "A resposta foi interrompida.");
};

export interface AIPreferences {
  monthlyGoal?: number | null;
  monthlyKWhGoal?: number | null;
  primaryPropertyId?: string | null;
  essentialApplianceIds?: string[];
  maxReductionPercent?: number;
  minHoursByAppliance?: Record<string, number>;
  comfortNotes?: string;
  recommendationCategories?: string[];
  proactiveInsights?: boolean;
  alertFrequency?: "off" | "daily" | "weekly";
  alertCategories?: string[];
  conversationRetentionDays?: 0 | 7 | 30 | 90;
}
export interface AIStatus { enabled: boolean; generative: boolean; admin: boolean; experimental: Record<string, boolean> }
export interface ConversationSummary { id: string; title: string; updatedAt: string; propertyId?: string | null }
export interface AlertItem { key: string; kind: string; title: string; detail: string; createdAt: string; propertyId: string }

export const wattAIAccount = {
  status: () => apiRequest<AIStatus>("/api/ai/status", quiet),
  preferences: () => apiRequest<{ preferences: AIPreferences }>("/api/ai/preferences", quiet).then((data) => data.preferences),
  savePreferences: (patch: AIPreferences) =>
    apiRequest<{ preferences: AIPreferences }>("/api/ai/preferences", { method: "PUT", body: JSON.stringify(patch) }).then((data) => data.preferences),
  deleteData: () => apiRequest("/api/ai/data", { method: "DELETE", body: "{}" }),
  conversations: () => apiRequest<{ conversations: ConversationSummary[] }>("/api/ai/conversations", quiet).then((data) => data.conversations),
  conversation: (id: string) =>
    apiRequest<{ conversation: { id: string; title: string; messages: Array<{ role: "user" | "assistant"; content: string; response?: WattAIResponse }> } }>(`/api/ai/conversations/${encodeURIComponent(id)}`, quiet)
      .then((data) => data.conversation),
  deleteConversation: (id: string) => apiRequest(`/api/ai/conversations/${encodeURIComponent(id)}`, { ...quiet, method: "DELETE", body: "{}" }),
  alerts: () => apiRequest<{ alerts: AlertItem[] }>("/api/ai/alerts", quiet).then((data) => data.alerts),
  evaluateAlerts: () => apiRequest<{ created: AlertItem[]; skipped?: string }>("/api/ai/alerts/evaluate", { method: "POST", body: "{}" }),
  reportSummary: (year: number, month: number, propertyId?: string) =>
    apiRequest<{ property: { id: string; name: string }; lines: string[]; quality: string }>(
      `/api/ai/report-summary?year=${year}&month=${month}${propertyId ? `&propertyId=${encodeURIComponent(propertyId)}` : ""}`, quiet),
  adminSettings: () => apiRequest<{ settings: Record<string, unknown>; effective: Record<string, unknown>; allowedModels: string[] }>("/api/ai/admin/settings", quiet),
  saveAdminSettings: (patch: Record<string, unknown>) => apiRequest("/api/ai/admin/settings", { method: "PUT", body: JSON.stringify(patch) }),
  adminUsage: (days = 30) => apiRequest<{ usage: Record<string, unknown> }>(`/api/ai/admin/usage?days=${days}`, quiet),
};
