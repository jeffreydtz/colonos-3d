import type { ColorId, DevKind, Resource, Resources, Terrain } from "./types.ts";

export const HEX_SIZE = 1;
export const DEFAULT_VICTORY = 10;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const BANK_EACH_STANDARD = 19;
export const BANK_EACH_EXPANSION = 24;
/** @deprecated alias de la expansión 5–6 */
export const BANK_EACH = BANK_EACH_EXPANSION;
export const MAX_HAND_SAFE = 7;
/** Ofertas abiertas por jugador (contraofertas incluidas): más es spam, no comercio. */
export const MAX_OPEN_OFFERS = 8;
export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;

export const PIECES = {
  caminos: 15,
  poblados: 5,
  ciudades: 4,
} as const;

export const COSTS: Record<"camino" | "poblado" | "ciudad" | "dev", Partial<Resources>> = {
  camino: { ladrillo: 1, madera: 1 },
  poblado: { ladrillo: 1, madera: 1, lana: 1, trigo: 1 },
  ciudad: { trigo: 2, mineral: 3 },
  dev: { lana: 1, trigo: 1, mineral: 1 },
};

export type BoardKind = "standard" | "expansion";

export const TERRAIN_COUNTS_STANDARD: Record<Terrain, number> = {
  madera: 4,
  lana: 4,
  trigo: 4,
  ladrillo: 3,
  mineral: 3,
  desierto: 1,
};

export const TERRAIN_COUNTS_EXPANSION: Record<Terrain, number> = {
  madera: 6,
  lana: 6,
  trigo: 6,
  ladrillo: 5,
  mineral: 5,
  desierto: 2,
};

/** @deprecated expansión 5–6 */
export const TERRAIN_COUNTS = TERRAIN_COUNTS_EXPANSION;

export const NUMBER_TOKENS_STANDARD: number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

export const NUMBER_TOKENS_EXPANSION: number[] = [
  2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
];

export const NUMBER_TOKENS = NUMBER_TOKENS_EXPANSION;

export const DEV_DECK_STANDARD: DevKind[] = [
  ...Array<DevKind>(14).fill("caballero"),
  ...Array<DevKind>(5).fill("punto_victoria"),
  ...Array<DevKind>(2).fill("progreso_caminos"),
  ...Array<DevKind>(2).fill("progreso_invento"),
  ...Array<DevKind>(2).fill("progreso_monopolio"),
];

export const DEV_DECK_EXPANSION: DevKind[] = [
  ...Array<DevKind>(20).fill("caballero"),
  ...Array<DevKind>(5).fill("punto_victoria"),
  ...Array<DevKind>(3).fill("progreso_caminos"),
  ...Array<DevKind>(3).fill("progreso_invento"),
  ...Array<DevKind>(3).fill("progreso_monopolio"),
];

export const DEV_DECK = DEV_DECK_EXPANSION;

export const PORTS_STANDARD: Array<{ type: Resource | "general"; ratio: 2 | 3 }> = [
  { type: "general", ratio: 3 },
  { type: "general", ratio: 3 },
  { type: "general", ratio: 3 },
  { type: "general", ratio: 3 },
  { type: "madera", ratio: 2 },
  { type: "ladrillo", ratio: 2 },
  { type: "lana", ratio: 2 },
  { type: "trigo", ratio: 2 },
  { type: "mineral", ratio: 2 },
];

export const PORTS_EXPANSION: Array<{ type: Resource | "general"; ratio: 2 | 3 }> = [
  { type: "general", ratio: 3 },
  { type: "general", ratio: 3 },
  { type: "general", ratio: 3 },
  { type: "general", ratio: 3 },
  { type: "general", ratio: 3 },
  { type: "madera", ratio: 2 },
  { type: "ladrillo", ratio: 2 },
  { type: "lana", ratio: 2 },
  { type: "lana", ratio: 2 },
  { type: "trigo", ratio: 2 },
  { type: "mineral", ratio: 2 },
];

/** La mesa de 6 es el modo principal. */
export const DEFAULT_SEAT_LIMIT = 6;

export function boardKindForCount(n: number): BoardKind {
  return n >= 5 ? "expansion" : "standard";
}

export const COLOR_HEX: Record<ColorId, string> = {
  rojo: "#E0601A",
  azul: "#2E93D6",
  naranja: "#F2B01E",
  blanco: "#F4F4F5",
  verde: "#14B38A",
  marron: "#D58BBA",
};

export const COLOR_LABEL: Record<ColorId, string> = {
  rojo: "Rojo",
  azul: "Azul",
  naranja: "Ámbar",
  blanco: "Blanco",
  verde: "Verde",
  marron: "Violeta",
};

export const RESOURCE_LABEL: Record<Resource, string> = {
  madera: "Madera",
  ladrillo: "Ladrillo",
  lana: "Lana",
  trigo: "Trigo",
  mineral: "Piedra",
};

export const TERRAIN_LABEL: Record<Terrain, string> = {
  ...RESOURCE_LABEL,
  desierto: "Desierto",
};

export const TERRAIN_COLOR: Record<Terrain, string> = {
  madera: "#1b7a4a",
  lana: "#7cbc4a",
  trigo: "#e4b44c",
  ladrillo: "#c45c32",
  mineral: "#8b95a7",
  desierto: "#e6d2a2",
};

export const EMPTY_RESOURCES = (): Resources => ({
  madera: 0,
  ladrillo: 0,
  lana: 0,
  trigo: 0,
  mineral: 0,
});

export const FULL_BANK = (each: number = BANK_EACH_STANDARD): Resources => ({
  madera: each,
  ladrillo: each,
  lana: each,
  trigo: each,
  mineral: each,
});
