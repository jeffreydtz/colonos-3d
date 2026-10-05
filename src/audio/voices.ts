import type { SfxCategory } from "./prefs";

export type SfxName =
  | "turn"
  | "turn_soft"
  | "warn10"
  | "warn5"
  | "dice_throw"
  | "dice_hit"
  | "dice_settle"
  | "produce"
  | "build"
  | "trade"
  | "robber"
  | "card"
  | "chat"
  | "offer"
  | "stolen"
  | "win"
  | "lose";

export type VoiceStep = {
  wave: OscillatorType;
  from: number;
  to: number;
  /** Segundos. */
  dur: number;
  /** Ganancia de pico, antes del master. Se queda baja a propósito. */
  gain: number;
  delay: number;
  noise?: boolean;
};

/** Cada nombre tiene una firma distinta: no hay dos eventos con el mismo motivo. */
export const VOICES: Record<SfxName, VoiceStep[]> = {
  turn: [
    { wave: "sine", from: 523, to: 523, dur: 0.16, gain: 0.16, delay: 0 },
    { wave: "sine", from: 659, to: 659, dur: 0.16, gain: 0.16, delay: 0.12 },
    { wave: "sine", from: 784, to: 784, dur: 0.28, gain: 0.18, delay: 0.24 },
  ],
  turn_soft: [{ wave: "sine", from: 349, to: 330, dur: 0.09, gain: 0.045, delay: 0 }],
  warn10: [
    { wave: "triangle", from: 698, to: 698, dur: 0.09, gain: 0.1, delay: 0 },
    { wave: "triangle", from: 698, to: 698, dur: 0.12, gain: 0.1, delay: 0.16 },
  ],
  warn5: [
    { wave: "square", from: 880, to: 880, dur: 0.07, gain: 0.07, delay: 0 },
    { wave: "square", from: 880, to: 880, dur: 0.07, gain: 0.07, delay: 0.1 },
    { wave: "square", from: 1174, to: 1174, dur: 0.14, gain: 0.08, delay: 0.2 },
  ],
  dice_throw: [
    { wave: "sine", from: 240, to: 90, dur: 0.16, gain: 0.12, delay: 0, noise: true },
    { wave: "triangle", from: 180, to: 70, dur: 0.18, gain: 0.1, delay: 0.02 },
  ],
  dice_hit: [{ wave: "triangle", from: 140, to: 48, dur: 0.09, gain: 0.12, delay: 0 }],
  dice_settle: [
    { wave: "sine", from: 160, to: 70, dur: 0.16, gain: 0.13, delay: 0 },
    { wave: "triangle", from: 90, to: 42, dur: 0.09, gain: 0.05, delay: 0.015 },
  ],
  produce: [
    { wave: "sine", from: 523, to: 659, dur: 0.08, gain: 0.045, delay: 0 },
    { wave: "sine", from: 659, to: 784, dur: 0.12, gain: 0.04, delay: 0.06 },
  ],
  build: [
    { wave: "triangle", from: 160, to: 90, dur: 0.07, gain: 0.12, delay: 0 },
    { wave: "triangle", from: 200, to: 100, dur: 0.08, gain: 0.11, delay: 0.11 },
  ],
  trade: [
    { wave: "sine", from: 494, to: 370, dur: 0.1, gain: 0.09, delay: 0 },
    { wave: "sine", from: 370, to: 587, dur: 0.14, gain: 0.09, delay: 0.12 },
  ],
  robber: [{ wave: "sawtooth", from: 196, to: 55, dur: 0.42, gain: 0.06, delay: 0 }],
  card: [{ wave: "triangle", from: 620, to: 1240, dur: 0.32, gain: 0.08, delay: 0 }],
  chat: [{ wave: "sine", from: 988, to: 880, dur: 0.05, gain: 0.05, delay: 0 }],
  offer: [
    { wave: "sine", from: 587, to: 587, dur: 0.1, gain: 0.1, delay: 0 },
    { wave: "sine", from: 880, to: 880, dur: 0.16, gain: 0.1, delay: 0.11 },
  ],
  stolen: [
    { wave: "square", from: 660, to: 220, dur: 0.06, gain: 0.05, delay: 0 },
    { wave: "triangle", from: 440, to: 110, dur: 0.2, gain: 0.11, delay: 0.05 },
  ],
  win: [
    { wave: "triangle", from: 523, to: 523, dur: 0.14, gain: 0.12, delay: 0 },
    { wave: "triangle", from: 659, to: 659, dur: 0.14, gain: 0.12, delay: 0.13 },
    { wave: "triangle", from: 784, to: 784, dur: 0.14, gain: 0.12, delay: 0.26 },
    { wave: "triangle", from: 1046, to: 1046, dur: 0.36, gain: 0.14, delay: 0.39 },
  ],
  lose: [
    { wave: "sine", from: 466, to: 466, dur: 0.16, gain: 0.09, delay: 0 },
    { wave: "sine", from: 392, to: 392, dur: 0.16, gain: 0.09, delay: 0.16 },
    { wave: "sine", from: 311, to: 280, dur: 0.34, gain: 0.1, delay: 0.32 },
  ],
};

export const SFX_CATEGORY: Record<SfxName, SfxCategory> = {
  turn: "turno",
  turn_soft: "turno",
  warn10: "reloj",
  warn5: "reloj",
  dice_throw: "dados",
  dice_hit: "dados",
  dice_settle: "dados",
  produce: "mesa",
  build: "mesa",
  trade: "mesa",
  robber: "mesa",
  card: "mesa",
  chat: "avisos",
  offer: "avisos",
  stolen: "avisos",
  win: "avisos",
  lose: "avisos",
};

export function voiceSignature(name: SfxName): string {
  return VOICES[name]
    .map((s) => `${s.wave}:${s.from}>${s.to}:${s.dur}:${s.delay}:${s.noise ? "n" : "t"}:${s.gain}`)
    .join("|");
}
