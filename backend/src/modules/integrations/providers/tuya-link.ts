// Resolves the Tuya account linked to a WattStatus user.
// Phase 1 (proof of concept): a single user/uid pair from server env. The uid
// comes from the Tuya console ("Link App Account"), never from the client.
// Phase 2 (multi-user) needs Tuya's per-user authorization flow; see docs.
import { env } from "../../../config/env";
import { TuyaIntegration, isTuyaRegion } from "./tuya";

export const isTuyaProjectConfigured = () => Boolean(env.tuyaAccessId && env.tuyaAccessSecret);

export const createTuyaForUser = (userId: string, config = env) => {
  if (!config.tuyaAccessId || !config.tuyaAccessSecret) return null;
  if (!config.tuyaPocUserId || !config.tuyaPocUid || userId !== config.tuyaPocUserId) return null;
  const region = isTuyaRegion(config.tuyaRegion) ? config.tuyaRegion : "us";
  return new TuyaIntegration(config.tuyaAccessId, config.tuyaAccessSecret, config.tuyaPocUid, { region, timeoutMs: 3000 });
};
