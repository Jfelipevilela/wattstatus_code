// Adapter between the alert sweep and the app's services, for a scheduled
// task (e.g. a Netlify scheduled function next to the energy collector).
// Not wired to any schedule yet; see docs/WATTSTATUS_AI.md § Alertas.
import type { AIDataSource } from "./ai.orchestrator";
import { loadSnapshot } from "./ai.orchestrator";
import type { AIStore } from "./ai.store";
import { AlertDelivery, runAlertSweep } from "./ai.alerts";

export const sweepAlerts = (
  deps: { store: AIStore; data: AIDataSource; delivery?: AlertDelivery; now?: () => Date },
  options: { pageSize?: number; maxUsers?: number; maxPropertiesPerUser?: number } = {},
) => runAlertSweep({
  store: deps.store,
  delivery: deps.delivery,
  // Delivery needs both a validated channel and this explicit switch.
  deliveryEnabled: process.env.AI_ALERTS_DELIVERY === "on",
  now: deps.now,
  snapshots: {
    snapshotsFor: async (userId) => {
      const [properties, appliances] = await Promise.all([deps.data.listProperties(userId), deps.data.listAppliances(userId)]);
      const now = deps.now?.() ?? new Date();
      return Promise.all(properties.slice(0, options.maxPropertiesPerUser ?? 3).map((property) => loadSnapshot(deps.data, userId, property, appliances, now)));
    },
  },
}, options);
