import * as CANNON from "cannon-es";
import * as THREE from "three";
import { DIE_SIZE, FACE_NORMAL } from "./dieGeo";

/** Altura del paño respecto del centro de la bandeja de madera. Igual que el mesh. */
export const FELT_LIFT = 0.055;
const DT = 1 / 60;
const HALF = DIE_SIZE / 2;
/** Borde interior del paño: coincide con el marco de madera del mesh. */
const INNER_X = 1.14;
const INNER_Z = 0.66;
const MAX_ATTEMPTS = 14;
const STEPS = 150;

export type DieSample = {
  t: number;
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
};

export type ThrowClip = {
  duration: number;
  settleAt: number;
  a: DieSample[];
  b: DieSample[];
  /** Tiempos (s) de impactos, para el sonido. */
  hits: number[];
  faces: [number, number];
};

/** Stream visual. No decide el número: el servidor ya lo fijó. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(seed: number, n: number): number {
  return (Math.imul(seed ^ Math.imul(n + 1, 0x45d9f3b), 0x9e3779b9) >>> 0) || 1;
}

export function facePointingUp(q: THREE.Quaternion): { face: number; dot: number } {
  const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q.clone().invert());
  let face = 1;
  let dot = -2;
  for (let f = 1; f <= 6; f++) {
    const d = FACE_NORMAL[f]!.dot(localUp);
    if (d > dot) {
      dot = d;
      face = f;
    }
  }
  return { face, dot };
}

function bodyQuat(q: CANNON.Quaternion): THREE.Quaternion {
  return new THREE.Quaternion(q.x, q.y, q.z, q.w);
}

/** Rota el mesh, fijo durante toda la tirada, para que la cara del servidor quede arriba al asentarse. */
function faceOffset(bodyFinal: THREE.Quaternion, value: number): THREE.Quaternion {
  const { face } = facePointingUp(bodyFinal);
  return new THREE.Quaternion().setFromUnitVectors(FACE_NORMAL[value]!.clone(), FACE_NORMAL[face]!.clone());
}

type Sim = {
  a: CANNON.Body;
  b: CANNON.Body;
  framesA: CANNON.Quaternion[];
  framesB: CANNON.Quaternion[];
  posA: CANNON.Vec3[];
  posB: CANNON.Vec3[];
  hits: number[];
  feltY: number;
  score: number;
  ok: boolean;
};

function simulate(seed: number, tray: [number, number, number]): Sim {
  const rng = mulberry32(seed);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
  world.allowSleep = false;
  const solver = world.solver as CANNON.GSSolver;
  solver.iterations = 14;
  solver.tolerance = 1e-7;

  const wood = new CANNON.Material("wood");
  const ivory = new CANNON.Material("ivory");
  // Más pesados y un poco más vivos al tocar: el número igual lo fija el servidor al asentar.
  const feltContact = { friction: 0.55, restitution: 0.4, contactEquationStiffness: 1e7, contactEquationRelaxation: 3 };
  world.addContactMaterial(new CANNON.ContactMaterial(ivory, wood, feltContact));
  world.addContactMaterial(
    new CANNON.ContactMaterial(ivory, ivory, {
      friction: 0.22,
      restitution: 0.18,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    }),
  );

  const feltY = tray[1] + FELT_LIFT;
  world.addBody(
    new CANNON.Body({
      mass: 0,
      material: wood,
      shape: new CANNON.Box(new CANNON.Vec3(INNER_X, 0.06, INNER_Z)),
      position: new CANNON.Vec3(tray[0], feltY - 0.06, tray[2]),
    }),
  );
  const wallH = 0.62;
  const wallY = feltY + wallH / 2;
  const walls: Array<[CANNON.Vec3, CANNON.Vec3]> = [
    [new CANNON.Vec3(INNER_X + 0.06, wallH / 2, 0.05), new CANNON.Vec3(tray[0], wallY, tray[2] + INNER_Z + 0.05)],
    [new CANNON.Vec3(INNER_X + 0.06, wallH / 2, 0.05), new CANNON.Vec3(tray[0], wallY, tray[2] - INNER_Z - 0.05)],
    [new CANNON.Vec3(0.05, wallH / 2, INNER_Z + 0.06), new CANNON.Vec3(tray[0] + INNER_X + 0.05, wallY, tray[2])],
    [new CANNON.Vec3(0.05, wallH / 2, INNER_Z + 0.06), new CANNON.Vec3(tray[0] - INNER_X - 0.05, wallY, tray[2])],
  ];
  for (const [half, pos] of walls) {
    world.addBody(new CANNON.Body({ mass: 0, material: wood, shape: new CANNON.Box(half), position: pos }));
  }

  const mk = (side: number): CANNON.Body => {
    const b = new CANNON.Body({
      mass: 0.12,
      material: ivory,
      shape: new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF)),
      linearDamping: 0.06,
      angularDamping: 0.09,
      allowSleep: false,
    });
    const spin = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2),
    );
    b.position.set(
      tray[0] + side * (0.22 + rng() * 0.06),
      feltY + HALF + 0.52 + rng() * 0.16,
      tray[2] - 0.08 + (rng() - 0.5) * 0.1,
    );
    b.quaternion.set(spin.x, spin.y, spin.z, spin.w);
    b.velocity.set((rng() - 0.5) * 1.2, 0.12 + rng() * 0.4, 0.65 + rng() * 0.95);
    b.angularVelocity.set((rng() - 0.5) * 14, (rng() - 0.5) * 14, (rng() - 0.5) * 14);
    world.addBody(b);
    return b;
  };

  const a = mk(-1);
  const b = mk(1);
  const framesA: CANNON.Quaternion[] = [];
  const framesB: CANNON.Quaternion[] = [];
  const posA: CANNON.Vec3[] = [];
  const posB: CANNON.Vec3[] = [];
  const hits: number[] = [];
  let prevA = a.velocity.length();
  let prevB = b.velocity.length();
  let lastHit = -1;

  for (let i = 0; i <= STEPS; i++) {
    if (i > 0) {
      world.step(DT / 2);
      world.step(DT / 2);
    }
    const t = i * DT;
    framesA.push(a.quaternion.clone());
    framesB.push(b.quaternion.clone());
    posA.push(a.position.clone());
    posB.push(b.position.clone());
    const sa = a.velocity.length();
    const sb = b.velocity.length();
    if (i > 3 && t - lastHit > 0.08 && (prevA - sa > 1.15 || prevB - sb > 1.15)) {
      hits.push(t);
      lastHit = t;
    }
    prevA = sa;
    prevB = sb;
  }

  const flat = (body: CANNON.Body): number => facePointingUp(bodyQuat(body.quaternion)).dot;
  const onTable = (body: CANNON.Body): boolean => {
    const bottom = body.position.y - HALF;
    const inside =
      Math.abs(body.position.x - tray[0]) < INNER_X - HALF - 0.02 &&
      Math.abs(body.position.z - tray[2]) < INNER_Z - HALF - 0.02;
    const slow = body.velocity.length() < 0.28 && body.angularVelocity.length() < 0.7;
    const grounded = bottom >= feltY - 0.015 && bottom <= feltY + 0.035;
    return inside && slow && grounded && flat(body) > 0.992;
  };
  const gap = a.position.distanceTo(b.position);
  const ok = onTable(a) && onTable(b) && gap > DIE_SIZE * 0.96 && hits.length > 0;
  const score = flat(a) + flat(b) + (gap > DIE_SIZE ? 0.2 : 0) + Math.min(hits.length, 3) * 0.05;
  return { a, b, framesA, framesB, posA, posB, hits, feltY, score, ok };
}

function clipFrom(sim: Sim, values: [number, number]): ThrowClip {
  const offA = faceOffset(bodyQuat(sim.a.quaternion), values[0]);
  const offB = faceOffset(bodyQuat(sim.b.quaternion), values[1]);
  const a: DieSample[] = [];
  const b: DieSample[] = [];
  for (let i = 0; i < sim.framesA.length; i++) {
    const t = i * DT;
    const qa = new THREE.Quaternion(sim.framesA[i]!.x, sim.framesA[i]!.y, sim.framesA[i]!.z, sim.framesA[i]!.w).multiply(offA);
    const qb = new THREE.Quaternion(sim.framesB[i]!.x, sim.framesB[i]!.y, sim.framesB[i]!.z, sim.framesB[i]!.w).multiply(offB);
    const pa = sim.posA[i]!;
    const pb = sim.posB[i]!;
    a.push({ t, px: pa.x, py: pa.y, pz: pa.z, qx: qa.x, qy: qa.y, qz: qa.z, qw: qa.w });
    b.push({ t, px: pb.x, py: pb.y, pz: pb.z, qx: qb.x, qy: qb.y, qz: qb.z, qw: qb.w });
  }
  let settleAt = a[a.length - 1]!.t;
  for (let i = 8; i < a.length; i++) {
    const qa = new THREE.Quaternion(a[i]!.qx, a[i]!.qy, a[i]!.qz, a[i]!.qw);
    const qb = new THREE.Quaternion(b[i]!.qx, b[i]!.qy, b[i]!.qz, b[i]!.qw);
    const still =
      facePointingUp(qa).face === values[0] &&
      facePointingUp(qb).face === values[1] &&
      facePointingUp(qa).dot > 0.99 &&
      facePointingUp(qb).dot > 0.99 &&
      Math.hypot(a[i]!.px - a[i - 6]!.px, a[i]!.py - a[i - 6]!.py, a[i]!.pz - a[i - 6]!.pz) < 0.02 &&
      Math.hypot(b[i]!.px - b[i - 6]!.px, b[i]!.py - b[i - 6]!.py, b[i]!.pz - b[i - 6]!.pz) < 0.02;
    if (still) {
      settleAt = a[i]!.t;
      break;
    }
  }
  return {
    duration: a[a.length - 1]!.t,
    settleAt,
    a,
    b,
    hits: sim.hits,
    faces: values,
  };
}

/**
 * Tira los dos dados con cannon-es a paso fijo. La semilla sólo elige velocidades:
 * el número ya vino del servidor. El mesh lleva un giro constante para que, al
 * apoyarse, la cara de arriba sea ese número, sin un slerp final.
 * Misma semilla y mismos valores → la misma cinta en todos los clientes.
 */
export function planThrow(opts: {
  seed: number;
  values: [number, number];
  tray: [number, number, number];
}): ThrowClip {
  let best: Sim | null = null;
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    const sim = simulate(mixSeed(opts.seed >>> 0 || 1, n), opts.tray);
    if (!best || sim.score > best.score) best = sim;
    if (sim.ok) return clipFrom(sim, opts.values);
  }
  return clipFrom(best!, opts.values);
}

export function sampleDie(frames: DieSample[], time: number): DieSample {
  const head = frames[0];
  const tail = frames[frames.length - 1];
  if (!head || !tail) throw new Error("tirada vacía");
  if (time <= head.t) return head;
  if (time >= tail.t) return tail;
  let i = 1;
  while (i < frames.length && frames[i]!.t < time) i += 1;
  const b = frames[i]!;
  const a = frames[i - 1]!;
  const u = (time - a.t) / Math.max(1e-6, b.t - a.t);
  const qa = new THREE.Quaternion(a.qx, a.qy, a.qz, a.qw);
  const qb = new THREE.Quaternion(b.qx, b.qy, b.qz, b.qw);
  const q = qa.slerp(qb, u);
  return {
    t: time,
    px: a.px + (b.px - a.px) * u,
    py: a.py + (b.py - a.py) * u,
    pz: a.pz + (b.pz - a.pz) * u,
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
  };
}

/** Semilla visual si el servidor viejo no mandó `diceThrow`. Igual en todos los clientes. */
export function visualSeed(throwSeed: number | null | undefined, rollNo: number): number {
  if (throwSeed) return throwSeed >>> 0;
  return (Math.imul(rollNo + 1, 0x9e3779b9) >>> 0) || 1;
}
