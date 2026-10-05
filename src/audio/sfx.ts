import { alarmPlan } from "./alarms";
import { clampVolume, shouldPlay, type SoundPrefs, defaultSoundPrefs } from "./prefs";
import { SFX_CATEGORY, VOICES, type SfxName } from "./voices";

export type { SfxName } from "./voices";

type TaggedNode = AudioScheduledSourceNode & { __at?: number };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let prefs: SoundPrefs = defaultSoundPrefs();
let unlocked = false;
let lastHit = 0;
let keepOsc: OscillatorNode | null = null;
let keepGain: GainNode | null = null;
let alarmNodes: TaggedNode[] = [];
let pendingAlarm: { deadlineMs: number; yourTurn: boolean } | null = null;

const unlockWaiters: Array<() => void> = [];
let unlockBound = false;

function audioCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

function ensure(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = prefs.enabled ? prefs.volume : 0;
    master.connect(ctx.destination);
    ctx.onstatechange = () => {
      if (ctx?.state === "running") fireUnlock();
    };
  }
  return ctx;
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  const len = Math.floor(ac.sampleRate * 0.25);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

export function applySoundPrefs(next: SoundPrefs): void {
  prefs = {
    enabled: next.enabled,
    volume: clampVolume(next.volume),
    mute: { ...next.mute },
  };
  if (master && ctx) {
    const level = prefs.enabled ? prefs.volume : 0;
    master.gain.setTargetAtTime(level, ctx.currentTime, 0.03);
  }
  if (!prefs.enabled || prefs.volume <= 0 || prefs.mute.reloj) pendingAlarm = null;
}

export function audioRunning(): boolean {
  return ctx?.state === "running";
}

export function audioUnlocked(): boolean {
  return unlocked;
}

function startVoice(ac: AudioContext, name: SfxName, gain: number, when: number): TaggedNode[] {
  if (!master) return [];
  const nodes: TaggedNode[] = [];
  const gScale = Math.max(0, gain);
  for (const step of VOICES[name]) {
    const t0 = when + step.delay;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = step.wave;
    const from = Math.max(1, step.from);
    const to = Math.max(1, step.to);
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + Math.max(0.01, step.dur));
    const peak = Math.max(0.0001, step.gain * gScale);
    const attack = Math.min(0.03, Math.max(0.005, step.dur * 0.28));
    const end = t0 + Math.max(step.dur, attack + 0.02);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(end + 0.02);
    const tagged = osc as TaggedNode;
    tagged.__at = t0;
    nodes.push(tagged);
    if (step.noise) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac);
      const hp = ac.createBiquadFilter();
      const lp = ac.createBiquadFilter();
      const ng = ac.createGain();
      hp.type = "highpass";
      hp.frequency.value = 500;
      lp.type = "lowpass";
      lp.frequency.value = 1600;
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime(peak * 0.7, t0 + 0.012);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + step.dur);
      src.connect(hp);
      hp.connect(lp);
      lp.connect(ng);
      ng.connect(master);
      src.start(t0);
      src.stop(t0 + step.dur + 0.02);
      const tagged = src as TaggedNode;
      tagged.__at = t0;
      nodes.push(tagged);
    }
  }
  return nodes;
}

const RETRY_IF_SUSPENDED = new Set<SfxName>(["turn", "turn_soft", "warn10", "warn5", "chat", "offer", "stolen", "win", "lose"]);

export function playSfx(name: SfxName, gain = 1): void {
  const category = SFX_CATEGORY[name];
  if (!shouldPlay(prefs, category)) return;
  const ac = ensure();
  if (!ac) return;
  const fire = () => {
    if (ac.state !== "running" || !shouldPlay(prefs, category)) return;
    try {
      startVoice(ac, name, gain, ac.currentTime);
    } catch {
      /* el grafo es opcional */
    }
  };
  if (ac.state === "running") {
    fire();
    return;
  }
  if (!RETRY_IF_SUSPENDED.has(name)) {
    void ac.resume();
    return;
  }
  void ac.resume().then(fire);
}

/** Impacto de dado: ganancia por impulso del contacto. Pasa por el master. */
export function playDiceHit(impulse: number): void {
  if (!shouldPlay(prefs, "dados")) return;
  const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (nowMs - lastHit < 40) return;
  lastHit = nowMs;
  const ac = ensure();
  if (!ac || !master || ac.state !== "running") return;
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
  g.connect(master);
  o.start();
  o.stop(ac.currentTime + 0.14);
}

function cancelFutureAlarms(): void {
  if (!ctx) {
    alarmNodes = [];
    return;
  }
  const now = ctx.currentTime;
  const keep: TaggedNode[] = [];
  for (const node of alarmNodes) {
    const at = node.__at ?? 0;
    if (at <= now + 0.02) {
      keep.push(node);
      continue;
    }
    try {
      node.stop();
    } catch {
      /* ya terminó */
    }
    try {
      node.disconnect();
    } catch {
      /* ya suelto */
    }
  }
  alarmNodes = keep;
}

export function cancelTurnAlarms(): void {
  pendingAlarm = null;
  cancelFutureAlarms();
}

function flushPendingAlarm(): void {
  const pending = pendingAlarm;
  if (!pending || !ctx || ctx.state !== "running") return;
  pendingAlarm = null;
  scheduleTurnAlarms(pending.deadlineMs, pending.yourTurn);
}

/** Agenda 10 s y 5 s en el reloj del AudioContext: sigue aunque el intervalo de la pestaña se congele. */
export function scheduleTurnAlarms(deadlineMs: number, yourTurn: boolean): void {
  cancelFutureAlarms();
  if (!shouldPlay(prefs, "reloj")) {
    pendingAlarm = null;
    return;
  }
  const ac = ensure();
  if (!ac || !master || ac.state !== "running") {
    pendingAlarm = { deadlineMs, yourTurn };
    return;
  }
  pendingAlarm = null;
  const gain = yourTurn ? 1 : 0.4;
  try {
    for (const hit of alarmPlan(Date.now(), deadlineMs)) {
      const when = ac.currentTime + hit.delayMs / 1000;
      alarmNodes.push(...startVoice(ac, hit.name, gain, when));
    }
  } catch {
    /* sin audio */
  }
}

export function resumeAudio(): Promise<void> {
  if (!ctx) return Promise.resolve();
  if (ctx.state === "running") {
    flushPendingAlarm();
    return Promise.resolve();
  }
  return ctx.resume().then(() => {
    flushPendingAlarm();
  });
}

function fireUnlock(): void {
  if (!ctx || ctx.state !== "running") return;
  if (!unlocked) {
    unlocked = true;
    const waiters = unlockWaiters.splice(0, unlockWaiters.length);
    for (const cb of waiters) cb();
    unbindUnlock();
  }
  flushPendingAlarm();
}

function onGesture(): void {
  const ac = ensure();
  if (!ac) return;
  try {
    const buf = ac.createBuffer(1, 1, ac.sampleRate);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    src.start(0);
  } catch {
    /* el gesto igual pide resume */
  }
  if (ac.state === "running") fireUnlock();
  else void ac.resume().then(() => fireUnlock());
}

function bindUnlock(): void {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;
  window.addEventListener("pointerdown", onGesture, { passive: true });
  window.addEventListener("touchend", onGesture, { passive: true });
  window.addEventListener("keydown", onGesture);
}

function unbindUnlock(): void {
  if (!unlockBound || typeof window === "undefined") return;
  unlockBound = false;
  window.removeEventListener("pointerdown", onGesture);
  window.removeEventListener("touchend", onGesture);
  window.removeEventListener("keydown", onGesture);
}

/**
 * El navegador (también iOS) deja el AudioContext en suspenso hasta un gesto.
 * Hay que arrancar un buffer en el mismo turno del evento, no después de un await.
 */
export function installAudioUnlock(onUnlock: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (unlocked) {
    onUnlock();
    return () => {};
  }
  unlockWaiters.push(onUnlock);
  bindUnlock();
  if (ctx?.state === "running") fireUnlock();
  return () => {
    const i = unlockWaiters.indexOf(onUnlock);
    if (i >= 0) unlockWaiters.splice(i, 1);
  };
}

/** Oscilador casi mudo, directo a la salida, para que la pestaña atrás no congele el aviso de turno. */
export function setKeepAlive(on: boolean): void {
  if (!on) {
    try {
      keepOsc?.stop();
    } catch {
      /* ya parado */
    }
    keepOsc?.disconnect();
    keepGain?.disconnect();
    keepOsc = null;
    keepGain = null;
    return;
  }
  const ac = ensure();
  if (!ac || ac.state !== "running" || keepOsc) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.value = 28;
  g.gain.value = 0.0006;
  o.connect(g);
  g.connect(ac.destination);
  o.start();
  keepOsc = o;
  keepGain = g;
}

export function reduceMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}
