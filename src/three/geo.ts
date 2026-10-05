import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hexCorner, hexToPixel, landAxials, pips, vertexKey, edgeKey } from "@shared/hex";
import type { BoardKind } from "@shared/constants";
import type { Vec2 } from "@shared/types";

export const S = 1.05;
/** Radio a vértice = S: las losetas se tocan como el cartón físico, sin rendija de mar. */
export const TILE_R_TOP = S;
export const TILE_R_BOT = S;
export const PLATE_H = 0.14;
export const BEVEL = 0.018;
/** Cara superior de toda loseta: cartón parejo como el físico, sin escalones entre terrenos. */
export const TILE_TOP = 0.17;
export const TILE_BOTTOM = -0.02;
export const SEA_Y = 0;
/**
 * La ficha física mide 25 mm sobre una loseta de 79 mm (32% del ancho). Acá ~39%: un poco más
 * grande para que el número se lea en el celular, sin tapar el terreno como el 45% de antes.
 */
export const TOKEN_R = 0.34;
export const TOKEN_H = 0.054;
export const TOKEN_ZONE_R = TOKEN_R + 0.06;

/** Como la ficha impresa: el número crece con la probabilidad (6 y 8 grandes, 2 y 12 chicos). */
export function digitScale(n: number): number {
  return (0.84 + pips(n) * 0.04) * (n >= 10 ? 0.86 : 1);
}

/**
 * Peón opaco parado sobre la ficha, como en el Catán de mesa.
 * La base (y = 0 del torneado) es más ancha que la cara impresa: desde la mesa no se lee el número.
 */
export const ROBBER_FOOT_LOCAL = 0.2;
export const ROBBER_SCALE = 2.08;
export const ROBBER_FOOT_R = ROBBER_FOOT_LOCAL * ROBBER_SCALE;
/** Alto del torneado sin escalar. */
export const ROBBER_H = 0.5;
/** Cara impresa (círculo del atlas), no sólo el glifo. El pie la tapa entera. */
export const ROBBER_NUMBER_R = TOKEN_R * 0.93;

/**
 * Centro de la loseta, encima de la ficha. El mismo lugar con número o en el desierto.
 */
export function robberSpot(hex: { q: number; r: number; number?: number | null }): THREE.Vector2 {
  const p = hexToPixel(hex.q, hex.r, S);
  return new THREE.Vector2(p.x, p.y);
}

/**
 * ¿El pie tapa el número desde esta elevación de cámara (grados sobre el horizonte)?
 * El disco del pie cubre el dígito; el cuerpo opaco corta el rayo que sale de ese punto.
 */
export function robberCoversToken(elevationDeg: number): boolean {
  const spot = robberSpot({ q: 0, r: 0, number: 8 });
  const center = hexToPixel(0, 0, S);
  const cx = spot.x - center.x;
  const cz = spot.y - center.y;
  const rf = ROBBER_FOOT_R;
  const h = ROBBER_H * ROBBER_SCALE;
  const baseY = TILE_TOP + TOKEN_H;
  const el = (elevationDeg * Math.PI) / 180;
  const rings = [0, ROBBER_NUMBER_R * 0.55, ROBBER_NUMBER_R];
  for (let ai = 0; ai < 24; ai++) {
    const az = (ai / 24) * Math.PI * 2;
    const ux = Math.sin(az) * Math.cos(el);
    const uy = Math.sin(el);
    const uz = Math.cos(az) * Math.cos(el);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      for (const rad of rings) {
        const px = Math.cos(a) * rad;
        const pz = Math.sin(a) * rad;
        if (Math.hypot(px - cx, pz - cz) > rf - 0.004) return false;
        const ox = px - cx;
        const oz = pz - cz;
        const A = ux * ux + uz * uz;
        const B = 2 * (ox * ux + oz * uz);
        const C = ox * ox + oz * oz - rf * rf;
        if (A < 1e-8) continue;
        const disc = B * B - 4 * A * C;
        if (disc < 0) return false;
        const s = Math.sqrt(disc);
        const hits = [(-B - s) / (2 * A), (-B + s) / (2 * A)].filter((t) => t > 0.002);
        const blocked = hits.some((t) => {
          const y = baseY + t * uy;
          return y >= baseY - 0.001 && y <= baseY + h + 0.001;
        });
        if (!blocked) return false;
      }
    }
  }
  return true;
}
export const CAVITY_R = 0.48;
export const VERTEX_CLEAR_R = 0.22;
/**
 * Agua entre la costa más saliente y el marco. La ficha de puerto (centro a 0,74, radio 0,35)
 * queda adentro con aire; menos que esto la mete en la madera. El hexágono no puede copiar
 * cada entrante de la costa: achicar este margen achica también esas ensenadas.
 */
export const SEA_MARGIN = 0.9;
export const FRAME_W = 0.62;
export const FRAME_TOP = 0.24;
export const PIECE_Y = TILE_TOP;
/**
 * Poblados y ciudades sobre el modelo base: las fichas son más grandes que las físicas para que
 * se lean, y a escala 1 las casitas quedaban chicas al lado.
 */
export const PIECE_SCALE = 1.15;
export const ROAD_Y = TILE_TOP - 0.004;
/**
 * Perfil del palito (x = ancho, y = alto). Más ancho que una cinta y acostado,
 * para que no se lea como un muro sobre la arista.
 */
/** Palo redondeado, más ancho abajo: se lee como madera torneada, no como una regla. */
export const ROAD_PROFILE: Array<[number, number]> = [
  [-0.054, 0],
  [-0.05, 0.018],
  [-0.036, 0.046],
  [-0.016, 0.066],
  [0, 0.074],
  [0.016, 0.066],
  [0.036, 0.046],
  [0.05, 0.018],
  [0.054, 0],
];
/** Largo del camino sobre la arista: deja lugar al poblado de cada punta. */
export const ROAD_LEN = 0.68;
/** Pose de arranque; `fitBoard` la reemplaza en el primer frame según aspecto y HUD. */
export const CAM_FOV = 30;
export const CAM_CLASSIC: [number, number, number] = [0, 13.6, 9.9];
export const CAM_EXPANSION: [number, number, number] = [-0.9, 17.8, 12.9];
export const PROP_MAX_H = {
  mineral: 0.85,
  madera: 0.55,
  other: 0.3,
} as const;

export type Axial2 = { q: number; r: number };

export function islandCenter(hexes: Axial2[]): THREE.Vector2 {
  const c = new THREE.Vector2();
  if (!hexes.length) return c;
  for (const h of hexes) {
    const p = hexToPixel(h.q, h.r, S);
    c.x += p.x;
    c.y += p.y;
  }
  return c.multiplyScalar(1 / hexes.length);
}

/** Normales de un hexágono con vértices a izquierda/derecha (el marco de Catán para losetas en punta). */
const FRAME_NORMALS = [330, 30, 90, 150, 210, 270].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return new THREE.Vector2(Math.cos(a), Math.sin(a));
});

/** Apotemas del hexágono de mar: envuelve la costa con `margin` de agua, simétrico. */
export function seaApothems(hexes: Axial2[], margin = SEA_MARGIN): { center: THREE.Vector2; apothems: number[] } {
  const center = islandCenter(hexes);
  const outline = outlineFromAxials(hexes);
  const reach = FRAME_NORMALS.map((n) => {
    let m = 0;
    for (const p of outline) m = Math.max(m, (p.x - center.x) * n.x + (p.y - center.y) * n.y);
    return m;
  });
  const diag = Math.max(reach[0]!, reach[1]!, reach[3]!, reach[4]!) + margin;
  const flat = Math.max(reach[2]!, reach[5]!) + margin;
  return { center, apothems: [diag, diag, flat, diag, diag, flat] };
}

/** Polígono CCW (x, z) del hexágono definido por apotemas sobre FRAME_NORMALS. */
export function hexFromApothems(center: THREE.Vector2, apothems: number[], grow = 0): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let k = 0; k < 6; k++) {
    const n1 = FRAME_NORMALS[k]!;
    const n2 = FRAME_NORMALS[(k + 1) % 6]!;
    const a1 = apothems[k]! + grow;
    const a2 = apothems[(k + 1) % 6]! + grow;
    const det = n1.x * n2.y - n1.y * n2.x;
    const x = (a1 * n2.y - a2 * n1.y) / det;
    const y = (n1.x * a2 - n2.x * a1) / det;
    out.push(new THREE.Vector2(center.x + x, center.y + y));
  }
  return ensureCcw(out);
}

export function hexShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = radius * Math.cos(a);
    const y = radius * Math.sin(a);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

/** Loseta biselada que ocupa exactamente [bottom, top] en Y. */
export function makeHexPlate(
  radius = TILE_R_TOP,
  top = TILE_TOP,
  bottom = TILE_BOTTOM,
  bevel = BEVEL,
): THREE.ExtrudeGeometry {
  const shape = hexShape(radius - bevel);
  const depth = Math.max(0.01, top - bottom - 2 * bevel);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bottom + bevel, 0);
  geo.computeVertexNormals();
  planarXZ(geo);
  return geo;
}

function planarXZ(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) * 0.55 + 0.5;
    uv[i * 2 + 1] = pos.getZ(i) * 0.55 + 0.5;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

export function outlineFromAxials(axials: Array<{ q: number; r: number }>, size = S): THREE.Vector2[] {
  const counts = new Map<string, { a: Vec2; b: Vec2; n: number }>();
  for (const h of axials) {
    const c = hexToPixel(h.q, h.r, size);
    const corners = [0, 1, 2, 3, 4, 5].map((i) => hexCorner(c, size, i));
    for (let i = 0; i < 6; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 6]!;
      const k = edgeKey(vertexKey(a.x, a.y), vertexKey(b.x, b.y));
      const hit = counts.get(k);
      if (hit) hit.n += 1;
      else counts.set(k, { a, b, n: 1 });
    }
  }
  const border = [...counts.values()].filter((e) => e.n === 1);
  if (border.length === 0) return [];
  const byVertex = new Map<string, Array<{ a: Vec2; b: Vec2 }>>();
  for (const e of border) {
    const ka = vertexKey(e.a.x, e.a.y);
    const kb = vertexKey(e.b.x, e.b.y);
    byVertex.set(ka, [...(byVertex.get(ka) ?? []), e]);
    byVertex.set(kb, [...(byVertex.get(kb) ?? []), e]);
  }
  const start = border[0]!;
  const loop: THREE.Vector2[] = [new THREE.Vector2(start.a.x, start.a.y)];
  let at = vertexKey(start.a.x, start.a.y);
  const seen = new Set<string>();
  for (let n = 0; n < border.length + 2; n++) {
    const cands = byVertex.get(at) ?? [];
    let next: Vec2 | null = null;
    for (const e of cands) {
      const other = vertexKey(e.a.x, e.a.y) === at ? e.b : e.a;
      const ok = vertexKey(other.x, other.y);
      const ek = `${at}|${ok}`;
      if (seen.has(ek) || seen.has(`${ok}|${at}`)) continue;
      seen.add(ek);
      next = other;
      break;
    }
    if (!next) break;
    loop.push(new THREE.Vector2(next.x, next.y));
    at = vertexKey(next.x, next.y);
    if (loop.length > 2 && at === vertexKey(start.a.x, start.a.y)) break;
  }
  return loop;
}

export function landOutline(kind: BoardKind, size = S): THREE.Vector2[] {
  return outlineFromAxials(landAxials(kind), size);
}

export function offsetLoop(pts: THREE.Vector2[], dist: number): THREE.Vector2[] {
  const n = pts.length;
  if (n < 3) return pts;
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n]!;
    const cur = pts[i]!;
    const next = pts[(i + 1) % n]!;
    const e1 = new THREE.Vector2().subVectors(cur, prev);
    const e2 = new THREE.Vector2().subVectors(next, cur);
    if (e1.lengthSq() < 1e-8 || e2.lengthSq() < 1e-8) {
      out.push(cur.clone());
      continue;
    }
    e1.normalize();
    e2.normalize();
    const n1 = new THREE.Vector2(e1.y, -e1.x);
    const n2 = new THREE.Vector2(e2.y, -e2.x);
    const nrm = n1.add(n2);
    if (nrm.lengthSq() < 1e-8) {
      out.push(cur.clone().add(n1.multiplyScalar(dist)));
      continue;
    }
    nrm.normalize();
    const miter = Math.min(2, 1 / Math.max(0.25, nrm.dot(n1)));
    out.push(cur.clone().addScaledVector(nrm, dist * miter));
  }
  return out;
}

export function loopArea(pts: THREE.Vector2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function ensureCcw(pts: THREE.Vector2[]): THREE.Vector2[] {
  return loopArea(pts) < 0 ? pts.slice().reverse() : pts;
}

/** Une geometrías de sólido (todas sin index, mismos attrs) para 1 draw call. */
export function mergeSolid(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const cleaned = parts.map((g) => {
    const n = g.getIndex() ? g.toNonIndexed() : g.clone();
    if (!n.getAttribute("normal")) n.computeVertexNormals();
    const count = n.getAttribute("position")!.count;
    if (!n.getAttribute("uv")) {
      n.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    for (const name of Object.keys(n.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") n.deleteAttribute(name);
    }
    return n;
  });
  const merged = mergeGeometries(cleaned, false);
  if (!merged) throw new Error("mergeSolid failed");
  merged.computeVertexNormals();
  return merged;
}
