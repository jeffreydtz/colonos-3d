import {
  DROP_H,
  DURATION,
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  motionMs,
  type MotionOpts,
} from "./tokens";

export type PiecePose = { y: number; sx: number; sy: number; sz: number };

const REST: PiecePose = { y: 0, sx: 1, sy: 1, sz: 1 };

/**
 * Cae, se aplasta al tocar y rebota una vez. El origen de la pieza es la base,
 * así que sy < 1 aplasta el techo y la base se queda en el vértice.
 */
export function pieceDrop(u: number, reduce = false): PiecePose {
  if (reduce || u >= 1) return REST;
  const t = clamp01(u);
  if (t <= 0) return { y: DROP_H, sx: 0.96, sy: 1.06, sz: 0.96 };
  const fall = 0.56;
  const squash = 0.74;
  const rebound = 0.9;
  if (t < fall) {
    const k = easeInCubic(t / fall);
    return {
      y: DROP_H * (1 - k),
      sx: 0.96 + 0.04 * k,
      sy: 1 + 0.06 * (1 - k),
      sz: 0.96 + 0.04 * k,
    };
  }
  if (t < squash) {
    const s = Math.sin(((t - fall) / (squash - fall)) * Math.PI * 0.5);
    return { y: 0, sx: 1 + 0.14 * s, sy: 1 - 0.2 * s, sz: 1 + 0.14 * s };
  }
  if (t < rebound) {
    const k = (t - squash) / (rebound - squash);
    const left = 1 - easeOutCubic(k);
    return {
      y: 0.05 * Math.sin(k * Math.PI),
      sx: 1 + 0.14 * left,
      sy: 1 - 0.2 * left,
      sz: 1 + 0.14 * left,
    };
  }
  const k = easeOutCubic((t - rebound) / (1 - rebound));
  return { y: 0.012 * (1 - k), sx: 1, sy: 1, sz: 1 };
}

/** La ciudad crece desde la base del poblado, con un leve overshoot. */
export function upgradeRise(u: number, reduce = false): PiecePose {
  if (reduce || u >= 1) return REST;
  const e = easeOutBack(clamp01(u), 1.35);
  return {
    y: 0,
    sx: 0.78 + 0.22 * Math.min(e, 1.06),
    sy: Math.max(0.05, 0.18 + 0.82 * e),
    sz: 0.78 + 0.22 * Math.min(e, 1.06),
  };
}

export type RoadPose = { y: number; width: number; length: number; thick: number };

/** Cae un poco, se estira a lo largo de la arista y se asienta. */
export function roadLay(u: number, reduce = false): RoadPose {
  if (reduce || u >= 1) return { y: 0, width: 1, length: 1, thick: 1 };
  const t = clamp01(u);
  const e = easeOutCubic(t);
  const contact = t > 0.78 ? Math.sin(((t - 0.78) / 0.22) * Math.PI) : 0;
  return {
    y: 0.14 * (1 - e),
    width: 0.42 + 0.58 * e + 0.06 * contact,
    length: 0.08 + 0.92 * easeInOutCubic(t),
    thick: 1 - 0.1 * contact,
  };
}

export type Vec3 = { x: number; y: number; z: number };

/**
 * Levanta en el origen, cruza en arco y apoya en el destino.
 * Con reducir movimiento queda ya apoyado.
 */
export function robberPose(u: number, from: Vec3, to: Vec3, opts: MotionOpts = {}): Vec3 {
  if (opts.reduce || u >= 1) return { x: to.x, y: to.y, z: to.z };
  if (u <= 0) return { x: from.x, y: from.y, z: from.z };
  const liftH = opts.lite ? 0.28 : 0.62;
  const bow = opts.lite ? 0.05 : 0.12;
  const liftEnd = 0.22;
  const landStart = 0.78;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const t = clamp01(u);
  if (t < liftEnd) {
    const k = easeOutCubic(t / liftEnd);
    return { x: from.x, y: from.y + liftH * k, z: from.z };
  }
  if (t < landStart) {
    const k = easeInOutCubic((t - liftEnd) / (landStart - liftEnd));
    return {
      x: lerp(from.x, to.x, k),
      y: from.y + liftH + Math.sin(k * Math.PI) * bow,
      z: lerp(from.z, to.z, k),
    };
  }
  const k = easeInCubic((t - landStart) / (1 - landStart));
  return { x: to.x, y: to.y + liftH * (1 - k), z: to.z };
}

/** La loseta sale del agua y se asienta. Sólo traslación: el volumen de toque no cambia de tamaño. */
export function boardRise(u: number, reduce = false): { y: number } {
  if (reduce || u >= 1) return { y: 0 };
  const t = clamp01(u);
  if (t <= 0) return { y: -0.46 };
  return { y: -0.46 * (1 - easeOutCubic(t)) };
}

/** `dist` es la distancia axial al centro (hypot de q, r). */
export function tileUnit(now: number, started: number, dist: number, opts: MotionOpts = {}): number {
  const dur = motionMs(DURATION.boardRise, opts);
  if (dur <= 0) return 1;
  const step = opts.lite ? DURATION.boardStaggerLite : DURATION.boardStagger;
  const delay = Math.max(0, dist) * step;
  return clamp01((now - started - delay) / dur);
}

export function tileOffset(now: number, started: number, dist: number, opts: MotionOpts = {}): number {
  return boardRise(tileUnit(now, started, dist, opts), !!opts.reduce).y;
}
