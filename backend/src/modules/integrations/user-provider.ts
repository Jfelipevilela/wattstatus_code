import type { MongoDatabase } from "../../storage/mongo-db";
import { SmartThingsIntegration } from "./providers/smartthings";
import { LgThinQIntegration, lgCredentialsSchema } from "./providers/lg-thinq";
import { resolveAccessToken } from "./smartthings-oauth";
import { createTuyaForUser } from "./providers/tuya-link";
import type { ProviderResolver } from "../appliances/group-off.service";
// Add future providers here with user-specific credentials and power-off support.
export const userProviderResolver =
  (db: MongoDatabase): ProviderResolver =>
  async (userId, provider) => {
    if (provider === "smartthings") {
      const token = await resolveAccessToken(db, userId);
      return token ? new SmartThingsIntegration(token, 3000) : null;
    }
    if (provider === "lg-thinq") {
      const stored = await db.getIntegrationToken(userId, provider);
      if (!stored) return null;
      return new LgThinQIntegration(
        lgCredentialsSchema.parse(JSON.parse(stored)),
      );
    }
    if (provider === "tuya") return createTuyaForUser(userId);
    return null;
  };
