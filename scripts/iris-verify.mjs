import fs from "node:fs";
import puppeteer from "puppeteer-core";

const URL = "http://127.0.0.1:43210";
const out = "/opt/cursor/artifacts";
fs.mkdirSync(out, { recursive: true });
const tmp = "/tmp/colonos-screens";
fs.mkdirSync(tmp, { recursive: true });

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
    "--ignore-gpu-blocklist",
    "--window-size=1440,900",
  ],
  defaultViewport: { width: 1440, height: 900 },
});

async function shot(page, name) {
  const dests = [`${out}/${name}.png`, `${tmp}/${name}.png`];
  await page.screenshot({ path: dests[0], type: "png" });
  fs.copyFileSync(dests[0], dests[1]);
  console.log("shot", name);
}

async function clickText(page, re, timeout = 12000) {
  await page.waitForFunction(
    (pattern) => [...document.querySelectorAll("button")].some((b) => new RegExp(pattern).test(b.textContent || "")),
    { timeout },
    re.source,
  );
  await page.evaluate((pattern) => {
    const b = [...document.querySelectorAll("button")].find((el) => new RegExp(pattern).test(el.textContent || ""));
    b?.click();
  }, re.source);
}

async function waitGfx(page) {
  await page.waitForFunction(
    () => {
      const g = window.__colonosGfx;
      return g && g.calls > 0 && g.triangles > 0;
    },
    { timeout: 20000 },
  );
  await new Promise((r) => setTimeout(r, 400));
  return page.evaluate(() => window.__colonosGfx);
}

async function setMode(page, mode) {
  await page.evaluate((m) => {
    localStorage.setItem("colonos-graficos", m);
  }, mode);
  const label = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="gfx-toggle"]');
    return b?.textContent || "";
  });
  const want = `Gráficos: ${mode}`;
  if (label && !label.includes(mode)) {
    await page.click('[data-testid="gfx-toggle"]');
    await page.waitForFunction(
      (m) => (document.querySelector('[data-testid="gfx-toggle"]')?.textContent || "").includes(m),
      { timeout: 8000 },
      mode,
    );
  } else if (!label) {
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForSelector("canvas", { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));
}

async function typeName(page, name) {
  await page.waitForFunction(() => document.body.innerText.includes("Crear partida"));
  await page.evaluate((n) => {
    const input = document.querySelector("input[placeholder='Cómo te dicen en la mesa']");
    if (!input) return;
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    desc?.set?.call(input, n);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, name);
}

async function startGame(page, { seats, bots, name }) {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate((m) => localStorage.setItem("colonos-graficos", m), "normal");
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await typeName(page, name);
  await page.evaluate((n) => {
    [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === String(n))?.click();
  }, seats);
  await clickText(page, /Crear partida/);
  await page.waitForFunction(() => /Sala /.test(document.body.innerText));
  for (let i = 0; i < bots; i++) {
    await clickText(page, /Agregar bot/);
    await new Promise((r) => setTimeout(r, 180));
  }
  await page.waitForFunction(
    (n) => new RegExp(`Empezar partida \\(${n}\\/`).test(document.body.innerText),
    {},
    seats,
  );
  await clickText(page, /Empezar partida/);
  await page.waitForSelector("canvas", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
}

const metrics = {};

{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.setViewport({ width: 1440, height: 900 });
  await startGame(page, { seats: 3, bots: 2, name: "Luz" });
  await setMode(page, "normal");
  metrics.classic_normal_1440 = await waitGfx(page);
  await shot(page, "iris_classic_normal_1440");

  await page.click('[data-testid="actions-hide"]').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, "iris_classic_actions_collapsed_1440");
  await page.click('[data-testid="actions-show"]').catch(() => {});

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 700));
  await setMode(page, "normal");
  metrics.classic_normal_390 = await waitGfx(page);
  await shot(page, "iris_classic_normal_390");

  await setMode(page, "liviano");
  metrics.classic_lite_390 = await waitGfx(page);
  await shot(page, "iris_classic_lite_390");

  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /^\s*Mesa\s*$/.test(b.textContent || ""))?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim().startsWith("Chat"))?.click();
  });
  await page.waitForSelector('[data-testid="chat-input"]');
  await page.setViewport({ width: 390, height: 480, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 500));
  for (const msg of ["primera", "segunda", "tercera", "el último tiene que verse"]) {
    await page.evaluate((text) => {
      const input = document.querySelector('[data-testid="chat-input"]');
      if (!input) return;
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      proto?.set?.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('[data-testid="chat-send"]')?.click();
    }, msg);
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, "iris_chat_390x480");
  await ctx.close();
}

{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(40000);
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.setViewport({ width: 1440, height: 900 });
  await startGame(page, { seats: 6, bots: 5, name: "Luz" });
  await setMode(page, "normal");
  metrics.grande_normal_1440 = await waitGfx(page);
  await shot(page, "iris_grande_normal_1440");

  await page.click('[data-testid="actions-hide"]').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, "iris_grande_actions_collapsed_1440");

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 700));
  await setMode(page, "normal");
  metrics.grande_normal_390 = await waitGfx(page);
  await shot(page, "iris_grande_normal_390");

  await setMode(page, "liviano");
  metrics.grande_lite_390 = await waitGfx(page);
  await shot(page, "iris_grande_lite_390");
  await ctx.close();
}

const report = `${out}/iris-metrics.json`;
fs.writeFileSync(report, JSON.stringify(metrics, null, 2));
fs.writeFileSync(`${tmp}/iris-metrics.json`, JSON.stringify(metrics, null, 2));
console.log("metrics", JSON.stringify(metrics, null, 2));
console.log("ok iris");
await browser.close();
