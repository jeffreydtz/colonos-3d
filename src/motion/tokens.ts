/**
 * Tokens de motion. Un solo lugar para duraciones (ms), curvas y la nitidez de la cámara.
 * El 3D, el CSS y la cosecha leen de acá. Los números pinneados (cosecha, cámara, dados)
 * se conservan: este módulo les pone nombre, no les cambia el valor.
 */

export const DURATION = {
  /** Hover, anillo, micro. */
  micro: 140,
  /** Caída y asentado de un poblado. */
  place: 560,
  /** El poblado se vuelve ciudad: crece desde la base. */
  upgrade: 640,
  /** El camino se apoya y se estira sobre la arista. */
  road: 520,
  /** Ladrón: levantar, arco, apoyar. */
  robber: 780,
  robberLite: 460,
  /** Vuelo de la cosecha. Igual que el perfil que ya estaba medido. */
  harvestMine: 780,
  harvestOther: 460,
  harvestLiteMine: 420,
  harvestLiteOther: 280,
  harvestReduce: 160,
  harvestStagger: 80,
  harvestStaggerLite: 40,
  harvestLimit: 1400,
  /** Sobre de la carta de desarrollo. */
  cardBurst: 900,
  cardRise: 560,
  cardFlip: 700,
  cardTear: 420,
  cardPack: 560,
  cardTilt: 140,
  /** La isla se arma loseta por loseta. */
  boardRise: 680,
  boardStagger: 46,
  boardStaggerLite: 28,
  /** Tarjeta de victoria, sin scrim. */
  victory: 480,
  /** Tomas de cámara ya calibradas: no marean y no cambian de duración. */
  cameraIntro: 1700,
  cameraDice: 2600,
  cameraRobber: 1500,
  handCatch: 220,
  seatPulse: 420,
} as const;

/** Arco de la cosecha, en px de CSS. Negativo sube. No es una duración. */
export const HARVEST_ARC = {
  fullLift: -72,
  fullBounce: -10,
  otherLift: -18,
  liteBounce: -8,
} as const;

/** Nitidez del ease exponencial de la cámara (1/s). Restaurar queda más rápida que el intro. */
export const CAMERA_SHARP = {
  intro: 2.2,
  event: 4.2,
  restore: 8,
} as const;

/**
 * Cadenas CSS. `outCubic` es la del vuelo de recursos (ya pinneada).
 * El resto nombra las curvas que ya usaba la carta.
 */
export const BEZIER = {
  outCubic: "cubic-bezier(0.33, 0, 0.2, 1)",
  outBack: "cubic-bezier(0.2, 0.9, 0.3, 1.2)",
  inOut: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  inCubic: "cubic-bezier(0.55, 0, 0.75, 0.2)",
  cardFlip: "cubic-bezier(0.3, 0.7, 0.2, 1)",
} as const;

/** Deriva del bump del agua, en UV por segundo. Se apaga con reducir movimiento. */
export const SEA_DRIFT = {
  x: 0.01,
  y: 0.006,
} as const;

/** Alto de la caída de una pieza, en unidades del tablero. */
export const DROP_H = 0.62;

export type MotionOpts = { lite?: boolean; reduce?: boolean };

/** Acorta en liviano y deja la pose final si el usuario pidió menos movimiento. */
export function motionMs(base: number, opts: MotionOpts = {}): number {
  if (opts.reduce) return 0;
  if (opts.lite) return Math.max(1, Math.round(base * 0.62));
  return base;
}

export function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

export function easeOutCubic(t: number): number {
  const u = clamp01(t);
  return 1 - (1 - u) ** 3;
}

export function easeInCubic(t: number): number {
  const u = clamp01(t);
  return u * u * u;
}

export function easeInOutCubic(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

/** Overshoot suave. s=1.70158 es el back estándar; 1.35 es el que ya usaba el poblado. */
export function easeOutBack(t: number, s = 1.70158): number {
  const u = clamp01(t);
  const c = s + 1;
  return 1 + c * (u - 1) ** 3 + s * (u - 1) ** 2;
}
