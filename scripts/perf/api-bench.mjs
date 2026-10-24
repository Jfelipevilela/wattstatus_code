// API latency, MongoDB command counts and a bounded concurrent load test against
// the isolated scripts/perf/bench-server.cjs. Never run against production.
//
//   node scripts/perf/api-bench.mjs --url=http://127.0.0.1:4511 --property=<id> \
//     [--samples=40] [--users=10] [--seconds=20] [--out=file.json]
const arg = (name, fallback) => {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const base = arg("url", "http://127.0.0.1:4511");
const propertyId = arg("property");
const samples = Number(arg("samples", 40));
const users = Number(arg("users", 10));
const seconds = Number(arg("seconds", 20));
const out = arg("out");
const pace = Number(arg("pace", 550));
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) throw new Error("Benchmarks only run against a local fixture");

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return +sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)].toFixed(1);
};

const session = async (email, password) => {
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  const csrfCookie = csrfRes.headers.getSetCookie().map((item) => item.split(";")[0]);
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, Cookie: csrfCookie.join("; "), Origin: base },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return res.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
};

const month = () => {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400000);
  return new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
};
const ENDPOINTS = [
  "/api/auth/me",
  "/api/properties",
  "/api/appliances",
  "/api/user-settings",
  () => `/api/energy/history?${month()}`,
  () => `/api/energy/history?${month()}&format=columns`,
  () => `/api/properties/${propertyId}/floors`,
  () => `/api/properties/${propertyId}/rooms`,
  () => `/api/properties/${propertyId}/energy?${month()}`,
  "/api/ai/insights",
];

const get = async (cookie, path) => {
  const started = performance.now();
  const res = await fetch(base + path, { headers: { Cookie: cookie } });
  const body = await res.arrayBuffer();
  return { status: res.status, ms: performance.now() - started, bytes: body.byteLength };
};

const main = async () => {
  // Sessions first: the login limiters allow 10 attempts per account and IP.
  const cookies = [];
  for (let i = 0; i < users; i++) cookies.push(await session(i % 2 ? "perf-b@example.test" : "perf-a@example.test", "Perf-Fixture-123!"));
  const cookie = cookies[0];
  const report = { base, at: new Date().toISOString(), endpoints: {}, load: null };
  // Sequential: latency distribution + Mongo commands per request.
  for (const endpoint of ENDPOINTS) {
    const path = typeof endpoint === "function" ? endpoint() : endpoint;
    const key = path.split("?")[0].replace(/[0-9a-f-]{36}/g, ":id") + (path.includes("format=columns") ? "?format=columns" : "");
    await fetch(`${base}/__perf/commands?reset=1`);
    await get(cookie, path);
    const commands = await fetch(`${base}/__perf/commands?reset=1`).then((res) => res.json());
    const times = [];
    let bytes = 0;
    let statuses = new Set();
    for (let i = 0; i < samples; i++) {
      const result = await get(cookie, path);
      times.push(result.ms); bytes = result.bytes; statuses.add(result.status);
      // Paced under the global per-IP limiter so latency is measured, not 429s.
      await new Promise((resolve) => setTimeout(resolve, pace));
    }
    report.endpoints[key] = {
      p50: percentile(times, 50), p95: percentile(times, 95), p99: percentile(times, 99),
      responseKB: +(bytes / 1024).toFixed(1), statuses: [...statuses],
      mongoCommands: commands.total, commands: commands.byName,
    };
  }
  // Start the load phase in a fresh limiter window.
  await new Promise((resolve) => setTimeout(resolve, 60000 - (Date.now() % 60000) + 100));
  // Load: N independent sessions from the same IP (like an office NAT) opening
  // the dashboard data set in a loop for a fixed time.
  const dashboard = ["/api/auth/me", "/api/properties", "/api/appliances", "/api/user-settings", `/api/energy/history?${month()}`];
  const deadline = Date.now() + seconds * 1000;
  const times = [];
  const statuses = {};
  await Promise.all(cookies.map(async (userCookie) => {
    while (Date.now() < deadline) {
      const results = await Promise.all(dashboard.map((path) => get(userCookie, path)));
      for (const result of results) { times.push(result.ms); statuses[result.status] = (statuses[result.status] || 0) + 1; }
      // A user does not reload the dashboard continuously: think time 1-3 s.
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));
    }
  }));
  report.load = {
    users, seconds, requests: times.length, throughputRps: +(times.length / seconds).toFixed(1),
    p50: percentile(times, 50), p95: percentile(times, 95), p99: percentile(times, 99), statuses,
  };
  const json = JSON.stringify(report, null, 2);
  if (out) (await import("node:fs")).writeFileSync(out, json);
  console.log(json);
};

main().catch((error) => { console.error(error); process.exit(1); });
