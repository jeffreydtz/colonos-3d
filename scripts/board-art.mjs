import fs from "node:fs";
import puppeteer from "puppeteer-core";

const URL = "http://127.0.0.1:43210";
const out = "/opt/cursor/artifacts";
fs.mkdirSync(out, { recursive: true });
const tmp = "/tmp/colonos-screens";
fs.mkdirSync(tmp, { recursive: true });
const tag = process.argv[2] || "before";

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

const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.body.innerText.includes("Crear partida"));
await page.evaluate(() => {
  const input = document.querySelector("input[placeholder='Cómo te dicen en la mesa']");
  if (!input) return;
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  proto?.set?.call(input, "Luz");
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "3")?.click();
});
await clickText(page, /Crear partida/);
await page.waitForFunction(() => /Sala /.test(document.body.innerText));
await clickText(page, /Agregar bot/);
await new Promise((r) => setTimeout(r, 250));
await clickText(page, /Agregar bot/);
await page.waitForFunction(() => /Empezar partida \(3\//.test(document.body.innerText));
await clickText(page, /Empezar partida/);
await page.waitForSelector("canvas");
await new Promise((r) => setTimeout(r, 1800));
await shot(page, `board_${tag}_1440`);

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await new Promise((r) => setTimeout(r, 900));
await shot(page, `board_${tag}_390`);

console.log("ok", tag);
await browser.close();
