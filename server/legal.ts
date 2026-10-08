import { COSTS } from "../shared/constants.ts";
import { pairedSeat } from "../shared/paired.ts";
import type { GameState, LegalMoves, Resource } from "../shared/types.ts";
import { hasResources, sumResources } from "./resources.ts";

export function currentPlayer(state: GameState) {
  if (state.phase === "construccion_especial") {
    const id = state.specialBuildQueue[0];
    return state.players.find((p) => p.id === id) ?? null;
  }
  return state.players[state.turnIndex] ?? null;
}

/** Dueño del turno (el que tira y pasa). En la pausa de construcción sigue siendo el índice, no quien construye. */
export function turnOwner(state: GameState) {
  return state.players[state.turnIndex] ?? null;
}

/**
 * Pareja que puede construir y comerciar con el banco durante el turno.
 * No corre en la colocación, el descarte ni la pausa de construcción: ahí juega una sola persona.
 */
export function pairedPlayerId(state: GameState): string | null {
  if (
    state.phase === "fin" ||
    state.phase === "colocacion_poblado" ||
    state.phase === "colocacion_camino" ||
    state.phase === "descarte" ||
    state.phase === "construccion_especial"
  ) {
    return null;
  }
  const idx = pairedSeat(state.turnIndex, state.players.length);
  if (idx == null) return null;
  return state.players[idx]?.id ?? null;
}

export type TurnRole = "owner" | "paired" | "special";

/** Quién puede mandar una jugada de turno. El descarte y el ladrón de un 7 se filtran aparte. */
export function turnRole(state: GameState, playerId: string): TurnRole | null {
  if (state.phase === "fin" || state.phase === "descarte") return null;
  if (state.phase === "construccion_especial") {
    return state.specialBuildQueue[0] === playerId ? "special" : null;
  }
  const owner = state.players[state.turnIndex];
  if (!owner) return null;
  if (
    state.phase === "colocacion_poblado" ||
    state.phase === "colocacion_camino" ||
    state.phase === "ladron"
  ) {
    return owner.id === playerId ? "owner" : null;
  }
  if (owner.id === playerId) return "owner";
  if (pairedPlayerId(state) === playerId) return "paired";
  return null;
}

/** Quién mueve el ladrón: el dueño en un 7, o quien jugó el caballero. */
export function robberMoverId(state: GameState): string | null {
  return state.robberActorId ?? state.players[state.turnIndex]?.id ?? null;
}

export function emptyLegal(): LegalMoves {
  return {
    vertices: [],
    cityVertices: [],
    edges: [],
    hexes: [],
    stealFrom: [],
    canRoll: false,
    canEndTurn: false,
    canBuyDev: false,
    canPlayKnight: false,
    canPlayYearPlenty: false,
    canPlayMonopoly: false,
    canPlayRoadBuilding: false,
    canTrade: false,
    canBankTrade: false,
    mustDiscard: 0,
    robberHexes: [],
  };
}

export function distanceOk(state: GameState, vertexId: string): boolean {
  const v = state.vertices[vertexId];
  if (!v) return false;
  if (state.buildings.some((b) => b.vertexId === vertexId)) return false;
  for (const n of v.neighborIds) {
    if (state.buildings.some((b) => b.vertexId === n)) return false;
  }
  return true;
}

export function playerTouchesVertex(state: GameState, playerId: string, vertexId: string): boolean {
  const v = state.vertices[vertexId];
  if (!v) return false;
  return v.edgeIds.some((eid) => state.roads.some((r) => r.edgeId === eid && r.playerId === playerId));
}

function enemyOccupiesVertex(state: GameState, playerId: string, vertexId: string): boolean {
  return state.buildings.some((b) => b.vertexId === vertexId && b.playerId !== playerId);
}

export function playerTouchesEdge(state: GameState, playerId: string, edgeId: string): boolean {
  const e = state.edges[edgeId];
  if (!e) return false;
  for (const vid of e.vertexIds) {
    if (state.buildings.some((b) => b.vertexId === vid && b.playerId === playerId)) return true;
    // Un poblado enemigo corta la red: no se puede seguir a través de ese vértice.
    if (enemyOccupiesVertex(state, playerId, vid)) continue;
    const v = state.vertices[vid];
    if (!v) continue;
    for (const eid of v.edgeIds) {
      if (eid === edgeId) continue;
      if (state.roads.some((r) => r.edgeId === eid && r.playerId === playerId)) return true;
    }
  }
  return false;
}

export function legalSettlementVertices(
  state: GameState,
  playerId: string,
  setup: boolean,
): string[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  if (!setup && player.pieces.poblados <= 0) return [];
  const out: string[] = [];
  for (const v of Object.values(state.vertices)) {
    if (!distanceOk(state, v.id)) continue;
    if (!setup && !playerTouchesVertex(state, playerId, v.id)) continue;
    out.push(v.id);
  }
  return out;
}

export function legalRoadEdges(
  state: GameState,
  playerId: string,
  setupVertexId: string | null,
): string[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  if (player.pieces.caminos <= 0 && setupVertexId == null) return [];
  const out: string[] = [];
  for (const e of Object.values(state.edges)) {
    if (state.roads.some((r) => r.edgeId === e.id)) continue;
    if (setupVertexId) {
      if (!e.vertexIds.includes(setupVertexId)) continue;
    } else if (!playerTouchesEdge(state, playerId, e.id)) {
      continue;
    }
    out.push(e.id);
  }
  return out;
}

export function legalCityVertices(state: GameState, playerId: string): string[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.pieces.ciudades <= 0) return [];
  return state.buildings
    .filter((b) => b.playerId === playerId && b.kind === "poblado")
    .map((b) => b.vertexId);
}

export function stealCandidates(state: GameState, hexId: string, actorId: string): string[] {
  const ids = new Set<string>();
  for (const b of state.buildings) {
    const v = state.vertices[b.vertexId];
    if (!v) continue;
    if (v.hexIds.includes(hexId) && b.playerId !== actorId) {
      const p = state.players.find((x) => x.id === b.playerId);
      if (p && sumResources(p.resources) > 0) ids.add(b.playerId);
    }
  }
  return [...ids];
}

export function bestBankRate(state: GameState, playerId: string, resource: Resource): number {
  let rate = 4;
  for (const b of state.buildings) {
    if (b.playerId !== playerId) continue;
    const port = state.vertices[b.vertexId]?.port;
    if (!port) continue;
    if (port.type === "general") rate = Math.min(rate, 3);
    if (port.type === resource) rate = Math.min(rate, 2);
  }
  return rate;
}

function playable(state: GameState, playerId: string, kind: "caballero" | "progreso_caminos" | "progreso_monopolio" | "progreso_invento"): boolean {
  if (state.playedDevThisTurn) return false;
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return false;
  return p.devCards.some((c) => c.kind === kind && c.purchasedTurn < state.turnNumber);
}

export function legalMoves(state: GameState, playerId: string): LegalMoves {
  const legal = emptyLegal();
  const player = state.players.find((p) => p.id === playerId);
  if (!player || state.phase === "fin") return legal;

  if (state.phase === "descarte") {
    legal.mustDiscard = state.discardNeeded[playerId] ?? 0;
    return legal;
  }

  if (state.phase === "ladron") {
    if (robberMoverId(state) !== playerId) return legal;
    if (state.pendingStealHexId) {
      legal.stealFrom = stealCandidates(state, state.pendingStealHexId, playerId);
      legal.hexes = [];
      legal.robberHexes = [];
    } else {
      legal.robberHexes = state.hexes.filter((h) => h.id !== state.robberHexId).map((h) => h.id);
      legal.hexes = legal.robberHexes;
    }
    return legal;
  }

  const role = turnRole(state, playerId);
  if (!role) return legal;

  if (state.phase === "colocacion_poblado") {
    legal.vertices = legalSettlementVertices(state, playerId, true);
    return legal;
  }
  if (state.phase === "colocacion_camino") {
    legal.edges = legalRoadEdges(state, playerId, state.lastSettlementVertexId);
    return legal;
  }

  if (state.pendingRoadBuilding > 0 && (state.phase === "principal" || state.phase === "construccion_especial")) {
    const who = state.roadCardPlayerId ?? state.players[state.turnIndex]?.id ?? playerId;
    if (playerId === who) {
      legal.edges = legalRoadEdges(state, playerId, null);
      legal.canEndTurn = role !== "paired" && legal.edges.length === 0;
      return legal;
    }
    if (role === "owner" || role === "special") {
      legal.canEndTurn = legalRoadEdges(state, who, null).length === 0;
    }
    return legal;
  }

  if (state.phase === "dados") {
    legal.canRoll = role === "owner";
    legal.canPlayKnight = playable(state, playerId, "caballero");
    return legal;
  }

  if (state.phase === "construccion_especial") {
    fillBuild(state, player, legal);
    legal.canEndTurn = true;
    return legal;
  }

  if (state.phase === "principal") {
    fillBuild(state, player, legal);
    legal.canBuyDev = hasResources(player.resources, COSTS.dev) && state.devDeck.length > 0;
    legal.canPlayKnight = playable(state, playerId, "caballero");
    legal.canPlayYearPlenty = playable(state, playerId, "progreso_invento");
    legal.canPlayMonopoly = playable(state, playerId, "progreso_monopolio");
    legal.canPlayRoadBuilding =
      playable(state, playerId, "progreso_caminos") &&
      player.pieces.caminos >= 1 &&
      legalRoadEdges(state, playerId, null).length >= 1;
    legal.canBankTrade = true;
    if (role === "owner") {
      legal.canTrade = true;
      legal.canEndTurn = true;
      legal.robberHexes = state.hexes.filter((h) => h.id !== state.robberHexId).map((h) => h.id);
    }
  }

  return legal;
}

function fillBuild(state: GameState, player: GameState["players"][number], legal: LegalMoves): void {
  if (hasResources(player.resources, COSTS.camino) && player.pieces.caminos > 0) {
    legal.edges = legalRoadEdges(state, player.id, null);
  }
  if (hasResources(player.resources, COSTS.poblado) && player.pieces.poblados > 0) {
    legal.vertices = legalSettlementVertices(state, player.id, false);
  }
  if (hasResources(player.resources, COSTS.ciudad) && player.pieces.ciudades > 0) {
    legal.cityVertices = legalCityVertices(state, player.id);
  }
}
