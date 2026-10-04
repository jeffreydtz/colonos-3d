import { applyAction, createGame } from "../server/engine.ts";
import { legalMoves, legalSettlementVertices } from "../server/legal.ts";
import type { ColorId, GameState } from "../shared/types.ts";

export function testGame(n = 3, seed = 42): GameState {
  const colors: ColorId[] = ["rojo", "azul", "naranja", "blanco", "verde", "marron"];
  return createGame({
    seed,
    victoryPoints: 10,
    players: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `J${i}`,
      color: colors[i]!,
    })),
  });
}

/** Fase actual sin el estrechamiento de TS: acciones y timers la cambian por debajo. */
export function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

export function firstVertex(state: GameState, except: string[] = []): string {
  const taken = new Set(state.buildings.map((b) => b.vertexId));
  for (const b of state.buildings) {
    const v = state.vertices[b.vertexId];
    if (v) for (const n of v.neighborIds) taken.add(n);
  }
  for (const ex of except) {
    taken.add(ex);
    const v = state.vertices[ex];
    if (v) for (const n of v.neighborIds) taken.add(n);
  }
  for (const v of Object.values(state.vertices)) {
    if (!taken.has(v.id)) return v.id;
  }
  throw new Error("no vertex");
}

export function setupSnake(state: GameState): void {
  const n = state.players.length;
  const order = [...Array(n).keys(), ...[...Array(n).keys()].reverse()];
  for (const idx of order) {
    const p = state.players[idx]!;
    state.turnIndex = idx;
    state.phase = "colocacion_poblado";
    const v = legalSettlementVertices(state, p.id, true)[0];
    if (!v) throw new Error("no settlement");
    const r1 = applyAction(state, p.id, { type: "place_settlement", vertexId: v });
    if (!r1.ok) throw new Error(r1.error);
    const e = legalMoves(state, p.id).edges[0];
    if (!e) throw new Error("no road");
    const r2 = applyAction(state, p.id, { type: "place_road", edgeId: e });
    if (!r2.ok) throw new Error(r2.error);
  }
}
