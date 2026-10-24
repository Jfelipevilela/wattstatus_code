// Browser lab measurements through the Chrome DevTools Protocol (no extra deps).
// Requires a running scripts/perf/bench-server.cjs.
//
//   node scripts/perf/measure.mjs --url=http://127.0.0.1:4511 --property=<id> \
//     [--profile=desktop|mobile] [--runs=3] [--out=file.json]
//
// desktop: 1440x900, no throttling. mobile: 390x844 DPR 3, CPU 4x slower and
// "Slow 4G"-like network (150 ms RTT, 1.6 Mbps down, 750 kbps up).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const arg = (name, fallback) => {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const base = arg("url", "http://127.0.0.1:4511");
const propertyId = arg("property");
const profile = arg("profile", "desktop");
const runs = Number(arg("runs", 3));
const out = arg("out");
// --routes=reports,dashboard measures only those loads and skips SPA/3D/memory.
const only = arg("routes")?.split(",");
const email = arg("email", "perf-a@example.test");
const password = arg("password", "Perf-Fixture-123!");
const chromePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((item) => item && existsSync(item));
if (!chromePath) throw new Error("Chrome not found; set CHROME_PATH");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Collected inside the page from the first byte of every document.
const OBSERVERS = `(() => {
  const m = window.__perf = { lcp: 0, cls: 0, longTasks: [], fcp: 0, draws: 0, frames: 0, triangles: 0 };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) m.lcp = e.startTime; })
      .observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) {
      m.cls += e.value;
      // Which elements moved, to find the cause of a shift.
      (m.shifts ||= []).push({ value: +e.value.toFixed(4), at: Math.round(e.startTime), nodes: (e.sources || [])
        .map((s) => s.node ? s.node.nodeName + "." + String(s.node.className || "").slice(0, 60) + " y " + s.previousRect.y + "→" + s.currentRect.y + " h " + s.previousRect.height + "→" + s.currentRect.height : "?") });
    } })
      .observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) m.longTasks.push([e.startTime, e.duration]); })
      .observe({ type: "longtask", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") m.fcp = e.startTime; })
      .observe({ type: "paint", buffered: true });
  } catch {}
  for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
    if (!proto) continue;
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const original = proto[name];
      if (!original) continue;
      proto[name] = function (mode, a, b, c, d) {
        m.draws++;
        const count = name.startsWith("drawElements") ? a : b;
        const instances = name.endsWith("Instanced") ? (name === "drawElementsInstanced" ? d : c) : 1;
        if (mode === 4) m.triangles += (count / 3) * instances;
        return original.apply(this, arguments);
      };
    }
  }
})();`;

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) for (const listener of this.listeners) listener(msg);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(listener) { this.listeners.push(listener); }
}

const launch = async () => {
  const userDir = mkdtempSync(path.join(tmpdir(), "watt-perf-"));
  const chrome = spawn(chromePath, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${userDir}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--enable-precise-memory-info",
    "--js-flags=--expose-gc", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    chrome.stderr.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    chrome.on("exit", () => reject(new Error("Chrome exited")));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  const cdp = new Cdp(ws);
  const close = async () => { ws.close(); chrome.kill(); await sleep(500); try { rmSync(userDir, { recursive: true, force: true }); } catch {} };
  return { cdp, close };
};

const openPage = async (cdp) => {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);
  const requests = new Map();
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Network.requestWillBeSent") {
      requests.set(msg.params.requestId, { url: msg.params.request.url, method: msg.params.request.method,
        type: msg.params.type, start: msg.params.timestamp, done: false, bytes: 0, status: 0 });
    } else if (msg.method === "Network.responseReceived") {
      const row = requests.get(msg.params.requestId);
      if (row) { row.status = msg.params.response.status; row.fromCache = msg.params.response.fromDiskCache || msg.params.response.fromMemoryCache; }
    } else if (msg.method === "Network.loadingFinished" || msg.method === "Network.loadingFailed") {
      const row = requests.get(msg.params.requestId);
      if (row) { row.done = true; row.end = msg.params.timestamp; row.bytes = msg.params.encodedDataLength || 0; }
    }
  });
  await send("Page.enable");
  await send("Network.enable");
  await send("Runtime.enable");
  await send("Performance.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: OBSERVERS });
  if (profile === "mobile") {
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await send("Network.emulateNetworkConditions", { offline: false, latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  } else {
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  }
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "evaluate failed");
    return result.result.value;
  };
  // Settled = no request in flight for `quiet` ms (or timeout).
  const settle = async (quiet = 800, timeout = 30000) => {
    const started = Date.now();
    let idleSince = Date.now();
    while (Date.now() - started < timeout) {
      const busy = [...requests.values()].some((row) => !row.done);
      if (busy) idleSince = Date.now();
      else if (Date.now() - idleSince >= quiet) return Date.now() - started - quiet;
      await sleep(50);
    }
    return timeout;
  };
  return { send, evaluate, settle, requests };
};

const summarizeRequests = (requests) => {
  const rows = [...requests.values()];
  const api = rows.filter((row) => new URL(row.url).pathname.startsWith("/api/"));
  const js = rows.filter((row) => row.type === "Script");
  const apiPaths = {};
  for (const row of api) {
    const key = `${row.method} ${new URL(row.url).pathname.replace(/[0-9a-f-]{36}/g, ":id")}`;
    apiPaths[key] = (apiPaths[key] || 0) + 1;
  }
  return {
    requests: rows.length,
    apiRequests: api.length,
    api429: api.filter((row) => row.status === 429).length,
    transferKB: +(rows.reduce((sum, row) => sum + row.bytes, 0) / 1024).toFixed(1),
    jsKB: +(js.reduce((sum, row) => sum + row.bytes, 0) / 1024).toFixed(1),
    jsFiles: js.length,
    apiPaths,
  };
};

const pageMetrics = async (page) => {
  const perf = await page.evaluate(`(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const m = window.__perf;
    const fcp = m.fcp || 0;
    // TBT approximation: long-task time over 50 ms after FCP.
    const tbt = m.longTasks.filter(([s]) => s >= fcp).reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0);
    return { ttfb: nav ? nav.responseStart : 0, fcp, lcp: m.lcp, cls: +m.cls.toFixed(4), shifts: m.shifts, tbt: Math.round(tbt),
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
  })()`);
  for (const key of ["ttfb", "fcp", "lcp", "domContentLoaded"]) perf[key] = Math.round(perf[key]);
  return perf;
};

const login = async (page) => {
  await page.send("Page.navigate", { url: `${base}/login` });
  await page.settle(500);
  await page.evaluate(`(async () => {
    const csrf = await fetch("/api/auth/csrf", { credentials: "include" }).then((r) => r.json());
    const res = await fetch("/api/auth/login", { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.csrfToken },
      body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }) });
    if (!res.ok) throw new Error("login failed " + res.status);
    localStorage.setItem("wattstatus:floorplan-view", "3d");
  })()`);
};

const median = (values) => {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2);
};
const aggregate = (samples) => {
  const result = {};
  for (const key of Object.keys(samples[0])) {
    result[key] = typeof samples[0][key] === "number" ? median(samples.map((sample) => sample[key])) : samples[samples.length - 1][key];
  }
  return result;
};

const ROUTES = [
  { name: "home", path: "/", auth: false },
  { name: "login", path: "/login", auth: false },
  { name: "signup", path: "/signup", auth: false },
  { name: "dashboard", path: "/dashboard", auth: true },
  { name: "properties", path: "/imoveis", auth: true },
  { name: "property-3d", path: () => `/imoveis/${propertyId}`, auth: true, three: true },
  { name: "appliances", path: "/aparelhos", auth: true },
  { name: "reports", path: "/relatorios", auth: true },
  { name: "calculator", path: "/calculadora", auth: true },
  { name: "smartthings", path: "/integracoes/smartthings", auth: true },
].filter((route) => !only || only.includes(route.name));

// Full document load of one route. cold=true disables the HTTP cache.
const measureLoad = async (page, route, cold) => {
  await page.send("Network.setCacheDisabled", { cacheDisabled: cold });
  page.requests.clear();
  const started = Date.now();
  await page.send("Page.navigate", { url: base + (typeof route.path === "function" ? route.path() : route.path) });
  const settledMs = await page.settle(route.three ? 1500 : 800, 45000);
  const usableMs = Date.now() - started - (route.three ? 1500 : 800);
  const metrics = await pageMetrics(page);
  const three = route.three ? await page.evaluate(`(() => {
    const m = window.__perf; return { canvas: !!document.querySelector("canvas"), drawCallsTotal: m.draws };
  })()`) : {};
  return { ...metrics, usableMs: Math.max(usableMs, settledMs), ...summarizeRequests(page.requests), ...three };
};

// Client-side navigation through React Router (popstate), like clicking a link.
const measureSpaNav = async (page, path) => {
  page.requests.clear();
  const started = Date.now();
  await page.evaluate(`(() => { history.pushState({}, "", ${JSON.stringify(path)}); dispatchEvent(new PopStateEvent("popstate")); })()`);
  await page.settle(500, 30000);
  const { apiPaths, ...requests } = summarizeRequests(page.requests);
  return { path, settledMs: Date.now() - started - 500, ...requests, apiPaths };
};

// Frame cost of the 3D view while orbiting the camera with pointer drags.
const measure3D = async (page) => {
  await page.send("Network.setCacheDisabled", { cacheDisabled: false });
  await page.send("Page.navigate", { url: `${base}/imoveis/${propertyId}` });
  const start = Date.now();
  await page.evaluate(`new Promise((resolve) => { const t = setInterval(() => { if (document.querySelector("canvas")) { clearInterval(t); resolve(); } }, 20); setTimeout(resolve, 30000); })`);
  const canvasMs = Date.now() - start;
  await page.settle(1500, 45000);
  const box = await page.evaluate(`(() => { const r = document.querySelector("canvas")?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) return { canvasMs, error: "no canvas" };
  const idle = await page.evaluate(`(() => { const m = window.__perf; const d = m.draws; return new Promise((r) => setTimeout(() => r(m.draws - d), 2000)); })()`);
  const sample = await page.evaluate(`(() => {
    const m = window.__perf; m.draws = 0; m.triangles = 0;
    const frames = []; let last = performance.now(); let running = true;
    const tick = (now) => { frames.push(now - last); last = now; if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    window.__stopFrames = () => { running = false; return { frames, draws: m.draws, triangles: m.triangles }; };
    return true;
  })()`);
  void sample;
  let x = box.x;
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y: box.y, button: "left", clickCount: 1 });
  for (let step = 0; step < 90; step++) {
    x += step < 45 ? 4 : -4;
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: box.y, button: "left", buttons: 1 });
    await sleep(16);
  }
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y: box.y, button: "left", clickCount: 1 });
  const result = await page.evaluate("window.__stopFrames()");
  const frames = result.frames.slice(2).sort((a, b) => a - b);
  const renderedFrames = Math.max(1, frames.length);
  const metrics = await page.send("Performance.getMetrics");
  const metric = (name) => metrics.metrics.find((item) => item.name === name)?.value;
  return {
    canvasMs,
    frameMsP50: +median(frames).toFixed(1),
    frameMsP95: +(frames[Math.floor(frames.length * 0.95)] || 0).toFixed(1),
    fpsDuringOrbit: +(1000 / median(frames)).toFixed(1),
    drawCallsPerFrame: Math.round(result.draws / renderedFrames),
    trianglesPerFrame: Math.round(result.triangles / renderedFrames),
    idleDrawCalls2s: idle,
    heapMB: +(metric("JSHeapUsedSize") / 1048576).toFixed(1),
    nodes: metric("Nodes"),
  };
};

// Heap after N view toggles (3D -> 2D -> 3D), measured after forced GC.
const measureMemory = async (page, cycles = 20) => {
  const heap = async () => {
    await page.send("HeapProfiler.collectGarbage");
    await sleep(300);
    await page.send("HeapProfiler.collectGarbage");
    const metrics = await page.send("Performance.getMetrics");
    return +(metrics.metrics.find((item) => item.name === "JSHeapUsedSize").value / 1048576).toFixed(2);
  };
  await page.send("HeapProfiler.enable");
  await page.send("Page.navigate", { url: `${base}/imoveis/${propertyId}` });
  await page.settle(1500, 45000);
  const series = [await heap()];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    for (const label of ["2D", "3D"]) {
      await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === ${JSON.stringify(label)}); b && b.click(); })()`);
      await sleep(label === "3D" ? 1200 : 300);
    }
    if (cycle % 5 === 0) series.push(await heap());
  }
  return { cycles, heapMBAfterGc: series };
};

const main = async () => {
  const { cdp, close } = await launch();
  const report = { profile, base, runs, at: new Date().toISOString(), loads: {}, spa: [], three: null, memory: null };
  try {
    for (let run = 0; run < runs; run++) {
      const page = await openPage(cdp);
      for (const route of ROUTES.filter((item) => !item.auth)) {
        for (const cold of [true, false]) {
          const key = `${route.name}:${cold ? "cold" : "warm"}`;
          (report.loads[key] ||= []).push(await measureLoad(page, route, cold));
        }
      }
      await login(page);
      for (const route of ROUTES.filter((item) => item.auth)) {
        if (route.three && !propertyId) continue;
        for (const cold of [true, false]) {
          const key = `${route.name}:${cold ? "cold" : "warm"}`;
          (report.loads[key] ||= []).push(await measureLoad(page, route, cold));
        }
      }
      if (run === 0 && !only) {
        await page.send("Network.setCacheDisabled", { cacheDisabled: false });
        await page.send("Page.navigate", { url: `${base}/dashboard` });
        await page.settle(800);
        const path = ["/imoveis", ...(propertyId ? [`/imoveis/${propertyId}`] : []), "/aparelhos", "/dashboard", "/imoveis", "/relatorios", "/dashboard"];
        for (const step of path) report.spa.push(await measureSpaNav(page, step));
        if (propertyId) {
          report.three = await measure3D(page);
          report.memory = await measureMemory(page, Number(arg("cycles", 20)));
        }
      }
    }
    for (const [key, samples] of Object.entries(report.loads)) report.loads[key] = aggregate(samples);
  } finally {
    await close();
  }
  const json = JSON.stringify(report, null, 2);
  if (out) writeFileSync(out, json);
  console.log(json);
};

main().catch((error) => { console.error(error); process.exit(1); });
