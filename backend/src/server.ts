import { createApp, buildIntegrations } from "./app";
import { env } from "./config/env";
import { MongoDatabase } from "./storage/mongo-db";
import { PostgresDatabase } from "./storage/postgres-db";

const start = async () => {
  const db = new MongoDatabase ();
  await db.init();

  const integrationManager = buildIntegrations();
  const app = createApp({ db, integrationManager });

  app.listen(env.port, () => {
    console.log(`WattStatus API ouvindo na porta ${env.port}`);
  });
};

start().catch((err) => {
  console.error("Falha ao iniciar servidor", err);
  process.exit(1);
});
