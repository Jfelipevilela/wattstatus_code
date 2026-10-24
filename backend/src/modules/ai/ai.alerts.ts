// Proactive alerts: deterministic detection, priority, dedupe, consent and a
// delivery interface for the scheduler. Nothing is sent unless a validated
// channel is registered and delivery is switched on.
import {
  AlertCandidate, PropertySnapshot, buildRecommendations, detectAnomalies, evaluateAlerts, money, brlRate,
} from "./ai.engine";

export type AlertPriority = "alta" | "media" | "baixa";
export type AlertKindV2 = AlertCandidate["kind"] | "appliance_anomaly" | "savings_opportunity";
export interface AlertV2 extends Omit<AlertCandidate, "kind"> { kind: AlertKindV2; priority: AlertPriority }

const PRIORITY: Record<AlertKindV2, AlertPriority> = {
  goal_risk: "alta", consumption_increase: "alta", appliance_anomaly: "alta",
  forecast: "media", persistent_anomaly: "media", missing_reading: "media",
  savings_opportunity: "baixa",
};

export interface AlertPreferences {
  monthlyGoal?: number | null;
  monthlyKWhGoal?: number | null;
  essentialApplianceIds?: string[];
  minHoursByAppliance?: Record<string, number>;
  alertCategories?: string[];
}

export const detectAlerts = (snapshot: PropertySnapshot, preferences: AlertPreferences, now = new Date(), dismissedRecommendations: string[] = []): AlertV2[] => {
  const month = snapshot.period.start.slice(0, 7);
  const base: AlertV2[] = evaluateAlerts(snapshot, preferences, now).map((alert) => ({ ...alert, priority: PRIORITY[alert.kind] }));
  // Appliance-level: a reading incompatible with the registered power.
  for (const anomaly of detectAnomalies(snapshot, now)) {
    if (anomaly.kind !== "inconsistent_reading" || !anomaly.applianceId) continue;
    base.push({ key: `appliance_anomaly:${anomaly.applianceId}:${month}`, kind: "appliance_anomaly", priority: "alta", propertyId: snapshot.property.id, applianceId: anomaly.applianceId, title: anomaly.title, detail: anomaly.detail });
  }
  // One savings opportunity per month, only when it is worth at least R$ 10.
  const best = buildRecommendations(snapshot, [], {
    protectedIds: preferences.essentialApplianceIds, minHours: preferences.minHoursByAppliance, categories: ["reduce_usage"],
  }).find((item) => (item.impactMonthly ?? 0) >= 10 && !dismissedRecommendations.includes(item.id));
  if (best) {
    base.push({
      key: `savings:${snapshot.property.id}:${month}`, kind: "savings_opportunity", priority: "baixa", propertyId: snapshot.property.id, applianceId: best.applianceId ?? undefined,
      title: best.title, detail: `Economia simulada de cerca de R$ ${brlRate(money(best.impactMonthly!))} por mês. ${best.reason}`,
    });
  }
  const allowed = preferences.alertCategories?.length ? new Set(preferences.alertCategories) : null;
  const order: Record<AlertPriority, number> = { alta: 0, media: 1, baixa: 2 };
  return base.filter((alert) => !allowed || allowed.has(alert.kind)).sort((a, b) => order[a.priority] - order[b.priority]);
};

// ---------------------------------------------------------------- delivery

export interface AlertDelivery {
  readonly channel: string;
  // True only after the channel was validated (e.g. push subscription, e-mail sender).
  readonly ready: boolean;
  send(userId: string, alert: AlertV2): Promise<void>;
}
// Default: records alerts in the app only.
export const inAppOnly: AlertDelivery = { channel: "in_app", ready: false, send: async () => {} };

export interface SchedulerStore {
  listAlertRecipients(after: string | null, limit: number): Promise<Array<{ userId: string; preferences: AlertPreferences & { proactiveInsights?: boolean; alertFrequency?: string } }>>;
  saveAlerts(userId: string, alerts: AlertV2[], minIntervalMs: number): Promise<Array<AlertV2 & { createdAt: Date }>>;
  markDelivered(userId: string, key: string, channel: string): Promise<void>;
  dismissedRecommendations(userId: string): Promise<string[]>;
}
export interface SchedulerSnapshots {
  snapshotsFor(userId: string): Promise<PropertySnapshot[]>;
}

export const frequencyMs = (frequency?: string) => (frequency === "weekly" ? 7 : 1) * 86400000;

// Entry point for a scheduled task: walks consenting users in pages, stores
// new alerts (dedupe + frequency), and delivers them only through a ready
// channel when delivery is explicitly enabled.
export const runAlertSweep = async (
  deps: { store: SchedulerStore; snapshots: SchedulerSnapshots; delivery?: AlertDelivery; deliveryEnabled?: boolean; now?: () => Date },
  options: { pageSize?: number; maxUsers?: number } = {},
) => {
  const delivery = deps.delivery ?? inAppOnly;
  const send = Boolean(deps.deliveryEnabled) && delivery.ready;
  const pageSize = options.pageSize ?? 50;
  const maxUsers = options.maxUsers ?? 1000;
  const report = { users: 0, created: 0, delivered: 0, skippedConsent: 0, errors: 0 };
  let after: string | null = null;
  while (report.users < maxUsers) {
    const page = await deps.store.listAlertRecipients(after, pageSize);
    if (!page.length) break;
    for (const { userId, preferences } of page) {
      after = userId;
      report.users++;
      if (!preferences.proactiveInsights || !preferences.alertFrequency || preferences.alertFrequency === "off") { report.skippedConsent++; continue; }
      try {
        const dismissed = await deps.store.dismissedRecommendations(userId);
        const alerts = (await deps.snapshots.snapshotsFor(userId)).flatMap((snapshot) => detectAlerts(snapshot, preferences, deps.now?.() ?? new Date(), dismissed));
        const created = await deps.store.saveAlerts(userId, alerts, frequencyMs(preferences.alertFrequency));
        report.created += created.length;
        if (send) {
          for (const alert of created.filter((item) => item.priority !== "baixa")) {
            await delivery.send(userId, alert);
            await deps.store.markDelivered(userId, alert.key, delivery.channel);
            report.delivered++;
          }
        }
      } catch {
        report.errors++;
      }
    }
    if (page.length < pageSize) break;
  }
  return report;
};
