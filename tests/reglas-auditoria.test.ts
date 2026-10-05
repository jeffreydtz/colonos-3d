import { describe, expect, it } from "vitest";
import { applyAction, totalVp, visibleVp } from "../server/engine.ts";
import { bestBankRate, legalMoves } from "../server/legal.ts";
import { longestRoadLength, refreshAwards } from "../server/longestRoad.ts";
import { sumResources } from "../server/resources.ts";
import { toClientView } from "../server/view.ts";
import type { GameState } from "../shared/types.ts";
import { setupSnake, testGame } from "./helpers.ts";

function viewOf(state: GameState, playerId: string) {
  return toClientView(state, playerId, {
    roomCode: "AUD01",
    hostId: state.players[0]!.id,
    chat: [],
    connected: new Set(state.players.map((p) => p.id)),
  });
}

function ready(state: GameState) {
  setupSnake(state);
  state.phase = "principal";
  state.turnIndex = 0;
  state.turnNumber = 2;
}

function lineOfEdges(state: GameState, n: number): { edges: string[]; verts: string[] } {
  const adj = new Map<string, Array<{ to: string; id: string }>>();
  for (const e of Object.values(state.edges)) {
    const [a, b] = e.vertexIds;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ to: b, id: e.id });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ to: a, id: e.id });
  }
  let found: { edges: string[]; verts: string[] } | null = null;
  function dfs(v: string, edges: string[], verts: string[], seen: Set<string>) {
    if (found) return;
    if (edges.length === n) {
      found = { edges: [...edges], verts: [...verts] };
      return;
    }
    for (const nxt of adj.get(v) ?? []) {
      if (seen.has(nxt.to)) continue;
      seen.add(nxt.to);
      edges.push(nxt.id);
      verts.push(nxt.to);
      dfs(nxt.to, edges, verts, seen);
      verts.pop();
      edges.pop();
      seen.delete(nxt.to);
    }
  }
  for (const start of adj.keys()) {
    dfs(start, [], [start], new Set([start]));
    if (found) break;
  }
  if (!found) throw new Error("no hay camino");
  return found;
}

describe("colocación y producción", () => {
  it("el primer poblado no cobra y el segundo sí, salvo desierto", () => {
    const state = testGame(3, 21);
    const n = state.players.length;
    const order = [...Array(n).keys(), ...[...Array(n).keys()].reverse()];
    let sawSecond = false;
    for (const idx of order) {
      const p = state.players[idx]!;
      const before = sumResources(p.resources);
      const round = state.setupRound;
      state.turnIndex = idx;
      state.phase = "colocacion_poblado";
      const v = legalMoves(state, p.id).vertices[0];
      expect(v).toBeTruthy();
      expect(applyAction(state, p.id, { type: "place_settlement", vertexId: v! }).ok).toBe(true);
      if (round === 1) expect(sumResources(p.resources)).toBe(before);
      else if (sumResources(p.resources) > before) sawSecond = true;
      const e = legalMoves(state, p.id).edges[0];
      expect(applyAction(state, p.id, { type: "place_road", edgeId: e! }).ok).toBe(true);
    }
    expect(state.phase).toBe("dados");
    expect(state.turnNumber).toBe(1);
    expect(sawSecond).toBe(true);
  });

  it("con 7 cartas no se descarta; con 9 se tiran 4", () => {
    const state = testGame(3, 44);
    ready(state);
    const [p0, p1, p2] = state.players;
    let saw7 = false;
    let saw9 = false;
    for (let i = 0; i < 240 && (!saw7 || !saw9); i++) {
      const nine = i % 2 === 0;
      p0!.resources = { madera: nine ? 9 : 7, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
      p1!.resources = { madera: 3, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
      p2!.resources = { madera: 0, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
      state.phase = "dados";
      state.turnIndex = 0;
      state.waitingDiscard = [];
      state.discardNeeded = {};
      const r = applyAction(state, p0!.id, { type: "roll" });
      expect(r.ok).toBe(true);
      const total = (state.dice?.[0] ?? 0) + (state.dice?.[1] ?? 0);
      if (total !== 7) continue;
      if (nine) {
        expect(state.phase).toBe("descarte");
        expect(state.discardNeeded[p0!.id]).toBe(4);
        expect(state.waitingDiscard).toEqual([p0!.id]);
        saw9 = true;
      } else {
        expect(state.phase).toBe("ladron");
        expect(state.discardNeeded[p0!.id]).toBeUndefined();
        saw7 = true;
      }
    }
    expect(saw7 && saw9).toBe(true);
  });
});

describe("comercio, puertos y ofertas", () => {
  it("2:1 en el puerto del recurso, 3:1 en el general y 4:1 sin edificio", () => {
    const state = testGame(3, 5);
    const p = state.players[0]!;
    const wood = Object.values(state.vertices).find((v) => v.port?.type === "madera");
    const any = Object.values(state.vertices).find((v) => v.port?.type === "general");
    expect(wood && any).toBeTruthy();
    state.buildings = [{ vertexId: wood!.id, playerId: p.id, kind: "poblado" }];
    expect(bestBankRate(state, p.id, "madera")).toBe(2);
    expect(bestBankRate(state, p.id, "trigo")).toBe(4);
    state.buildings = [];
    state.phase = "principal";
    state.turnIndex = 0;
    state.turnNumber = 1;
    p.resources = { madera: 0, ladrillo: 0, lana: 3, trigo: 0, mineral: 0 };
    const bad = applyAction(state, p.id, { type: "bank_trade", give: { lana: 3 }, want: { trigo: 1 } });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/4:1/);
    expect(bad.error).not.toMatch(/puerto/);
    state.buildings = [{ vertexId: any!.id, playerId: p.id, kind: "ciudad" }];
    expect(bestBankRate(state, p.id, "trigo")).toBe(3);
    const ok = applyAction(state, p.id, { type: "bank_trade", give: { lana: 3 }, want: { trigo: 1 } });
    expect(ok.ok).toBe(true);
    expect(p.resources.trigo).toBe(1);
  });

  it("pasar de una oferta a la mesa no se la saca a los demás", () => {
    const state = testGame(3, 13);
    ready(state);
    const [a, b, c] = state.players;
    a!.resources.madera = 2;
    b!.resources.lana = 1;
    c!.resources.lana = 1;
    expect(
      applyAction(state, a!.id, { type: "offer_trade", toId: "todos", give: { madera: 1 }, want: { lana: 1 } }).ok,
    ).toBe(true);
    const tradeId = state.trades[0]!.id;
    expect(applyAction(state, c!.id, { type: "reject_trade", tradeId }).ok).toBe(true);
    expect(state.trades).toHaveLength(1);
    expect(viewOf(state, c!.id).trades).toEqual([]);
    expect(viewOf(state, b!.id).trades).toHaveLength(1);
    expect(JSON.stringify(viewOf(state, b!.id))).not.toContain("declinedBy");
    expect(applyAction(state, c!.id, { type: "accept_trade", tradeId }).ok).toBe(false);
    expect(applyAction(state, b!.id, { type: "accept_trade", tradeId }).ok).toBe(true);
    expect(b!.resources.madera).toBe(1);
    expect(a!.resources.lana).toBe(1);
  });

  it("un tercero no puede rechazar una oferta dirigida", () => {
    const state = testGame(3, 14);
    ready(state);
    const [a, b, c] = state.players;
    a!.resources.madera = 1;
    expect(
      applyAction(state, a!.id, { type: "offer_trade", toId: b!.id, give: { madera: 1 }, want: { lana: 1 } }).ok,
    ).toBe(true);
    const tradeId = state.trades[0]!.id;
    expect(applyAction(state, c!.id, { type: "reject_trade", tradeId }).ok).toBe(false);
    expect(state.trades).toHaveLength(1);
    expect(applyAction(state, b!.id, { type: "reject_trade", tradeId }).ok).toBe(true);
    expect(state.trades).toEqual([]);
  });
});

describe("cartas, ejército, ruta y victoria", () => {
  it("el caballero de antes de tirar vuelve a los dados", () => {
    const state = testGame(3, 9);
    ready(state);
    const p = state.players[0]!;
    state.phase = "dados";
    for (const pl of state.players) {
      pl.resources = { madera: 0, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    }
    p.devCards = [{ kind: "caballero", purchasedTurn: 0 }];
    const hex = state.hexes.find((h) => h.id !== state.robberHexId && h.terrain === "desierto") ?? state.hexes.find((h) => h.id !== state.robberHexId)!;
    expect(applyAction(state, p.id, { type: "play_knight", hexId: hex.id, stealFromId: null }).ok).toBe(true);
    expect(state.phase).toBe("dados");
    expect(state.robberHexId).toBe(hex.id);
    expect(p.knightsPlayed).toBe(1);
    expect(state.playedDevThisTurn).toBe(true);
  });

  it("un caballero que cierra el juego no deja el robo colgado", () => {
    const state = testGame(3, 18);
    ready(state);
    const [actor, victim] = state.players;
    victim!.resources.madera = 2;
    const home = state.buildings.find((b) => b.playerId === victim!.id)!;
    const hexId = state.vertices[home.vertexId]!.hexIds.find((id) => id !== state.robberHexId)!;
    actor!.knightsPlayed = 2;
    actor!.devCards = [{ kind: "caballero", purchasedTurn: 0 }];
    state.victoryPoints = visibleVp(state, actor!.id) + 2;
    state.phase = "dados";
    expect(applyAction(state, actor!.id, { type: "play_knight", hexId, stealFromId: null }).ok).toBe(true);
    expect(state.phase).toBe("fin");
    expect(state.winnerId).toBe(actor!.id);
    expect(state.pendingStealHexId).toBeNull();
    expect(victim!.resources.madera).toBe(2);
    expect(state.largestArmyPlayerId).toBe(actor!.id);
  });

  it("Invento cobra sólo lo que el banco tiene", () => {
    const state = testGame(3, 15);
    ready(state);
    const p = state.players[0]!;
    p.devCards = [{ kind: "progreso_invento", purchasedTurn: 0 }];
    p.resources = { madera: 0, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    state.bank.trigo = 0;
    state.bank.madera = 1;
    expect(applyAction(state, p.id, { type: "play_year_plenty", resources: ["trigo", "madera"] }).ok).toBe(true);
    expect(p.resources.madera).toBe(1);
    expect(p.resources.trigo).toBe(0);
    const ev = state.events.find((e) => e.piece === "invento")!;
    expect(ev.resources).toEqual({ madera: 1 });
  });

  it("Monopolio vacía a los demás y no al banco", () => {
    const state = testGame(3, 16);
    ready(state);
    const [p, a, b] = state.players;
    p!.devCards = [{ kind: "progreso_monopolio", purchasedTurn: 0 }];
    p!.resources.madera = 1;
    a!.resources.madera = 3;
    b!.resources.madera = 2;
    const bank = state.bank.madera;
    expect(applyAction(state, p!.id, { type: "play_monopoly", resource: "madera" }).ok).toBe(true);
    expect(p!.resources.madera).toBe(6);
    expect(a!.resources.madera).toBe(0);
    expect(b!.resources.madera).toBe(0);
    expect(state.bank.madera).toBe(bank);
  });

  it("no se juega la carta comprada en el mismo turno y el mazo vacío no vende", () => {
    const state = testGame(3, 17);
    ready(state);
    const p = state.players[0]!;
    state.devDeck = ["caballero"];
    p.resources = { madera: 0, ladrillo: 0, lana: 1, trigo: 1, mineral: 1 };
    expect(applyAction(state, p.id, { type: "buy_dev" }).ok).toBe(true);
    const hex = state.hexes.find((h) => h.id !== state.robberHexId)!.id;
    expect(applyAction(state, p.id, { type: "play_knight", hexId: hex, stealFromId: null }).ok).toBe(false);
    expect(p.devCards).toHaveLength(1);
    state.devDeck = [];
    p.resources = { madera: 0, ladrillo: 0, lana: 1, trigo: 1, mineral: 1 };
    expect(applyAction(state, p.id, { type: "buy_dev" }).ok).toBe(false);
  });

  it("la carta de caminos pide como máximo las piezas que quedan", () => {
    const state = testGame(3, 19);
    ready(state);
    const p = state.players[0]!;
    p.pieces.caminos = 1;
    p.devCards = [{ kind: "progreso_caminos", purchasedTurn: 0 }];
    expect(applyAction(state, p.id, { type: "play_road_building" }).ok).toBe(true);
    expect(state.pendingRoadBuilding).toBe(1);
  });

  it("un punto de victoria comprado cierra la partida en tu turno", () => {
    const state = testGame(3, 20);
    ready(state);
    const p = state.players[0]!;
    state.victoryPoints = visibleVp(state, p.id) + 1;
    state.devDeck = ["punto_victoria"];
    p.resources = { madera: 0, ladrillo: 0, lana: 1, trigo: 1, mineral: 1 };
    expect(applyAction(state, p.id, { type: "buy_dev" }).ok).toBe(true);
    expect(state.phase).toBe("fin");
    expect(state.winnerId).toBe(p.id);
    expect(totalVp(state, p.id)).toBe(state.victoryPoints);
  });

  it("un poblado enemigo parte la ruta; el propio no", () => {
    const state = testGame(3, 22);
    const line = lineOfEdges(state, 6);
    const [a, b] = state.players;
    state.roads = line.edges.map((edgeId) => ({ edgeId, playerId: a!.id }));
    const mid = line.verts[3]!;
    state.buildings = [{ vertexId: mid, playerId: a!.id, kind: "poblado" }];
    expect(longestRoadLength(state, a!.id)).toBe(6);
    state.buildings = [{ vertexId: mid, playerId: b!.id, kind: "poblado" }];
    expect(longestRoadLength(state, a!.id)).toBe(3);
    refreshAwards(state);
    expect(state.longestRoadPlayerId).toBeNull();
  });
});

describe("pausa de construcción 5-6", () => {
  it("no se compran cartas ni se gana hasta el turno propio", () => {
    const state = testGame(5, 23);
    ready(state);
    const p = state.players[2]!;
    state.phase = "construccion_especial";
    state.specialBuildQueue = [p.id];
    state.turnIndex = 0;
    p.resources = { madera: 0, ladrillo: 0, lana: 2, trigo: 4, mineral: 4 };
    expect(legalMoves(state, p.id).canBuyDev).toBe(false);
    expect(applyAction(state, p.id, { type: "buy_dev" }).ok).toBe(false);
    expect(applyAction(state, p.id, { type: "bank_trade", give: { lana: 4 }, want: { madera: 1 } }).ok).toBe(false);
    const own = state.buildings.find((b) => b.playerId === p.id && b.kind === "poblado")!;
    state.victoryPoints = visibleVp(state, p.id) + 1;
    expect(applyAction(state, p.id, { type: "build_city", vertexId: own.vertexId }).ok).toBe(true);
    expect(state.phase).toBe("construccion_especial");
    expect(state.winnerId).toBeNull();
    expect(applyAction(state, p.id, { type: "end_turn" }).ok).toBe(true);
    expect(state.phase).not.toBe("fin");
    state.phase = "dados";
    state.turnIndex = 2;
    state.specialBuildQueue = [];
    expect(applyAction(state, p.id, { type: "roll" }).ok).toBe(true);
    expect(state.phase).toBe("fin");
    expect(state.winnerId).toBe(p.id);
    expect(state.dice).toBeNull();
  });
});
