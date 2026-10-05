import { COLORS } from "../shared/types.ts";
import type { ClientView, ColorId, GameState } from "../shared/types.ts";
import { createGame } from "./engine.ts";
import { toClientView } from "./view.ts";

export const ART_SCENES = [
  "S0-vacio",
  "S1-lleno",
  "S2-mosaico",
  "S3-dados",
  "S4-cartas",
  "S5-victoria",
  "S6-grande",
  "S7-iconos",
] as const;

export type ArtSceneId = (typeof ART_SCENES)[number];

const NAMES = ["Luz", "Tomi", "Mora", "Fede", "Nico", "Sol"];

export function isArtSceneId(id: string): id is ArtSceneId {
  return (ART_SCENES as readonly string[]).includes(id);
}

function players(n: number): Array<{ id: string; name: string; color: ColorId }> {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: NAMES[i] ?? `J${i}`,
    color: COLORS[i]!,
  }));
}

function fillPieces(state: GameState): void {
  const verts = Object.values(state.vertices);
  const taken = new Set<string>();
  function nextVertex(): (typeof verts)[number] | undefined {
    for (const v of verts) {
      if (taken.has(v.id)) continue;
      if (v.neighborIds.some((n) => taken.has(n))) continue;
      taken.add(v.id);
      return v;
    }
    for (const v of verts) {
      if (!taken.has(v.id)) {
        taken.add(v.id);
        return v;
      }
    }
    return undefined;
  }
  const usedEdges = new Set<string>();
  for (const p of state.players) {
    const spots: string[] = [];
    for (let s = 0; s < 2; s++) {
      const v = nextVertex();
      if (!v) break;
      state.buildings.push({ vertexId: v.id, playerId: p.id, kind: "poblado" });
      p.pieces.poblados = Math.max(0, p.pieces.poblados - 1);
      spots.push(v.id);
    }
    const city = nextVertex();
    if (city) {
      state.buildings.push({ vertexId: city.id, playerId: p.id, kind: "ciudad" });
      p.pieces.ciudades = Math.max(0, p.pieces.ciudades - 1);
      spots.push(city.id);
    }
    let roads = 0;
    for (const vid of spots) {
      const v = state.vertices[vid];
      if (!v) continue;
      for (const eid of v.edgeIds) {
        if (roads >= 6) break;
        if (usedEdges.has(eid)) continue;
        usedEdges.add(eid);
        state.roads.push({ edgeId: eid, playerId: p.id });
        p.pieces.caminos = Math.max(0, p.pieces.caminos - 1);
        roads += 1;
      }
    }
  }
  const forest8 =
    state.hexes.find((h) => h.terrain === "madera" && h.number === 8) ??
    state.hexes.find((h) => h.terrain === "madera");
  if (forest8) state.robberHexId = forest8.id;
  state.phase = "principal";
  state.turnNumber = 12;
  state.turnIndex = 0;
}

function mosaicLayout(state: GameState): void {
  const terrains = ["madera", "lana", "trigo", "ladrillo", "mineral", "desierto"] as const;
  const numbers = [6, 8, 5, 10, 3, null] as const;
  for (let i = 0; i < terrains.length; i++) {
    const h = state.hexes[i];
    if (!h) break;
    h.terrain = terrains[i]!;
    h.number = numbers[i] ?? null;
    h.q = i - 2;
    h.r = 0;
  }
  state.hexes = state.hexes.slice(0, 6);
}

export function buildArtState(scene: ArtSceneId, seed = 42, playerCount?: number): GameState {
  const n =
    playerCount != null && playerCount >= 3 && playerCount <= 6
      ? playerCount
      : scene === "S6-grande" || scene === "S5-victoria"
        ? 6
        : scene === "S1-lleno"
          ? 4
          : 3;
  const state = createGame({
    seed,
    entropy: "test",
    victoryPoints: 10,
    players: players(n),
  });
  if (scene === "S1-lleno" || scene === "S5-victoria" || scene === "S4-cartas" || scene === "S7-iconos") {
    fillPieces(state);
  }
  if (scene === "S1-lleno") {
    state.dice = [6, 2];
    state.rollNo = 1;
  }
  if (scene === "S0-vacio") {
    state.phase = "principal";
    state.turnNumber = 1;
  }
  if (scene === "S6-grande") {
    state.phase = "principal";
    state.turnNumber = 1;
  }
  if (scene === "S2-mosaico") {
    mosaicLayout(state);
    state.phase = "principal";
  }
  if (scene === "S3-dados") {
    state.phase = "principal";
    state.dice = [3, 4];
    state.rollNo = 1;
    state.diceThrow = 20261004;
    state.turnNumber = 4;
  }
  if (scene === "S5-victoria") {
    const you = state.players[0]!;
    // 3 ciudades (6) + ruta más larga (2) + ejército más grande (2) = la meta de 10.
    for (const b of state.buildings) {
      if (b.playerId === you.id && b.kind === "poblado") b.kind = "ciudad";
    }
    state.longestRoadPlayerId = you.id;
    state.largestArmyPlayerId = you.id;
    you.knightsPlayed = 3;
    state.phase = "fin";
    state.winnerId = you.id;
  }
  if (scene === "S4-cartas" || scene === "S7-iconos") {
    const you = state.players[0]!;
    you.resources = { madera: 3, ladrillo: 2, lana: 2, trigo: 3, mineral: 2 };
    you.devCards = [
      { kind: "caballero", purchasedTurn: 1 },
      { kind: "punto_victoria", purchasedTurn: 1 },
      { kind: "progreso_invento", purchasedTurn: 2 },
    ];
  }
  return state;
}

export function buildArtView(scene: ArtSceneId, seed = 42, playerCount?: number): ClientView {
  const state = buildArtState(scene, seed, playerCount);
  const you = state.players[0]!;
  return toClientView(state, you.id, {
    roomCode: "ART001",
    hostId: you.id,
    chat: [],
    connected: new Set(state.players.map((p) => p.id)),
    bots: new Set(state.players.slice(1).map((p) => p.id)),
    deadlineAt: null,
    unboxPlayerId: null,
  });
}
