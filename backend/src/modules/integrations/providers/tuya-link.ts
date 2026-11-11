// Resolves the Tuya account linked to a WattStatus user.
// The link is the user's Tuya uid, stored per user in the encrypted
// integration token store. It is written only by a server-side linking flow,
// never from client input: the project can read every linked account, so a
// uid typed by a user would expose someone else's devices. Until that flow
// exists, no user is linked and the integration reports "not linked".
import { env } from "../../../config/env";
import { TuyaIntegration, isTuyaRegion } from "./tuya";

const UID = /^[A-Za-z0-9]{1,64}$/;

export interface TuyaLinkStore {
  getIntegrationToken(userId: string, provider: string): Promise<string | null>;
}

export const isTuyaProjectConfigured = (config = env) => Boolean(config.tuyaAccessId && config.tuyaAccessSecret);

export const createTuyaForUser = async (db: TuyaLinkStore, userId: string, config = env) => {
  if (!isTuyaProjectConfigured(config)) return null;
  const stored = await db.getIntegrationToken(userId, "tuya");
  if (!stored) return null;
  let uid: unknown;
  try {
    uid = (JSON.parse(stored) as { uid?: unknown }).uid;
  } catch {
    return null;
  }
  if (typeof uid !== "string" || !UID.test(uid)) return null;
  const region = isTuyaRegion(config.tuyaRegion) ? config.tuyaRegion : "us";
  return new TuyaIntegration(config.tuyaAccessId, config.tuyaAccessSecret, uid, { region, timeoutMs: 3000 });
};
