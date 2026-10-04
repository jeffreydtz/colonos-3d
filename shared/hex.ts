import type { Axial, Vec2 } from "./types.ts";

export const HEX_DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexId(q: number, r: number): string {
  return `${q},${r}`;
}

export function parseHexId(id: string): Axial {
  const [q, r] = id.split(",").map(Number);
  return { q, r };
}

export function addAxial(a: Axial, b: Axial): Axial {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexToPixel(q: number, r: number, size: number): Vec2 {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = size * (3 / 2) * r;
  return { x, y };
}

export function hexCorner(center: Vec2, size: number, i: number): Vec2 {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return {
    x: center.x + size * Math.cos(angle),
    y: center.y + size * Math.sin(angle),
  };
}

export function vertexKey(x: number, y: number): string {
  const rx = Math.round(x * 1000) / 1000;
  const ry = Math.round(y * 1000) / 1000;
  return `${rx.toFixed(3)},${ry.toFixed(3)}`;
}

export function parseVertexKey(id: string): Vec2 {
  const [x, y] = id.split(",").map(Number);
  return { x, y };
}

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Isla clásica 3–4: 19 hexágonos en filas 3-4-5-4-3 = todos los hex a distancia ≤ 2
 * del centro. Cada fila queda centrada en x = 0 (hexágono regular, no rombo).
 */
export function landAxialsStandard(): Axial[] {
  const rows: Array<{ r: number; q0: number; n: number }> = [
    { r: -2, q0: 0, n: 3 },
    { r: -1, q0: -1, n: 4 },
    { r: 0, q0: -2, n: 5 },
    { r: 1, q0: -2, n: 4 },
    { r: 2, q0: -2, n: 3 },
  ];
  return expandRows(rows);
}

/**
 * Isla 5–6: 30 hexágonos en filas 3-4-5-6-5-4-3, simétrica como la extensión física.
 * Todas las filas comparten el mismo centro en x (−√3/2); la fila de 6 no se corre.
 */
export function landAxialsExpansion(): Axial[] {
  const rows: Array<{ r: number; q0: number; n: number }> = [
    { r: -3, q0: 0, n: 3 },
    { r: -2, q0: -1, n: 4 },
    { r: -1, q0: -2, n: 5 },
    { r: 0, q0: -3, n: 6 },
    { r: 1, q0: -3, n: 5 },
    { r: 2, q0: -3, n: 4 },
    { r: 3, q0: -3, n: 3 },
  ];
  return expandRows(rows);
}

function expandRows(rows: Array<{ r: number; q0: number; n: number }>): Axial[] {
  const out: Axial[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) out.push({ q: row.q0 + i, r: row.r });
  }
  return out;
}

export function landAxials(kind: "standard" | "expansion" = "expansion"): Axial[] {
  return kind === "standard" ? landAxialsStandard() : landAxialsExpansion();
}

export function pips(n: number | null): number {
  if (n == null) return 0;
  if (n === 7) return 0;
  return 6 - Math.abs(n - 7);
}
