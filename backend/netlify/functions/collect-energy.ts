import { schedule } from "@netlify/functions";
import { MongoDatabase } from "../../src/storage/mongo-db";
import { collectEnergy } from "../../src/modules/energy/energy-collector";

// Netlify invokes scheduled functions internally. No public API route exists.
export const handler = schedule("*/5 * * * *", async () => {
  if (process.env.ENERGY_COLLECTION_ENABLED !== "true") return { statusCode: 200 };
  const db = new MongoDatabase();
  try {
    await db.init();
    const result = await collectEnergy(db, {
      enabled: true,
      intervalMinutes: Number(process.env.ENERGY_COLLECTION_INTERVAL_MINUTES || 30),
      maxDevices: Number(process.env.ENERGY_COLLECTION_BATCH_SIZE || 2),
      deadlineMs: 20000,
    });
    console.info("Energy collection", result);
  } finally {
    await db.close();
  }
  return { statusCode: 200 };
});
