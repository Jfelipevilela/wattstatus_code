import dotenv from "dotenv";

dotenv.config();

if (process.env.NODE_ENV === "production" &&
    (!process.env.JWT_SECRET || !process.env.SMARTTHINGS_TOKEN_SECRET)) {
  throw new Error("JWT_SECRET e SMARTTHINGS_TOKEN_SECRET são obrigatórios em produção");
}

export const env = {
  port: process.env.PORT ? Number(process.env.PORT) : 4000,
  jwtSecret: process.env.JWT_SECRET || "wattstatus-dev-secret",
  smartThingsToken: process.env.SMARTTHINGS_TOKEN || "",
  lgClientId: process.env.LG_CLIENT_ID || "",
  lgClientSecret: process.env.LG_CLIENT_SECRET || "",
  lgRefreshToken: process.env.LG_REFRESH_TOKEN || "",
  databaseUrl:
    process.env.DATABASE_URL || "postgres://user:password@localhost:5432/wattstatus",
  smartThingsTokenSecret:
    process.env.SMARTTHINGS_TOKEN_SECRET || process.env.JWT_SECRET || "wattstatus-dev-secret",
  tariffsApiUrl: process.env.TARIFFS_API_URL || "",
  mongoUrl: process.env.MONGO_URL || "mongodb://localhost:27017",
  mongoDbName: process.env.MONGO_DB_NAME || "wattstatus",
};
