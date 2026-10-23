import dotenv from "dotenv";
import { randomBytes } from "crypto";

dotenv.config();

const production = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET || (production ? "" : randomBytes(32).toString("hex"));
if (production && (jwtSecret.length < 32 || /^(wattstatus-dev-secret|change-me)/i.test(jwtSecret))) {
  throw new Error("JWT_SECRET deve conter pelo menos 32 caracteres aleatórios em produção.");
}
if (production && !process.env.SMARTTHINGS_TOKEN_SECRET) {
  throw new Error("SMARTTHINGS_TOKEN_SECRET é obrigatório em produção para preservar os tokens criptografados.");
}
const allowedOrigins = (process.env.APP_ORIGINS || process.env.URL ||
  (production ? "https://wattstatus.netlify.app" :
    "https://wattstatus.netlify.app,http://localhost:8080,http://localhost:5173,http://localhost:4000"))
  .split(",").map((value) => new URL(value.trim()).origin);
const trustProxy = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5) {
  throw new Error("TRUST_PROXY_HOPS inválido.");
}

export const env = {
  port: process.env.PORT ? Number(process.env.PORT) : 4000,
  jwtSecret,
  allowedOrigins,
  trustProxy,
  smartThingsToken: process.env.SMARTTHINGS_TOKEN || "",
  // OAuth-In SmartApp. All three must be set to offer "Entrar com Samsung".
  smartThingsClientId: process.env.SMARTTHINGS_CLIENT_ID || "",
  smartThingsClientSecret: process.env.SMARTTHINGS_CLIENT_SECRET || "",
  smartThingsRedirectUri: process.env.SMARTTHINGS_REDIRECT_URI || "",
  smartThingsAuthorizeUrl:
    process.env.SMARTTHINGS_AUTHORIZE_URL || "https://api.smartthings.com/oauth/authorize",
  smartThingsTokenUrl:
    process.env.SMARTTHINGS_TOKEN_URL || "https://auth-global.api.smartthings.com/oauth/token",
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
