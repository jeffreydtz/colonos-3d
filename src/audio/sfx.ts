import { Howl, Howler } from "howler";

export type SfxName =
  | "dice_throw"
  | "dice_hit"
  | "dice_settle"
  | "build"
  | "robber"
  | "produce"
  | "card"
  | "ui";

let ctx: AudioContext | null = null;
let muted = true;
let lastHit = 0;

function wavUri(freq: number, ms: number, vol = 0.35, type: "square" | "sine" = "sine"): string {
  const sr = 22050;
  const n = Math.floor((sr * ms) / 1000);
  const data = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 18) * (1 - i / n);
    const s = type === "square" ? (Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1) : Math.sin(2 * Math.PI * freq * t);
    data[i] = Math.max(-32767, Math.min(32767, s * env * vol * 32767));
  }
  const bytes = data.byteLength;
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, bytes, true);
  new Uint8Array(buf, 44).set(new Uint8Array(data.buffer));
  let bin = "";
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

const howls: Partial<Record<SfxName, Howl>> = {};

function clip(name: SfxName, freq: number, ms: number, vol: number, type: "square" | "sine" = "sine"): Howl {
  const existing = howls[name];
  if (existing) return existing;
  const h = new Howl({ src: [wavUri(freq, ms, vol, type)], volume: vol, html5: false });
  howls[name] = h;
  return h;
}

export function setSfxMuted(on: boolean): void {
  muted = !on;
  try {
    Howler.mute(!on);
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Impacto de dado: ganancia por impulso (cannon-es contact). */
export function playDiceHit(impulse: number): void {
  if (muted) return;
  const now = performance.now();
  if (now - lastHit < 40) return;
  lastHit = now;
  const ac = audio();
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  const f = ac.createBiquadFilter();
  o.type = "triangle";
  const mag = Math.min(1, Math.abs(impulse) / 7);
  o.frequency.setValueAtTime(90 + mag * 140, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.08);
  f.type = "lowpass";
  f.frequency.value = 420 + mag * 800;
  g.gain.setValueAtTime(0.0001, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.04 + mag * 0.12, ac.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
  o.connect(f);
  f.connect(g);
  g.connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + 0.14);
}

export function playSfx(name: SfxName, gain = 1): void {
  if (muted) return;
  if (name === "dice_hit") {
    playDiceHit(4 * gain);
    return;
  }
  const table: Record<Exclude<SfxName, "dice_hit">, [number, number, number, "square" | "sine"]> = {
    dice_throw: [180, 180, 0.25, "sine"],
    dice_settle: [220, 220, 0.2, "sine"],
    build: [310, 140, 0.22, "square"],
    robber: [90, 260, 0.28, "sine"],
    produce: [520, 160, 0.18, "sine"],
    card: [240, 450, 0.2, "sine"],
    ui: [660, 60, 0.12, "square"],
  };
  const spec = table[name];
  if (!spec) return;
  const [freq, ms, vol, type] = spec;
  const h = clip(name, freq, ms, vol * gain, type);
  h.volume(Math.min(1, vol * gain));
  h.play();
}

export function reduceMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}
