import { schedule } from "@netlify/functions";
import { MongoDatabase } from "../../src/storage/mongo-db";
import { collectEnergy } from "../../src/modules/energy/energy-collector";

// Netlify invokes scheduled functions internally. No public API route exists.
export const handler = schedule("*/5 * * * *", async () => {
  if (process.env.ENERGY_COLLECTION_ENABLED !== "true") return { statusCode: 200 };
  const started = Date.now();
  const db = new MongoDatabase(undefined, undefined, {
    serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000, socketTimeoutMS: 5000,
  });
  try {
    // API initialization creates indexes when imported devices are configured.
    await db.init(false);
    const result = await collectEnergy(db, {
      enabled: true,
      intervalMinutes: Number(process.env.ENERGY_COLLECTION_INTERVAL_MINUTES || 30),
      maxDevices: Number(process.env.ENERGY_COLLECTION_BATCH_SIZE || 2),
      deadlineMs: Math.max(0, 23000 - (Date.now() - started)),
    });
    console.info("Energy collection", result);
  } catch {
    console.error("Energy collection unavailable");
    return { statusCode: 503 };
  } finally {
    await db.close();
  }
  return { statusCode: 200 };
});
