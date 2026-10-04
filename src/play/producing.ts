import type { ClientView, Resource, Terrain } from "@shared/types";

const TERRAIN_RES: Partial<Record<Terrain, Resource>> = {
  madera: "madera",
  ladrillo: "ladrillo",
  lana: "lana",
  trigo: "trigo",
  mineral: "mineral",
};

export function diceTotal(view: ClientView): number {
  return view.dice ? view.dice[0] + view.dice[1] : 0;
}

/** Hexes que pagan con el último tiro (no desierto, no bloqueados por el ladrón). */
export function producingHexes(view: ClientView): ClientView["hexes"] {
  const total = diceTotal(view);
  if (!total || total === 7) return [];
  return view.hexes.filter((h) => h.number === total && h.id !== view.robberHexId && h.terrain !== "desierto");
}

export function terrainResource(terrain: Terrain): Resource | null {
  return TERRAIN_RES[terrain] ?? null;
}

export type HexScreen = { id: string; resource: Resource; x: number; y: number };

/** Últimas proyecciones pantalla de hexes productores (llenado desde el canvas). */
export const HEX_SCREENS: HexScreen[] = [];
