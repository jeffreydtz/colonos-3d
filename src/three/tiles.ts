import * as THREE from "three";
import type { Terrain } from "@shared/types";
import { TILE_R_TOP } from "./geo";

/** Giro de 60°·k por loseta: misma silueta, distinta veta, así dos losetas iguales no se ven calcadas. */
export function tileSpin(id: string, _terrain: Terrain): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 6) * Math.PI) / 3;
}

export const TILE_TINT = {
  base: "#ffffff",
  producing: "#fff4d4",
  highlighted: "#f4e4c1",
  chosen: "#fff6d0",
  robbed: "#8f8a84",
} as const;

export function tileTint(
  id: string,
  terrain: Terrain,
  highlighted: Set<string>,
  producing: Set<string> | undefined,
  robberHexId?: string,
  chosenId?: string,
): string {
  if (chosenId && id === chosenId) return TILE_TINT.chosen;
  if (highlighted.has(id)) return TILE_TINT.highlighted;
  // El oscurecido avisa "esta loseta dejó de producir"; el desierto nunca produce y arranca con el
  // ladrón: oscurecida, la arena se leía como una tabla de madera.
  if (id === robberHexId && terrain !== "desierto") return TILE_TINT.robbed;
  if (producing?.has(id)) return TILE_TINT.producing;
  return TILE_TINT.base;
}

const hexGeo = new Map<number, THREE.CylinderGeometry>();

/**
 * Prisma de 6 lados con un vértice hacia ±z: misma orientación "en punta" que las
 * losetas biseladas y que los vértices del motor. Lados rectos, sin conicidad.
 */
export function prismGeo(height: number): THREE.CylinderGeometry {
  const key = Math.round(height * 1000);
  let g = hexGeo.get(key);
  if (g) return g;
  g = new THREE.CylinderGeometry(TILE_R_TOP, TILE_R_TOP * 1.008, height, 6);
  hexGeo.set(key, g);
  return g;
}
