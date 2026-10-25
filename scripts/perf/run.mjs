// Runs the whole lab benchmark against a fresh isolated fixture and drops the
// throwaway database afterwards.
//
//   node scripts/perf/run.mjs --label=before [--rooms=20] [--skip-browser] [--skip-api]
// Results land in scripts/perf/results/<label>-*.json.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const label = arg("label", "run");
const rooms = arg("rooms", "20");
const port = arg("port", "4511");
const results = path.join(here, "results");
mkdirSync(results, { recursive: true });

const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "inherit"] });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args[0]} exited ${code}`))));
});

const server = spawn(process.execPath, [path.join(here, "bench-server.cjs"), `--rooms=${rooms}`, `--port=${port}`],
  { stdio: ["pipe", "pipe", "inherit"] });
const ready = await new Promise((resolve, reject) => {
  let buffer = "";
  server.stdout.on("data", (chunk) => {
    buffer += chunk;
    const line = buffer.split("\n").find((item) => item.includes('"ready"'));
    if (line) resolve(JSON.parse(line));
  });
  server.on("exit", () => reject(new Error("fixture exited")));
});
const url = ready.url;
const property = ready.users[0].propertyId;
console.log(`fixture ${ready.dbName} rooms=${rooms} seeded in ${ready.seedMs} ms`);
try {
  if (!process.argv.includes("--skip-api")) {
    await run([path.join(here, "api-bench.mjs"), `--url=${url}`, `--property=${property}`, `--samples=${arg("samples", "12")}`,
      `--users=${arg("users", "8")}`, `--seconds=${arg("seconds", "30")}`, `--out=${path.join(results, `${label}-api-r${rooms}.json`)}`]);
    console.log("api done");
    // Fresh limiter window for the browser run.
    await new Promise((resolve) => setTimeout(resolve, 60000 - (Date.now() % 60000) + 100));
  }
  if (!process.argv.includes("--skip-browser")) {
    for (const profile of (arg("profiles", "desktop,mobile")).split(",")) {
      await run([path.join(here, "measure.mjs"), `--url=${url}`, `--property=${property}`, `--profile=${profile}`,
        `--runs=${arg("runs", "3")}`, `--out=${path.join(results, `${label}-browser-${profile}-r${rooms}.json`)}`]);
      console.log(`browser ${profile} done`);
      await new Promise((resolve) => setTimeout(resolve, 60000 - (Date.now() % 60000) + 100));
    }
  }
} finally {
  server.stdin.write("quit\n");
  await new Promise((resolve) => server.on("exit", resolve));
}
