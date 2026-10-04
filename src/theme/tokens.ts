export const THEMES = ["atardecer", "dia", "noche", "isla"] as const;
export type ThemeId = (typeof THEMES)[number];

export const TOKENS = {
  room: "#140d09",
  tableWalnut: "#4a3020",
  tableWalnutHi: "#7a5233",
  felt: "#4a1c26",
  feltTrim: "#b08d3c",
  frame: "#3b2417",
  seaDeep: "#12405a",
  seaShallow: "#2f8fa8",
  seaFoam: "#e9f4f2",
  tokenCream: "#f1e4c3",
  tokenInk: "#2a1d12",
  tokenHot: "#b3261e",
  gold: "#e8c26a",
  parchment: "#f4e9d0",
  outline: "#120c08",
  panel: "#2b1d14",
} as const;

export const THEME = {
  atardecer: {
    bg: "#140d09",
    fogNear: 22,
    fogFar: 60,
    key: "#ffc98a",
    keyInt: 2.2,
    keyPos: [8, 12, 6] as [number, number, number],
    fill: "#7fa6d6",
    fillInt: 0.35,
    hemiSky: "#ffd8a8",
    hemiGround: "#3d2918",
    hemiInt: 0.45,
    ambient: 0.22,
    lamp: true,
    env: 0.8,
  },
  // Más luz que el atardecer pero sin quemar: con ACES, de más el trigo y el desierto se lavaban a blanco.
  dia: {
    bg: "#3d5566",
    fogNear: 32,
    fogFar: 78,
    key: "#fff6e4",
    keyInt: 2.45,
    keyPos: [10, 18, 8] as [number, number, number],
    fill: "#d7ecff",
    fillInt: 0.5,
    hemiSky: "#d7ecff",
    hemiGround: "#8a7a62",
    hemiInt: 0.58,
    ambient: 0.3,
    lamp: false,
    env: 0.92,
  },
  noche: {
    bg: "#05060c",
    fogNear: 24,
    fogFar: 62,
    key: "#c5d2f6",
    keyInt: 1.78,
    keyPos: [-6, 11, 4] as [number, number, number],
    fill: "#3a527c",
    fillInt: 0.8,
    hemiSky: "#31456e",
    hemiGround: "#1a140f",
    hemiInt: 0.58,
    ambient: 0.29,
    lamp: true,
    env: 0.42,
  },
  isla: {
    bg: "#062033",
    fogNear: 20,
    fogFar: 44,
    key: "#ffffff",
    keyInt: 1.55,
    keyPos: [10, 16, 8] as [number, number, number],
    fill: "#c5e4f5",
    fillInt: 0.2,
    hemiSky: "#c5e4f5",
    hemiGround: "#3d2918",
    hemiInt: 0.55,
    ambient: 0.34,
    lamp: false,
    env: 0.6,
  },
} as const;

export const PLAYER_GLYPHS = ["●", "▲", "■", "◆", "★", "✚"] as const;

export const THEME_LABEL: Record<ThemeId, string> = {
  atardecer: "Atardecer",
  dia: "Día",
  noche: "Noche",
  isla: "Isla",
};

export const TERRAIN_3D: Record<string, { base: string; accent: string; accent2: string }> = {
  madera: { base: "#2f6b3c", accent: "#1f5a35", accent2: "#5a3b22" },
  lana: { base: "#86c050", accent: "#f2e8c8", accent2: "#f4efe4" },
  trigo: { base: "#e2b04a", accent: "#c78d2b", accent2: "#f0c45a" },
  ladrillo: { base: "#c45c32", accent: "#8f3b1e", accent2: "#d98055" },
  mineral: { base: "#7f8aa0", accent: "#4b5365", accent2: "#f2f5f8" },
  desierto: { base: "#e2cf9f", accent: "#c2a36b", accent2: "#4f7a3a" },
};

const THEME_KEY = "colonos-tema";

export function loadTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw && (THEMES as readonly string[]).includes(raw)) return raw as ThemeId;
  } catch {
    /* ignore */
  }
  return "atardecer";
}

export function saveTheme(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* ignore */
  }
}
