// Security and streaming checks against a HOMOLOGATION deploy. Creates
// synthetic accounts (@example.com) in that site's database; refuses
// production hosts. Never enables anything and never sends a model request
// unless the site already has generative AI on and --allow-generative is set.
//
//   node scripts/homolog/remote-check.mjs --base=https://<homolog-site> \
//     [--admin-email=... --admin-password=...]   (admin provisioned via admin-grant.cjs)
//     [--allow-http-local]                         (only for http://127.0.0.1 rehearsals)
//
// Prints a JSON report. Exit code 1 when a required check fails.
import { randomUUID } from "node:crypto";

const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name) => process.argv.includes(`--${name}`);
const BASE = (arg("base") || "").replace(/\/$/, "");
const PRODUCTION_HOSTS = (process.env.WATTSTATUS_PROD_HOSTS || "wattstatus.netlify.app").split(",").map((h) => h.trim()).filter(Boolean);
const fail = (message) => { console.error(message); process.exit(2); };
if (!BASE) fail("--base é obrigatório");
const target = new URL(BASE);
if (PRODUCTION_HOSTS.includes(target.hostname)) fail(`Recusado: ${target.hostname} é produção.`);
const local = ["127.0.0.1", "localhost"].includes(target.hostname);
if (target.protocol !== "https:" && !(local && flag("allow-http-local"))) fail("Use HTTPS (ou --allow-http-local para ensaio em 127.0.0.1).");
const ORIGIN = target.origin;

const report = { base: ORIGIN, at: new Date().toISOString(), checks: [] };
const record = (id, ok, detail, required = true) => { report.checks.push({ id, ok, required, detail }); return ok; };

// Cookie jar per synthetic person; cookies are kept in memory only.
const person = () => {
  const jar = new Map();
  const cookies = [];
  const send = async (path, init = {}, { origin = ORIGIN, withCookies = true } = {}) => {
    const headers = new Headers(init.headers);
    if (origin) headers.set("origin", origin);
    if (withCookies && jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await fetch(`${ORIGIN}${path}`, { ...init, headers, redirect: "manual" });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      cookies.push(line);
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  };
  const csrf = async () => (await (await send("/api/auth/csrf")).json()).csrfToken;
  const post = async (path, body, extra = {}) => send(path, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": extra.csrf ?? await csrf() }, body: JSON.stringify(body) }, extra);
  return { send, post, csrf, cookies, jar };
};
const register = async (p, email, password) => p.post("/api/auth/register", { name: "Homologação", email, password, confirmPassword: password, acceptTerms: true });
const login = async (p, email, password) => p.post("/api/auth/login", { email, password });

const readStream = async (res, { abortAfterFirst = false, controller } = {}) => {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let chunks = 0, text = "";
  const t0 = Date.now();
  for (;;) {
    const { value, done } = await reader.read().catch(() => ({ done: true }));
    if (done) break;
    chunks++;
    text += decoder.decode(value, { stream: true });
    for (const match of text.matchAll(/event: (\w+)/g)) if (events.length < [...text.matchAll(/event: (\w+)/g)].length) events.push({ event: match[1], ms: Date.now() - t0 });
    if (abortAfterFirst && events.length) { controller.abort(); break; }
  }
  return { chunks, events: [...text.matchAll(/event: (\w+)/g)].map((m) => m[1]), timeline: events, text };
};

const main = async () => {
  const password = `Homolog-${randomUUID()}`;
  const alice = person(), bob = person();
  const aliceEmail = `homolog-a-${Date.now()}@example.com`;
  const bobEmail = `homolog-b-${Date.now()}@example.com`;

  // Headers and cookies.
  const home = await fetch(ORIGIN, { redirect: "manual" });
  record("H1 cabeçalhos de segurança", ["x-frame-options", "x-content-type-options", "content-security-policy", "referrer-policy"].every((h) => home.headers.get(h)) || local,
    local ? "ignorado em ensaio local (cabeçalhos vêm do netlify.toml)" : "X-Frame-Options, nosniff, CSP, Referrer-Policy", !local);
  const reg = await register(alice, aliceEmail, password);
  record("A1 cadastro", reg.status === 201, `status ${reg.status}`);
  const sessionCookie = alice.cookies.find((line) => /wattstatus_token=/.test(line)) ?? "";
  record("C1 cookie de sessão Secure + HttpOnly + SameSite + __Host-", /;\s*Secure/i.test(sessionCookie) && /HttpOnly/i.test(sessionCookie) && /SameSite=Lax/i.test(sessionCookie) && /^__Host-/.test(sessionCookie),
    sessionCookie.replace(/=([^;]+)/, "=<valor>"), !local);
  await register(bob, bobEmail, password);

  // CSRF and CORS.
  const noCsrf = await alice.send("/api/properties", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }) });
  record("X1 mutação sem CSRF recusada", noCsrf.status === 403, `status ${noCsrf.status}`);
  const foreign = await alice.send("/api/properties", {}, { origin: "https://exemplo.invalid" });
  record("X2 origem externa recusada (CORS)", foreign.status === 403 && !foreign.headers.get("access-control-allow-origin"), `status ${foreign.status}`);

  // Session lifecycle and isolation.
  const me = await alice.send("/api/auth/me");
  record("S1 sessão ativa", me.status === 200, `status ${me.status}`);
  const aliceProps = await (await alice.send("/api/properties")).json();
  const aliceProperty = aliceProps.properties?.[0]?.id;
  const bobPeek = aliceProperty ? await bob.send(`/api/properties/${aliceProperty}`) : { status: 0 };
  record("I1 outro usuário não lê o imóvel", [403, 404].includes(bobPeek.status), `status ${bobPeek.status}`);

  // Admin.
  const adminPaths = ["/api/ai/admin/settings", "/api/ai/admin/usage", "/api/energy/collection-stats"];
  const userAdmin = await Promise.all(adminPaths.map(async (path) => (await alice.send(path)).status));
  record("P1 usuário comum recebe 403 na administração", userAdmin.every((status) => status === 403), userAdmin.join(","));
  const status = await (await alice.send("/api/ai/status")).json();
  record("P2 /api/ai/status admin=false para usuário comum", status.admin === false, `admin=${status.admin}`);
  record("G1 IA generativa desligada", status.generative === false || flag("allow-generative"), `generative=${status.generative}`);
  if (arg("admin-email") && arg("admin-password")) {
    const admin = person();
    const signedIn = await login(admin, arg("admin-email"), arg("admin-password"));
    const statuses = await Promise.all(adminPaths.map(async (path) => (await admin.send(path)).status));
    record("P3 administrador de teste (admin_grants) acessa", signedIn.status === 200 && statuses.every((s) => s === 200), `login ${signedIn.status}; ${statuses.join(",")}`);
  } else record("P3 administrador de teste", null, "não informado (--admin-email/--admin-password)", false);

  // SmartThings commands without a configured token are refused.
  const command = await alice.post("/api/integrations/smartthings/devices/qualquer/commands", { capability: "switch", command: "on" });
  record("T1 comando SmartThings sem integração recusado", command.status >= 400 && command.status < 500, `status ${command.status}`);

  // Streaming: routing, refusals, progressive delivery, cancellation.
  const streamNoSession = await person().post("/api/ai/chat/stream", { message: "Oi" });
  record("R1 stream sem sessão recusado", [401, 403].includes(streamNoSession.status) && /json/.test(streamNoSession.headers.get("content-type") || ""), `status ${streamNoSession.status}`);
  const streamForeign = await alice.send("/api/ai/chat/stream", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": await alice.csrf() }, body: JSON.stringify({ message: "Oi" }) }, { origin: "https://exemplo.invalid" });
  record("R2 stream de origem externa recusado", streamForeign.status === 403, `status ${streamForeign.status}`);
  const streamBadCsrf = await alice.post("/api/ai/chat/stream", { message: "Oi" }, { csrf: "forjado" });
  record("R3 stream com CSRF inválido recusado", streamBadCsrf.status === 403, `status ${streamBadCsrf.status}`);
  if (status.generative && !flag("allow-generative")) {
    record("R4 stream autenticado", null, "pulado: IA generativa ligada no site (evita consumir créditos)", true);
  } else {
    const ok = await alice.post("/api/ai/chat/stream", { message: "Analisar minha casa" });
    const stream = await readStream(ok);
    record("R4 stream autenticado (text/event-stream, etapas e resposta)", ok.status === 200 && /text\/event-stream/.test(ok.headers.get("content-type") || "") && stream.events.at(-1) === "response" && stream.events.includes("stage"),
      `status ${ok.status}; eventos ${stream.events.join(",")}`);
    const spread = stream.timeline.length > 1 ? stream.timeline.at(-1).ms - stream.timeline[0].ms : 0;
    record("R5 entrega progressiva", stream.chunks > 1, `${stream.chunks} pedaço(s); intervalo entre o 1º e o último evento ${spread} ms (respostas do motor são rápidas: 1 pedaço indica buffer da plataforma)`, false);
    const response = JSON.parse(stream.text.match(/event: response\ndata: (.*)\n/)?.[1] ?? "{}");
    record("R6 resposta determinística (sem modelo)", response.meta?.generated === "deterministic" || flag("allow-generative"), `generated=${response.meta?.generated}`);
    const controller = new AbortController();
    const cancelled = await alice.send("/api/ai/chat/stream", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": await alice.csrf() }, body: JSON.stringify({ message: "Minha conta aumentou muito. Descubra o motivo." }), signal: controller.signal })
      .then((res) => readStream(res, { abortAfterFirst: true, controller }).then(() => "cancelado após o 1º evento"), (error) => `abortado: ${error.name}`);
    const after = await alice.send("/api/auth/me");
    record("R7 cancelamento sem afetar a sessão", after.status === 200, `${cancelled}; /me depois: ${after.status}`);
  }

  // AI rate limit: 429 without losing the session.
  let limited = 0;
  for (let i = 0; i < 25 && !limited; i++) {
    const res = await alice.post("/api/ai/chat", { message: "Qual aparelho mais gasta?" });
    if (res.status === 429) limited = i + 1;
  }
  const stillIn = await alice.send("/api/auth/me");
  record("L1 limite da IA responde 429", limited > 0, limited ? `429 na requisição ${limited}` : "sem 429 em 25 requisições", !local);
  record("L2 429 não encerra a sessão", stillIn.status === 200, `/me ${stillIn.status}`);

  // Logout.
  await alice.post("/api/auth/logout", {});
  const afterLogout = await alice.send("/api/auth/me");
  record("S2 logout encerra a sessão", afterLogout.status === 401, `status ${afterLogout.status}`);

  report.syntheticAccounts = [aliceEmail, bobEmail];
  console.log(JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => c.required && c.ok === false);
  process.exit(failed.length ? 1 : 0);
};
main().catch((error) => { console.error("remote-check falhou:", error.message); process.exit(1); });
