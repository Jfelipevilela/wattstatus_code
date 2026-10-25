// Checks a homologation environment before it is configured on Netlify.
// Reads a dotenv-style file the operator keeps OUTSIDE the repository and
// prints only names and verdicts, never values.
//
//   node scripts/homolog/preflight-env.mjs <path/to/homolog.env> [--prod-fingerprints=<file>]
//
// --prod-fingerprints: optional file with one sha256 per line of production
// secrets (JWT_SECRET, SMARTTHINGS_TOKEN_SECRET, MONGO_URL...), produced by
// the production owner with `node scripts/homolog/preflight-env.mjs --fingerprint <prod.env>`.
// It lets this check prove no production secret is reused without ever
// seeing them.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const parse = (file) => Object.fromEntries(readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/)
  .map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));

const SECRET_KEYS = ["JWT_SECRET", "SMARTTHINGS_TOKEN_SECRET", "MONGO_URL", "AI_API_KEY", "SMARTTHINGS_CLIENT_SECRET", "LG_CLIENT_SECRET", "LG_REFRESH_TOKEN"];
const PRODUCTION_HOSTS = (process.env.WATTSTATUS_PROD_HOSTS || "wattstatus.netlify.app").split(",").map((host) => host.trim()).filter(Boolean);

const args = process.argv.slice(2);
if (args[0] === "--fingerprint") {
  // For the production owner: prints hashes only.
  const env = parse(args[1]);
  for (const key of SECRET_KEYS) if (env[key]) console.log(sha(env[key]));
  process.exit(0);
}
const file = args.find((arg) => !arg.startsWith("--"));
if (!file) { console.error("uso: preflight-env.mjs <arquivo.env> [--prod-fingerprints=<arquivo>]"); process.exit(2); }
const env = parse(file);
const fingerprintFile = args.find((arg) => arg.startsWith("--prod-fingerprints="))?.split("=")[1];
const prodHashes = new Set(fingerprintFile ? readFileSync(fingerprintFile, "utf8").split(/\s+/).filter(Boolean) : []);

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const has = (key) => typeof env[key] === "string" && env[key].length > 0;

check("NODE_ENV=production", env.NODE_ENV === "production", "cookies Secure/__Host- e recusa de segredos fracos");
check("JWT_SECRET forte", has("JWT_SECRET") && env.JWT_SECRET.length >= 32 && !/^(replace|change-me|wattstatus-dev)/i.test(env.JWT_SECRET), ">= 32 caracteres, não placeholder");
check("SMARTTHINGS_TOKEN_SECRET forte e distinto", has("SMARTTHINGS_TOKEN_SECRET") && env.SMARTTHINGS_TOKEN_SECRET.length >= 32 && env.SMARTTHINGS_TOKEN_SECRET !== env.JWT_SECRET, ">= 32 caracteres, diferente do JWT_SECRET");
check("MONGO_URL definido", has("MONGO_URL"), "banco exclusivo de homologação");
check("MONGO_DB_NAME isolado", has("MONGO_DB_NAME") && env.MONGO_DB_NAME !== "wattstatus" && /homolog|staging|hml/i.test(env.MONGO_DB_NAME), "não pode ser 'wattstatus'; deve conter homolog/staging/hml");
const origins = (env.APP_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
check("APP_ORIGINS só HTTPS de homologação", origins.length > 0 && origins.every((origin) => {
  try { const url = new URL(origin); return url.protocol === "https:" && !PRODUCTION_HOSTS.includes(url.hostname); } catch { return false; }
}), `origens: ${origins.length}; nenhuma pode ser ${PRODUCTION_HOSTS.join(", ")}`);
check("SMARTTHINGS_REDIRECT_URI não aponta para produção", !has("SMARTTHINGS_REDIRECT_URI") || !PRODUCTION_HOSTS.includes(new URL(env.SMARTTHINGS_REDIRECT_URI).hostname), "callback de homologação ou vazio");
check("IA generativa desligada", (env.AI_ENABLED ?? "false") !== "true", "AI_ENABLED=false");
check("Sem chave de IA", !has("AI_API_KEY"), "AI_API_KEY vazia na fase inicial");
check("Coleta desligada", (env.ENERGY_COLLECTION_ENABLED ?? "false") !== "true", "ENERGY_COLLECTION_ENABLED=false");
check("Envio de alertas desligado", (env.AI_ALERTS_DELIVERY ?? "off") !== "on", "AI_ALERTS_DELIVERY=off");
check("SmartThings OAuth desligado", !has("SMARTTHINGS_CLIENT_ID") && !has("SMARTTHINGS_CLIENT_SECRET"), "CLIENT_ID/SECRET vazios na fase inicial");
check("SMARTTHINGS_TOKEN global ausente", !has("SMARTTHINGS_TOKEN"), "nenhum token SmartThings de serviço");
check("AI_ADMIN_EMAILS ausente", !("AI_ADMIN_EMAILS" in env), "descontinuada; admin vem de admin_grants");
check("TRUST_PROXY_HOPS definido", has("TRUST_PROXY_HOPS") && /^[0-5]$/.test(env.TRUST_PROXY_HOPS), "mesmo valor validado em produção");
if (prodHashes.size) {
  const reused = SECRET_KEYS.filter((key) => has(key) && prodHashes.has(sha(env[key])));
  check("Nenhum segredo de produção reutilizado", reused.length === 0, reused.length ? `reutilizados: ${reused.join(", ")}` : "comparado por sha256");
} else {
  check("Nenhum segredo de produção reutilizado", null, "não verificado: forneça --prod-fingerprints");
}
const unknown = Object.keys(env).filter((key) => !/^(NODE_ENV|PORT|JWT_SECRET|SMARTTHINGS_|MONGO_|APP_ORIGINS|TRUST_PROXY_HOPS|TARIFFS_API_URL|ENERGY_COLLECTION_|AI_|LG_|VITE_API_BASE_URL)/.test(key));
if (unknown.length) check("Variáveis desconhecidas", false, unknown.join(", "));

for (const row of results) console.log(`${row.ok === true ? "OK  " : row.ok === null ? "??  " : "FALHA"} ${row.name} — ${row.detail}`);
const failed = results.filter((row) => row.ok === false).length;
console.log(failed ? `\n${failed} verificação(ões) falharam. Não configure o ambiente.` : "\nPronto para configurar na Netlify (homologação).");
process.exit(failed ? 1 : 0);
