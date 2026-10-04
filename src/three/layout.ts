import * as THREE from "three";
import {
  FRAME_TOP,
  FRAME_W,
  TILE_TOP,
  ensureCcw,
  hexFromApothems,
  offsetLoop,
  outlineFromAxials,
  seaApothems,
  type Axial2,
} from "./geo";

export type BoardLayout = {
  /** Centro de la isla en (x, z). */
  center: THREE.Vector2;
  /** Borde del agua = cara interna del marco. */
  sea: THREE.Vector2[];
  frameOuter: THREE.Vector2[];
  /** Costa real de las losetas (radio S). */
  coast: THREE.Vector2[];
  /** Costa + franja de puertos, para encuadrar en vertical. */
  harbor: THREE.Vector2[];
};

export function boardLayout(hexes: Axial2[]): BoardLayout {
  const { center, apothems } = seaApothems(hexes);
  const coast = ensureCcw(outlineFromAxials(hexes));
  return {
    center,
    sea: hexFromApothems(center, apothems),
    frameOuter: hexFromApothems(center, apothems, FRAME_W),
    coast,
    harbor: offsetLoop(coast, 0.8),
  };
}

export type Framing = {
  tray: [number, number, number];
  /** Velas de la noche (x, z), sobre la mesa y adentro del encuadre. */
  candles: Array<[number, number]>;
  points: THREE.Vector3[];
  /** Toma de dados: la costa entera más la bandeja. Se acerca sin cortar la isla. */
  dice: THREE.Vector3[];
  wide: boolean;
};

const TRAY_HALF: [number, number] = [1.25, 0.78];

function bounds(poly: THREE.Vector2[]) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.y);
    z1 = Math.max(z1, p.y);
  }
  return { x0, x1, z0, z1 };
}

/**
 * Dónde va la bandeja de dados y qué puntos tiene que mostrar la cámara.
 * Apaisado: bandeja al costado derecho del marco y se encuadra el marco entero.
 * Vertical: bandeja abajo y se encuadra la costa con los puertos (el ancho manda).
 */
/** Arista del marco cuya normal hacia afuera más se parece a `angle` (en el plano x, z). */
function frameEdgeFacing(layout: BoardLayout, angle: number) {
  const want = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
  const poly = layout.frameOuter;
  let best = { score: -Infinity, mid: new THREE.Vector2(), n: want.clone(), t: new THREE.Vector2(1, 0) };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const t = b.clone().sub(a).normalize();
    const n = new THREE.Vector2(t.y, -t.x);
    if (n.dot(mid.clone().sub(layout.center)) < 0) n.multiplyScalar(-1);
    const score = n.dot(want);
    if (score > best.score) best = { score, mid, n, t };
  }
  return best;
}

/** Centro de la bandeja en la esquina de mesa que deja libre la arista diagonal de abajo a la derecha. */
function cornerTray(layout: BoardLayout): [number, number] {
  const edge = frameEdgeFacing(layout, Math.PI / 6);
  const support = TRAY_HALF[0] * Math.abs(edge.n.x) + TRAY_HALF[1] * Math.abs(edge.n.y);
  const c = edge.mid.clone().addScaledVector(edge.n, support + 0.3);
  return [c.x, c.y];
}

/** Par de velas frente a la arista diagonal de arriba a la izquierda: en diagonal con la bandeja. */
function cornerCandles(layout: BoardLayout): Array<[number, number]> {
  const edge = frameEdgeFacing(layout, Math.PI + Math.PI / 6);
  const at = (out: number, along: number): [number, number] => {
    const p = edge.mid.clone().addScaledVector(edge.n, out).addScaledVector(edge.t, along);
    return [p.x, p.y];
  };
  return [at(0.62, 0.26), at(0.86, -0.18)];
}

export function framing(layout: BoardLayout, aspect: number): Framing {
  const wide = aspect >= 1.12;
  const fb = bounds(layout.frameOuter);
  const corner = cornerTray(layout);
  const tray: [number, number, number] = wide
    ? [corner[0], 0.04, corner[1]]
    : [layout.center.x, 0.04, fb.z1 + TRAY_HALF[1] + 0.12];
  // En vertical la esquina de arriba queda fuera de cuadro: las velas acompañan a la bandeja.
  const candles: Array<[number, number]> = wide
    ? cornerCandles(layout)
    : [
        [tray[0] - TRAY_HALF[0] - 0.55, tray[2] - 0.12],
        [tray[0] - TRAY_HALF[0] - 0.95, tray[2] + 0.22],
      ];
  const points: THREE.Vector3[] = [];
  const ring = wide ? layout.frameOuter : layout.harbor;
  const y = wide ? FRAME_TOP : TILE_TOP;
  for (const p of ring) points.push(new THREE.Vector3(p.x, y, p.y));
  const trayCorners: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      trayCorners.push(new THREE.Vector3(tray[0] + sx * TRAY_HALF[0], 0.32, tray[2] + sz * TRAY_HALF[1]));
    }
  }
  points.push(...trayCorners);
  const dice = [...layout.coast.map((p) => new THREE.Vector3(p.x, TILE_TOP, p.y)), ...trayCorners];
  return { tray, candles, points, dice, wide };
}
