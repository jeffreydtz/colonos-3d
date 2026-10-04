import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.ART_URL ?? "http://127.0.0.1:43210";
const round = (() => {
  const i = process.argv.indexOf("--round");
  return i >= 0 ? String(process.argv[i + 1] ?? "0") : "0";
})();

const destDir = path.join(ROOT, "docs", "art", `ronda-${round}`);
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

const SHOT_D1 = { vp: "D1", width: 1440, height: 900, dpr: 1, mobile: false };
const SHOT_M1 = { vp: "M1", width: 390, height: 844, dpr: 2, mobile: true };

function jobsAll() {
  if (round === "1") {
    const out = [];
    for (const scene of ["S0-vacio", "S1-lleno"]) {
      for (const theme of ["atardecer", "dia", "noche"]) {
        out.push({ scene, shot: SHOT_D1, tier: "normal", theme, cam: "tactica" });
        out.push({ scene, shot: SHOT_M1, tier: "normal", theme, cam: "tactica" });
      }
      out.push({ scene, shot: SHOT_D1, tier: "liviano", theme: "isla", cam: "tactica" });
      out.push({ scene, shot: SHOT_M1, tier: "liviano", theme: "isla", cam: "tactica" });
    }
    out.push({ scene: "S1-lleno", shot: SHOT_D1, tier: "liviano", theme: "atardecer", cam: "tactica" });
    out.push({ scene: "S0-vacio", shot: SHOT_D1, tier: "liviano", theme: "atardecer", cam: "tactica" });
    out.push({ scene: "S1-lleno", shot: SHOT_D1, tier: "normal", theme: "atardecer", cam: "tactica", cvd: "deutan" });
    out.push({ scene: "S1-lleno", shot: SHOT_D1, tier: "normal", theme: "atardecer", cam: "tactica", cvd: "protan" });
    out.push({ scene: "S1-lleno", shot: SHOT_D1, tier: "normal", theme: "atardecer", cam: "tactica", cvd: "tritan" });
    return out;
  }
  if (round === "2" || round === "3") {
    const out = [];
    for (const scene of ["S0-vacio", "S1-lleno", "S2-mosaico", "S6-grande"]) {
      for (const shot of [SHOT_D1, SHOT_M1]) {
        for (const tier of ["normal", "liviano"]) {
          out.push({ scene, shot, tier, theme: "atardecer", cam: "tactica" });
        }
      }
    }
    if (round === "3") {
      out.push({ scene: "S1-lleno", shot: SHOT_D1, tier: "normal", theme: "atardecer", cam: "tactica", cvd: "deutan" });
      out.push({ scene: "S1-lleno", shot: SHOT_D1, tier: "normal", theme: "atardecer", cam: "tactica", cvd: "protan" });
      out.push({ scene: "S1-lleno", shot: SHOT_D1, tier: "normal", theme: "atardecer", cam: "tactica", cvd: "tritan" });
    }
    return out;
  }
  if (round === "6") {
    const out = [];
    for (const shot of [SHOT_D1, SHOT_M1]) {
      out.push({ scene: "S7-iconos", shot, tier: "normal", theme: "atardecer", cam: "tactica", wait: "icon-sheet" });
      out.push({ scene: "S4-cartas", shot, tier: "normal", theme: "atardecer", cam: "tactica", freeze: false, wait: "hand-strip" });
    }
    out.push({
      scene: "S7-iconos",
      shot: SHOT_D1,
      tier: "normal",
      theme: "atardecer",
      cam: "tactica",
      cvd: "deutan",
      wait: "icon-sheet",
    });
    return out;
  }
  if (round === "4" || round === "5") {
    const out = [];
    for (const shot of [SHOT_D1, SHOT_M1]) {
      for (const tier of ["normal", "liviano"]) {
        out.push({ scene: "S3-dados", shot, tier, theme: "atardecer", cam: "tactica" });
      }
    }
    out.push({ scene: "S3-dados", shot: SHOT_D1, tier: "normal", theme: "atardecer", cam: "tactica", cvd: "deutan" });
    if (round === "4") {
      out.push({ scene: "S3-dados", shot: SHOT_D1, tier: "normal", theme: "atardecer", cam: "dados" });
    }
    return out;
  }
  if (round === "7") {
    const out = [];
    for (const shot of [SHOT_D1, SHOT_M1]) {
      out.push({ scene: "S4-cartas", shot, tier: "normal", theme: "atardecer", cam: "tactica", freeze: false, wait: "hand-strip" });
    }
    return out;
  }
  if (round === "8" || round === "9") {
    const out = [];
    for (const shot of [SHOT_D1, SHOT_M1]) {
      out.push({ scene: "S1-lleno", shot, tier: "normal", theme: "atardecer", cam: shot.vp === "D1" && round === "9" ? "cinematica" : "tactica" });
      out.push({ scene: "S1-lleno", shot, tier: "liviano", theme: "atardecer", cam: "tactica" });
    }
    return out;
  }
  if (round === "10" || round === "11" || round === "12" || round === "play") {
    return [
      { scene: "S3-dados", shot: SHOT_D1, tier: "normal", theme: "atardecer", cam: "dados" },
      { scene: "S1-lleno", shot: SHOT_D1, tier: "normal", theme: "atardecer", cam: "tactica" },
      { scene: "S1-lleno", shot: SHOT_M1, tier: "normal", theme: "atardecer", cam: "tactica" },
      { scene: "S4-cartas", shot: SHOT_M1, tier: "normal", theme: "atardecer", cam: "tactica", freeze: false, wait: "hand-strip" },
      { scene: "S1-lleno", shot: SHOT_D1, tier: "normal", theme: "dia", cam: "tactica" },
      { scene: "S1-lleno", shot: SHOT_D1, tier: "normal", theme: "noche", cam: "tactica" },
      { scene: "S1-lleno", shot: SHOT_D1, tier: "liviano", theme: "atardecer", cam: "tactica" },
      { scene: "S4-cartas", shot: SHOT_D1, tier: "normal", theme: "atardecer", cam: "tactica", freeze: false, wait: "hand-strip" },
    ];
  }
  const out = [];
  for (const scene of ["S0-vacio", "S1-lleno", "S6-grande"]) {
    for (const shot of [SHOT_D1, SHOT_M1]) {
      for (const tier of shot.vp === "D1" ? ["normal", "liviano"] : ["liviano", "normal"]) {
        out.push({ scene, shot, tier, theme: "atardecer", cam: "tactica" });
      }
    }
  }
  return out;
}

function jobs() {
  const only = (() => {
    const i = process.argv.indexOf("--only");
    return i >= 0 ? String(process.argv[i + 1] ?? "") : "";
  })();
  const list = jobsAll();
  if (!only) return list;
  return list.filter((j) => j.scene === only && !j.cvd && j.shot.vp === "D1" && j.tier === "normal");
}

const CVD_MAT = {
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

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
  const theme = job.theme ?? "atardecer";
  const freeze = job.freeze === false ? "0" : "1";
  const cam = job.cam ?? "tactica";
  const url = `${BASE}/?scene=${job.scene}&seed=42&tier=${job.tier}&freeze=${freeze}&theme=${theme}&cam=${cam}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 20000 });
  await page.waitForFunction(() => window.__colonosReady === true, { timeout: 20000 });
  if (job.wait) {
    await page.waitForSelector(`[data-testid="${job.wait}"]`, { timeout: 15000 });
  }
  await new Promise((r) => setTimeout(r, 400));
  const extra = await page.evaluate((cvd) => {
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
    const ys = [];
    const lin = (c) => {
      const x = c / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    for (let i = 0; i < data.length; i += 16) {
      const Y = 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
      ys.push(Y);
    }
    ys.sort((a, b) => a - b);
    const mean = ys.reduce((s, v) => s + v, 0) / ys.length;
    const p1 = ys[Math.floor(ys.length * 0.01)] ?? 0;
    const p99 = ys[Math.floor(ys.length * 0.99)] ?? 1;
    if (cvd && window) {
      /* applied after screenshot via node */
    }
    return { lumaMean: mean, lumaP1: p1, lumaP99: p99, span: p99 - p1 };
  }, job.cvd ?? null);
  const suf = job.cvd ? `_${job.cvd}` : "";
  const name = `r${round}_${job.scene}_${job.shot.vp}_${job.tier}_${job.cam}${job.theme && job.theme !== "atardecer" ? `_${job.theme}` : ""}${suf}`;
  const png = path.join(destDir, `${name}.png`);
  await page.screenshot({ path: png, type: "png" });
  if (job.cvd) {
    await applyCvdPng(png, job.cvd);
  }
  const skipBulk = round === "10" || round === "11" || round === "12" || round === "play";
  if (!skipBulk) fs.copyFileSync(png, path.join(artOut, `${name}.png`));
  const perf = await page.evaluate(() => window.__colonosPerf);
  metrics[name] = { ...perf, ...extra, theme: job.theme };
  console.log(name, metrics[name]);
  await ctx.close();
}

async function applyCvdPng(file, kind) {
  const page = await browser.newPage();
  const buf = fs.readFileSync(file);
  const b64 = buf.toString("base64");
  await page.setContent(`<canvas id="c"></canvas>`);
  const out = await page.evaluate(
    async ({ b64, mat }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.getElementById("c");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const im = g.getImageData(0, 0, c.width, c.height);
      const d = im.data;
      const lin = (v) => {
        const x = v / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      const enc = (x) => {
        const y = Math.max(0, Math.min(1, x));
        const s = y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055;
        return Math.round(s * 255);
      };
      for (let i = 0; i < d.length; i += 4) {
        const r = lin(d[i]);
        const g0 = lin(d[i + 1]);
        const b = lin(d[i + 2]);
        const nr = mat[0][0] * r + mat[0][1] * g0 + mat[0][2] * b;
        const ng = mat[1][0] * r + mat[1][1] * g0 + mat[1][2] * b;
        const nb = mat[2][0] * r + mat[2][1] * g0 + mat[2][2] * b;
        d[i] = enc(nr);
        d[i + 1] = enc(ng);
        d[i + 2] = enc(nb);
      }
      g.putImageData(im, 0, 0);
      return c.toDataURL("image/png");
    },
    { b64, mat: CVD_MAT[kind] },
  );
  const raw = out.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(file, Buffer.from(raw, "base64"));
  await page.close();
}

for (const job of jobs()) {
  await capture(job);
}

fs.writeFileSync(path.join(destDir, "metrics.json"), JSON.stringify(metrics, null, 2));
fs.writeFileSync(path.join(artOut, `ronda-${round}-metrics.json`), JSON.stringify(metrics, null, 2));

const ALIASES = {
  4: {
    "r4_S3-dados_D1_normal_dados.png": "r4_S3-dados_1440.png",
    "r4_S3-dados_M1_normal_tactica.png": "r4_S3-dados_390.png",
    "r4_S3-dados_D1_normal_tactica_deutan.png": "r4_S3-dados_1440_deutan.png",
    "r4_S3-dados_D1_liviano_tactica.png": "r4_S3-dados_1440_liviano.png",
  },
  5: {
    "r5_S3-dados_D1_normal_tactica.png": "r5_S3-dados_1440.png",
    "r5_S3-dados_M1_normal_tactica.png": "r5_S3-dados_390.png",
    "r5_S3-dados_D1_normal_tactica_deutan.png": "r5_S3-dados_1440_deutan.png",
  },
  7: {
    "r7_S4-cartas_D1_normal_tactica.png": "r7_S4-cartas_1440.png",
    "r7_S4-cartas_M1_normal_tactica.png": "r7_S4-cartas_390.png",
  },
  8: {
    "r8_S1-lleno_D1_normal_tactica.png": "r8_S1-lleno_1440.png",
    "r8_S1-lleno_M1_normal_tactica.png": "r8_S1-lleno_390.png",
    "r8_S1-lleno_D1_liviano_tactica.png": "r8_S1-lleno_1440_liviano.png",
  },
  10: {
    "r10_S3-dados_D1_normal_dados.png": "r10_dados_1440.png",
    "r10_S1-lleno_D1_normal_tactica.png": "r10_lleno_1440.png",
    "r10_S1-lleno_M1_normal_tactica.png": "r10_lleno_390.png",
    "r10_S4-cartas_M1_normal_tactica.png": "r10_hud_390.png",
    "r10_S1-lleno_D1_normal_tactica_dia.png": "r12_dia_1440.png",
    "r10_S1-lleno_D1_normal_tactica_noche.png": "r12_noche_1440.png",
    "r10_S1-lleno_D1_liviano_tactica.png": "r10_liviano_1440.png",
    "r10_S4-cartas_D1_normal_tactica.png": "r10_hud_1440.png",
  },
};
for (const [src, alias] of Object.entries(ALIASES[round] ?? {})) {
  const from = path.join(destDir, src);
  if (!fs.existsSync(from)) continue;
  fs.copyFileSync(from, path.join(artOut, alias));
  fs.copyFileSync(from, path.join(destDir, alias));
  console.log("alias", alias);
}

console.log("wrote", path.join(destDir, "metrics.json"));
await browser.close();
