import * as THREE from "three";
import { hexToPixel, parseHexId } from "@shared/hex";
import { RESOURCES, type ClientView, type Resource } from "@shared/types";
import { S } from "../geo";

/** Distancia del centro de la ficha de puerto al medio de la arista costera. */
export const PORT_OFFSET = 0.74;

export type PortPair = {
  id: string;
  type: string;
  ratio: 2 | 3;
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** Centro de la loseta costera dueña de la arista (sin escalar). */
  hex: { x: number; y: number } | null;
};

export function portPairs(vertices: ClientView["vertices"]): PortPair[] {
  const withPort = vertices.filter((v) => v.port);
  const used = new Set<string>();
  const out: PortPair[] = [];
  for (const v of withPort) {
    if (used.has(v.id) || !v.port) continue;
    const mate = withPort.find(
      (o) =>
        o.id !== v.id &&
        !used.has(o.id) &&
        o.port?.type === v.port?.type &&
        o.port?.ratio === v.port?.ratio &&
        Math.hypot(o.x - v.x, o.y - v.y) < 1.15,
    );
    used.add(v.id);
    if (mate) used.add(mate.id);
    const b = mate ?? v;
    const shared = mate ? v.hexIds.find((h) => mate.hexIds.includes(h)) : v.hexIds[0];
    const hex = shared ? hexToPixel(parseHexId(shared).q, parseHexId(shared).r, 1) : null;
    out.push({
      id: v.id,
      type: v.port.type,
      ratio: v.port.ratio,
      a: { x: v.x, y: v.y },
      b: { x: b.x, y: b.y },
      hex,
    });
  }
  return out;
}

export function portSignCell(pair: PortPair): number {
  if (pair.type === "general") return 0;
  const i = RESOURCES.indexOf(pair.type as Resource);
  return i >= 0 ? i + 1 : 0;
}

/** Ficha en el agua, hacia afuera de la loseta costera; mundo (x, z). */
export function portAnchor(pair: PortPair): { token: THREE.Vector2; a: THREE.Vector2; b: THREE.Vector2 } {
  const a = new THREE.Vector2(pair.a.x * S, pair.a.y * S);
  const b = new THREE.Vector2(pair.b.x * S, pair.b.y * S);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const out = pair.hex
    ? mid.clone().sub(new THREE.Vector2(pair.hex.x * S, pair.hex.y * S))
    : mid.clone();
  if (out.lengthSq() < 1e-6) out.set(0, 1);
  out.normalize();
  return { token: mid.clone().addScaledVector(out, PORT_OFFSET), a, b };
}

/**
 * Dónde arranca cada pasarela: en los dos vértices de la arista, corridos un poco hacia la ficha
 * para que la tabla salga de la costa y no del poblado.
 */
export function plankShores(a: THREE.Vector2, b: THREE.Vector2, token: THREE.Vector2): THREE.Vector2[] {
  return [a, b].map((v) => v.clone().lerp(token, 0.06));
}
