import { MongoDatabase } from "../../storage/mongo-db";
import { SmartThingsIntegration } from "../integrations/providers/smartthings";
import { extractCumulativeKWh } from "./energy-history";

export type CollectionResult = { claimed: number; saved: number; failed: number; skipped: number };

export async function collectEnergy(db: MongoDatabase, options: {
  enabled: boolean; intervalMinutes: number; maxDevices: number; deadlineMs: number;
  now?: () => Date;
  integration?: (token: string) => Pick<SmartThingsIntegration, "listDevices" | "getDeviceStatus">;
}): Promise<CollectionResult> {
  const result = { claimed: 0, saved: 0, failed: 0, skipped: 0 };
  if (!options.enabled) return result;
  const now = options.now ?? (() => new Date());
  const integration = options.integration ?? ((token: string) => new SmartThingsIntegration(token));
  const stopAt = Date.now() + Math.min(options.deadlineMs, 20000);
  const intervalMs = Math.max(5, options.intervalMinutes) * 60000;
  for (let i = 0; i < Math.min(options.maxDevices, 3) && Date.now() < stopAt - 1000; i++) {
    const claim = await db.claimEnergyCollection(now(), 60000);
    if (!claim) break;
    result.claimed++;
    let success = false;
    try {
      const { appliance } = claim;
      const token = await db.getIntegrationToken(appliance.userId, "smartthings");
      if (!token) { result.skipped++; success = true; continue; }
      const client = integration(token);
      const devices = await client.listDevices();
      if (!devices.some((device) => device.id === appliance.integrationDeviceId && device.capabilities?.includes("energyMeter"))) {
        result.skipped++; success = true; continue;
      }
      const status = await client.getDeviceStatus(appliance.integrationDeviceId!);
      const counterKWh = extractCumulativeKWh(status.raw);
      if (counterKWh === null) { result.skipped++; success = true; continue; }
      await db.saveEnergySample(appliance.userId, "smartthings", appliance.integrationDeviceId!, counterKWh, now());
      result.saved++;
      success = true;
    } catch {
      result.failed++;
    } finally {
      await db.finishEnergyCollection(claim.key, now(), intervalMs, success);
    }
  }
  return result;
}
