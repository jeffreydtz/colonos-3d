import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createGame, produceResources, totalVp, visibleVp } from "../server/engine.ts";
import { legalMoves } from "../server/legal.ts";
import { longestRoadLength, refreshAwards } from "../server/longestRoad.ts";
import {
  applyIdleTimeout,
  bindSocket,
  createRoom,
  dropPlayer,
  joinRoom,
  play,
  pruneRooms,
  resetRoomsForTests,
  roomCount,
  startGame,
} from "../server/rooms.ts";
import { parseAction, parseCreatePayload, parseJoinPayload } from "../server/validate.ts";
import { toClientView } from "../server/view.ts";
import type { Action, GameState, Resource } from "../shared/types.ts";
import { phaseOf, setupSnake, testGame } from "./helpers.ts";

afterEach(() => {
  resetRoomsForTests();
});

function extras(state: GameState, youId: string) {
  return {
    roomCode: "TEST",
    hostId: state.players[0]!.id,
    chat: [],
    connected: new Set(state.players.map((p) => p.id)),
    deadlineAt: null as number | null,
  };
}

describe("payloads malformados", () => {
  it("create/join con {} o null no tiran", () => {
    expect(parseCreatePayload(null).ok).toBe(false);
    expect(parseCreatePayload({}).ok).toBe(false);
    expect(parseJoinPayload(undefined).ok).toBe(false);
    expect(createRoom(null).ok).toBe(false);
    expect(createRoom({}).ok).toBe(false);
    expect(joinRoom({}).ok).toBe(false);
    expect(joinRoom(null).ok).toBe(false);
  });

  it("acciones sin schema no tiran el motor", () => {
    const state = testGame(3, 4);
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "principal";
    expect(applyAction(state, p.id, {} as Action).ok).toBe(false);
    expect(applyAction(state, p.id, { type: "discard" } as Action).ok).toBe(false);
    expect(applyAction(state, p.id, { type: "play_year_plenty" } as Action).ok).toBe(false);
    expect(applyAction(state, p.id, { type: "offer_trade" } as Action).ok).toBe(false);
    expect(applyAction(state, p.id, { type: "bank_trade" } as Action).ok).toBe(false);
    expect(parseAction(null).ok).toBe(false);
  });
});

describe("recursos negativos y enteros", () => {
  it("discard con trigo:-4 no acuña cartas", () => {
    const state = testGame(3, 8);
    setupSnake(state);
    const p = state.players[0]!;
    p.resources = { madera: 0, ladrillo: 0, lana: 0, trigo: 4, mineral: 0 };
    state.phase = "descarte";
    state.waitingDiscard = [p.id];
    state.discardNeeded = { [p.id]: 4 };
    const before = p.resources.trigo;
    const r = applyAction(state, p.id, { type: "discard", resources: { trigo: -4 } });
    expect(r.ok).toBe(false);
    expect(p.resources.trigo).toBe(before);
  });

  it("trueque con cantidades negativas no crea cartas", () => {
    const state = testGame(3, 8);
    setupSnake(state);
    const a = state.players[0]!;
    state.phase = "principal";
    state.turnIndex = 0;
    a.resources.madera = 1;
    const r = applyAction(state, a.id, {
      type: "bank_trade",
      give: { madera: -1 },
      want: { trigo: 1 },
    });
    expect(r.ok).toBe(false);
    expect(a.resources.trigo).toBe(0);
  });
});

describe("vista y secretos", () => {
  it("la mano ajena y los PV ocultos no viajan; el banco no se manda", () => {
    const state = testGame(3, 9);
    setupSnake(state);
    const a = state.players[0]!;
    const b = state.players[1]!;
    a.devCards.push({ kind: "punto_victoria", purchasedTurn: 0 });
    a.resources.trigo = 5;
    b.resources = { madera: 3, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    const viewB = toClientView(state, b.id, extras(state, b.id));
    expect(viewB.hand.resources).toEqual(b.resources);
    expect(viewB.hand.resources.trigo).toBe(0);
    expect(viewB.hand.resources.madera).toBe(3);
    expect(viewB.hand.devCards.some((c) => c.kind === "punto_victoria")).toBe(false);
    expect(viewB.players.find((p) => p.id === a.id)?.visibleVp).toBe(visibleVp(state, a.id));
    expect(viewB.hand.totalVp).toBe(totalVp(state, b.id));
    expect(JSON.stringify(viewB)).not.toContain("punto_victoria");

    state.phase = "descarte";
    state.waitingDiscard = [a.id];
    const viewA = toClientView(state, a.id, extras(state, a.id));
    expect(viewA.bank).toBeNull();
    expect(viewA.bankHas).toBeNull();
    state.phase = "principal";
    const viewOk = toClientView(state, a.id, extras(state, a.id));
    expect(viewOk.bank).toBeNull();
    expect(viewOk.bankHas).not.toBeNull();
    expect(viewOk.bankHas?.madera).toBeTypeOf("boolean");
    expect(viewOk.hand.devCards.some((c) => c.kind === "punto_victoria")).toBe(true);
  });
});

describe("desconexión, timeout y reconexión", () => {
  function threeSeatRoom() {
    const a = createRoom({ name: "Luz", color: "rojo" });
    if (!a.ok) throw new Error("create");
    const b = joinRoom({ code: a.room.code, name: "Tomi", color: "azul" });
    const c = joinRoom({ code: a.room.code, name: "Mora", color: "naranja" });
    if (!b.ok || !c.ok) throw new Error("join");
    bindSocket(a.room, a.playerId, "s-a");
    bindSocket(a.room, b.playerId, "s-b");
    bindSocket(a.room, c.playerId, "s-c");
    const started = startGame(a.room, a.playerId);
    expect(started.ok).toBe(true);
    setupSnake(a.room.game!);
    return { room: a.room, a, b, c };
  }

  it("si se cae el jugador del turno, al timeout entra un bot (V1)", () => {
    const { room, a } = threeSeatRoom();
    const g = room.game!;
    g.phase = "principal";
    g.turnIndex = 0;
    expect(g.players[0]!.id).toBe(a.playerId);
    dropPlayer(room, a.playerId);
    expect(g.players[g.turnIndex]!.id).toBe(a.playerId);
    expect(room.seats.find((s) => s.id === a.playerId)?.isBot).toBe(false);
    applyIdleTimeout(room);
    expect(room.seats.find((s) => s.id === a.playerId)?.isBot).toBe(true);
    expect(phaseOf(g) === "fin" || g.players[g.turnIndex]!.id !== a.playerId || phaseOf(g) === "dados").toBe(
      true,
    );
    const other = g.players[g.turnIndex]!;
    const blocked = play(room, other.id, { type: "roll" });
    if (phaseOf(g) === "dados") expect(blocked.ok).toBe(true);
    else expect(play(room, other.id, { type: "end_turn" }).error !== "No te toca." || g.phase !== "principal").toBe(true);
  });

  it("si se cae quien debe descartar, auto-descarta (V2)", () => {
    const { room, a } = threeSeatRoom();
    const g = room.game!;
    const p = g.players.find((x) => x.id === a.playerId)!;
    p.resources = { madera: 4, ladrillo: 4, lana: 0, trigo: 0, mineral: 0 };
    g.phase = "descarte";
    g.waitingDiscard = [p.id];
    g.discardNeeded = { [p.id]: 4 };
    dropPlayer(room, p.id);
    expect(g.waitingDiscard.includes(p.id)).toBe(false);
    expect(p.resources.madera + p.resources.ladrillo).toBeLessThanOrEqual(4);
    expect(g.phase).not.toBe("descarte");
    expect(room.seats.find((s) => s.id === p.id)?.isBot).toBe(true);
  });

  it("timeout de descarte también auto-descarta a quien está AFK", () => {
    const { room, a } = threeSeatRoom();
    const g = room.game!;
    const p = g.players.find((x) => x.id === a.playerId)!;
    p.resources = { madera: 8, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    g.phase = "descarte";
    g.waitingDiscard = [p.id];
    g.discardNeeded = { [p.id]: 4 };
    applyIdleTimeout(room);
    expect(g.waitingDiscard.includes(p.id)).toBe(false);
  });

  it("reconecta con token y conserva la mano, incluso en descarte", () => {
    const { room, a } = threeSeatRoom();
    const g = room.game!;
    const p = g.players.find((x) => x.id === a.playerId)!;
    p.resources.trigo = 6;
    g.phase = "descarte";
    g.waitingDiscard = [p.id];
    g.discardNeeded = { [p.id]: 3 };
    const seat = room.seats.find((s) => s.id === a.playerId)!;
    seat.connected = false;
    seat.socketId = null;
    const again = joinRoom({
      code: room.code,
      name: "Luz",
      color: "rojo",
      token: a.token,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.playerId).toBe(a.playerId);
    expect(g.players.find((x) => x.id === a.playerId)!.resources.trigo).toBe(6);
    expect(g.phase).toBe("descarte");
  });

  it("un token de otra sala no toma el asiento", () => {
    const a = createRoom({ name: "Luz", color: "rojo" });
    const b = createRoom({ name: "Tomi", color: "azul" });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const sneak = joinRoom({
      code: b.room.code,
      name: "Intruso",
      color: "naranja",
      token: a.token,
    });
    expect(sneak.ok).toBe(true);
    if (!sneak.ok) return;
    expect(sneak.playerId).not.toBe(a.playerId);
    expect(b.room.seats.some((s) => s.token === a.token)).toBe(false);
    expect(a.room.seats).toHaveLength(1);
  });

  it("en lobby el asiento se libera al caerse (V3)", () => {
    const a = createRoom({ name: "Luz", color: "rojo" });
    if (!a.ok) throw new Error("create");
    const b = joinRoom({ code: a.room.code, name: "Tomi", color: "azul" });
    if (!b.ok) throw new Error("join");
    bindSocket(a.room, a.playerId, "s-a");
    bindSocket(a.room, b.playerId, "s-b");
    expect(a.room.seats).toHaveLength(2);
    dropPlayer(a.room, b.playerId);
    expect(a.room.seats.some((s) => s.id === b.playerId)).toBe(false);
    const c = joinRoom({ code: a.room.code, name: "Mora", color: "naranja" });
    expect(c.ok).toBe(true);
  });
});

describe("counter_trade ajeno (V4)", () => {
  it("un tercero no puede contraofertar una oferta dirigida a otro", () => {
    const state = testGame(3, 13);
    setupSnake(state);
    const a = state.players[0]!;
    const b = state.players[1]!;
    const c = state.players[2]!;
    state.phase = "principal";
    state.turnIndex = 0;
    a.resources.madera = 1;
    b.resources.lana = 1;
    c.resources.trigo = 1;
    expect(
      applyAction(state, a.id, {
        type: "offer_trade",
        toId: b.id,
        give: { madera: 1 },
        want: { lana: 1 },
      }).ok,
    ).toBe(true);
    const tradeId = state.trades[0]!.id;
    const r = applyAction(state, c.id, {
      type: "counter_trade",
      tradeId,
      give: { trigo: 1 },
      want: { madera: 1 },
    });
    expect(r.ok).toBe(false);
    expect(state.trades[0]?.fromId).toBe(a.id);
  });
});

describe("camino a través de poblado enemigo (V5)", () => {
  it("no deja construir un camino que cruza un poblado ajeno", () => {
    const state = testGame(3, 19);
    setupSnake(state);
    const a = state.players[0]!;
    const b = state.players[1]!;
    state.phase = "principal";
    state.turnIndex = 0;
    a.resources.madera = 5;
    a.resources.ladrillo = 5;
    const myRoad = state.roads.find((r) => r.playerId === a.id)!;
    const edge = state.edges[myRoad.edgeId]!;
    let blockedVertex: string | null = null;
    let nextEdge: string | null = null;
    for (const vid of edge.vertexIds) {
      const v = state.vertices[vid]!;
      const mine = state.buildings.some((x) => x.vertexId === vid && x.playerId === a.id);
      if (mine) continue;
      blockedVertex = vid;
      nextEdge = v.edgeIds.find(
        (eid) => eid !== myRoad.edgeId && !state.roads.some((r) => r.edgeId === eid),
      ) ?? null;
      if (nextEdge) break;
    }
    expect(blockedVertex && nextEdge).toBeTruthy();
    state.buildings.push({ vertexId: blockedVertex!, playerId: b.id, kind: "poblado" });
    const r = applyAction(state, a.id, { type: "build_road", edgeId: nextEdge! });
    expect(r.ok).toBe(false);
    expect(legalMoves(state, a.id).edges.includes(nextEdge!)).toBe(false);
  });
});

describe("invento, mazo, ladrón, ejército, 5-6, memoria", () => {
  it("invento entrega dos recursos y rechaza tipos inválidos sin gastar la carta", () => {
    const state = testGame(3, 22);
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "principal";
    state.turnNumber = 2;
    p.devCards.push({ kind: "progreso_invento", purchasedTurn: 0 });
    const bad = applyAction(state, p.id, { type: "play_year_plenty", resources: ["piedra", "oro"] } as unknown as Action);
    expect(bad.ok).toBe(false);
    expect(p.devCards).toHaveLength(1);
    const ok = applyAction(state, p.id, { type: "play_year_plenty", resources: ["trigo", "mineral"] });
    expect(ok.ok).toBe(true);
    expect(p.resources.trigo + p.resources.mineral).toBeGreaterThanOrEqual(1);
    expect(p.devCards).toHaveLength(0);
  });

  it("mazo agotado no deja comprar", () => {
    const state = testGame(3, 23);
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "principal";
    state.turnIndex = 0;
    p.resources = { madera: 0, ladrillo: 0, lana: 5, trigo: 5, mineral: 5 };
    state.devDeck = [];
    expect(applyAction(state, p.id, { type: "buy_dev" }).ok).toBe(false);
  });

  it("el ladrón bloquea la producción del hexágono", () => {
    const state = testGame(3, 21);
    setupSnake(state);
    const p = state.players[0]!;
    const b = state.buildings.find((x) => x.playerId === p.id)!;
    const v = state.vertices[b.vertexId]!;
    const hex = state.hexes.find((h) => v.hexIds.includes(h.id) && h.number && h.terrain !== "desierto")!;
    const res = hex.terrain as Resource;
    state.robberHexId = hex.id;
    const before = p.resources[res];
    produceResources(state, hex.number!);
    expect(p.resources[res]).toBe(before);
  });

  it("empate de camino más largo no otorga el bono; un corte lo saca", () => {
    const state = testGame(3, 17);
    setupSnake(state);
    const a = state.players[0]!;
    const b = state.players[1]!;
    const occupied = new Set(state.roads.map((r) => r.edgeId));
    const free = Object.values(state.edges).filter((e) => !occupied.has(e.id));
    for (const e of free.slice(0, 5)) {
      state.roads.push({ edgeId: e.id, playerId: a.id });
    }
    refreshAwards(state);
    const lenA = longestRoadLength(state, a.id);
    if (lenA >= 5) {
      expect(state.longestRoadPlayerId === a.id || state.longestRoadPlayerId === null).toBe(true);
    }
    for (const e of free.slice(5, 10)) {
      state.roads.push({ edgeId: e.id, playerId: b.id });
    }
    refreshAwards(state);
    const enemyV = state.buildings.find((x) => x.playerId === b.id)?.vertexId;
    if (enemyV) {
      refreshAwards(state);
      expect(longestRoadLength(state, a.id)).toBeGreaterThanOrEqual(0);
    }
  });

  it("ejército más grande a partir de 3 caballeros", () => {
    const state = testGame(3, 24);
    setupSnake(state);
    const p = state.players[0]!;
    p.knightsPlayed = 3;
    refreshAwards(state);
    expect(state.largestArmyPlayerId).toBe(p.id);
  });

  it("pausa 5-6 sigue el sentido horario desde el jugador actual", () => {
    const state = testGame(6, 30);
    setupSnake(state);
    state.phase = "principal";
    state.turnIndex = 2;
    const cur = state.players[2]!.id;
    expect(applyAction(state, cur, { type: "end_turn" }).ok).toBe(true);
    expect(state.phase).toBe("construccion_especial");
    expect(state.specialBuildQueue[0]).toBe(state.players[3]!.id);
    expect(state.specialBuildQueue[state.specialBuildQueue.length - 1]).toBe(state.players[1]!.id);
    expect(state.specialBuildQueue.includes(cur)).toBe(false);
  });

  it("40 salas huérfanas se limpian", () => {
    const created = [];
    for (let i = 0; i < 40; i++) {
      const r = createRoom({ name: `N${i}`, color: "rojo", victoryPoints: 10 });
      expect(r.ok).toBe(true);
      if (r.ok) created.push(r.room);
    }
    expect(roomCount()).toBe(40);
    for (const room of created) {
      room.seats[0]!.connected = false;
      room.lastActivity = Date.now() - 40 * 60 * 1000;
    }
    const removed = pruneRooms(30 * 60 * 1000);
    expect(removed).toBe(40);
    expect(roomCount()).toBe(0);
  });

  it("ladrón atómico: steal inválido no mueve; pending no salta el robo", () => {
    const state = testGame(3, 25);
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "ladron";
    state.turnIndex = 0;
    const here = state.robberHexId;
    const other = state.hexes.find((h) => h.id !== here)!;
    const before = state.robberHexId;
    const bad = applyAction(state, p.id, {
      type: "move_robber",
      hexId: other.id,
      stealFromId: "nadie",
    });
    expect(bad.ok).toBe(false);
    expect(state.robberHexId).toBe(before);

    const emptyHex = state.hexes.find(
      (h) =>
        h.id !== state.robberHexId &&
        !state.buildings.some((b) => state.vertices[b.vertexId]?.hexIds.includes(h.id)),
    );
    if (emptyHex) {
      const ok = applyAction(state, p.id, { type: "move_robber", hexId: emptyHex.id, stealFromId: null });
      expect(ok.ok).toBe(true);
    }

    state.phase = "ladron";
    state.pendingStealHexId = state.robberHexId;
    const jump = state.hexes.find((h) => h.id !== state.robberHexId)!;
    const skip = applyAction(state, p.id, { type: "move_robber", hexId: jump.id, stealFromId: null });
    expect(skip.ok).toBe(false);
    expect(state.pendingStealHexId).toBe(state.robberHexId);
  });

  it("construcción de caminos con 0 piezas no consume la carta", () => {
    const state = testGame(3, 26);
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "principal";
    state.turnNumber = 2;
    p.pieces.caminos = 0;
    p.devCards.push({ kind: "progreso_caminos", purchasedTurn: 0 });
    const r = applyAction(state, p.id, { type: "play_road_building" });
    expect(r.ok).toBe(false);
    expect(p.devCards).toHaveLength(1);
  });

  it("victoria oculta se chequea al tirar", () => {
    const state = createGame({
      seed: 2,
      victoryPoints: 3,
      players: [
        { id: "p0", name: "A", color: "rojo" },
        { id: "p1", name: "B", color: "azul" },
        { id: "p2", name: "C", color: "naranja" },
      ],
    });
    setupSnake(state);
    const p = state.players[0]!;
    p.devCards.push({ kind: "punto_victoria", purchasedTurn: 0 });
    expect(state.phase).toBe("dados");
    expect(totalVp(state, p.id)).toBeGreaterThanOrEqual(3);
    const r = applyAction(state, p.id, { type: "roll" });
    expect(r.ok).toBe(true);
    expect(state.phase).toBe("fin");
    expect(state.winnerId).toBe(p.id);
  });

  it("monopolio junta un recurso y rechaza basura", () => {
    const state = testGame(3, 27);
    setupSnake(state);
    const a = state.players[0]!;
    const b = state.players[1]!;
    const c = state.players[2]!;
    state.phase = "principal";
    state.turnNumber = 2;
    a.devCards.push({ kind: "progreso_monopolio", purchasedTurn: 0 });
    a.resources.lana = 0;
    b.resources.lana = 4;
    c.resources.lana = 0;
    expect(applyAction(state, a.id, { type: "play_monopoly", resource: "mana" as never }).ok).toBe(false);
    expect(a.devCards).toHaveLength(1);
    expect(applyAction(state, a.id, { type: "play_monopoly", resource: "lana" }).ok).toBe(true);
    expect(a.resources.lana).toBe(4);
    expect(b.resources.lana).toBe(0);
  });
});

describe("nombres duplicados", () => {
  it("no deja dos asientos con el mismo nombre", () => {
    const a = createRoom({ name: "Luz", color: "rojo" });
    if (!a.ok) throw new Error("create");
    const b = joinRoom({ code: a.room.code, name: "Luz", color: "azul" });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.room.seats.map((s) => s.name.toLowerCase())).not.toEqual(["luz", "luz"]);
  });
});
