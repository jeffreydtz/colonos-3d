import { edgeKey } from "../shared/hex.ts";
import type { GameState } from "../shared/types.ts";

export function longestRoadLength(state: GameState, playerId: string): number {
  const myEdges = state.roads.filter((r) => r.playerId === playerId);
  if (myEdges.length === 0) return 0;

  const blocked = new Set(
    state.buildings.filter((b) => b.playerId !== playerId).map((b) => b.vertexId),
  );

  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const list = adj.get(a) ?? [];
    if (!list.includes(b)) list.push(b);
    adj.set(a, list);
  };

  for (const road of myEdges) {
    const e = state.edges[road.edgeId];
    if (!e) continue;
    const [a, b] = e.vertexIds;
    add(a, b);
    add(b, a);
  }

  function trail(node: string, used: Set<string>): number {
    if (blocked.has(node)) return 0;
    let best = 0;
    for (const nxt of adj.get(node) ?? []) {
      const eid = edgeKey(node, nxt);
      if (used.has(eid)) continue;
      used.add(eid);
      const extra = blocked.has(nxt) ? 0 : trail(nxt, used);
      best = Math.max(best, 1 + extra);
      used.delete(eid);
    }
    return best;
  }

  let best = 0;
  for (const start of adj.keys()) {
    if (blocked.has(start)) continue;
    best = Math.max(best, trail(start, new Set()));
  }
  return best;
}

export function refreshAwards(state: GameState): void {
  const lengths = state.players.map((p) => ({
    id: p.id,
    len: longestRoadLength(state, p.id),
  }));
  const maxRoad = Math.max(0, ...lengths.map((x) => x.len));
  if (maxRoad < 5) {
    state.longestRoadPlayerId = null;
  } else {
    const current = state.longestRoadPlayerId
      ? lengths.find((x) => x.id === state.longestRoadPlayerId)
      : undefined;
    if (current && current.len === maxRoad && current.len >= 5) {
      // keep holder on tie
    } else {
      const top = lengths.filter((x) => x.len === maxRoad);
      state.longestRoadPlayerId = top.length === 1 ? top[0]!.id : null;
    }
  }

  const armies = state.players.map((p) => ({ id: p.id, n: p.knightsPlayed }));
  const maxArmy = Math.max(0, ...armies.map((x) => x.n));
  if (maxArmy < 3) {
    state.largestArmyPlayerId = null;
  } else {
    const current = state.largestArmyPlayerId
      ? armies.find((x) => x.id === state.largestArmyPlayerId)
      : undefined;
    if (current && current.n === maxArmy && current.n >= 3) {
      // keep
    } else {
      const top = armies.filter((x) => x.n === maxArmy);
      state.largestArmyPlayerId = top.length === 1 ? top[0]!.id : null;
    }
  }
}
