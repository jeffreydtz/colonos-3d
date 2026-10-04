import { COSTS } from "../shared/constants.ts";
import { pips } from "../shared/hex.ts";
import { RESOURCES } from "../shared/types.ts";
import type { Action, ClientView, GameState, Resource, Resources, TradeOffer } from "../shared/types.ts";
import { applyAction, createGame } from "./engine.ts";
import { currentPlayer, legalMoves, legalRoadEdges } from "./legal.ts";
import { hasResources, pickDiscard, sumResources } from "./resources.ts";
import { toClientView } from "./view.ts";

function hexById(view: ClientView, id: string) {
  return view.hexes.find((h) => h.id === id);
}

function vertexById(view: ClientView, id: string) {
  return view.vertices.find((v) => v.id === id);
}

function ownedTerrains(view: ClientView): Set<string> {
  const out = new Set<string>();
  for (const b of view.buildings) {
    if (b.playerId !== view.youId) continue;
    const v = vertexById(view, b.vertexId);
    if (!v) continue;
    for (const hid of v.hexIds) {
      const h = hexById(view, hid);
      if (h && h.terrain !== "desierto") out.add(h.terrain);
    }
  }
  return out;
}

function vertexScore(view: ClientView, vertexId: string): number {
  const v = vertexById(view, vertexId);
  if (!v) return 0;
  const owned = ownedTerrains(view);
  let s = 0;
  const terrains = new Set<string>();
  for (const hid of v.hexIds) {
    const hex = hexById(view, hid);
    if (!hex) continue;
    s += pips(hex.number);
    if (hex.terrain !== "desierto") {
      s += 0.45;
      terrains.add(hex.terrain);
      if (!owned.has(hex.terrain)) s += 1.35;
    }
    if (hex.number === 6 || hex.number === 8) s += 0.25;
    if (hex.id === view.robberHexId) s -= 1.5;
  }
  if (v.port) s += v.port.ratio === 2 ? 2.3 : 1.15;
  s += terrains.size * 0.55;
  return s;
}

function bestBankRateFromView(view: ClientView, resource: Resource): number {
  let rate = 4;
  for (const b of view.buildings) {
    if (b.playerId !== view.youId) continue;
    const port = vertexById(view, b.vertexId)?.port;
    if (!port) continue;
    if (port.type === "general") rate = Math.min(rate, 3);
    if (port.type === resource) rate = Math.min(rate, 2);
  }
  return rate;
}

function goalCosts(view: ClientView): Array<{ name: string; cost: Partial<Resources>; ready: boolean }> {
  const legal = view.legal;
  return [
    { name: "ciudad", cost: COSTS.ciudad, ready: legal.cityVertices.length > 0 },
    { name: "poblado", cost: COSTS.poblado, ready: legal.vertices.length > 0 },
    { name: "dev", cost: COSTS.dev, ready: legal.canBuyDev },
    { name: "camino", cost: COSTS.camino, ready: legal.edges.length > 0 },
  ];
}

function neededResources(view: ClientView): Set<Resource> {
  const hand = view.hand.resources;
  const need = new Set<Resource>();
  for (const goal of goalCosts(view)) {
    if (!goal.ready && goal.name !== "ciudad" && goal.name !== "poblado") continue;
    for (const k of RESOURCES) {
      if ((goal.cost[k] ?? 0) > hand[k]) need.add(k);
    }
  }
  if (need.size === 0) {
    for (const k of RESOURCES) {
      if (hand[k] === 0) need.add(k);
    }
  }
  return need;
}

function tryBankFor(view: ClientView, cost: Partial<Resources>): Action | null {
  const hand = view.hand.resources;
  if (!view.legal.canBankTrade) return null;
  if (hasResources(hand, cost)) return null;
  const missing: Resource[] = [];
  for (const k of RESOURCES) {
    const need = (cost[k] ?? 0) - hand[k];
    for (let i = 0; i < need; i++) missing.push(k);
  }
  if (missing.length !== 1) return null;
  const wantRes = missing[0]!;
  if (view.bankHas && view.bankHas[wantRes] === false) return null;
  let best: Resource | null = null;
  for (const k of RESOURCES) {
    if (k === wantRes) continue;
    const rate = bestBankRateFromView(view, k);
    if (hand[k] >= rate + (cost[k] ?? 0)) {
      if (!best || hand[k] > hand[best]) best = k;
    }
  }
  if (!best) return null;
  const rate = bestBankRateFromView(view, best);
  return { type: "bank_trade", give: { [best]: rate }, want: { [wantRes]: 1 } };
}

function tradeScore(view: ClientView, trade: TradeOffer): number {
  const hand = view.hand.resources;
  if (!hasResources(hand, trade.want)) return -100;
  const need = neededResources(view);
  let score = 0;
  for (const k of RESOURCES) {
    const get = trade.give[k] ?? 0;
    const lose = trade.want[k] ?? 0;
    score += get * (need.has(k) ? 3.2 : 0.9);
    score -= lose * (need.has(k) ? 3.8 : 0.7);
    if (hand[k] - lose <= 0 && lose > 0 && need.has(k)) score -= 4;
  }
  return score;
}

function considerTrades(view: ClientView): Action | null {
  const incoming = view.trades.filter(
    (t) => t.fromId !== view.youId && (t.toId === view.youId || t.toId === "todos"),
  );
  for (const t of incoming) {
    if (tradeScore(view, t) >= 1.2) return { type: "accept_trade", tradeId: t.id };
    return { type: "reject_trade", tradeId: t.id };
  }
  return null;
}

function myHexIds(view: ClientView): Set<string> {
  const out = new Set<string>();
  for (const b of view.buildings) {
    if (b.playerId !== view.youId) continue;
    const v = vertexById(view, b.vertexId);
    if (v) for (const hid of v.hexIds) out.add(hid);
  }
  return out;
}

function robberHexScore(view: ClientView, hexId: string): number {
  const mine = myHexIds(view);
  if (mine.has(hexId)) return -12;
  const hex = hexById(view, hexId);
  let s = pips(hex?.number ?? null);
  for (const b of view.buildings) {
    const v = vertexById(view, b.vertexId);
    if (!v?.hexIds.includes(hexId)) continue;
    if (b.playerId === view.youId) s -= 8;
    else {
      const opp = view.players.find((p) => p.id === b.playerId);
      s += 2.2 + (opp?.visibleVp ?? 0) * 0.45 + (opp?.resourceCount ?? 0) * 0.12;
    }
  }
  return s;
}

function pickVictim(view: ClientView, ids: string[]): string | null {
  if (!ids.length) return null;
  return ids.slice().sort((a, b) => {
    const pa = view.players.find((p) => p.id === a);
    const pb = view.players.find((p) => p.id === b);
    const sa = (pa?.visibleVp ?? 0) * 10 + (pa?.resourceCount ?? 0);
    const sb = (pb?.visibleVp ?? 0) * 10 + (pb?.resourceCount ?? 0);
    return sb - sa;
  })[0]!;
}

function stealAction(
  view: ClientView,
  type: "move_robber" | "play_knight",
  hexId: string,
  stealFrom: string[],
): Action {
  return { type, hexId, stealFromId: pickVictim(view, stealFrom) };
}

function opponentsOnHex(view: ClientView, hexId: string): string[] {
  const ids = new Set<string>();
  for (const b of view.buildings) {
    if (b.playerId === view.youId) continue;
    const v = vertexById(view, b.vertexId);
    if (v?.hexIds.includes(hexId)) {
      const p = view.players.find((x) => x.id === b.playerId);
      if (p && p.resourceCount > 0) ids.add(b.playerId);
    }
  }
  return [...ids];
}

function bestEdge(view: ClientView, edges: string[]): string {
  const myVerts = new Set(
    view.buildings.filter((b) => b.playerId === view.youId).map((b) => b.vertexId),
  );
  const myRoadVerts = new Set<string>();
  for (const r of view.roads) {
    if (r.playerId !== view.youId) continue;
    const e = view.edges.find((x) => x.id === r.edgeId);
    if (e) {
      myRoadVerts.add(e.vertexIds[0]);
      myRoadVerts.add(e.vertexIds[1]);
    }
  }
  let best = edges[0]!;
  let bestS = -Infinity;
  for (const eid of edges) {
    const e = view.edges.find((x) => x.id === eid);
    if (!e) continue;
    let s = 0;
    for (const vid of e.vertexIds) {
      s += vertexScore(view, vid) * 0.35;
      if (myVerts.has(vid) || myRoadVerts.has(vid)) s += 1.4;
    }
    if (s > bestS) {
      bestS = s;
      best = eid;
    }
  }
  return best;
}

function robberHurtsMe(view: ClientView): boolean {
  return myHexIds(view).has(view.robberHexId);
}

function pickMonopoly(view: ClientView): Resource {
  const hand = view.hand.resources;
  const need = neededResources(view);
  if (need.size) {
    return [...need].sort((a, b) => hand[a] - hand[b])[0]!;
  }
  return RESOURCES.slice().sort((a, b) => hand[a] - hand[b] || a.localeCompare(b))[0]!;
}

function pickYearPlenty(view: ClientView): [Resource, Resource] {
  const hand = view.hand.resources;
  const missing: Resource[] = [];
  for (const goal of goalCosts(view)) {
    if (goal.name !== "ciudad" && goal.name !== "poblado") continue;
    for (const k of RESOURCES) {
      const need = (goal.cost[k] ?? 0) - hand[k];
      for (let i = 0; i < need; i++) missing.push(k);
    }
    if (missing.length >= 2) break;
  }
  while (missing.length < 2) {
    const fewest = RESOURCES.slice().sort((a, b) => hand[a] - hand[b])[0]!;
    missing.push(fewest);
  }
  return [missing[0]!, missing[1]!];
}

function knightTargets(view: ClientView): string[] {
  if (view.legal.robberHexes.length) return view.legal.robberHexes;
  if (view.legal.hexes.length) return view.legal.hexes;
  return view.hexes.filter((h) => h.id !== view.robberHexId).map((h) => h.id);
}

function pickKnightHex(view: ClientView): Action | null {
  const hexes = knightTargets(view);
  if (!hexes.length) return null;
  const ranked = hexes.slice().sort((a, b) => robberHexScore(view, b) - robberHexScore(view, a));
  const hexId = ranked[0]!;
  return stealAction(view, "play_knight", hexId, opponentsOnHex(view, hexId));
}

export function chooseBotActionFromView(view: ClientView): Action | null {
  const legal = view.legal;
  const hand = view.hand.resources;

  if (legal.mustDiscard > 0) {
    return { type: "discard", resources: pickDiscard(hand, legal.mustDiscard) };
  }

  const tradeAct = considerTrades(view);
  if (tradeAct) return tradeAct;

  if (legal.stealFrom.length) {
    const hexId = view.legal.hexes[0] ?? view.robberHexId;
    return { type: "move_robber", hexId, stealFromId: pickVictim(view, legal.stealFrom) };
  }

  if (view.youId !== view.currentPlayerId) return null;

  if (view.phase === "colocacion_poblado" && legal.vertices.length) {
    const best = legal.vertices.slice().sort((a, b) => vertexScore(view, b) - vertexScore(view, a))[0]!;
    return { type: "place_settlement", vertexId: best };
  }
  if (view.phase === "colocacion_camino" && legal.edges.length) {
    return { type: "place_road", edgeId: bestEdge(view, legal.edges) };
  }

  if (view.phase === "ladron" && legal.hexes.length) {
    const ranked = legal.hexes.slice().sort((a, b) => robberHexScore(view, b) - robberHexScore(view, a));
    for (const hexId of ranked) {
      const steal = opponentsOnHex(view, hexId);
      if (steal.length) return stealAction(view, "move_robber", hexId, steal);
    }
    return { type: "move_robber", hexId: ranked[0]!, stealFromId: null };
  }

  if (view.pendingRoadBuilding > 0) {
    if (legal.edges.length) return { type: "build_road", edgeId: bestEdge(view, legal.edges) };
    if (legal.canEndTurn) return { type: "end_turn" };
  }

  if (view.phase === "dados") {
    if (legal.canPlayKnight && robberHurtsMe(view)) {
      const knight = pickKnightHex(view);
      if (knight) return knight;
    }
    if (legal.canRoll) return { type: "roll" };
  }

  if (view.phase === "principal" || view.phase === "construccion_especial") {
    if (legal.canPlayKnight && (robberHurtsMe(view) || leadingOpponent(view))) {
      const knight = pickKnightHex(view);
      if (knight) return knight;
    }

    if (legal.cityVertices.length && hasResources(hand, COSTS.ciudad)) {
      return { type: "build_city", vertexId: legal.cityVertices[0]! };
    }
    const bankCity = tryBankFor(view, COSTS.ciudad);
    if (bankCity) return bankCity;

    if (legal.vertices.length && hasResources(hand, COSTS.poblado)) {
      const best = legal.vertices.slice().sort((a, b) => vertexScore(view, b) - vertexScore(view, a))[0]!;
      return { type: "build_settlement", vertexId: best };
    }
    const bankSet = tryBankFor(view, COSTS.poblado);
    if (bankSet) return bankSet;

    if (legal.canPlayYearPlenty) {
      return { type: "play_year_plenty", resources: pickYearPlenty(view) };
    }
    if (legal.canPlayMonopoly) {
      return { type: "play_monopoly", resource: pickMonopoly(view) };
    }
    if (legal.canPlayRoadBuilding && legal.edges.length >= 1) {
      return { type: "play_road_building" };
    }

    if (legal.edges.length && hasResources(hand, COSTS.camino)) {
      return { type: "build_road", edgeId: bestEdge(view, legal.edges) };
    }
    const bankRoad = tryBankFor(view, COSTS.camino);
    if (bankRoad) return bankRoad;

    if (legal.canBuyDev && hasResources(hand, COSTS.dev)) {
      return { type: "buy_dev" };
    }

    if (legal.canEndTurn) return { type: "end_turn" };
  }

  if (legal.canRoll) return { type: "roll" };
  if (legal.canEndTurn) return { type: "end_turn" };
  return null;
}

function leadingOpponent(view: ClientView): boolean {
  const me = view.players.find((p) => p.id === view.youId);
  const best = view.players.reduce((m, p) => (p.id === view.youId ? m : Math.max(m, p.visibleVp)), 0);
  return best >= (me?.visibleVp ?? 0) + 2;
}

export function chooseBotAction(state: GameState, playerId: string): Action | null {
  const view = toClientView(state, playerId, {
    roomCode: "",
    hostId: "",
    chat: [],
    connected: new Set(state.players.map((p) => p.id)),
  });
  return chooseBotActionFromView(view);
}

/** Si la jugada del bot falla, fuerza un avance legal para no trabar la mesa. */
export function forceProgress(state: GameState, playerId: string): boolean {
  if (state.phase === "fin") return false;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;

  if (state.phase === "descarte") {
    const need = state.discardNeeded[playerId] ?? 0;
    if (need <= 0) return false;
    return applyAction(state, playerId, {
      type: "discard",
      resources: pickDiscard(player.resources, need),
    }).ok;
  }

  const actor = currentPlayer(state);
  if (!actor || actor.id !== playerId) return false;

  if (state.pendingRoadBuilding > 0) {
    const edges = legalRoadEdges(state, playerId, null);
    if (edges.length) {
      const placed = applyAction(state, playerId, { type: "build_road", edgeId: edges[0]! });
      if (placed.ok) return true;
    }
    state.pendingRoadBuilding = 0;
  }

  const legal = legalMoves(state, playerId);
  if (state.phase === "colocacion_poblado" && legal.vertices[0]) {
    return applyAction(state, playerId, { type: "place_settlement", vertexId: legal.vertices[0] }).ok;
  }
  if (state.phase === "colocacion_camino" && legal.edges[0]) {
    return applyAction(state, playerId, { type: "place_road", edgeId: legal.edges[0] }).ok;
  }
  if (state.phase === "dados") {
    return applyAction(state, playerId, { type: "roll" }).ok;
  }
  if (state.phase === "ladron") {
    if (state.pendingStealHexId && legal.stealFrom[0]) {
      return applyAction(state, playerId, {
        type: "move_robber",
        hexId: state.pendingStealHexId,
        stealFromId: legal.stealFrom[0],
      }).ok;
    }
    const hex = legal.hexes[0] ?? legal.robberHexes[0];
    if (hex) {
      return applyAction(state, playerId, {
        type: "move_robber",
        hexId: hex,
        stealFromId: legal.stealFrom[0] ?? null,
      }).ok;
    }
    return false;
  }
  if (state.phase === "principal" || state.phase === "construccion_especial") {
    return applyAction(state, playerId, { type: "end_turn" }).ok;
  }
  return false;
}

export function applyBotStep(state: GameState, playerId: string): boolean {
  const action = chooseBotAction(state, playerId);
  if (action) {
    const res = applyAction(state, playerId, action);
    if (res.ok) return true;
  }
  return forceProgress(state, playerId);
}

export function runBotGame(opts: {
  players: number;
  seed: number;
  victoryPoints: number;
  maxTurns?: number;
}): { state: GameState; turns: number; winnerId: string | null } {
  const names = ["Luz", "Tomi", "Mora", "Fede", "Nico", "Sol"];
  const colors = ["rojo", "azul", "naranja", "blanco", "verde", "marron"] as const;
  const n = opts.players;
  const state = createGame({
    seed: opts.seed,
    victoryPoints: opts.victoryPoints,
    players: Array.from({ length: n }, (_, i) => ({
      id: `bot-${i}`,
      name: names[i]!,
      color: colors[i]!,
    })),
  });
  const maxTurns = opts.maxTurns ?? 500;
  let guard = 0;
  while (state.phase !== "fin" && state.turnNumber < maxTurns && guard < maxTurns * 80) {
    guard += 1;
    if (state.phase === "descarte") {
      for (const pid of [...state.waitingDiscard]) {
        applyBotStep(state, pid);
      }
      continue;
    }
    // Respuestas de comercio de quienes no tienen el turno.
    let traded = false;
    for (const p of state.players) {
      if (state.trades.length === 0) break;
      const actor = currentPlayer(state);
      if (actor && p.id === actor.id) continue;
      const act = chooseBotAction(state, p.id);
      if (act && (act.type === "accept_trade" || act.type === "reject_trade")) {
        applyAction(state, p.id, act);
        traded = true;
      }
    }
    if (traded) continue;
    const actor = currentPlayer(state);
    if (!actor) {
      if (state.phase === "construccion_especial" && state.specialBuildQueue.length === 0) {
        applyAction(state, state.players[state.turnIndex]!.id, { type: "end_turn" });
        continue;
      }
      break;
    }
    if (!applyBotStep(state, actor.id)) break;
  }
  return { state, turns: state.turnNumber, winnerId: state.winnerId };
}
