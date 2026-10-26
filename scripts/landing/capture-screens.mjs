// Captures the platform screenshots used on the landing
// (public/landing/app-*.webp) from the disposable demo server.
//
// Usage, with scripts/landing/demo-server.cjs running:
//   npm i --no-save playwright-core
//   node scripts/landing/capture-screens.mjs --email=demo@example.test --password=<printed> --property=<printed id> [--url=http://127.0.0.1:4611] [--chrome=<path>]
// Needs Python with Pillow for the WebP conversion (PNGs stay in tmp/landing-screens/).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const arg = (name, fallback) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = arg("url", "http://127.0.0.1:4611");
const email = arg("email");
const password = arg("password");
const propertyId = arg("property");
if (!email || !password || !propertyId) {
  console.error("Pass --email, --password and --property as printed by demo-server.cjs");
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "tmp/landing-screens");
mkdirSync(out, { recursive: true });

const { chromium } = await import("playwright-core");
const browser = await chromium.launch({ executablePath: arg("chrome", process.env.CHROME_PATH) });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", deviceScaleFactor: 1.5 })).newPage();
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.getByLabel(/e-?mail/i).fill(email);
await page.getByLabel(/senha/i).first().fill(password);
await page.getByRole("button", { name: /entrar/i }).last().click();
await page.waitForURL("**/dashboard", { timeout: 20000 });

const shots = [
  ["dashboard", "/dashboard"],
  ["property", `/imoveis/${propertyId}`],
  ["appliances", "/aparelhos"],
  ["ai", "/dashboard", async () => {
    await page.getByRole("button", { name: /WattStatus AI/ }).last().click();
    await page.waitForTimeout(4000);
  }],
];
for (const [name, url, act] of shots) {
  await page.goto(base + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  if (act) await act();
  const png = path.join(out, `${name}.png`);
  await page.screenshot({ path: png });
  const webp = path.join(root, "public/landing", `app-${name}.webp`);
  execFileSync("python", ["-c", `from PIL import Image; Image.open(r"${png}").convert("RGB").resize((1600, 1000), Image.LANCZOS).save(r"${webp}", "WEBP", quality=80, method=6)`]);
  console.log(`wrote ${path.relative(root, webp)}`);
}
await browser.close();
