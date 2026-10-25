// Measurement freshness, from the collection contract
// (docs/COLETA_ENERGIA.md § 7, MongoDatabase.energyCollectionStatus).
// The AI only reads what the collector already stored: no SmartThings calls.

export type FreshnessState = "recent" | "delayed" | "missing" | "disabled" | "error";
export interface DeviceFreshness {
  applianceId: string;
  state: FreshnessState;
  lastReadingAt: string | null;
  ageMs: number | null;
  nextAt?: string | null;
  lastStatus?: string | null;
  failures?: number;
  // True when the AI derived the state from readings in the history
  // (devices measured before the collection queue recorded successes).
  derived?: boolean;
}
export interface CollectionStatus { enabled: boolean; intervalMs: number; devices: DeviceFreshness[] }

export const FRESHNESS_LABEL: Record<FreshnessState, string> = {
  recent: "Atualizado",
  delayed: "Leitura atrasada",
  missing: "Sem medição",
  disabled: "Coleta desativada",
  error: "Erro de coleta",
};

// "há 40 min", "há 3 h", "há 2 dias": coarse on purpose, the reading time is
// what matters, not the second.
export const ageText = (ageMs: number | null) => {
  if (ageMs === null || !Number.isFinite(ageMs)) return null;
  const minutes = Math.max(1, Math.round(ageMs / 60000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} dias`;
};

// The sentence the assistant uses for a device, per state. Values come from
// the collector's stored status.
export const freshnessSentence = (name: string, freshness: DeviceFreshness | undefined, connected: boolean) => {
  if (!freshness) {
    return connected ? null : `${name} não tem medição automática; os valores vêm do cadastro.`;
  }
  switch (freshness.state) {
    case "recent": return null;
    case "delayed": return `A última medição de ${name} ocorreu ${ageText(freshness.ageMs)}. Posso analisar o histórico disponível, mas não confirmar o consumo atual.`;
    case "missing": return `${name} ainda não tem nenhuma medição automática; uso os dados cadastrados.`;
    case "disabled": return `${name} não está sendo monitorado automaticamente. Posso usar os dados estimados cadastrados para fazer uma simulação.`;
    case "error": return `Há um problema na atualização das medições de ${name}. Os valores recentes podem estar incompletos.`;
  }
};

export interface FreshnessSummary {
  monitored: number;
  counts: Record<FreshnessState, number>;
  // Devices whose recent readings cannot be trusted as current.
  unreliable: number;
}
export const summarizeFreshness = (devices: DeviceFreshness[]): FreshnessSummary => {
  const counts: Record<FreshnessState, number> = { recent: 0, delayed: 0, missing: 0, disabled: 0, error: 0 };
  for (const device of devices) counts[device.state]++;
  return { monitored: devices.length, counts, unreliable: counts.delayed + counts.error + counts.missing };
};
