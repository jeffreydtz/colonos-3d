import {
  NUMBER_TOKENS_EXPANSION,
  NUMBER_TOKENS_STANDARD,
  PORTS_EXPANSION,
  PORTS_STANDARD,
  TERRAIN_COUNTS_EXPANSION,
  TERRAIN_COUNTS_STANDARD,
  type BoardKind,
} from "./constants.ts";
import { edgeKey, hexCorner, hexId, hexToPixel, HEX_DIRS, landAxials, vertexKey } from "./hex.ts";
import { shuffle } from "./rng.ts";
import type { Edge, HexTile, Port, Resource, Terrain, Vertex } from "./types.ts";

export interface BoardGraph {
  hexes: HexTile[];
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  robberHexId: string;
}

const HEX_SIZE = 1;

function terrainBag(rng: () => number, kind: BoardKind): Terrain[] {
  const counts = kind === "standard" ? TERRAIN_COUNTS_STANDARD : TERRAIN_COUNTS_EXPANSION;
  const bag: Terrain[] = [];
  for (const [terrain, count] of Object.entries(counts) as [Terrain, number][]) {
    for (let i = 0; i < count; i++) bag.push(terrain);
  }
  return shuffle(bag, rng);
}

export function numbersNotRedAdjacent(hexes: HexTile[]): boolean {
  const byId = new Map(hexes.map((h) => [h.id, h]));
  for (const h of hexes) {
    if (h.number !== 6 && h.number !== 8) continue;
    for (const d of HEX_DIRS) {
      const n = byId.get(hexId(h.q + d.q, h.r + d.r));
      if (n && (n.number === 6 || n.number === 8) && n.id !== h.id) return false;
    }
  }
  return true;
}

function redConflictCount(hexes: HexTile[]): number {
  const byId = new Map(hexes.map((h) => [h.id, h]));
  let n = 0;
  for (const h of hexes) {
    if (h.number !== 6 && h.number !== 8) continue;
    for (const d of HEX_DIRS) {
      const nb = byId.get(hexId(h.q + d.q, h.r + d.r));
      if (nb && (nb.number === 6 || nb.number === 8) && nb.id > h.id) n += 1;
    }
  }
  return n;
}

function repairRedAdjacency(hexes: HexTile[], rng: () => number): void {
  const numbered = hexes.filter((h) => h.number != null);
  for (let guard = 0; guard < 2_500; guard++) {
    if (numbersNotRedAdjacent(hexes)) return;
    const reds = numbered.filter((h) => h.number === 6 || h.number === 8);
    const others = numbered.filter((h) => h.number !== 6 && h.number !== 8);
    if (!others.length || !reds.length) return;
    const a = reds[Math.floor(rng() * reds.length)]!;
    const b = others[Math.floor(rng() * others.length)]!;
    const before = redConflictCount(hexes);
    const tmp = a.number;
    a.number = b.number;
    b.number = tmp;
    if (redConflictCount(hexes) > before) {
      b.number = a.number;
      a.number = tmp;
    }
  }
}

/** Pares de vecinos con el mismo número (dos 9 pegados): legal, pero el reparto se ve amontonado. */
export function twinNumberPairs(hexes: HexTile[]): number {
  const byId = new Map(hexes.map((h) => [h.id, h]));
  let n = 0;
  for (const h of hexes) {
    if (h.number == null) continue;
    for (const d of HEX_DIRS) {
      const nb = byId.get(hexId(h.q + d.q, h.r + d.r));
      if (nb && nb.number === h.number && nb.id > h.id) n += 1;
    }
  }
  return n;
}

/**
 * Reparto variable del reglamento: fichas al azar con los rojos (6 y 8) nunca vecinos. Además se
 * evita que dos fichas iguales queden pegadas, con canjes al azar que nunca empeoran el reparto.
 */
function assignNumbers(hexes: HexTile[], rng: () => number, kind: BoardKind): void {
  const numbered = hexes.filter((h) => h.terrain !== "desierto");
  const source = kind === "standard" ? NUMBER_TOKENS_STANDARD : NUMBER_TOKENS_EXPANSION;
  const tokens = shuffle(source, rng);
  numbered.forEach((h, i) => {
    h.number = tokens[i] ?? 2;
  });
  const score = () => redConflictCount(hexes) * 10 + twinNumberPairs(hexes);
  let current = score();
  for (let guard = 0; guard < 6_000 && current > 0; guard++) {
    const a = numbered[Math.floor(rng() * numbered.length)]!;
    const b = numbered[Math.floor(rng() * numbered.length)]!;
    if (a.number === b.number) continue;
    const tmp = a.number;
    a.number = b.number;
    b.number = tmp;
    const next = score();
    if (next > current) {
      b.number = a.number;
      a.number = tmp;
    } else current = next;
  }
  repairRedAdjacency(hexes, rng);
}

export function buildBoard(rng: () => number, kind: BoardKind = "expansion"): BoardGraph {
  const axials = landAxials(kind);
  const terrains = terrainBag(rng, kind);
  const hexes: HexTile[] = axials.map((a, i) => ({
    id: hexId(a.q, a.r),
    q: a.q,
    r: a.r,
    terrain: terrains[i]!,
    number: null,
  }));
  assignNumbers(hexes, rng, kind);

  const hexSet = new Set(hexes.map((h) => h.id));
  const vertices: Record<string, Vertex> = {};
  const edges: Record<string, Edge> = {};

  for (const h of hexes) {
    const center = hexToPixel(h.q, h.r, HEX_SIZE);
    const corners: string[] = [];
    for (let i = 0; i < 6; i++) {
      const p = hexCorner(center, HEX_SIZE, i);
      const vid = vertexKey(p.x, p.y);
      corners.push(vid);
      if (!vertices[vid]) {
        vertices[vid] = {
          id: vid,
          x: p.x,
          y: p.y,
          hexIds: [],
          neighborIds: [],
          edgeIds: [],
          port: null,
        };
      }
      if (!vertices[vid].hexIds.includes(h.id)) vertices[vid].hexIds.push(h.id);
    }
    for (let i = 0; i < 6; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 6]!;
      const eid = edgeKey(a, b);
      if (!edges[eid]) {
        edges[eid] = { id: eid, vertexIds: a < b ? [a, b] : [b, a], hexIds: [] };
      }
      if (!edges[eid].hexIds.includes(h.id)) edges[eid].hexIds.push(h.id);
      const va = vertices[a]!;
      const vb = vertices[b]!;
      if (!va.neighborIds.includes(b)) va.neighborIds.push(b);
      if (!vb.neighborIds.includes(a)) vb.neighborIds.push(a);
      if (!va.edgeIds.includes(eid)) va.edgeIds.push(eid);
      if (!vb.edgeIds.includes(eid)) vb.edgeIds.push(eid);
    }
  }

  void hexSet;
  const ports = kind === "standard" ? PORTS_STANDARD : PORTS_EXPANSION;
  placePorts(vertices, edges, rng, ports);

  const deserts = hexes.filter((h) => h.terrain === "desierto");
  const robberHexId = deserts[0]?.id ?? hexes[0]!.id;

  return { hexes, vertices, edges, robberHexId };
}

function coastalEdges(edges: Record<string, Edge>): Edge[] {
  return Object.values(edges).filter((e) => e.hexIds.length === 1);
}

function placePorts(
  vertices: Record<string, Vertex>,
  edges: Record<string, Edge>,
  rng: () => number,
  portTypes: Port[],
): void {
  const coast = coastalEdges(edges);
  const usedVertices = new Set<string>();
  const chosen: Edge[] = [];

  const start = coast.slice().sort((a, b) => {
    const ay = vertices[a.vertexIds[0]]!.y + vertices[a.vertexIds[1]]!.y;
    const by = vertices[b.vertexIds[0]]!.y + vertices[b.vertexIds[1]]!.y;
    return ay - by;
  })[0];
  if (!start) return;

  // Parejo como el marco oficial: 30 aristas / 9 puertos dejan huecos de 3-4-3, 38 / 11 de 3 y 4.
  // Con un paso fijo de 3 los últimos tramos de costa quedaban sin ningún puerto.
  const ordered = walkCoast(start, coast, vertices);
  for (let i = 0; i < portTypes.length; i++) {
    const e = ordered[Math.round((i * ordered.length) / portTypes.length) % ordered.length]!;
    if (usedVertices.has(e.vertexIds[0]) || usedVertices.has(e.vertexIds[1])) continue;
    chosen.push(e);
    usedVertices.add(e.vertexIds[0]);
    usedVertices.add(e.vertexIds[1]);
  }

  if (chosen.length < portTypes.length) {
    for (const e of ordered) {
      if (chosen.length >= portTypes.length) break;
      if (usedVertices.has(e.vertexIds[0]) || usedVertices.has(e.vertexIds[1])) continue;
      chosen.push(e);
      usedVertices.add(e.vertexIds[0]);
      usedVertices.add(e.vertexIds[1]);
    }
  }

  const ports = shuffle(portTypes, rng);
  chosen.forEach((e, i) => {
    const port = ports[i];
    if (!port) return;
    vertices[e.vertexIds[0]]!.port = port;
    vertices[e.vertexIds[1]]!.port = port;
  });
}

function walkCoast(start: Edge, coast: Edge[], vertices: Record<string, Vertex>): Edge[] {
  const byVertex = new Map<string, Edge[]>();
  for (const e of coast) {
    for (const v of e.vertexIds) {
      const list = byVertex.get(v) ?? [];
      list.push(e);
      byVertex.set(v, list);
    }
  }
  const ordered: Edge[] = [];
  const seen = new Set<string>();
  let current = start;
  let fromV = current.vertexIds[0];
  for (let i = 0; i < coast.length + 2; i++) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    ordered.push(current);
    const nextV = current.vertexIds[0] === fromV ? current.vertexIds[1] : current.vertexIds[0];
    const candidates = (byVertex.get(nextV) ?? []).filter((e) => !seen.has(e.id));
    if (candidates.length === 0) break;
    current = candidates[0]!;
    fromV = nextV;
  }
  void vertices;
  return ordered.length ? ordered : coast;
}

export function emptyPartialResources(): Partial<Record<Resource, number>> {
  return {};
}
