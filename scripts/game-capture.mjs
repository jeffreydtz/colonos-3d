import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

/**
 * Partidas reales (no el arnés): crea mesa, mete bots, coloca, tira dados y
 * saca capturas de lobby, HUD, mano, comercio, log y chat.
 * `node scripts/game-capture.mjs --tag before [--only 6p]`
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.ART_URL ?? "http://127.0.0.1:43210";
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] ?? def) : def;
};
const tag = arg("--tag", "shot");
const only = arg("--only", "");
const destDir = process.env.ART_DEST ?? path.join(ROOT, "docs", "art", "refino");
fs.mkdirSync(destDir, { recursive: true });

function chromePath() {
  for (const p of ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("no chrome");
}

const D1 = { vp: "1440", width: 1440, height: 900, dpr: 1, mobile: false };
const M1 = { vp: "390", width: 390, height: 844, dpr: 2, mobile: true };

const RUNS = [
  { id: "3p_1440", shot: D1, seats: 3, tier: "normal", theme: "atardecer", extras: ["noche", "liviano"] },
  { id: "3p_390", shot: M1, seats: 3, tier: "liviano", theme: "atardecer", extras: ["build", "trade390", "mesa", "carta"] },
  { id: "4p_1440", shot: D1, seats: 4, tier: "normal", theme: "atardecer", extras: ["opciones", "actions", "trade", "chat", "carta"] },
  { id: "4p_390", shot: M1, seats: 4, tier: "normal", theme: "noche", extras: ["mesa"] },
  { id: "6p_1440", shot: D1, seats: 6, tier: "normal", theme: "atardecer", extras: ["liviano"] },
  { id: "6p_390", shot: M1, seats: 6, tier: "normal", theme: "atardecer", extras: ["opciones", "trade390", "chat390", "build"] },
];

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: "new",
  protocolTimeout: 120_000,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const metrics = {};

async function shot(page, name) {
  const file = path.join(destDir, `${tag}_${name}.png`);
  await sleep(350);
  await page.screenshot({ path: file, type: "png" });
  const perf = await page.evaluate(() => window.__colonosPerf ?? null);
  metrics[`${tag}_${name}`] = perf;
  console.log("shot", name, perf ? `${perf.calls} calls ${perf.triangles} tris` : "");
}

async function clickText(page, text, exact = true) {
  return page.evaluate(
    (t, ex) => {
      const els = [...document.querySelectorAll("button")];
      const el = els.find((b) => {
        const s = (b.textContent ?? "").trim();
        return ex ? s === t : s.startsWith(t);
      });
      if (!el || el.disabled) return false;
      el.click();
      return true;
    },
    text,
    exact,
  );
}

/** El primero que se ve: el panel de escritorio y la hoja del celu comparten testids. */
async function clickTestId(page, id) {
  return page.evaluate((x) => {
    const el = [...document.querySelectorAll(`[data-testid="${x}"]`)].find((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!(el instanceof HTMLElement)) return false;
    el.click();
    return true;
  }, id);
}

/** Juega la parte del humano: colocación inicial hasta su tiro, o ladrón/descarte hasta la fase principal. */
async function drive(page, mode) {
  const t0 = Date.now();
  while (Date.now() - t0 < 150_000) {
    const step = await page.evaluate(async () => {
      const dev = window.__colonosDev;
      if (!dev) return "nodev";
      const { useApp, sendAction } = dev;
      const v = useApp.getState().view;
      if (!v) return "noview";
      if (v.currentPlayerId !== v.youId) return `wait:${v.phase}`;
      const pips = (n) => (n == null ? 0 : 6 - Math.abs(7 - n));
      const hexById = new Map(v.hexes.map((h) => [h.id, h]));
      if (v.phase === "colocacion_poblado" && v.legal.vertices.length) {
        const best = [...v.legal.vertices]
          .map((id) => {
            const vx = v.vertices.find((x) => x.id === id);
            const score = (vx?.hexIds ?? []).reduce((s, h) => s + pips(hexById.get(h)?.number ?? null), 0);
            return { id, score };
          })
          .sort((a, b) => b.score - a.score)[0];
        await sendAction({ type: "place_settlement", vertexId: best.id });
        return "settle";
      }
      if (v.phase === "colocacion_camino" && v.legal.edges.length) {
        await sendAction({ type: "place_road", edgeId: v.legal.edges[0] });
        return "road";
      }
      if (v.phase === "dados") return "dados";
      if (v.phase === "ladron") {
        const hex = v.legal.robberHexes[0] ?? v.legal.hexes[0];
        if (hex) await sendAction({ type: "move_robber", hexId: hex, stealFromId: null });
        return "robber";
      }
      if (v.phase === "descarte" && v.legal.mustDiscard > 0) {
        const need = v.legal.mustDiscard;
        const bag = {};
        let left = need;
        for (const r of ["madera", "ladrillo", "lana", "trigo", "mineral"]) {
          const take = Math.min(left, v.hand.resources[r]);
          if (take > 0) bag[r] = take;
          left -= take;
        }
        await sendAction({ type: "discard", resources: bag });
        return "discard";
      }
      return `phase:${v.phase}`;
    });
    if (mode === "toRoll" && step === "dados") return step;
    if (mode === "afterRoll" && (step.startsWith("phase:principal") || step.startsWith("phase:construccion"))) return step;
    if (mode === "afterRoll" && step.startsWith("wait") && Date.now() - t0 > 8_000) return step;
    await sleep(step.startsWith("wait") ? 700 : 450);
  }
  return "timeout";
}

async function setSettingsOpen(page, open) {
  await page.evaluate((want) => {
    const t = document.querySelector('[data-testid="settings-toggle"]');
    if (!(t instanceof HTMLButtonElement)) return;
    const isOpen = t.getAttribute("aria-expanded") === "true";
    if (isOpen !== want) t.click();
  }, open);
  await sleep(250);
}

async function doExtra(page, cfg, extra) {
  if (extra === "noche") {
    for (let i = 0; i < 4; i++) {
      await setSettingsOpen(page, true);
      const label = await page.evaluate(() => document.querySelector('[data-testid="theme-toggle"]')?.textContent ?? "");
      if (label.includes("Noche")) break;
      await clickTestId(page, "theme-toggle");
      await sleep(400);
    }
    await setSettingsOpen(page, false);
    await sleep(2500);
    await shot(page, `noche_${cfg.id}`);
  }
  if (extra === "liviano") {
    await setSettingsOpen(page, true);
    await clickTestId(page, "gfx-toggle");
    await setSettingsOpen(page, false);
    await sleep(2500);
    await shot(page, `liviano_${cfg.id}`);
  }
  if (extra === "opciones") {
    await setSettingsOpen(page, true);
    await sleep(400);
    await shot(page, `opciones_${cfg.id}`);
    await setSettingsOpen(page, false);
  }
  if (extra === "actions") {
    await clickTestId(page, "actions-show");
    await sleep(500);
    await shot(page, `acciones_${cfg.id}`);
  }
  if (extra === "trade" || extra === "trade390") {
    if (extra === "trade390") await clickTestId(page, "dock-trade");
    else if (!(await clickTestId(page, "trade-show"))) await clickTestId(page, "tab-banco");
    await sleep(500);
    await shot(page, `trueque_${cfg.id}`);
    if (await clickTestId(page, "tab-jugadores")) {
      await sleep(400);
      await shot(page, `trueque_jugadores_${cfg.id}`);
    }
    if (extra === "trade390") await clickTestId(page, "sheet-close");
  }
  if (extra === "chat" || extra === "chat390") {
    await page.evaluate(async () => {
      const { sendChat } = window.__colonosDev;
      await sendChat("buenas, ¿alguien tiene ladrillo? :madera:");
      await sendChat("dale que va :D");
    });
    if (extra === "chat390") await clickTestId(page, "dock-mesa");
    await sleep(300);
    await clickText(page, "Chat");
    await sleep(600);
    await shot(page, `chat_${cfg.id}`);
    if (extra === "chat390") await clickTestId(page, "sheet-close");
  }
  if (extra === "build") {
    await clickTestId(page, "dock-build");
    await sleep(600);
    await shot(page, `construir_${cfg.id}`);
    await clickTestId(page, "sheet-close");
  }
  if (extra === "mesa") {
    await clickTestId(page, "dock-mesa");
    await sleep(600);
    await shot(page, `mesa_${cfg.id}`);
    await clickTestId(page, "sheet-close");
  }
  if (extra === "carta") {
    const prep = await page.evaluate(async () => {
      const code = (localStorage.getItem("colonos.lastRoom") || "").toUpperCase();
      const raw = localStorage.getItem(`colonos.session.${code}`);
      const token = raw ? JSON.parse(raw).token : null;
      const r = await fetch("/api/dev/prepare-unbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, token }),
      });
      return r.json();
    });
    if (!prep?.ok) throw new Error(`prepare-unbox: ${prep?.error ?? "sin respuesta"}`);
    await sleep(700);
    await page.evaluate(async () => {
      await window.__colonosDev.sendAction({ type: "buy_dev" });
    });
    await page.waitForSelector('[data-testid="unbox-owner"]', { timeout: 8000 });
    await shot(page, `carta_sobre_${cfg.id}`);
    await page.waitForSelector('[data-stage="front"]', { timeout: 8000 });
    await sleep(1100);
    await shot(page, `carta_${cfg.id}`);
    await clickTestId(page, "unbox-next");
    await sleep(600);
  }
}

async function run(cfg) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.error("pageerror", cfg.id, err.message));
  try {
    await runIn(page, cfg);
  } catch (err) {
    console.error("run failed", cfg.id, err?.message ?? err);
    const body = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => "");
    console.error("body:", body.replace(/\s+/g, " "));
    await page.screenshot({ path: path.join(destDir, `${tag}_FAIL_${cfg.id}.png`) }).catch(() => {});
  }
  await ctx.close();
}

async function runIn(page, cfg) {
  page.setDefaultTimeout(30_000);
  await page.setViewport({
    width: cfg.shot.width,
    height: cfg.shot.height,
    deviceScaleFactor: cfg.shot.dpr,
    isMobile: cfg.shot.mobile,
    hasTouch: cfg.shot.mobile,
  });
  await page.evaluateOnNewDocument(
    (tier, theme) => {
      localStorage.setItem("colonos-graficos", tier);
      localStorage.setItem("colonos-tema", theme);
    },
    cfg.tier,
    cfg.theme,
  );
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.includes("Crear partida")));
  if (cfg.id.startsWith("3p")) await shot(page, `home_${cfg.shot.vp}`);
  await page.evaluate(() => {
    const input = document.querySelector("input");
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "Jeffrey");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickText(page, String(cfg.seats));
  await clickText(page, "Crear partida");
  await page.waitForFunction(() => document.body.innerText.includes("Sala "), { timeout: 15_000 });
  for (let i = 1; i < cfg.seats; i++) {
    await clickText(page, "Agregar bot", false);
    await page.waitForFunction((n) => document.querySelectorAll('li:not([data-testid="seat-free"])').length >= n, {}, i + 1);
  }
  await shot(page, `lobby_${cfg.id}`);
  await clickText(page, "Empezar partida", false);
  await page.waitForSelector("canvas", { timeout: 30_000 });
  await page.waitForFunction(() => window.__colonosReady === true, { timeout: 30_000 });
  await sleep(2200);
  await shot(page, `setup_${cfg.id}_${cfg.tier}_${cfg.theme}`);

  const reached = await drive(page, "toRoll");
  console.log(cfg.id, "reached", reached);
  await sleep(1200);
  await shot(page, `turno_${cfg.id}_${cfg.tier}_${cfg.theme}`);
  await page.evaluate(async () => {
    await window.__colonosDev.sendAction({ type: "roll" });
  });
  await sleep(1400);
  await shot(page, `dados_aire_${cfg.id}`);
  await sleep(3600);
  await drive(page, "afterRoll");
  await sleep(600);
  await shot(page, `post_dados_${cfg.id}_${cfg.tier}_${cfg.theme}`);

  for (const extra of cfg.extras) {
    try {
      await doExtra(page, cfg, extra);
    } catch (err) {
      console.error("extra failed", cfg.id, extra, err?.message ?? err);
    }
  }
}

for (const cfg of RUNS) {
  if (only && !cfg.id.includes(only)) continue;
  await run(cfg);
}
fs.writeFileSync(path.join(destDir, `${tag}-metrics${only ? `-${only}` : ""}.json`), JSON.stringify(metrics, null, 2));
await browser.close();
console.log("done", destDir);
