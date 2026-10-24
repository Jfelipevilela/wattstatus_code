// Controlled orchestrator: intent and entities are resolved deterministically,
// the engine computes every number, and the model (when enabled) only rewrites
// the computed answer in natural language. A model answer that introduces a
// number not present in the facts is discarded.
import type { ApplianceRecord, PropertyRecord, RoomRecord } from "../../types";
import type { EnergyInterval } from "../energy/energy-history";
import {
  ENGINE_VERSION, PropertySnapshot, ApplianceFacts, buildSnapshot, monthPeriod, normalize, kwh, money,
  forecastMonth, comparePeriods, detectAnomalies, buildRecommendations, simulateForAppliance, planBudget,
  simulateReplacement, measuredSource, EnergyDataSource, brlRate,
  buildTrend, explainTrend, zonedDay, zonedMidnight, type ChartExplanation, type MonthPeriod,
} from "./ai.engine";
import type { ChatContext, ChatRequest, WattAIAction, WattAICard, WattAIMetric, WattAIResponse } from "./ai.schemas";
import { responseSchema, preferencesSchema } from "./ai.schemas";
import type { z } from "zod";
import { AIConfig, ModelProvider, completeWithLimits } from "./ai.provider";
import { SYSTEM_PROMPT, narrationPrompt, classificationPrompt, investigationPlanPrompt } from "./ai.prompts";
import { validateNarration, type GuardFacts, type GuardViolation } from "./ai.guard";
import { ageText, freshnessSentence, FRESHNESS_LABEL, type CollectionStatus, type FreshnessState } from "./ai.freshness";
import { buildSavingsPlan, parsePlanRequest } from "./ai.plans";
import { DEFAULT_BUDGET, defaultPlan, modelPlanSchema, runInvestigation, sanitizePlan, TOOL_NAMES, type Investigation, type ToolName } from "./ai.tools";

export interface AIDataSource {
  listProperties(userId: string): Promise<PropertyRecord[]>;
  listRooms(userId: string, propertyId: string): Promise<RoomRecord[]>;
  listAppliances(userId: string): Promise<ApplianceRecord[]>;
  getEnergyHistory(userId: string, start: Date, end: Date): Promise<EnergyInterval[]>;
  // Stored collection status (docs/COLETA_ENERGIA.md § 7). Optional: without
  // it the assistant keeps working and simply does not claim freshness.
  getCollectionStatus?(userId: string): Promise<CollectionStatus | null>;
}

export type AIPreferences = z.infer<typeof preferencesSchema>;

export type Intent =
  | "greeting" | "property_summary" | "top_consumers" | "room_ranking" | "appliance_detail"
  | "forecast" | "compare_periods" | "coverage" | "anomalies" | "recommendations"
  | "simulate_reduction" | "simulate_annual" | "simulate_replacement" | "budget"
  | "compare_properties" | "device_command" | "explain_chart" | "investigate" | "compare_appliances" | "unknown";

export const INTENTS: Intent[] = [
  "greeting", "property_summary", "top_consumers", "room_ranking", "appliance_detail", "forecast",
  "compare_periods", "coverage", "anomalies", "recommendations", "simulate_reduction", "simulate_annual",
  "simulate_replacement", "budget", "compare_properties", "device_command", "explain_chart", "investigate", "compare_appliances", "unknown",
];

// ---------------------------------------------------------------- parsing

const WORD_NUMBERS: Record<string, number> = {
  meia: 0.5, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};
const NUM = "(\\d+(?:[.,]\\d+)?|meia|uma?|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)";
const toNumber = (raw: string) => WORD_NUMBERS[raw] ?? Number(raw.replace(",", "."));

export const parseMoney = (text: string): number | null => {
  const match = normalize(text).match(/r\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/);
  if (!match) return null;
  return Number(match[1].replace(/\./g, "")) + (match[2] ? Number(`0.${match[2]}`) : 0);
};

export const parseHours = (text: string) => {
  const t = normalize(text);
  const reduce = t.match(new RegExp(`${NUM}\\s*(?:h\\b|horas?)\\s*(?:a\\s*)?(?:menos|antes)`));
  if (reduce) return { reduceBy: toNumber(reduce[1]) };
  const reduce2 = t.match(new RegExp(`(?:reduz\\w*|diminu\\w*|cortar|tirar)\\s*(?:\\w+\\s){0,4}?(?:em\\s)?${NUM}\\s*(?:h\\b|horas?)`));
  if (reduce2) return { reduceBy: toNumber(reduce2[1]) };
  const target = t.match(new RegExp(`(?:usar|usando|ligar|ligado)\\s*(?:\\w+\\s){0,4}?(?:por\\s|so\\s|apenas\\s)?${NUM}\\s*(?:h\\b|horas?)\\s*(?:por dia|ao dia|diarias)?`));
  if (target && !/menos|antes/.test(t)) return { target: toNumber(target[1]) };
  const percent = t.match(/(\d{1,2})\s*%/);
  if (percent && /(reduz|diminu|menos|cortar)/.test(t)) return { percent: Number(percent[1]) / 100 };
  return null;
};

export const classifyIntent = (text: string, context?: ChatContext): Intent => {
  const t = normalize(text);
  const hours = parseHours(text);
  // Out of reach of the user's data: other places, weather, future years.
  const years = (t.match(/\b20\d\d\b/g) ?? []).map(Number);
  if (years.some((year) => year > new Date().getFullYear()) ||
      /(vizinh|outros? (pais|paises|cidades?)|no japao|nos eua|na europa|clima|previsao do tempo|bandeira (do|no) proximo|bitcoin|acoes)/.test(t)) {
    return "unknown";
  }
  if (/\b(liga|desliga|ligue|desligue|acione|acender|apagar)\b/.test(t) && !/quanto|economi|se eu/.test(t)) return "device_command";
  if (/(em|por|num) (um )?ano|anual/.test(t) && (context?.lastIntent?.startsWith("simulate") || /economiz/.test(t)) && !hours) return "simulate_annual";
  if (hours && /(economi|menos|reduz|diminu|se eu|quanto|antes|cortar)/.test(t)) return "simulate_reduction";
  if (hours && context?.lastIntent?.startsWith("simulate")) return "simulate_reduction";
  if (/(descubr|investig|qual (o|e o) motivo|por que .*(conta|consumo|gasto).*(aument|subiu|alta|cara)|(conta|consumo|gasto).*(aumentou muito|subiu muito|disparou|esta (muito )?alta))/.test(t)) return "investigate";
  if (/(trocar|substituir|troca|mais eficiente|inverter|novo modelo)/.test(t)) return "simulate_replacement";
  if (/\bcompar/.test(t) && /\b(e|com|x|versus|vs)\b/.test(t) && !/(imove|ambiente|comodo|mes|periodo)/.test(t)) return "compare_appliances";
  if (/(plano de economia|de r\$ ?\d[\d.,]* para r\$ ?\d)/.test(t) && parseMoney(text) !== null) return "budget";
  if (/(no maximo|meta|orcamento|limite de|reduzir (a |minha )?conta|economizar r\$|baixar (a |minha )?conta)/.test(t) && parseMoney(text) !== null) return "budget";
  if (/(dois imoveis|imoveis|outra casa|cada imovel)/.test(t) && /(compar|qual|diferen|versus|vs)/.test(t)) return "compare_properties";
  if (/(anomal|estranh|fora do (padrao|normal)|incomum|investig|pico|alteracao)/.test(t)) return "anomalies";
  if (/(sem medi|medicao|medidos?|cobertura|sem leitura|leituras?)/.test(t)) return "coverage";
  if (/(prev|previsao|fim do mes|deve gastar|vou gastar|conta deste mes|conta do mes|quanto (vou|vai))/.test(t)) return "forecast";
  if (/(mes passado|aument|diminuiu|caiu|mudou|semana|tendencia|evolu|comparad)/.test(t)) return "compare_periods";
  if (/(ambientes?|comodos?|comodo)/.test(t) && /(caro|gasta|consom|compar|mais|ranking|tres|3)/.test(t)) return "room_ranking";
  if (/(economi|dica|habito|melhorar|recomend|reduzir|atencao|o que (posso|devo))/.test(t)) return "recommendations";
  if (/(qual|quais|que) .*(aparelho|equipamento|dispositivo).*(mais|maior)|(mais|maior) (gast|consum)|maiores consumidores|top/.test(t)) return "top_consumers";
  if (/analis/.test(t)) return "property_summary";
  if (/(gasta muito|consome muito|quanto .{0,40}?(gasta|consome|custa|consumindo|gastando)|consumo (atual )?d[aoe])/.test(t)) return "appliance_detail";
  if (/(analis|resum|como esta|situacao|minha casa|meu imovel|conta (esta )?alta|por que)/.test(t)) return "property_summary";
  if (/^(oi|ola|bom dia|boa tarde|boa noite|ajuda|help|e ai)\b/.test(t)) return "greeting";
  return "unknown";
};

const SYNONYMS: Array<[RegExp, string[]]> = [
  [/\btv\b|televis/, ["tv", "televis", "smart tv"]],
  [/\bar\b|ar.?condicionado|split/, ["ar condicionado", "ar-condicionado", "split", "ar "]],
  [/geladeira|refrigerador/, ["geladeira", "refrigerador"]],
  [/chuveiro/, ["chuveiro"]],
  [/computador|\bpc\b|notebook/, ["computador", "pc", "notebook"]],
  [/microondas|micro-ondas/, ["microondas", "micro-ondas", "micro ondas"]],
  [/maquina de lavar|lavadora/, ["lavar", "lavadora"]],
  [/secadora/, ["secadora"]],
];

// Appliances mentioned by name or common synonym, optionally inside a room.
export const matchAppliances = (text: string, snapshot: PropertySnapshot): ApplianceFacts[] => {
  const t = ` ${normalize(text)} `;
  const roomHits = snapshot.rooms.filter((room) => normalize(room.name).length > 2 && t.includes(normalize(room.name)));
  const scoped = (list: ApplianceFacts[]) => {
    if (!roomHits.length) return list;
    const inRoom = list.filter((item) => roomHits.some((room) => room.id === item.roomId));
    return inRoom.length ? inRoom : list;
  };
  const exact = snapshot.appliances.filter((item) => {
    const name = normalize(item.name);
    return name.length > 1 && t.includes(` ${name} `.replace(/\s+/g, " "));
  });
  if (exact.length) return scoped(exact);
  for (const [pattern, keys] of SYNONYMS) {
    if (!pattern.test(t)) continue;
    const hits = snapshot.appliances.filter((item) => keys.some((key) => ` ${normalize(item.name)} `.includes(key)));
    if (hits.length) return scoped(hits);
  }
  const words = t.split(" ").filter((word) => word.length >= 4);
  const partial = snapshot.appliances.filter((item) => normalize(item.name).split(" ").some((part) => part.length >= 4 && words.includes(part)));
  return scoped(partial);
};

export const matchRooms = (text: string, snapshot: PropertySnapshot) => {
  const t = normalize(text);
  return snapshot.rooms.filter((room) => normalize(room.name).length > 2 && t.includes(normalize(room.name)));
};

const PRONOUN = /\b(ele|ela|dele|dela|esse|essa|este|esta|nele|nela|o mesmo|a mesma)\b/;

// ---------------------------------------------------------------- formatting

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brlRound = (value: number) => brl(Math.round(value));
const pct = (value: number) => `${Math.round(value * 100)}%`;
const kwhText = (value: number) => `${kwh(value).toLocaleString("pt-BR")} kWh`;
const hoursText = (value: number) => `${value.toLocaleString("pt-BR")} h`;
// eslint-disable-next-line no-control-regex -- strips control characters from user-provided names
const safeName = (value: string) => value.replace(/[\u0000-\u001f<>`]/g, "").slice(0, 60);

const SOURCE_NOTE: Record<EnergyDataSource, string> = {
  measured: "medido",
  measured_partial: "medição parcial",
  estimated: "estimado pelo cadastro",
  projected: "projeção",
  simulated: "simulação",
  unavailable: "sem dados",
};

interface Draft {
  intent: Intent;
  message: string;
  metrics: WattAIMetric[];
  cards: WattAICard[];
  limitations: string[];
  suggestions: string[];
  actions: WattAIAction[];
  context: ChatContext;
  facts: Record<string, unknown>;
  // Structured qualitative claims a rewrite may make (see ai.guard).
  claims?: GuardFacts["claims"];
  // Freshness chips for the UI (only the devices the answer is about).
  dataQuality?: Array<{ applianceId: string; name: string; state: FreshnessState; label: string; lastReadingAt: string | null; age: string | null }>;
  complex?: boolean;
}

const estimatedLimitation = (snapshot: PropertySnapshot) => {
  const source = measuredSource(snapshot);
  if (source === "unavailable") return "Valores estimados pela potência e horas de uso cadastradas; nenhum aparelho deste imóvel tem medição real neste mês.";
  if (source === "measured_partial") {
    return `Só ${snapshot.totals.measuredApplianceCount} de ${snapshot.totals.applianceCount} aparelhos têm medição; o total medido não representa a casa inteira.`;
  }
  return null;
};

const openAppliance = (snapshot: PropertySnapshot, item: ApplianceFacts): WattAIAction => ({
  type: "open_property", label: `Ver ${safeName(item.name)} na planta`.slice(0, 80),
  propertyId: snapshot.property.id, ...(item.roomId ? { roomId: item.roomId } : {}), applianceId: item.id,
});
const openSimulator = (snapshot: PropertySnapshot, item: ApplianceFacts, proposedHours?: number): WattAIAction => ({
  type: "open_simulator", label: "Ajustar no simulador", propertyId: snapshot.property.id, applianceId: item.id,
  ...(proposedHours !== undefined ? { proposedHours } : {}),
});

const applianceRanking = (snapshot: PropertySnapshot, items: ApplianceFacts[], title: string): WattAICard => ({
  type: "ranking", title, source: "estimated",
  items: items.map((item) => ({
    id: item.id, label: safeName(item.name), sublabel: item.roomName ? safeName(item.roomName) : null,
    kWh: kwh(item.estimatedKWh), cost: money(item.estimatedCost), share: item.share, kind: "appliance" as const,
  })),
});

// ---------------------------------------------------------------- handlers

const emptyDraft = (intent: Intent, snapshot: PropertySnapshot | null, context: ChatContext): Draft => ({
  intent, message: "", metrics: [], cards: [], limitations: [], suggestions: [], actions: [],
  context: { ...context, ...(snapshot ? { propertyId: snapshot.property.id } : {}), lastIntent: intent }, facts: {},
});

const noAppliances = (draft: Draft, snapshot: PropertySnapshot) => {
  draft.message = `O imóvel "${safeName(snapshot.property.name)}" ainda não tem aparelhos cadastrados. Cadastre os aparelhos com potência e horas de uso para que eu possa analisar o consumo.`;
  draft.actions.push({ type: "open_page", label: "Cadastrar aparelhos", path: "/aparelhos" });
  draft.limitations.push("Sem aparelhos não há consumo estimado nem medido para analisar.");
  return draft;
};

export const handleIntent = (
  intent: Intent,
  request: ChatRequest,
  snapshot: PropertySnapshot,
  all: { snapshots: PropertySnapshot[]; preferences: AIPreferences; chart?: ChartExplanation; investigation?: Investigation },
): Draft => {
  const context = request.context ?? {};
  const draft = emptyDraft(intent, snapshot, context);
  const { totals } = snapshot;
  const limitation = estimatedLimitation(snapshot);
  const essential = new Set(all.preferences.essentialApplianceIds ?? []);
  const needsAppliances = !["greeting", "compare_properties", "device_command", "unknown"].includes(intent);
  if (needsAppliances && totals.applianceCount === 0) return noAppliances(draft, snapshot);

  const resolveAppliance = (): ApplianceFacts | ApplianceFacts[] | null => {
    const hits = matchAppliances(request.message, snapshot);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      // A pronoun or a previous pick settles the ambiguity.
      const previous = hits.find((item) => item.id === context.applianceId);
      return previous ?? hits;
    }
    if (context.applianceId && (PRONOUN.test(normalize(request.message)) || !matchRooms(request.message, snapshot).length)) {
      return snapshot.appliances.find((item) => item.id === context.applianceId) ?? null;
    }
    return null;
  };
  const ambiguity = (hits: ApplianceFacts[]) => {
    draft.message = `Encontrei ${hits.length} aparelhos que combinam com a pergunta. Qual deles?`;
    draft.cards.push({
      type: "choices", title: "Escolha o aparelho",
      items: hits.map((item) => ({ id: item.id, label: safeName(item.name), sublabel: item.roomName ? safeName(item.roomName) : null })),
    });
    for (const item of hits.slice(0, 4)) {
      draft.actions.push({ type: "ask", label: `${safeName(item.name)}${item.roomName ? ` (${safeName(item.roomName)})` : ""}`.slice(0, 80), message: `${request.message} — ${item.name}${item.roomName ? ` do ${item.roomName}` : ""}`.slice(0, 200) });
    }
    draft.context.lastIntent = intent;
    return draft;
  };

  switch (intent) {
    case "greeting": {
      const top = snapshot.appliances[0];
      draft.message = top && top.estimatedCost > 0
        ? `Olá! Posso analisar o consumo de "${safeName(snapshot.property.name)}", achar oportunidades de economia ou simular mudanças na rotina. Hoje o maior custo estimado é ${safeName(top.name)}, com ${brl(money(top.estimatedCost))} por mês. O que você quer descobrir?`
        : "Olá! Posso analisar o consumo da sua casa, identificar oportunidades de economia ou simular mudanças na sua rotina. O que você gostaria de descobrir?";
      draft.suggestions.push("Analisar minha casa", "Onde posso economizar?", "Prever a conta deste mês", "Comparar ambientes");
      return draft;
    }
    case "property_summary": {
      // "Analisar o consumo da sala": a named room narrows the analysis.
      const room = matchRooms(request.message, snapshot)[0];
      if (room) {
        const inRoom = snapshot.appliances.filter((item) => item.roomId === room.id);
        const roomRank = snapshot.rooms.findIndex((item) => item.id === room.id) + 1;
        draft.context.roomId = room.id;
        if (!inRoom.length) {
          draft.message = `${safeName(room.name)} não tem aparelhos cadastrados. Atribua aparelhos a este ambiente para analisar o consumo.`;
          draft.actions.push({ type: "open_property", label: "Abrir a planta", propertyId: snapshot.property.id, roomId: room.id });
          break;
        }
        const first = inRoom[0];
        draft.message = `${safeName(room.name)} tem ${inRoom.length} aparelho(s), com custo estimado de ${brl(money(room.estimatedCost))} e ${kwhText(room.estimatedKWh)} por mês: ${pct(room.share)} do imóvel, o ${roomRank}º ambiente mais caro. O maior custo aqui é ${safeName(first.name)} (${brl(money(first.estimatedCost))}).`
          + (room.measuredKWh > 0 ? ` Medido neste mês: ${kwhText(room.measuredKWh)}.` : "");
        draft.metrics.push(
          { label: `Custo de ${safeName(room.name)}`.slice(0, 80), value: money(room.estimatedCost), unit: "R$", source: "estimated" },
          { label: "Participação no imóvel", value: Math.round(room.share * 100), unit: "%", source: "estimated" },
        );
        draft.cards.push(applianceRanking(snapshot, inRoom.slice(0, 5), `Aparelhos em ${safeName(room.name)}`));
        draft.actions.push(openAppliance(snapshot, first), openSimulator(snapshot, first));
        draft.suggestions.push(`O que posso melhorar em ${safeName(room.name)}?`.slice(0, 120), "E se eu usar ele 1 hora a menos?");
        draft.context.applianceId = first.id;
        break;
      }
      const top = snapshot.appliances.slice(0, 3);
      const topRoom = snapshot.rooms.find((room) => room.applianceCount > 0);
      draft.message = [
        `"${safeName(snapshot.property.name)}" tem ${totals.applianceCount} aparelho(s) cadastrados, com custo estimado de ${brl(money(totals.estimatedCost))} e ${kwhText(totals.estimatedKWh)} por mês.`,
        top.length ? `Os maiores custos são ${top.map((item) => `${safeName(item.name)} (${pct(item.share)})`).join(", ")}.` : "",
        topRoom ? `O ambiente mais caro é ${safeName(topRoom.name)}, com ${pct(topRoom.share)} do total.` : "",
        totals.measuredApplianceCount ? `${totals.measuredApplianceCount} aparelho(s) têm medição real neste mês, somando ${kwhText(totals.measuredKWh)}.` : "",
      ].filter(Boolean).join(" ");
      draft.metrics.push(
        { label: "Custo estimado do mês", value: money(totals.estimatedCost), unit: "R$", source: "estimated" },
        { label: "Consumo estimado", value: kwh(totals.estimatedKWh), unit: "kWh", source: "estimated" },
      );
      if (totals.measuredApplianceCount) {
        draft.metrics.push({ label: "Medido até agora", value: kwh(totals.measuredKWh), unit: "kWh", source: measuredSource(snapshot), coverage: totals.coverage });
      }
      draft.cards.push(applianceRanking(snapshot, top, "Maiores consumidores"));
      if (top[0]) draft.actions.push(openAppliance(snapshot, top[0]), openSimulator(snapshot, top[0]));
      draft.suggestions.push("Onde posso economizar?", "Prever a conta deste mês", "Comparar ambientes");
      if (top[0]) draft.context.applianceId = top[0].id;
      break;
    }
    case "top_consumers": {
      const roomHits = matchRooms(request.message, snapshot);
      const pool = roomHits.length ? snapshot.appliances.filter((item) => roomHits.some((room) => room.id === item.roomId)) : snapshot.appliances;
      const top = pool.slice(0, 5);
      if (!top.length) {
        draft.message = `Não há aparelhos cadastrados em ${roomHits.map((room) => safeName(room.name)).join(", ")}.`;
        return draft;
      }
      const first = top[0];
      draft.message = `${roomHits.length ? `Em ${safeName(roomHits[0].name)}, o` : "O"} aparelho com maior custo estimado é ${safeName(first.name)}${first.roomName && !roomHits.length ? `, em ${safeName(first.roomName)}` : ""}: ${kwhText(first.estimatedKWh)} e ${brl(money(first.estimatedCost))} por mês (${pct(first.share)} do imóvel), com ${first.power} W por ${hoursText(first.usageHours)}/dia.`
        + (first.measuredKWh !== null ? ` Neste mês ele já tem ${kwhText(first.measuredKWh)} medidos.` : "");
      draft.cards.push(applianceRanking(snapshot, top, roomHits.length ? `Maiores consumidores em ${safeName(roomHits[0].name)}` : "Maiores consumidores"));
      draft.metrics.push({ label: `Custo de ${safeName(first.name)}`.slice(0, 80), value: money(first.estimatedCost), unit: "R$", source: "estimated" });
      draft.actions.push(openAppliance(snapshot, first), openSimulator(snapshot, first));
      draft.suggestions.push("E se eu usar ele 1 hora a menos?", "Vale a pena trocar ele?", "Comparar ambientes");
      draft.context.applianceId = first.id;
      draft.context.roomId = first.roomId ?? undefined;
      break;
    }
    case "room_ranking": {
      const rooms = snapshot.rooms.filter((room) => room.applianceCount > 0);
      if (!rooms.length) {
        draft.message = "Os aparelhos deste imóvel ainda não estão distribuídos em ambientes. Atribua cada aparelho a um cômodo na planta para comparar os ambientes.";
        draft.actions.push({ type: "open_property", label: "Abrir a planta", propertyId: snapshot.property.id });
        return draft;
      }
      const limit = /\b(tres|3)\b/.test(normalize(request.message)) ? 3 : 5;
      const top = rooms.slice(0, limit);
      draft.message = `O ambiente mais caro é ${safeName(top[0].name)}: ${brl(money(top[0].estimatedCost))} por mês (${pct(top[0].share)} do imóvel). `
        + (top.length > 1 ? `Depois vêm ${top.slice(1).map((room) => `${safeName(room.name)} (${brl(money(room.estimatedCost))})`).join(" e ")}.` : "")
        + (snapshot.unassigned.applianceCount ? ` ${snapshot.unassigned.applianceCount} aparelho(s) estão sem ambiente e somam ${brl(money(snapshot.unassigned.estimatedCost))}.` : "");
      draft.cards.push({
        type: "ranking", title: "Ambientes por custo estimado", source: "estimated",
        items: top.map((room) => ({ id: room.id, label: safeName(room.name), sublabel: `${room.applianceCount} aparelho(s)`, kWh: kwh(room.estimatedKWh), cost: money(room.estimatedCost), share: room.share, kind: "room" as const })),
      });
      draft.actions.push({ type: "open_property", label: `Ver ${safeName(top[0].name)} na planta`.slice(0, 80), propertyId: snapshot.property.id, roomId: top[0].id });
      draft.context.roomId = top[0].id;
      draft.suggestions.push(`O que posso melhorar em ${safeName(top[0].name)}?`.slice(0, 120), "Qual aparelho mais gasta?");
      break;
    }
    case "appliance_detail": {
      const found = resolveAppliance();
      if (Array.isArray(found)) return ambiguity(found);
      if (!found) {
        draft.message = "Não identifiquei o aparelho. Diga o nome como está cadastrado, por exemplo \"geladeira\" ou \"TV da sala\".";
        draft.cards.push(applianceRanking(snapshot, snapshot.appliances.slice(0, 5), "Aparelhos do imóvel"));
        return draft;
      }
      const rank = snapshot.appliances.findIndex((item) => item.id === found.id) + 1;
      const level = found.share >= 0.2 ? "um dos maiores custos" : found.share >= 0.08 ? "um custo intermediário" : "um custo baixo";
      draft.message = `${safeName(found.name)} tem custo estimado de ${brl(money(found.estimatedCost))} e ${kwhText(found.estimatedKWh)} por mês (${found.power} W × ${hoursText(found.usageHours)}/dia × ${found.days} dias). É o ${rank}º de ${totals.applianceCount} no imóvel e representa ${pct(found.share)} do total: ${level}.`
        + (found.measuredKWh !== null ? ` Medido neste mês: ${kwhText(found.measuredKWh)} em ${found.measuredDays} dia(s).`
          // Connected and read, but no consumption interval this month yet.
          : found.freshness && found.freshness.state !== "disabled" ? " Ainda não há consumo medido neste mês; o valor acima é estimado pelo cadastro."
          : " Ele não tem medição real; o valor depende da potência e das horas cadastradas.");
      draft.metrics.push(
        { label: "Custo estimado", value: money(found.estimatedCost), unit: "R$", source: "estimated" },
        { label: "Participação", value: Math.round(found.share * 100), unit: "%", source: "estimated" },
      );
      draft.actions.push(openAppliance(snapshot, found), openSimulator(snapshot, found));
      draft.suggestions.push("E se eu usar ele 1 hora a menos?", "Vale a pena trocar ele?");
      draft.context.applianceId = found.id;
      draft.context.roomId = found.roomId ?? undefined;
      break;
    }
    case "simulate_reduction":
    case "simulate_annual": {
      const found = resolveAppliance();
      if (Array.isArray(found)) return ambiguity(found);
      if (!found) {
        const top = snapshot.appliances.find((item) => !item.essential && item.usageHours >= 1);
        draft.message = "Qual aparelho você quer simular? Diga o nome, por exemplo \"TV 2 horas a menos\".";
        if (top) draft.actions.push({ type: "ask", label: `Simular ${safeName(top.name)}`.slice(0, 80), message: `E se eu usar ${top.name} 1 hora a menos por dia?`.slice(0, 200) });
        return draft;
      }
      const parsed = parseHours(request.message);
      let proposed: number;
      if (parsed?.target !== undefined) proposed = parsed.target;
      else if (parsed?.reduceBy !== undefined) proposed = found.usageHours - parsed.reduceBy;
      else if (parsed?.percent !== undefined) proposed = found.usageHours * (1 - parsed.percent);
      else if (context.lastProposedHours !== undefined && context.applianceId === found.id) proposed = context.lastProposedHours;
      else proposed = found.usageHours - 1;
      const requested = found.usageHours - proposed;
      const sim = simulateForAppliance(found, Math.max(0, proposed), snapshot.period.daysElapsed);
      if (proposed < 0) {
        sim.warnings.unshift(`${safeName(found.name)} está cadastrado com ${hoursText(found.usageHours)}/dia; não dá para reduzir ${hoursText(requested)}. Simulei o desligamento total.`);
      }
      if (!(sim.effectivePowerW > 0)) {
        draft.message = `${safeName(found.name)} não tem potência cadastrada, então não há base para simular a economia. Cadastre a potência da etiqueta do aparelho.`;
        draft.limitations.push(...sim.warnings);
        draft.actions.push(openAppliance(snapshot, found));
        return draft;
      }
      const s = sim.savings;
      const range = sim.scenarios.length > 1
        ? ` Como é um aparelho de ciclo (compressor ou termostato), a economia real pode ser menor, perto de ${brl(money(sim.scenarios[0].cost))} por mês.`
        : "";
      const basis = sim.assumptions[0].startsWith("Potência média")
        ? "Com base na potência média medida"
        : "Com base na potência e nas horas de uso cadastradas";
      draft.message = intent === "simulate_annual"
        ? `${basis} de ${safeName(found.name)}, passar de ${hoursText(sim.currentHours)} para ${hoursText(sim.proposedHours)} por dia representa cerca de ${kwhText(s.annualKWh)} e ${brl(money(s.annualCost))} em um ano (${brl(money(s.monthlyCost))} por mês).${range}`
        : `${basis} de ${safeName(found.name)} e na tarifa de R$ ${brlRate(found.rate)}/kWh, passar de ${hoursText(sim.currentHours)} para ${hoursText(sim.proposedHours)} por dia economiza cerca de ${kwhText(s.monthlyKWh)} e ${brl(money(s.monthlyCost))} por mês (${pct(s.percent)} do consumo dele), ou ${brl(money(s.annualCost))} em um ano.${range} Quer comparar com outra redução?`;
      draft.metrics.push(
        { label: "Economia por dia", value: money(s.dailyCost), unit: "R$", source: "simulated" },
        { label: "Economia por mês", value: money(s.monthlyCost), unit: "R$", source: "simulated" },
        { label: "Economia por ano", value: money(s.annualCost), unit: "R$", source: "simulated" },
        { label: "Energia evitada por mês", value: kwh(s.monthlyKWh), unit: "kWh", source: "simulated" },
      );
      draft.cards.push({ type: "simulation", simulation: sim as unknown as Record<string, unknown> });
      draft.limitations.push(...sim.warnings, "Economia simulada: o resultado real depende de como o aparelho é usado.");
      draft.actions.push(openSimulator(snapshot, found, sim.proposedHours), openAppliance(snapshot, found));
      draft.suggestions.push("Quanto economizaria em um ano?", `E com ${Math.max(0, Math.round(sim.currentHours) - 2)} horas por dia?`);
      draft.context.applianceId = found.id;
      draft.context.roomId = found.roomId ?? undefined;
      draft.context.lastProposedHours = sim.proposedHours;
      draft.context.lastReductionHours = sim.currentHours - sim.proposedHours;
      draft.facts = { simulation: sim };
      return draft;
    }
    case "simulate_replacement": {
      const found = resolveAppliance();
      if (Array.isArray(found)) return ambiguity(found);
      if (!found) {
        draft.message = "Qual aparelho você pensa em trocar? Diga o nome dele.";
        return draft;
      }
      const watts = normalize(request.message).match(/(\d{2,5})\s*(?:w\b|watts?)/);
      const newPower = watts ? Number(watts[1]) : Math.round(found.power * 0.7);
      const price = parseMoney(request.message);
      const sim = simulateReplacement({
        currentPowerW: found.power, newPowerW: newPower, hours: found.usageHours, daysPerMonth: found.days,
        rate: found.rate, price, applianceId: found.id, applianceName: found.name, cyclic: found.cyclic,
      });
      if (!watts) sim.assumptions.unshift(`Modelo novo hipotético 30% mais eficiente (${newPower} W). Informe a potência do modelo para um cálculo exato.`);
      draft.message = `Trocar ${safeName(found.name)} (${found.power} W) por um modelo de ${newPower} W, mantendo o mesmo uso, economizaria cerca de ${kwhText(sim.monthlyKWh)} e ${brl(money(sim.monthlyCost))} por mês, ou ${brl(money(sim.annualCost))} por ano.`
        + (sim.paybackMonths ? ` Com o preço informado, o investimento se paga em cerca de ${sim.paybackMonths} meses.` : " Informe o preço do novo aparelho para calcular o retorno.");
      draft.metrics.push(
        { label: "Economia por mês", value: money(sim.monthlyCost), unit: "R$", source: "simulated" },
        { label: "Economia por ano", value: money(sim.annualCost), unit: "R$", source: "simulated" },
      );
      draft.cards.push({ type: "simulation", simulation: sim as unknown as Record<string, unknown> });
      draft.limitations.push(...sim.assumptions);
      draft.context.applianceId = found.id;
      draft.facts = { replacement: sim };
      return draft;
    }
    case "budget": {
      const t = normalize(request.message);
      const parsed = parsePlanRequest(request.message, totals.estimatedCost)!;
      const target = parsed.target;
      const protectedIds = [...essential];
      // "não quero diminuir o computador": the user's own constraint wins.
      for (const clause of t.split(/[,.;]| mas /)) {
        if (/(nao quero|nao posso|sem (mexer|reduzir)|preciso d|manter)/.test(clause)) {
          for (const item of matchAppliances(clause, snapshot)) protectedIds.push(item.id);
        }
      }
      const plan = buildSavingsPlan(snapshot, target, {
        protectedIds,
        maxReduction: (all.preferences.maxReductionPercent ?? 30) / 100,
        minHours: all.preferences.minHoursByAppliance,
        statedCurrent: parsed.statedCurrent,
      });
      if (plan.gap <= 0) {
        draft.message = `O custo estimado atual (${brl(money(plan.reference))}) já está dentro da meta de ${brl(money(target))}. Posso avisar se a previsão do mês passar desse valor.`;
      } else {
        draft.message = `Para sair de ${brl(money(plan.reference))} e chegar a ${brl(money(target))} por mês, é preciso reduzir ${brl(money(plan.gap))}. `
          + (plan.actions.length
            ? `Plano: ${plan.actions.map((item) => `${safeName(item.applianceName)} de ${hoursText(item.fromHours)} para ${hoursText(item.toHours)} por dia (${brl(money(item.monthlyCost))}, esforço ${item.effort === "medio" ? "médio" : item.effort})`).join("; ")}. `
            : "")
          + (plan.reachable
            ? `Juntas, essas mudanças somam cerca de ${brl(money(plan.achieved))} por mês.`
            : `As mudanças permitidas somam ${brl(money(plan.achieved))}; faltam ${brl(money(plan.remaining))}. A meta não é alcançável só com cortes de uso dentro dos seus limites.`);
      }
      if (plan.excluded.length) draft.limitations.push(`Fora do plano: ${plan.excluded.map((item) => `${safeName(item.applianceName)} (${item.reason})`).join(", ")}.`);
      draft.limitations.push(...plan.uncertainty);
      draft.metrics.push(
        { label: "Custo estimado atual", value: money(plan.reference), unit: "R$", source: "estimated" },
        { label: "Meta", value: money(target), unit: "R$", source: "simulated" },
        { label: "Economia do plano", value: money(plan.achieved), unit: "R$", source: "simulated" },
      );
      draft.cards.push({ type: "budget", plan: { ...plan, current: plan.reference } as unknown as Record<string, unknown> });
      if (plan.actions.length) draft.actions.push({ type: "save_plan", label: "Salvar este plano", propertyId: snapshot.property.id, target: money(target), statedCurrent: parsed.statedCurrent ?? undefined });
      draft.facts = { plan };
      draft.claims = { protectedNames: snapshot.appliances.filter((item) => protectedIds.includes(item.id) || item.essential).map((item) => item.name), actionableNames: plan.actions.map((item) => item.applianceName) };
      draft.complex = protectedIds.length > 0;
      return draft;
    }
    case "investigate": {
      const investigation = all.investigation!;
      const evidence = investigation.findings.filter((finding) => finding.tool !== "savings_plan");
      draft.message = investigation.conclusion;
      const planFinding = investigation.findings.find((finding) => finding.tool === "savings_plan");
      if (planFinding) draft.message += ` ${planFinding.text}`;
      draft.cards.push({
        type: "investigation",
        steps: investigation.steps.map((step) => ({ tool: step.tool, ok: step.ok, skipped: step.skipped ?? null, findings: step.findings.length })),
        findings: evidence.slice(0, 8).map((finding) => ({ id: finding.id, text: finding.text, evidence: finding.evidence, confidence: finding.confidence, applianceId: finding.applianceId ?? null })),
      });
      if (investigation.plan && investigation.plan.gap > 0) {
        draft.cards.push({ type: "budget", plan: { ...investigation.plan, current: investigation.plan.reference } as unknown as Record<string, unknown> });
        if (investigation.plan.actions.length) draft.actions.push({ type: "save_plan", label: "Salvar este plano", propertyId: snapshot.property.id, target: money(investigation.plan.target) });
        draft.limitations.push(...investigation.plan.uncertainty);
      }
      const focus = evidence.find((finding) => finding.applianceId && finding.tool === "appliance_changes") ?? evidence.find((finding) => finding.applianceId);
      const item = focus && snapshot.appliances.find((entry) => entry.id === focus.applianceId);
      if (item) {
        draft.actions.push(openAppliance(snapshot, item), openSimulator(snapshot, item));
        draft.context.applianceId = item.id;
      }
      if (investigation.insufficient) draft.limitations.push("Conecte medidores para que a investigação compare consumo real entre períodos.");
      draft.limitations.push("A investigação aponta onde olhar; correlação não prova causa.");
      draft.suggestions.push("Monte um plano para economizar R$ 50", "Quais dispositivos estão sem medição?");
      draft.facts = { findings: evidence, conclusion: investigation.conclusion, plan: investigation.plan ?? null };
      const comparison = comparePeriods(snapshot);
      draft.claims = {
        trend: comparison.status === "ok" && comparison.change !== null ? (Math.abs(comparison.change) < 0.05 ? "flat" : comparison.change > 0 ? "up" : "down") : null,
        topName: snapshot.appliances[0]?.name ?? null,
        actionableNames: investigation.plan?.actions.map((action) => action.applianceName) ?? [],
      };
      draft.complex = true;
      return draft;
    }
    case "compare_appliances": {
      const hits = matchAppliances(request.message, snapshot);
      const named = snapshot.appliances.filter((item) => hits.includes(item)).slice(0, 4);
      if (named.length < 2) {
        draft.message = "Diga dois aparelhos cadastrados para comparar, por exemplo \"compare a TV e o computador\".";
        return draft;
      }
      const [a, b] = named;
      const ratio = b.estimatedCost > 0 ? a.estimatedCost / b.estimatedCost : null;
      draft.message = `${safeName(a.name)} custa ${brl(money(a.estimatedCost))} por mês (${a.power} W × ${hoursText(a.usageHours)}/dia) e ${safeName(b.name)} custa ${brl(money(b.estimatedCost))} (${b.power} W × ${hoursText(b.usageHours)}/dia), pelo cadastro.`
        + (ratio && ratio !== 1 ? ` ${safeName(ratio > 1 ? a.name : b.name)} pesa mais na conta.` : "");
      draft.cards.push({
        type: "comparison", title: "Custo estimado por mês", source: "estimated",
        items: named.map((item) => ({ label: safeName(item.name), value: money(item.estimatedCost), unit: "R$" as const })),
      });
      for (const item of named.slice(0, 2)) draft.actions.push(openSimulator(snapshot, item));
      if (named.some((item) => item.measuredKWh !== null)) {
        draft.limitations.push(`Medido neste mês: ${named.map((item) => `${safeName(item.name)} ${item.measuredKWh === null ? "sem leitura" : kwhText(item.measuredKWh)}`).join(", ")}.`);
      }
      draft.claims = { topName: (a.estimatedCost >= b.estimatedCost ? a : b).name, measuredNames: named.filter((item) => item.measuredKWh !== null).map((item) => item.name) };
      break;
    }
    case "forecast": {
      const forecast = forecastMonth(snapshot);
      if (forecast.status !== "ok" || forecast.cost === null || forecast.kWh === null) {
        draft.message = forecast.reason ?? "Não há dados suficientes para prever a conta deste mês.";
        draft.limitations.push(draft.message);
        return draft;
      }
      if (forecast.source === "projected") {
        draft.message = `Pelo ritmo medido nos últimos dias, o mês deve fechar perto de ${kwhText(forecast.kWh)} e ${brlRound(forecast.cost)}`
          + (forecast.low && forecast.high ? `, provavelmente entre ${brlRound(forecast.low)} e ${brlRound(forecast.high)}.` : ".");
        if (forecast.backtest) draft.limitations.push(`Erro médio do método nos últimos 7 dias: ${pct(forecast.backtest.wape)} (média simples: ${pct(forecast.backtest.baselineWape)}).`);
      } else {
        draft.message = `Pelas potências e horas cadastradas, o mês deve custar cerca de ${brlRound(forecast.cost)} (${kwhText(forecast.kWh)}). ${forecast.reason}`;
      }
      const goal = all.preferences.monthlyGoal;
      if (goal) draft.message += forecast.cost > goal ? ` Isso fica ${brlRound(forecast.cost - goal)} acima da sua meta de ${brl(goal)}.` : ` Dentro da sua meta de ${brl(goal)}.`;
      draft.metrics.push({ label: "Previsão do mês", value: Math.round(forecast.cost), unit: "R$", source: forecast.source });
      draft.cards.push({ type: "forecast", forecast: forecast as unknown as Record<string, unknown> });
      draft.limitations.push("Tarifa atual aplicada; bandeiras e impostos podem mudar o valor da conta.");
      draft.facts = { forecast };
      return draft;
    }
    case "compare_periods": {
      const comparison = comparePeriods(snapshot);
      if (comparison.status !== "ok" || comparison.currentPerDay === null || comparison.previousPerDay === null) {
        draft.message = `Não tenho informações suficientes para determinar isso. Ainda não dá para comparar com o mês passado: ${comparison.reason} Hoje há ${comparison.currentDays} dia(s) medidos neste mês e ${comparison.previousDays} no anterior.`
          + (limitation ? " O cadastro estimado não muda de um mês para outro, então ele não mostra tendência." : "");
        draft.limitations.push("Comparação de períodos exige medições reais.");
        return draft;
      }
      const change = comparison.change ?? 0;
      const direction = Math.abs(change) < 0.05 ? "praticamente estável" : change > 0 ? `${pct(change)} maior` : `${pct(-change)} menor`;
      draft.message = `A média diária medida neste mês é ${kwhText(comparison.currentPerDay)}, ${direction} que no mês passado (${kwhText(comparison.previousPerDay)} por dia). Comparei médias por dia para não misturar períodos de tamanhos diferentes.`;
      draft.metrics.push(
        { label: "Média diária deste mês", value: kwh(comparison.currentPerDay), unit: "kWh", source: comparison.source },
        { label: "Média diária do mês anterior", value: kwh(comparison.previousPerDay), unit: "kWh", source: comparison.source },
      );
      if (comparison.source === "measured_partial") draft.limitations.push("Só os aparelhos medidos entram na comparação.");
      draft.facts = { comparison };
      return draft;
    }
    case "coverage": {
      const unmeasured = snapshot.appliances.filter((item) => item.measuredKWh === null);
      draft.message = totals.measuredApplianceCount
        ? `${totals.measuredApplianceCount} de ${totals.applianceCount} aparelhos têm leituras neste mês, cobrindo cerca de ${pct(totals.coverage)} do consumo estimado. Sem medição: ${unmeasured.slice(0, 6).map((item) => safeName(item.name)).join(", ")}${unmeasured.length > 6 ? "…" : ""}.`
        : `Nenhum dos ${totals.applianceCount} aparelhos tem medição real neste mês; todos os valores são estimados pelo cadastro.`
          + (totals.connectedApplianceCount ? ` ${totals.connectedApplianceCount} estão conectados ao SmartThings, mas sem leituras de energia.` : "");
      draft.metrics.push({ label: "Cobertura de medição", value: Math.round(totals.coverage * 100), unit: "%", source: measuredSource(snapshot), coverage: totals.coverage });
      draft.actions.push({ type: "open_page", label: "Conectar SmartThings", path: "/integracoes/smartthings" });
      break;
    }
    case "anomalies": {
      const anomalies = detectAnomalies(snapshot);
      if (!anomalies.length) {
        draft.message = snapshot.daily.length + snapshot.previousDaily.length >= 14
          ? "Não encontrei nada fora do padrão nas medições recentes nem falhas de leitura."
          : "Não há histórico medido suficiente para detectar anomalias (são necessários 14 dias). Não encontrei falhas de leitura nos aparelhos conectados.";
      } else {
        draft.message = `Encontrei ${anomalies.length} ponto(s) para verificar: ${anomalies.slice(0, 3).map((item) => item.title).join("; ")}. Isso não prova desperdício: pode ser mudança de hábito, clima ou problema de medição.`;
        draft.cards.push({ type: "anomalies", items: anomalies as unknown as Array<Record<string, unknown>> });
      }
      draft.actions.push({ type: "open_page", label: "Ver anomalias", path: "/anomalias" });
      draft.facts = { anomalies };
      break;
    }
    case "recommendations": {
      const roomHits = matchRooms(request.message, snapshot);
      const recs = buildRecommendations(snapshot, detectAnomalies(snapshot), {
        hasGoal: Boolean(all.preferences.monthlyGoal), protectedIds: [...essential],
        minHours: all.preferences.minHoursByAppliance, categories: all.preferences.recommendationCategories,
        roomIds: roomHits.map((room) => room.id),
      }).filter((item) => !roomHits.length || roomHits.some((room) => room.id === item.roomId));
      if (!recs.length) {
        draft.message = roomHits.length
          ? `Não encontrei oportunidades relevantes em ${safeName(roomHits[0].name)} com os dados atuais.`
          : "Não encontrei oportunidades relevantes com os dados atuais.";
        return draft;
      }
      const withImpact = recs.filter((item) => item.impactMonthly);
      const sum = withImpact.reduce((total, item) => total + (item.impactMonthly ?? 0), 0);
      draft.message = `Separei ${Math.min(recs.length, 5)} oportunidade(s)${roomHits.length ? ` em ${safeName(roomHits[0].name)}` : ""}. `
        + (withImpact.length ? `As de redução de uso somam cerca de ${brl(money(sum))} por mês. ` : "")
        + `A primeira: ${recs[0].title.toLowerCase()} — ${recs[0].reason}`;
      draft.cards.push({ type: "recommendations", items: recs.slice(0, 5) as unknown as Array<Record<string, unknown>> });
      const first = snapshot.appliances.find((item) => item.id === recs[0].applianceId);
      if (first) {
        draft.actions.push(openSimulator(snapshot, first, Math.max(0, first.usageHours - 1)));
        draft.context.applianceId = first.id;
      }
      draft.facts = { recommendations: recs.slice(0, 5) };
      break;
    }
    case "compare_properties": {
      const list = all.snapshots.filter((item) => item.totals.applianceCount > 0);
      if (all.snapshots.length < 2) {
        draft.message = "Você tem só um imóvel cadastrado, então não há o que comparar.";
        return draft;
      }
      draft.message = all.snapshots
        .map((item) => `"${safeName(item.property.name)}": ${brl(money(item.totals.estimatedCost))} e ${kwhText(item.totals.estimatedKWh)} por mês (${item.totals.applianceCount} aparelhos)`)
        .join("; ") + ". Cada imóvel usa a tarifa dos seus próprios aparelhos.";
      draft.cards.push({
        type: "ranking", title: "Imóveis por custo estimado", source: "estimated",
        items: [...list].sort((a, b) => b.totals.estimatedCost - a.totals.estimatedCost).map((item) => ({
          id: item.property.id, label: safeName(item.property.name), sublabel: `${item.totals.applianceCount} aparelho(s)`,
          kWh: kwh(item.totals.estimatedKWh), cost: money(item.totals.estimatedCost), share: 0, kind: "property" as const,
        })),
      });
      for (const item of list.slice(0, 3)) draft.actions.push({ type: "open_property", label: `Abrir ${safeName(item.property.name)}`.slice(0, 80), propertyId: item.property.id });
      draft.limitations.push("Comparação baseada em estimativas de cadastro.");
      draft.complex = true;
      return draft;
    }
    case "device_command": {
      draft.message = "Ainda não envio comandos para aparelhos. Posso simular o efeito de mudar o uso e mostrar o aparelho na planta; ligar ou desligar continua sendo feito por você no SmartThings.";
      draft.limitations.push("Comandos de dispositivos exigem confirmação explícita e ainda não estão habilitados.");
      return draft;
    }
    case "explain_chart": {
      const chart = all.chart;
      if (!chart || chart.status !== "ok") {
        draft.message = `Não tenho informações suficientes para explicar este gráfico. ${chart?.limitations[0] ?? ""}`.trim();
        draft.limitations.push(...(chart?.limitations ?? []));
        return draft;
      }
      const t = normalize(request.message);
      const wanted = /(economiz|fazer|reduzir)/.test(t) ? ["top_appliance"]
        : /(incomum|estranh|anomal)/.test(t) ? ["anomaly"]
        : /(maior mudanca|mudou)/.test(t) ? ["biggest_change", "estimate_change"]
        : /(anterior|compar|aument|por que)/.test(t) ? ["estimate_change", "measured_change"]
        : ["estimate_change", "biggest_change", "measured_change", "top_appliance", "anomaly"];
      const picked = chart.facts.filter((fact) => wanted.includes(fact.kind));
      const unusual = /(incomum|estranh|anomal)/.test(t);
      const shown = picked.length ? picked : unusual ? [] : chart.facts.slice(0, 3);
      if (unusual && !picked.length) draft.message = "Não encontrei nada incomum nos dados deste gráfico. ";
      if (/por que/.test(t)) {
        draft.limitations.push("O gráfico mostra o que mudou, não a causa. Mudanças na estimativa vêm do cadastro; só a medição mostra mudanças de uso.");
      }
      draft.message += shown.map((fact) => fact.text).join(" ");
      draft.limitations.push(...chart.limitations);
      const last = chart.points[chart.points.length - 1];
      const prev = chart.points[chart.points.length - 2];
      if (last && prev) {
        draft.cards.push({
          type: "comparison", title: `${prev.month} × ${last.month}`, source: "estimated",
          items: [
            { label: prev.month, value: kwh(prev.estimatedKWh), unit: "kWh" },
            { label: last.month, value: kwh(last.estimatedKWh), unit: "kWh" },
          ],
        });
      }
      draft.cards.push({
        type: "trend", title: "Série do gráfico",
        points: chart.points.map((point) => ({
          ...point, estimatedKWh: kwh(point.estimatedKWh), estimatedCost: money(point.estimatedCost),
          measuredKWh: point.measuredKWh === null ? null : kwh(point.measuredKWh),
        })),
      });
      const related = shown.find((fact) => fact.applianceId);
      const relatedAppliance = related && snapshot.appliances.find((item) => item.id === related.applianceId);
      if (relatedAppliance) draft.actions.push(openAppliance(snapshot, relatedAppliance), openSimulator(snapshot, relatedAppliance));
      draft.suggestions.push("Qual foi a maior mudança?", "Existe algo incomum?", "O que posso fazer para economizar?");
      draft.facts = { chart: { points: chart.points, facts: shown } };
      return draft;
    }
    default: {
      draft.message = "Não tenho informações suficientes para responder isso com os seus dados. Posso responder sobre maiores consumidores, ambientes mais caros, previsão do mês, simulações de economia, metas e anomalias.";
      draft.suggestions.push("Qual aparelho mais gasta?", "Prever a conta deste mês", "Onde posso economizar?", "Quero gastar no máximo R$ 200 por mês");
      return draft;
    }
  }
  if (limitation) draft.limitations.push(limitation);
  return draft;
};

// ---------------------------------------------------------------- guard

const numbersIn = (text: string) =>
  (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((raw) => {
    if (/,\d{1,2}$/.test(raw)) return Number(raw.replace(/\./g, "").replace(",", "."));
    if (/^\d{1,3}(\.\d{3})+$/.test(raw)) return Number(raw.replace(/\./g, ""));
    return Number(raw.replace(",", "."));
  });

const collectNumbers = (value: unknown, out: Set<number>) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    for (const v of [value, value * 100]) for (const d of [0, 1, 2]) out.add(Number(v.toFixed(d)));
  } else if (typeof value === "string") {
    for (const n of numbersIn(value)) out.add(n);
  } else if (Array.isArray(value)) value.forEach((item) => collectNumbers(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectNumbers(item, out));
};

// True when every number in `text` exists in the facts or is a small
// calendar/unit constant. Prevents the model from inventing values.
export const numbersAreGrounded = (text: string, facts: unknown) => {
  const allowed = new Set<number>([...Array(32).keys(), 12, 24, 30, 365]);
  collectNumbers(facts, allowed);
  return numbersIn(text).every((n) => allowed.has(n) || allowed.has(Math.round(n)) && Number.isInteger(n));
};

// ---------------------------------------------------------------- run

export interface UsageRecord {
  intent: Intent;
  generated: "deterministic" | "llm";
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  error?: string;
  guardViolations?: GuardViolation[];
  toolCalls?: number;
}

export type ChatStage = "context" | "data" | "compute" | "narrate";
export interface ChatOptions {
  // Cancels model calls when the client goes away.
  signal?: AbortSignal;
  // Progress for streaming clients. Stages carry no numbers.
  onStage?: (stage: ChatStage) => void;
}

export interface OrchestratorDeps {
  data: AIDataSource;
  config: AIConfig;
  provider: ModelProvider | null;
  // Returns false when the user's or global model budget is exhausted.
  reserveModelCall?: (userId: string) => Promise<boolean>;
  preferences?: (userId: string) => Promise<AIPreferences>;
  now?: () => Date;
}

const resolveProperty = (properties: PropertyRecord[], context: ChatContext | undefined, message: string, preferences: AIPreferences) => {
  const t = normalize(message);
  const named = properties.find((item) => normalize(item.name).length > 2 && t.includes(normalize(item.name)));
  return named
    ?? properties.find((item) => item.id === context?.propertyId)
    ?? properties.find((item) => item.id === preferences.primaryPropertyId)
    ?? properties.find((item) => item.isPrimary)
    ?? properties[0]
    ?? null;
};

export const loadSnapshot = async (data: AIDataSource, userId: string, property: PropertyRecord, appliances: ApplianceRecord[], now: Date, forPeriod?: MonthPeriod) => {
  const period = forPeriod ?? monthPeriod(now, property.timezone || "America/Sao_Paulo");
  // Freshness only matters (and is only read) when the user has connected
  // devices; it runs in parallel with the other reads.
  const connected = appliances.some((item) => item.integrationProvider && item.integrationDeviceId);
  const [rooms, history, collection] = await Promise.all([
    data.listRooms(userId, property.id),
    data.getEnergyHistory(userId, period.previousStart, period.end),
    connected && data.getCollectionStatus ? data.getCollectionStatus(userId).catch(() => null) : Promise.resolve(null),
  ]);
  const start = period.start.toISOString();
  return buildSnapshot({
    property, rooms, appliances,
    intervals: history.filter((item) => item.endAt >= start),
    previousIntervals: history.filter((item) => item.endAt < start),
    period,
    collection,
    now,
  });
};

const CURRENT_QUESTION = /(agora|atual|atualmente|neste momento|hoje|ultima leitura|ultima medicao|esta ligad)/;
const FOCUS_INTENTS = ["appliance_detail", "top_consumers", "simulate_reduction", "simulate_annual", "simulate_replacement", "compare_appliances"];
const OVERVIEW_INTENTS = ["coverage", "investigate", "forecast", "compare_periods", "anomalies", "property_summary", "room_ranking", "explain_chart"];

// Adds what the collector knows about freshness to a computed answer: a
// sentence for the appliance in focus, limitations for overviews and a
// compact list for the quality chips. Never changes a number.
export const applyFreshness = (draft: Draft, snapshot: PropertySnapshot, request: ChatRequest) => {
  const focus = snapshot.appliances.find((item) => item.id === draft.context.applianceId);
  const asksCurrent = CURRENT_QUESTION.test(normalize(request.message));
  const quality: NonNullable<Draft["dataQuality"]> = [];
  const push = (item: ApplianceFacts) => {
    if (quality.some((entry) => entry.applianceId === item.id)) return;
    const state = item.freshness?.state ?? (item.connected ? null : "none");
    if (!state || state === "none") return;
    quality.push({ applianceId: item.id, name: safeName(item.name), state, label: FRESHNESS_LABEL[state], lastReadingAt: item.freshness?.lastReadingAt ?? null, age: ageText(item.freshness?.ageMs ?? null) });
  };
  if (focus && FOCUS_INTENTS.includes(draft.intent)) {
    const sentence = freshnessSentence(safeName(focus.name), focus.freshness ?? undefined, focus.connected);
    if (sentence && (focus.freshness || asksCurrent)) draft.message += ` ${sentence}`;
    // A cumulative reading up to two intervals old is recent, never live.
    else if (asksCurrent && focus.freshness?.state === "recent") draft.message += ` Última medição de ${safeName(focus.name)}: ${ageText(focus.freshness.ageMs)}; isso não é uma medição em tempo real.`;
    if (asksCurrent && !focus.freshness && !focus.connected) draft.limitations.push("Sem medição automática não há como confirmar o consumo atual; os valores são estimados.");
    push(focus);
  }
  const monitored = snapshot.appliances.filter((item) => item.freshness);
  if (OVERVIEW_INTENTS.includes(draft.intent) && monitored.length) {
    const order: Record<string, number> = { error: 0, delayed: 1, missing: 2, disabled: 3, recent: 4 };
    for (const item of [...monitored].sort((a, b) => order[a.freshness!.state] - order[b.freshness!.state]).slice(0, 6)) push(item);
    const stale = monitored.filter((item) => item.freshness!.state === "delayed" || item.freshness!.state === "error");
    if (stale.length) {
      draft.limitations.push(`${stale.length} medidor(es) com leitura atrasada ou erro de coleta (${stale.map((item) => `${safeName(item.name)}: ${item.freshness!.state === "error" ? "erro" : ageText(item.freshness!.ageMs)}`).join(", ")}). Valores recentes podem estar incompletos.`);
    }
    if (snapshot.freshness.enabled === false) draft.limitations.push("A coleta automática está desativada: as medições exibidas são históricas.");
  }
  if (draft.intent === "coverage" && monitored.length) {
    const s = snapshot.freshness.summary.counts;
    draft.message += ` Atualização: ${s.recent} atualizado(s), ${s.delayed} com leitura atrasada, ${s.missing} sem medição, ${s.error} com erro, ${s.disabled} com coleta desativada.`;
  }
  if (draft.intent === "compare_periods" && (snapshot.freshness.catchUpIntervals > 0 || monitored.some((item) => item.freshness!.state === "delayed" || item.freshness!.state === "error"))) {
    draft.limitations.push("Parte das medições está atrasada ou foi retomada após falha: a diferença entre os meses pode ser efeito da coleta, não do consumo.");
  }
  const forecast = draft.cards.find((card) => card.type === "forecast") as { forecast: { confidence?: string } } | undefined;
  if (forecast?.forecast.confidence) draft.limitations.push(`Confiança da previsão: ${forecast.forecast.confidence}.`);
  if (quality.length) draft.dataQuality = quality;
  return draft;
};

export class Orchestrator {
  constructor(private deps: OrchestratorDeps) {}

  async snapshotFor(userId: string, propertyId?: string) {
    const now = this.deps.now?.() ?? new Date();
    const [properties, appliances, preferences] = await Promise.all([
      this.deps.data.listProperties(userId),
      this.deps.data.listAppliances(userId),
      this.deps.preferences?.(userId) ?? Promise.resolve({} as AIPreferences),
    ]);
    const property = propertyId
      ? properties.find((item) => item.id === propertyId)
      : resolveProperty(properties, undefined, "", preferences);
    if (!property) return null;
    return { snapshot: await loadSnapshot(this.deps.data, userId, property, appliances, now), preferences, properties, appliances };
  }

  async chat(userId: string, request: ChatRequest, options: ChatOptions = {}): Promise<{ response: WattAIResponse; usage: UsageRecord }> {
    const stage = (name: ChatStage) => options.onStage?.(name);
    stage("context");
    const started = Date.now();
    const now = this.deps.now?.() ?? new Date();
    const [properties, appliances, preferences] = await Promise.all([
      this.deps.data.listProperties(userId),
      this.deps.data.listAppliances(userId),
      this.deps.preferences?.(userId) ?? Promise.resolve({} as AIPreferences),
    ]);
    // Context ids from the client are only hints: anything not owned by this
    // user is dropped here.
    const owned = new Set(properties.map((item) => item.id));
    const context: ChatContext = { ...(request.context ?? {}) };
    if (context.propertyId && !owned.has(context.propertyId)) delete context.propertyId;
    const ownAppliance = appliances.find((item) => item.id === context.applianceId);
    if (context.applianceId && (!ownAppliance || ownAppliance.propertyId !== context.propertyId)) delete context.applianceId;
    const safeRequest: ChatRequest = { ...request, context };

    const usage: UsageRecord = { intent: "unknown", generated: "deterministic", model: null, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: 0 };
    const property = resolveProperty(properties, context, request.message, preferences);
    if (property?.id !== context.propertyId) {
      delete context.applianceId;
      delete context.roomId;
    }
    if (!property) {
      const response = this.finish({
        ...emptyDraft("unknown", null, context),
        message: "Você ainda não tem imóveis cadastrados. Cadastre um imóvel e seus aparelhos para começar.",
        actions: [{ type: "open_page", label: "Cadastrar imóvel", path: "/imoveis" }],
      }, usage, started);
      return { response, usage };
    }
    stage("data");
    const snapshot = await loadSnapshot(this.deps.data, userId, property, appliances, now);
    if (context.roomId && !snapshot.rooms.some((room) => room.id === context.roomId)) delete context.roomId;

    let intent: Intent = request.chart ? "explain_chart" : classifyIntent(request.message, context);
    let chart: ChartExplanation | undefined;
    if (request.chart) {
      // The chart's series is recomputed here; nothing from the client is trusted.
      const scope = request.chart.propertyId && owned.has(request.chart.propertyId) ? request.chart.propertyId : null;
      const tz = property.timezone || "America/Sao_Paulo";
      const { year, month } = request.chart;
      const fromDate = new Date(Date.UTC(year, month - 6, 1));
      const from = zonedMidnight(fromDate.getUTCFullYear(), fromDate.getUTCMonth() + 1, 1, tz);
      const to = zonedMidnight(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1, tz);
      const history = await this.deps.data.getEnergyHistory(userId, from, to);
      const byMonth = new Map<string, number>();
      for (const item of history) {
        if (scope && item.propertyId !== scope) continue;
        const day = zonedDay(new Date(item.endAt), tz);
        const key = `${day.year}-${String(day.month).padStart(2, "0")}`;
        byMonth.set(key, (byMonth.get(key) ?? 0) + item.consumptionKWh);
      }
      const scoped = scope ? appliances.filter((item) => item.propertyId === scope) : appliances;
      const scopedProperty = scope ? properties.find((item) => item.id === scope) ?? null : null;
      chart = explainTrend(buildTrend(scoped, byMonth, year, month, scopedProperty), scope === property.id || properties.length === 1 ? snapshot : null);
    }
    let modelAllowed = Boolean(this.deps.provider);
    let toolCalls = 0;
    if (intent === "unknown" && modelAllowed && toolCalls < this.deps.config.maxToolCalls) {
      modelAllowed = (await this.deps.reserveModelCall?.(userId)) ?? true;
      if (modelAllowed) {
        toolCalls++;
        try {
          const result = await completeWithLimits(this.deps.provider!, {
            model: this.deps.config.modelFast,
            system: classificationPrompt(INTENTS),
            messages: [{ role: "user", content: request.message }],
            maxTokens: 20,
            signal: options.signal,
          }, this.deps.config.timeoutMs, 0);
          this.addTokens(usage, result);
          const picked = result.text.trim().toLowerCase().replace(/[^a-z_]/g, "") as Intent;
          if (INTENTS.includes(picked)) intent = picked;
        } catch (error) {
          usage.error = error instanceof Error ? error.message : "provider_error";
        }
      }
    }

    const snapshots = intent === "compare_properties"
      ? await Promise.all(properties.map((item) => (item.id === property.id ? snapshot : loadSnapshot(this.deps.data, userId, item, appliances, now))))
      : [snapshot];
    let investigation: Investigation | undefined;
    if (intent === "investigate") {
      // Plan: deterministic by default; a model may propose the order and the
      // subset, validated against the whitelist and the budget.
      let tools: ToolName[] = [];
      const hasTarget = parseMoney(request.message) !== null;
      if (modelAllowed && this.deps.provider && toolCalls < this.deps.config.maxToolCalls && ((await this.deps.reserveModelCall?.(userId)) ?? true)) {
        toolCalls++;
        try {
          const result = await completeWithLimits(this.deps.provider, {
            model: this.deps.config.modelFast,
            system: investigationPlanPrompt(TOOL_NAMES),
            messages: [{ role: "user", content: request.message }],
            maxTokens: 120,
            signal: options.signal,
          }, this.deps.config.timeoutMs, 0);
          this.addTokens(usage, result);
          const json = result.text.match(/\{[\s\S]*\}/)?.[0];
          const parsed = json ? modelPlanSchema.safeParse(JSON.parse(json)) : null;
          if (parsed?.success) tools = sanitizePlan(parsed.data.tools, DEFAULT_BUDGET, hasTarget);
          else usage.error = "plan_invalid";
        } catch (error) {
          usage.error = error instanceof Error ? error.message : "provider_error";
        }
      }
      if (!tools.length) tools = sanitizePlan(defaultPlan(hasTarget), DEFAULT_BUDGET, hasTarget);
      const protectedIds = [...(preferences.essentialApplianceIds ?? [])];
      investigation = runInvestigation(snapshot, tools, {
        planTarget: hasTarget ? parsePlanRequest(request.message, snapshot.totals.estimatedCost)?.target ?? null : null,
        planOptions: { protectedIds, maxReduction: (preferences.maxReductionPercent ?? 30) / 100, minHours: preferences.minHoursByAppliance },
      });
      usage.toolCalls = investigation.budget.callsUsed;
    }
    stage("compute");
    const draft = applyFreshness(handleIntent(intent, safeRequest, snapshot, { snapshots, preferences, chart, investigation }), snapshot, safeRequest);
    usage.intent = intent;
    if (!Object.keys(draft.facts).length) {
      draft.facts = { metrics: draft.metrics, cards: draft.cards };
    }

    const narrate = modelAllowed && this.deps.provider && toolCalls < this.deps.config.maxToolCalls &&
      !["greeting", "device_command", "unknown"].includes(intent) && !usage.error;
    if (narrate && ((toolCalls > 0) || ((await this.deps.reserveModelCall?.(userId)) ?? true))) {
      const model = draft.complex || (request.history?.length ?? 0) > 4 ? this.deps.config.modelReasoning : this.deps.config.modelFast;
      try {
        stage("narrate");
        const result = await completeWithLimits(this.deps.provider!, {
          signal: options.signal,
          model,
          system: SYSTEM_PROMPT,
          messages: [
            ...(request.history ?? []).slice(-4).map((item) => ({ role: item.role, content: item.content.slice(0, 600) })),
            { role: "user", content: narrationPrompt(request.message, draft.message, draft.facts, draft.limitations) },
          ],
          maxTokens: this.deps.config.maxOutputTokens,
        }, this.deps.config.timeoutMs, 1);
        this.addTokens(usage, result);
        usage.model = result.model;
        const violations = result.truncated ? ["length" as const] : validateNarration(result.text, {
          draft: draft.message,
          values: { facts: draft.facts, metrics: draft.metrics, cards: draft.cards },
          allowedNames: [],
          forbiddenNames: [
            ...appliances.map((item) => item.name),
            ...properties.map((item) => item.name),
            ...snapshot.rooms.map((item) => item.name),
          ],
          measured: snapshot.totals.measuredApplianceCount > 0,
          claims: {
            measuredNames: snapshot.appliances.filter((item) => item.measuredKWh !== null).map((item) => item.name),
            protectedNames: snapshot.appliances.filter((item) => item.essential || preferences.essentialApplianceIds?.includes(item.id)).map((item) => item.name),
            trend: (() => {
              const comparison = comparePeriods(snapshot);
              return comparison.status === "ok" && comparison.change !== null ? (Math.abs(comparison.change) < 0.05 ? "flat" : comparison.change > 0 ? "up" : "down") : null;
            })(),
            topName: snapshot.appliances[0]?.name ?? null,
            // "agora"/"atual" may only be said of devices read recently.
            recentNames: snapshot.appliances.filter((item) => item.freshness?.state === "recent").map((item) => item.name),
            ...draft.claims,
          },
        });
        usage.guardViolations = violations;
        if (!violations.length) {
          draft.message = result.text;
          usage.generated = "llm";
        } else {
          usage.error = `guard:${violations.join(",")}`;
        }
      } catch (error) {
        usage.error = error instanceof Error ? error.message : "provider_error";
        draft.limitations.push("IA generativa indisponível agora: resposta montada pelo motor de cálculo, com os mesmos números.");
      }
    } else if (narrate) {
      draft.limitations.push("Limite de uso da IA atingido: resposta gerada pelo motor de cálculo.");
    }
    const response = this.finish(draft, usage, started);
    return { response, usage };
  }

  private addTokens(usage: UsageRecord, result: { inputTokens: number; outputTokens: number }) {
    usage.inputTokens += result.inputTokens;
    usage.outputTokens += result.outputTokens;
    usage.estimatedCostUsd = (usage.inputTokens * this.deps.config.priceInput + usage.outputTokens * this.deps.config.priceOutput) / 1e6;
  }

  private finish(draft: Draft, usage: UsageRecord, started: number): WattAIResponse {
    usage.latencyMs = Date.now() - started;
    return responseSchema.parse({
      message: draft.message,
      intent: draft.intent,
      context: draft.context,
      metrics: draft.metrics,
      cards: draft.cards,
      limitations: [...new Set(draft.limitations)],
      suggestions: [...new Set(draft.suggestions)].slice(0, 6),
      actions: draft.actions.slice(0, 6),
      ...(draft.dataQuality ? { dataQuality: draft.dataQuality } : {}),
      meta: {
        engine: ENGINE_VERSION,
        generated: usage.generated,
        model: usage.model,
        latencyMs: usage.latencyMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd: Number(usage.estimatedCostUsd.toFixed(6)),
      },
    });
  }
}

export { SOURCE_NOTE };
