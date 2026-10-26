// Renders the static hero posters (public/landing/hero-poster*.webp) from the
// live 3D scene, so the poster always matches the canvas it stands in for.
//
// Usage, from the repo root, with the app running (npm run dev or preview):
//   npm i --no-save playwright-core
//   node scripts/landing/render-posters.mjs [--url=http://localhost:8080] [--chrome=<path to chrome.exe>]
//
// Converting PNG to WebP needs Python with Pillow (pip install pillow); the
// PNGs are kept in tmp/landing-posters/ either way.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const arg = (name, fallback) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const url = arg("url", "http://localhost:8080/");
const executablePath = arg("chrome", process.env.CHROME_PATH);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "tmp/landing-posters");
mkdirSync(out, { recursive: true });

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.error("playwright-core not found. Run: npm i --no-save playwright-core");
  process.exit(1);
}

const browser = await chromium.launch({ executablePath });
const targets = [
  { name: "hero-poster", width: 1600, height: 900, scale: 1, mobile: false },
  { name: "hero-poster-mobile", width: 390, height: 844, scale: 2, mobile: true },
];
for (const target of targets) {
  const context = await browser.newContext({
    viewport: { width: target.width, height: target.height },
    deviceScaleFactor: target.scale,
    isMobile: target.mobile,
    // Reduced motion: lights at full level, no sway, deterministic frame.
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  // Force the live scene even if this browser stored a light-mode choice.
  await page.addInitScript(() => localStorage.setItem("wattstatus-landing-3d", "on"));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => performance.getEntriesByName("hero-3d-first-frame").length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(4000);
  // Keep only the canvas: hide the header, copy, markers and overlays.
  await page.evaluate(() => {
    const stage = document.querySelector('[aria-label="Casa demonstrativa em 3D"]');
    const hide = (el) => el && (el.style.visibility = "hidden");
    document.querySelectorAll("header, .l-marker, [role=toolbar]").forEach(hide);
    hide(document.querySelector("#hero-title")?.closest(".l-container"));
    [...stage.children].forEach((el) => {
      if (!el.querySelector("canvas")) hide(el);
    });
  });
  const png = path.join(out, `${target.name}.png`);
  await page.locator('[aria-label="Casa demonstrativa em 3D"]').screenshot({ path: png });
  await context.close();
  const webp = path.join(root, "public/landing", `${target.name}.webp`);
  try {
    execFileSync("python", ["-c", `from PIL import Image; Image.open(r"${png}").convert("RGB").save(r"${webp}", "WEBP", quality=72, method=6)`]);
    console.log(`wrote ${path.relative(root, webp)}`);
  } catch {
    console.warn(`Pillow unavailable: convert ${path.relative(root, png)} to ${path.relative(root, webp)} manually.`);
  }
}
await browser.close();
