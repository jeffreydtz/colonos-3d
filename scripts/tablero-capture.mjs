import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.ART_URL ?? "http://127.0.0.1:43210";
const tag = (() => {
  const i = process.argv.indexOf("--tag");
  return i >= 0 ? String(process.argv[i + 1] ?? "shot") : "shot";
})();

const destDir = process.env.ART_DEST ?? path.join(ROOT, "docs", "art", "tablero-fix");
/** Parámetros extra de URL, ej. `&env=1` (look de GPU en dev) o `&cam=dados`. */
const EXTRA = process.env.ART_EXTRA ?? "";
fs.mkdirSync(destDir, { recursive: true });
const artOut = "/opt/cursor/artifacts";
fs.mkdirSync(artOut, { recursive: true });

function chromePath() {
  for (const p of [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("no chrome");
}

const D1 = { vp: "1440", width: 1440, height: 900, dpr: 1, mobile: false };
const M1 = { vp: "390", width: 390, height: 844, dpr: 2, mobile: true };

/**
 * Matriz de cierre: 3, 4 y 6 jugadores × 1440 y 390 × normal / liviano / noche.
 * 3 jugadores sale vacío (S0); 4 y 6 salen con piezas (S1) para ver caminos y puertos.
 */
function jobs() {
  const looks = [
    { tier: "normal", theme: "atardecer", look: "normal" },
    { tier: "liviano", theme: "atardecer", look: "liviano" },
    { tier: "normal", theme: "noche", look: "noche" },
  ];
  const boards = [
    { players: 3, scene: "S0-vacio" },
    { players: 4, scene: "S1-lleno" },
    { players: 6, scene: "S1-lleno" },
  ];
  const all = [];
  for (const board of boards) {
    for (const look of looks) {
      for (const shot of [D1, M1]) {
        all.push({
          scene: board.scene,
          shot,
          tier: look.tier,
          theme: look.theme,
          players: board.players,
          label: `${board.players}p_${look.look}`,
        });
      }
    }
  }
  all.push(
    { scene: "S6-grande", shot: D1, tier: "normal", theme: "atardecer", players: 6, label: "6p_grande" },
    { scene: "S1-lleno", shot: D1, tier: "normal", theme: "dia", players: 4, label: "4p_dia" },
  );
  const only = (() => {
    const i = process.argv.indexOf("--only");
    return i >= 0 ? String(process.argv[i + 1] ?? "") : "";
  })();
  if (!only) return all;
  return all.filter((j) => j.label.includes(only) || j.scene.includes(only));
}

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: "new",
  protocolTimeout: 90_000,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--window-size=1440,900",
  ],
  defaultViewport: { width: 1440, height: 900 },
});

const metrics = {};

async function capture(job) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);
  await page.setViewport({
    width: job.shot.width,
    height: job.shot.height,
    deviceScaleFactor: job.shot.dpr,
    isMobile: job.shot.mobile,
    hasTouch: job.shot.mobile,
  });
  const players = job.players ? `&players=${job.players}` : "";
  const cam = /[?&]cam=/.test(EXTRA) ? "" : "&cam=tactica";
  const url = `${BASE}/?scene=${job.scene}&seed=42&tier=${job.tier}&freeze=1&theme=${job.theme}${cam}${players}${EXTRA}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 20000 });
  await page.waitForFunction(() => window.__colonosReady === true, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 500));
  const extra = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return { luma: null };
    const w = canvas.width;
    const h = canvas.height;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const g = tmp.getContext("2d");
    if (!g) return { luma: null };
    try {
      g.drawImage(canvas, 0, 0);
    } catch {
      return { luma: null };
    }
    const x0 = Math.floor(w * 0.2);
    const y0 = Math.floor(h * 0.2);
    const cw = Math.floor(w * 0.6);
    const ch = Math.floor(h * 0.6);
    const { data } = g.getImageData(x0, y0, cw, ch);
    const lin = (c) => {
      const x = c / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 16) {
      sum += 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
      n += 1;
    }
    return { lumaMean: sum / n, hexCount: document.body.innerText.includes("isla") };
  });
  const name = `${tag}_${job.label}_${job.shot.vp}`;
  const png = path.join(destDir, `${name}.png`);
  await page.screenshot({ path: png, type: "png" });
  const perf = await page.evaluate(() => window.__colonosPerf);
  metrics[name] = { ...perf, ...extra, theme: job.theme, tier: job.tier, players: job.players, scene: job.scene };
  console.log(name, metrics[name]);
  await ctx.close();
}

for (const job of jobs()) {
  await capture(job);
}

fs.writeFileSync(path.join(destDir, `${tag}-metrics.json`), JSON.stringify(metrics, null, 2));
console.log("wrote", destDir);
await browser.close();
