import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { io } from "socket.io-client";

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

async function setName(page, name) {
  await page.evaluate((n) => {
    const input = document.querySelector("input[placeholder='Cómo te dicen en la mesa']");
    if (!input) return;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    proto?.set?.call(input, n);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, name);
}

async function prepareWith(token, code) {
  const r = await fetch(`${URL}/api/dev/prepare-unbox`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, token }),
  });
  return r.json();
}

async function joinViaSocket(code, name, color) {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ["websocket"] });
    const t = setTimeout(() => {
      s.close();
      reject(new Error("join timeout " + name));
    }, 8000);
    s.on("connect", () => {
      s.emit("join", { code, name, color }, (ack) => {
        clearTimeout(t);
        if (!ack?.ok) {
          s.close();
          reject(new Error(ack?.error || "join fail"));
          return;
        }
        resolve({ socket: s, color, ...ack });
      });
    });
    s.on("connect_error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

async function freeColor(page) {
  const text = await page.evaluate(() => document.body.innerText);
  const all = [
    ["Ámbar", "naranja"],
    ["Violeta", "marron"],
    ["Blanco", "blanco"],
    ["Verde", "verde"],
    ["Azul", "azul"],
    ["Rojo", "rojo"],
  ];
  const free = all.find(([label]) => !text.includes(label));
  return free?.[1] ?? "marron";
}

const hostCtx = await browser.createBrowserContext();
const guestCtx = await browser.createBrowserContext();
const host = await hostCtx.newPage();
host.setDefaultTimeout(30000);
host.on("pageerror", (e) => console.log("hosterr", e.message));
await host.goto(URL, { waitUntil: "domcontentloaded" });
await host.evaluate(() => localStorage.clear());
await host.goto(URL, { waitUntil: "domcontentloaded" });
await host.waitForFunction(() => document.body.innerText.includes("Crear partida"));
await setName(host, "Luz");
await host.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "6")?.click();
});
await clickText(host, /Crear partida/);
await host.waitForFunction(() => /Sala [A-Z0-9]{4,}/.test(document.body.innerText));
const hostSess = await host.evaluate(() => {
  const code = (localStorage.getItem("colonos.lastRoom") || "").toUpperCase();
  const raw = localStorage.getItem("colonos.session." + code);
  return raw ? JSON.parse(raw) : null;
});
const code = (hostSess?.code || "").toUpperCase();
console.log("code", code);

for (let i = 0; i < 4; i++) {
  await clickText(host, /Agregar bot/);
  await new Promise((r) => setTimeout(r, 250));
}

const color = await freeColor(host);
console.log("guest-color", color);
await new Promise((r) => setTimeout(r, 400));
const guestJoin = await joinViaSocket(code, "Ines", color);
console.log("guest-join", guestJoin.ok, guestJoin.playerId, guestJoin.color);
await host.waitForFunction(() => /Empezar partida \(6\//.test(document.body.innerText));
await clickText(host, /Empezar partida/);
await host.waitForSelector("canvas");
await new Promise((r) => setTimeout(r, 1200));
await shot(host, "ux3_desktop_mesa_chips");
const fade = await host.evaluate(() => Boolean(document.querySelector('[data-testid="chip-fade"]')));
console.log("chip-fade", fade);
const bots = await host.evaluate(() => document.querySelectorAll('[data-testid="chip-bot"]').length);
console.log("chip-bots", bots);

const guest = await guestCtx.newPage();
guest.setDefaultTimeout(30000);
guest.on("pageerror", (e) => console.log("guesterr", e.message));
await guest.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await guest.goto(URL, { waitUntil: "domcontentloaded" });
await guest.evaluate((sess) => {
  localStorage.clear();
  localStorage.setItem("colonos.lastRoom", sess.code);
  localStorage.setItem(
    "colonos.session." + sess.code,
    JSON.stringify({ code: sess.code, token: sess.token, name: sess.name, color: sess.color }),
  );
}, { code, token: guestJoin.token, name: "Ines", color: guestJoin.color });
await guest.goto(`${URL}/?sala=${code}`, { waitUntil: "domcontentloaded" });
await guest.waitForSelector("canvas", { timeout: 25000 });
await new Promise((r) => setTimeout(r, 800));

const strip = await guest.evaluate(() => {
  const el = document.querySelector('[data-testid="hand-strip"]');
  if (!el) return null;
  const num = el.querySelector(".text-2xl, span:nth-child(3)");
  const r = el.getBoundingClientRect();
  return {
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    height: Math.round(r.height),
    font: num ? getComputedStyle(num).fontSize : null,
    text: el.textContent?.replace(/\s+/g, " ").trim(),
  };
});
console.log("hand-strip", strip);
await shot(guest, "ux3_mobile_hand_strip");

await clickText(guest, /^Mesa$/);
await new Promise((r) => setTimeout(r, 350));
await guest.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Chat")?.click();
});
await new Promise((r) => setTimeout(r, 300));
const chatLayout = await guest.evaluate(() => {
  const visible = (el) => Boolean(el && el.offsetParent !== null && el.getBoundingClientRect().height > 0);
  const composer = [...document.querySelectorAll('[data-testid="chat-composer"]')].find(visible);
  const dock = document.querySelector('[data-testid="mobile-dock"]');
  const send = composer?.querySelector('[data-testid="chat-send"]');
  const strip = document.querySelector('[data-testid="hand-strip"]');
  if (!composer || !dock) return { ok: false, composers: document.querySelectorAll('[data-testid="chat-composer"]').length };
  const c = composer.getBoundingClientRect();
  const d = dock.getBoundingClientRect();
  const s = strip?.getBoundingClientRect();
  return {
    ok: true,
    composerBottom: Math.round(c.bottom),
    stripTop: s ? Math.round(s.top) : null,
    dockTop: Math.round(d.top),
    aboveDock: c.bottom <= d.top + 2,
    send: send?.textContent ?? null,
  };
});
console.log("chat-layout", chatLayout);
await shot(guest, "ux3_mobile_chat_enviar");

await guest.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Cerrar")?.click();
});
await new Promise((r) => setTimeout(r, 250));
const canvasBox = await guest.evaluate(() => {
  const c = document.querySelector("canvas");
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.left + 18, y: r.top + 18 };
});
if (canvasBox) await guest.mouse.click(canvasBox.x, canvasBox.y);
await new Promise((r) => setTimeout(r, 700));
const toast = await guest.evaluate(() => document.querySelector('[data-testid="toast"]')?.textContent ?? null);
console.log("invalid-click-toast", toast);
await shot(guest, "ux3_mobile_invalid_click");

const filters = await host.evaluate(() => {
  const el = document.querySelector('[data-testid="log-filters"]');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { wrap: cs.flexWrap, overflowX: cs.overflowX, height: Math.round(el.getBoundingClientRect().height) };
});
console.log("log-filters", filters);
const icons = await host.evaluate(() => document.querySelectorAll('[data-testid="piece-icon"]').length);
console.log("piece-icons", icons);
await shot(host, "ux3_desktop_log_filters");

const prep = await prepareWith(hostSess.token, code);
console.log("prepare-unbox", prep);
await new Promise((r) => setTimeout(r, 900));
const afterPrep = await host.evaluate(() => ({
  text: document.body.innerText.slice(0, 280),
  buy: [...document.querySelectorAll('[data-testid="buy-dev"]')].map((b) => ({
    disabled: b.disabled,
    visible: b.offsetParent !== null,
  })),
}));
console.log("after-prep", afterPrep);
await host.waitForFunction(() => {
  const buttons = [...document.querySelectorAll('[data-testid="buy-dev"]')];
  return buttons.some((b) => !b.disabled);
}, { timeout: 15000 });
await host.evaluate(() => {
  const buttons = [...document.querySelectorAll('[data-testid="buy-dev"]')];
  const vis = buttons.find((b) => !b.disabled && b.offsetParent !== null) ?? buttons.find((b) => !b.disabled);
  vis?.click();
});
await guest.waitForSelector('[data-testid="unbox-spectator"]', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 200));
const sealed = await guest.evaluate(() => {
  const root = document.querySelector('[data-testid="unbox-spectator"]');
  const title = root?.querySelector('[data-testid="unbox-title"]')?.textContent ?? "";
  const clock = root?.querySelector('[data-testid="turn-clock"]')?.textContent ?? "";
  const text = root?.textContent ?? "";
  const leaked = /Caballero|Invento|Monopolio|Punto de victoria/.test(title);
  return { title, clock, leaked, hasSobre: /Sobre cerrado/.test(text), kinds: /Caballero|Invento|Monopolio/.test(text) };
});
console.log("sealed", sealed);
await shot(guest, "ux3_mobile_sobre_cerrado");
await shot(host, "ux3_desktop_unbox_clock");
const t0 = Date.now();
await guest.waitForFunction(() => !document.querySelector('[data-testid="unbox-spectator"]'), { timeout: 3000 });
console.log("sealed-autoclose-ms", Date.now() - t0);
await shot(guest, "ux3_mobile_sobre_cerrado_gone");

guestJoin.socket.close();
await guest.setOfflineMode(true);
await new Promise((r) => setTimeout(r, 1500));
const otherOff = await host.evaluate(() => {
  const n = document.querySelectorAll('[data-testid="chip-offline"]').length;
  const titles = [...document.querySelectorAll('[data-testid="chip-offline"]')].map((el) => el.getAttribute("title"));
  return { n, titles };
});
console.log("other-offline-chip", otherOff);
await shot(host, "ux3_desktop_other_offline");

await host.evaluate(() => {
  const ev = new Event("offline");
  window.dispatchEvent(ev);
});
await host.setOfflineMode(true);
await new Promise((r) => setTimeout(r, 1200));
const net = await host.evaluate(() => document.querySelector('[data-testid="net-down"]')?.textContent ?? null);
console.log("own-net-down", net);
await shot(host, "ux3_desktop_net_down");

console.log("ok");
await browser.close();
