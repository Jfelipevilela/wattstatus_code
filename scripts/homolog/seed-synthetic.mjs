// Creates synthetic data on a HOMOLOGATION site through the public API (no
// database access): users @example.com, a property with rooms and
// appliances. Refuses production hosts. Prints the created e-mails; the
// password is printed once so the tester can sign in.
//
//   node scripts/homolog/seed-synthetic.mjs --base=https://<homolog-site> [--users=2] [--allow-http-local]
import { randomUUID } from "node:crypto";

const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const BASE = (arg("base") || "").replace(/\/$/, "");
const PRODUCTION_HOSTS = (process.env.WATTSTATUS_PROD_HOSTS || "wattstatus.netlify.app").split(",").map((h) => h.trim()).filter(Boolean);
if (!BASE) { console.error("--base é obrigatório"); process.exit(2); }
const target = new URL(BASE);
if (PRODUCTION_HOSTS.includes(target.hostname)) { console.error(`Recusado: ${target.hostname} é produção.`); process.exit(2); }
if (target.protocol !== "https:" && !(["127.0.0.1", "localhost"].includes(target.hostname) && process.argv.includes("--allow-http-local"))) {
  console.error("Use HTTPS."); process.exit(2);
}
const ORIGIN = target.origin;

const session = () => {
  const jar = new Map();
  const send = async (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("origin", ORIGIN);
    if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await fetch(`${ORIGIN}${path}`, { ...init, headers });
    for (const line of res.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    return res;
  };
  const call = async (method, path, body) => {
    const csrf = method === "GET" ? null : (await (await send("/api/auth/csrf")).json()).csrfToken;
    const res = await send(path, { method, headers: { "content-type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data.error ?? ""}`);
    return data;
  };
  return { call };
};

const APPLIANCES = [
  { name: "Ar-condicionado", power: 1400, usageHours: 8, room: "Quarto" },
  { name: "TV", power: 120, usageHours: 5, room: "Sala" },
  { name: "Computador", power: 300, usageHours: 8, room: "Escritório" },
  { name: "Geladeira", power: 150, usageHours: 24, room: null },
  { name: "Chuveiro elétrico", power: 5500, usageHours: 0.5, room: null },
];

const main = async () => {
  const password = `Homolog-${randomUUID()}`;
  const users = Math.max(1, Math.min(10, Number(arg("users") || 2)));
  const created = [];
  for (let n = 0; n < users; n++) {
    const email = `homolog-seed-${Date.now()}-${n}@example.com`;
    const s = session();
    await s.call("POST", "/api/auth/register", { name: `Teste ${n + 1}`, email, password, confirmPassword: password, acceptTerms: true });
    const { properties } = await s.call("GET", "/api/properties");
    const property = properties[0];
    const rooms = {};
    for (const [name, type] of [["Sala", "living"], ["Quarto", "bedroom"], ["Escritório", "office"]]) {
      rooms[name] = (await s.call("POST", `/api/properties/${property.id}/rooms`, { name, type })).room?.id;
    }
    for (const item of APPLIANCES) {
      await s.call("POST", "/api/appliances", { name: item.name, power: item.power, usageHours: item.usageHours, days: 30, tariff: "SP", propertyId: property.id, roomId: item.room ? rooms[item.room] ?? null : null });
    }
    created.push(email);
  }
  console.log(JSON.stringify({ base: ORIGIN, users: created, password, note: "Dados sintéticos de homologação. Não reutilize a senha." }, null, 2));
};
main().catch((error) => { console.error("seed falhou:", error.message); process.exit(1); });
