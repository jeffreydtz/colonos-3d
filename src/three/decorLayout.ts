/** Dónde va cada prop de terreno dentro de su loseta (coordenadas locales al centro del hex). */

export function hash(id: string, salt: number): number {
  let h = salt * 2654435761;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 1597334677);
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Bosque tupido: con 12, un anillo hacia el medio de cada arista y otro más afuera hacia los
 * vértices (los vértices quedan a 0,4 del árbol: entra un poblado). Cinco sueltos se leían como
 * un parque, no como un bosque.
 */
export function forestPos(id: string, k: number, per: number) {
  const outer = per > 6 && k >= 6;
  const slots = per > 6 ? 6 : per;
  const a = ((outer ? k - 6 : k) * 2 * Math.PI) / slots + (outer ? Math.PI / 6 : 0) + (hash(id, k + 3) - 0.5) * 0.28;
  const rad = outer ? 0.62 + hash(id, k + 11) * 0.05 : 0.55 + hash(id, k + 11) * 0.05;
  return { x: Math.cos(a) * rad, z: Math.sin(a) * rad, s: (outer ? 0.64 : 0.6) + hash(id, k + 21) * 0.22 };
}

/** Radio de la base del pino (cono de 0,14) a escala 1. */
export const TREE_BASE_R = 0.14;
export const BRICK = { l: 0.15, h: 0.05, d: 0.072 };
/** Media oveja más larga (hocico a cola) a escala 1. */
export const SHEEP_REACH = 0.16;
/** Radio de la base del pico de montaña a escala 1. */
export const CRAG_R = 0.22;
/** Base más ancha que alta: con conos finos y parejos la montaña se leía como un skyline de juguete. */
export const CRAG_H = 0.36;

/**
 * Macizo detrás de la ficha (lado lejano a la cámara, −z): dos cumbres nevadas en las esquinas de
 * atrás, cada una con un hombro pelado pegado hacia el costado (las bases se solapan y forman un
 * cordón), una loma baja adelante de un lado y una piedra chica. El pasillo justo detrás de la
 * ficha queda libre para el ladrón. Sólo las cumbres llevan nieve.
 */
export function peakPose(id: string, k: number, per: number) {
  const deg = Math.PI / 180;
  const flip = hash(id, 41) > 0.5 ? 1 : -1;
  const big = flip > 0 ? [1.0, 1.0] : [0.9, 0.86];
  const slots: Array<{ a: number; rad: number; sxz: number; sy: number; snow: boolean }> = [
    { a: 222, rad: 0.6, sxz: flip > 0 ? 1 : 0.94, sy: big[0]!, snow: true },
    { a: 318, rad: 0.6, sxz: flip > 0 ? 0.94 : 1, sy: big[1]!, snow: true },
    { a: flip > 0 ? 192 : 348, rad: 0.62, sxz: 0.8, sy: 0.55, snow: false },
    { a: flip > 0 ? 348 : 192, rad: 0.62, sxz: 0.72, sy: 0.45, snow: false },
    { a: flip > 0 ? 140 : 40, rad: 0.6, sxz: 0.6, sy: 0.3, snow: false },
    { a: flip > 0 ? 64 : 116, rad: 0.62, sxz: 0.44, sy: 0.2, snow: false },
  ];
  const s = slots[k % Math.min(per, slots.length)]!;
  const jitter = 1 + (hash(id, k + 43) - 0.5) * 0.08;
  const a = (s.a + (hash(id, k + 45) - 0.5) * 6) * deg;
  return {
    x: Math.cos(a) * s.rad,
    z: Math.sin(a) * s.rad,
    sxz: s.sxz * jitter,
    sy: s.sy * (1 + (hash(id, k + 47) - 0.5) * 0.12),
    yaw: hash(id, k + 49) * Math.PI * 2,
    tilt: (hash(id, k + 51) - 0.5) * 0.1,
    snow: s.snow,
  };
}

/**
 * Ovejas pastando hacia el medio de las aristas: dos vecinas y una enfrente, así no forman un
 * anillo prolijo alrededor de la ficha ni pisan vértices o caminos.
 */
export function sheepPos(id: string, k: number, per: number) {
  const start = Math.floor(hash(id, 31) * 6);
  const steps = per >= 3 ? [0, 1, 3] : [0, 3];
  const edge = (start + (steps[k % steps.length] ?? 0)) % 6;
  const a = (edge * Math.PI) / 3 + (hash(id, k + 33) - 0.5) * 0.4;
  const rad = 0.58 + hash(id, k + 35) * 0.04;
  return {
    x: Math.cos(a) * rad,
    z: Math.sin(a) * rad,
    yaw: hash(id, k + 37) * Math.PI * 2,
    s: 0.9 + hash(id, k + 39) * 0.16,
  };
}

/**
 * Pilas de tres ladrillos (dos abajo, uno cruzado arriba) hacia el medio de aristas alternas.
 * Ladrillos sueltos en anillo se leían como confeti.
 */
export function brickPose(id: string, k: number, stacks: number) {
  const stack = Math.floor(k / 3);
  const slot = k % 3;
  const a = (stack * 2 * Math.PI) / stacks + (stacks === 2 ? Math.PI / 3 : 0) + (hash(id, stack + 5) - 0.5) * 0.3;
  const rad = 0.6 + (hash(id, stack + 9) - 0.5) * 0.06;
  const across = slot === 2 ? 0 : slot === 0 ? -1 : 1;
  const off = across * (BRICK.d / 2 + 0.004);
  return {
    x: Math.cos(a) * (rad + off),
    z: Math.sin(a) * (rad + off),
    y: slot === 2 ? BRICK.h * 1.5 : BRICK.h / 2,
    yaw: -a - Math.PI / 2 + (slot === 2 ? Math.PI / 2 + (hash(id, stack + 13) - 0.5) * 0.5 : (hash(id, k) - 0.5) * 0.12),
  };
}
