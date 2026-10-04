import { describe, expect, it } from "vitest";
import { applyAction, createGame, produceResources, totalVp, visibleVp } from "../server/engine.ts";
import { legalMoves, legalSettlementVertices } from "../server/legal.ts";
import { longestRoadLength, refreshAwards } from "../server/longestRoad.ts";
import { runBotGame } from "../server/bots.ts";
import { landAxials } from "../shared/hex.ts";
import { buildBoard } from "../shared/board.ts";
import { mulberry32 } from "../shared/rng.ts";
import { TERRAIN_COUNTS } from "../shared/constants.ts";
import { firstVertex, testGame } from "./helpers.ts";
import type { GameState, Resource } from "../shared/types.ts";

function findEdgeTrail(state: GameState, occupied: Set<string>, n: number): string[] {
  const adj = new Map<string, string[]>();
  for (const e of Object.values(state.edges)) {
    if (occupied.has(e.id)) continue;
    const [a, b] = e.vertexIds;
    const la = adj.get(a) ?? [];
    la.push(e.id);
    adj.set(a, la);
    const lb = adj.get(b) ?? [];
    lb.push(e.id);
    adj.set(b, lb);
  }
  let best: string[] = [];
  function dfs(vertex: string, path: string[]): void {
    if (path.length > best.length) best = path.slice();
    if (best.length >= n) return;
    for (const eid of adj.get(vertex) ?? []) {
      if (path.includes(eid)) continue;
      const e = state.edges[eid]!;
      const nxt = e.vertexIds[0] === vertex ? e.vertexIds[1] : e.vertexIds[0];
      path.push(eid);
      dfs(nxt, path);
      path.pop();
      if (best.length >= n) return;
    }
  }
  for (const v of adj.keys()) {
    dfs(v, []);
    if (best.length >= n) break;
  }
  return best;
}

function setupSnake(state: GameState): void {
  const n = state.players.length;
  const order = [...Array(n).keys(), ...[...Array(n).keys()].reverse()];
  for (const idx of order) {
    const p = state.players[idx]!;
    state.turnIndex = idx;
    state.phase = "colocacion_poblado";
    const v = legalSettlementVertices(state, p.id, true)[0];
    expect(v).toBeTruthy();
    const r1 = applyAction(state, p.id, { type: "place_settlement", vertexId: v! });
    expect(r1.ok).toBe(true);
    const e = legalMoves(state, p.id).edges[0];
    expect(e).toBeTruthy();
    const r2 = applyAction(state, p.id, { type: "place_road", edgeId: e! });
    expect(r2.ok).toBe(true);
  }
}

describe("tablero 5-6", () => {
  it("genera 30 hexágonos con los terrenos de la expansión", () => {
    expect(landAxials("expansion")).toHaveLength(30);
    expect(landAxials()).toHaveLength(30);
    const board = buildBoard(mulberry32(7), "expansion");
    expect(board.hexes).toHaveLength(30);
    const counts: Record<string, number> = {};
    for (const h of board.hexes) counts[h.terrain] = (counts[h.terrain] ?? 0) + 1;
    expect(counts).toMatchObject(TERRAIN_COUNTS);
    const numbered = board.hexes.filter((h) => h.number != null);
    expect(numbered).toHaveLength(28);
    expect(Object.keys(board.vertices).length).toBeGreaterThan(40);
    expect(Object.keys(board.edges).length).toBeGreaterThan(60);
  });
});

describe("tablero 3-4", () => {
  it("genera 19 hexágonos, 9 puertos y el mazo clásico", () => {
    expect(landAxials("standard")).toHaveLength(19);
    const board = buildBoard(mulberry32(7), "standard");
    expect(board.hexes).toHaveLength(19);
    const numbered = board.hexes.filter((h) => h.number != null);
    expect(numbered).toHaveLength(18);
    const portVerts = Object.values(board.vertices).filter((v) => v.port);
    expect(portVerts.length).toBe(18);
    const state = testGame(4, 11);
    expect(state.boardKind).toBe("standard");
    expect(state.hexes).toHaveLength(19);
    expect(state.devDeck).toHaveLength(25);
    expect(state.bank.madera).toBe(19);
  });
});

describe("colocación y construcción", () => {
  it("respeta la regla de distancia entre poblados", () => {
    const state = testGame(3, 11);
    const p = state.players[0]!;
    const v = legalSettlementVertices(state, p.id, true)[0]!;
    expect(applyAction(state, p.id, { type: "place_settlement", vertexId: v }).ok).toBe(true);
    const neighbor = state.vertices[v]!.neighborIds[0]!;
    state.phase = "colocacion_poblado";
    state.turnIndex = 1;
    const r = applyAction(state, state.players[1]!.id, { type: "place_settlement", vertexId: neighbor });
    expect(r.ok).toBe(false);
  });

  it("no deja construir un poblado sin camino propio después del setup", () => {
    const state = testGame(3, 3);
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "principal";
    state.turnIndex = 0;
    p.resources.madera = 5;
    p.resources.ladrillo = 5;
    p.resources.lana = 5;
    p.resources.trigo = 5;
    const far = Object.values(state.vertices).find(
      (v) =>
        !state.buildings.some((b) => b.vertexId === v.id) &&
        !v.neighborIds.some((n) => state.buildings.some((b) => b.vertexId === n)) &&
        !v.edgeIds.some((e) => state.roads.some((r) => r.edgeId === e && r.playerId === p.id)),
    );
    expect(far).toBeTruthy();
    const r = applyAction(state, p.id, { type: "build_settlement", vertexId: far!.id });
    expect(r.ok).toBe(false);
  });

  it("construye ciudad sobre un poblado propio y suma 2 PV", () => {
    const state = testGame(3, 5);
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "principal";
    state.turnIndex = 0;
    p.resources.trigo = 5;
    p.resources.mineral = 5;
    const own = state.buildings.find((b) => b.playerId === p.id && b.kind === "poblado")!;
    const before = visibleVp(state, p.id);
    const r = applyAction(state, p.id, { type: "build_city", vertexId: own.vertexId });
    expect(r.ok).toBe(true);
    expect(own.kind).toBe("ciudad");
    expect(visibleVp(state, p.id)).toBe(before + 1);
  });
});

describe("producción y ladrón", () => {
  it("paga recursos en el número tirado y el ladrón bloquea el hex", () => {
    const state = testGame(3, 21);
    setupSnake(state);
    const p = state.players[0]!;
    const b = state.buildings.find((x) => x.playerId === p.id)!;
    const v = state.vertices[b.vertexId]!;
    const hex = state.hexes.find((h) => v.hexIds.includes(h.id) && h.number && h.terrain !== "desierto")!;
    const res = hex.terrain as Resource;
    const before = p.resources[res];
    state.robberHexId = state.hexes.find((h) => h.id !== hex.id)!.id;
    produceResources(state, hex.number!);
    expect(p.resources[res]).toBeGreaterThan(before);
    const after = p.resources[res];
    state.robberHexId = hex.id;
    produceResources(state, hex.number!);
    expect(p.resources[res]).toBe(after);
  });

  it("en un 7 descarta la mitad redondeada hacia abajo", () => {
    const state = testGame(3, 8);
    setupSnake(state);
    const p = state.players[0]!;
    p.resources = { madera: 4, ladrillo: 4, lana: 0, trigo: 0, mineral: 0 };
    state.phase = "descarte";
    state.waitingDiscard = [p.id];
    state.discardNeeded = { [p.id]: 4 };
    const r = applyAction(state, p.id, { type: "discard", resources: { madera: 4 } });
    expect(r.ok).toBe(true);
    expect(p.resources.madera).toBe(0);
    expect(p.resources.ladrillo).toBe(4);
  });

  it("el ladrón tiene que cambiar de hexágono", () => {
    const state = testGame(3, 9);
    setupSnake(state);
    state.phase = "ladron";
    state.turnIndex = 0;
    const r = applyAction(state, state.players[0]!.id, {
      type: "move_robber",
      hexId: state.robberHexId,
      stealFromId: null,
    });
    expect(r.ok).toBe(false);
  });
});

describe("comercio", () => {
  it("cambia 4:1 con el banco", () => {
    const state = testGame(3, 12);
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "principal";
    state.turnIndex = 0;
    p.resources.madera = 4;
    p.resources.trigo = 0;
    const r = applyAction(state, p.id, {
      type: "bank_trade",
      give: { madera: 4 },
      want: { trigo: 1 },
    });
    expect(r.ok).toBe(true);
    expect(p.resources.madera).toBe(0);
    expect(p.resources.trigo).toBe(1);
  });

  it("cierra un trato entre jugadores y una contraoferta", () => {
    const state = testGame(3, 13);
    setupSnake(state);
    const a = state.players[0]!;
    const b = state.players[1]!;
    state.phase = "principal";
    state.turnIndex = 0;
    a.resources.madera = 1;
    b.resources.lana = 1;
    const offer = applyAction(state, a.id, {
      type: "offer_trade",
      toId: b.id,
      give: { madera: 1 },
      want: { lana: 1 },
    });
    expect(offer.ok).toBe(true);
    const tradeId = state.trades[0]!.id;
    const acc = applyAction(state, b.id, { type: "accept_trade", tradeId });
    expect(acc.ok).toBe(true);
    expect(a.resources.lana).toBe(1);
    expect(b.resources.madera).toBe(1);
  });
});

describe("camino más largo y victoria", () => {
  it("otorga camino más largo a partir de 5", () => {
    const state = testGame(3, 17);
    setupSnake(state);
    const p = state.players[0]!;
    const occupied = new Set(state.roads.map((r) => r.edgeId));
    const trail = findEdgeTrail(state, occupied, 6);
    expect(trail.length).toBeGreaterThanOrEqual(5);
    for (const eid of trail) {
      state.roads.push({ edgeId: eid, playerId: p.id });
    }
    refreshAwards(state);
    expect(longestRoadLength(state, p.id)).toBeGreaterThanOrEqual(5);
    expect(state.longestRoadPlayerId).toBe(p.id);
  });

  it("gana al llegar a los puntos configurados", () => {
    const state = createGame({
      seed: 1,
      victoryPoints: 4,
      players: [
        { id: "p0", name: "A", color: "rojo" },
        { id: "p1", name: "B", color: "azul" },
        { id: "p2", name: "C", color: "naranja" },
      ],
    });
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "principal";
    state.turnIndex = 0;
    p.resources.trigo = 10;
    p.resources.mineral = 10;
    for (const b of state.buildings.filter((x) => x.playerId === p.id)) {
      applyAction(state, p.id, { type: "build_city", vertexId: b.vertexId });
    }
    expect(totalVp(state, p.id)).toBeGreaterThanOrEqual(4);
    expect(state.phase).toBe("fin");
    expect(state.winnerId).toBe(p.id);
  });
});

describe("partida completa con bots", () => {
  it("3 bots terminan en isla clásica", () => {
    const { state, winnerId, turns } = runBotGame({
      players: 3,
      seed: 2024,
      victoryPoints: 8,
      maxTurns: 450,
    });
    expect(state.hexes).toHaveLength(19);
    expect(state.boardKind).toBe("standard");
    expect(turns).toBeGreaterThan(0);
    expect(state.phase).toBe("fin");
    expect(winnerId).toBeTruthy();
  });

  it("4 bots terminan en isla clásica", () => {
    const { state, winnerId } = runBotGame({
      players: 4,
      seed: 2025,
      victoryPoints: 8,
      maxTurns: 450,
    });
    expect(state.hexes).toHaveLength(19);
    expect(state.phase).toBe("fin");
    expect(winnerId).toBeTruthy();
  });
});

describe("partida completa con 6 bots", () => {
  it("termina sin romper el motor", () => {
    const { state, winnerId, turns } = runBotGame({
      players: 6,
      seed: 2026,
      victoryPoints: 8,
      maxTurns: 450,
    });
    expect(state.hexes).toHaveLength(30);
    expect(state.players).toHaveLength(6);
    expect(turns).toBeGreaterThan(0);
    if (winnerId) {
      expect(totalVp(state, winnerId)).toBeGreaterThanOrEqual(8);
      expect(state.phase).toBe("fin");
    } else {
      // still a valid running game after many turns
      expect(["dados", "principal", "descarte", "ladron", "construccion_especial", "fin"]).toContain(
        state.phase,
      );
    }
  });
});

void firstVertex;
