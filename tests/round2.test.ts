import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyAction, createGame } from "../server/engine.ts";
import { legalMoves } from "../server/legal.ts";
import {
  applyIdleTimeout,
  bindSocket,
  createRoom,
  dropPlayer,
  getRoom,
  joinRoom,
  leaveRoom,
  IDLE_PRUNE_MS,
  MAX_ROOMS,
  play,
  prepareDevUnbox,
  pruneRooms,
  resetRoomsForTests,
  startGame,
  BOT_ONLY_PRUNE_MS,
} from "../server/rooms.ts";
import {
  ACTION_RATE,
  CREATE_RATE,
  MAX_HTTP_BUFFER_SIZE,
  allowRate,
  assertProductionCors,
  productionNeedsCorsOrigin,
  resetSecurityForTests,
  resolveCorsOrigin,
} from "../server/security.ts";
import { parseAction } from "../server/validate.ts";
import { toClientView } from "../server/view.ts";
import { buildBoard, numbersNotRedAdjacent } from "../shared/board.ts";
import { mulberry32, pickInt } from "../shared/rng.ts";
import { extractChatBody } from "../shared/chat.ts";
import { setupSnake, testGame } from "./helpers.ts";

afterEach(() => {
  resetRoomsForTests();
  resetSecurityForTests();
});

describe("B1 road_building stall", () => {
  it("sin aristas legales no consume la carta", () => {
    const state = testGame(3, 12);
    setupSnake(state);
    const p0 = state.players[0]!;
    state.phase = "principal";
    state.turnIndex = 0;
    p0.devCards = [{ kind: "progreso_caminos", purchasedTurn: 0 }];
    for (const e of Object.values(state.edges)) {
      if (!state.roads.some((r) => r.edgeId === e.id)) {
        state.roads.push({ edgeId: e.id, playerId: state.players[1]!.id });
      }
    }
    const before = p0.devCards.length;
    expect(legalMoves(state, p0.id).canPlayRoadBuilding).toBe(false);
    expect(applyAction(state, p0.id, { type: "play_road_building" }).ok).toBe(false);
    expect(p0.devCards.length).toBe(before);
    expect(state.pendingRoadBuilding).toBe(0);
  });

  it("si se agotan las aristas se puede pasar y el timeout no traba la mesa", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 21 }).ok).toBe(true);
    const g = created.room.game!;
    setupSnake(g);
    g.phase = "principal";
    g.turnIndex = 0;
    g.pendingRoadBuilding = 1;
    for (const e of Object.values(g.edges)) {
      if (!g.roads.some((r) => r.edgeId === e.id)) {
        g.roads.push({ edgeId: e.id, playerId: g.players[1]!.id });
      }
    }
    expect(legalMoves(g, g.players[0]!.id).edges).toHaveLength(0);
    expect(applyAction(g, g.players[0]!.id, { type: "end_turn" }).ok).toBe(true);
    expect(g.pendingRoadBuilding).toBe(0);

    g.phase = "principal";
    g.turnIndex = 0;
    g.pendingRoadBuilding = 1;
    for (const e of Object.values(g.edges)) {
      if (!g.roads.some((r) => r.edgeId === e.id)) {
        g.roads.push({ edgeId: e.id, playerId: g.players[1]!.id });
      }
    }
    applyIdleTimeout(created.room);
    expect(created.room.game?.pendingRoadBuilding).toBe(0);
    expect(created.room.game?.phase === "principal" || created.room.game?.phase === "dados" || created.room.game?.phase === "construccion_especial" || created.room.game?.phase === "fin").toBe(true);
    expect(created.room.game?.phase).not.toBe("ladron");
  });

  it("un timeout en dados no deja la mesa trabada si una acción falla", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 22 }).ok).toBe(true);
    const g = created.room.game!;
    setupSnake(g);
    g.phase = "dados";
    g.turnIndex = 0;
    const bad = applyAction(g, g.players[0]!.id, { type: "play_knight", hexId: "no-existe", stealFromId: null });
    expect(bad.ok).toBe(false);
    expect(g.phase).toBe("dados");
    applyIdleTimeout(created.room);
    const after = created.room.game!;
    expect(
      after.dice != null || after.phase !== "dados" || after.turnIndex !== 0,
    ).toBe(true);
  });
});

describe("A1 6 y 8 no adyacentes", () => {
  it("500 semillas en 3/4/5/6 sin 6-8 pegados", () => {
    for (const n of [3, 4, 5, 6]) {
      for (let s = 1; s <= 500; s++) {
        const state = createGame({
          seed: s * 17 + n * 91,
          players: Array.from({ length: n }, (_, i) => ({
            id: `p${i}`,
            name: `J${i}`,
            color: (["rojo", "azul", "naranja", "blanco", "verde", "marron"] as const)[i]!,
          })),
        });
        expect(numbersNotRedAdjacent(state.hexes), `${n}p seed ${s}`).toBe(true);
      }
    }
    const board = buildBoard(mulberry32(1), "expansion");
    expect(numbersNotRedAdjacent(board.hexes)).toBe(true);
  });
});

describe("A2 dados no derivan del deckSeed", () => {
  it("con entropy crypto los dados no coinciden con mulberry32(deckSeed+...)", () => {
    let differed = false;
    for (let i = 0; i < 8; i++) {
      const state = createGame({
        seed: 77 + i,
        entropy: "crypto",
        players: [
          { id: "p0", name: "A", color: "rojo" },
          { id: "p1", name: "B", color: "azul" },
          { id: "p2", name: "C", color: "naranja" },
        ],
      });
      setupSnake(state);
      const snap = { deckSeed: state.deckSeed, turnNumber: state.turnNumber, nextEventId: state.nextEventId };
      expect(applyAction(state, state.players[0]!.id, { type: "roll" }).ok).toBe(true);
      const rng = mulberry32((snap.deckSeed + snap.turnNumber * 997 + snap.nextEventId * 13) >>> 0);
      const p1 = pickInt(rng, 1, 6);
      const p2 = pickInt(rng, 1, 6);
      if (state.dice && (state.dice[0] !== p1 || state.dice[1] !== p2)) {
        differed = true;
        break;
      }
    }
    expect(differed).toBe(true);
  });

  it("en entropy test los dos dados no son un mismo stream congelado", () => {
    let unequal = false;
    for (let s = 1; s <= 24; s++) {
      const state = testGame(3, 200 + s);
      setupSnake(state);
      expect(applyAction(state, state.players[0]!.id, { type: "roll" }).ok).toBe(true);
      if (state.dice && state.dice[0] !== state.dice[1]) {
        unequal = true;
        break;
      }
    }
    expect(unequal).toBe(true);
  });
});

describe("A3 salas, buffer y rate", () => {
  it("el tope es 200 mesas", () => {
    for (let i = 0; i < MAX_ROOMS; i++) {
      const r = createRoom({ name: `N${i}`, color: "rojo" });
      expect(r.ok).toBe(true);
    }
    const extra = createRoom({ name: "DeMas", color: "azul" });
    expect(extra.ok).toBe(false);
  });

  it("poda mesas 100% bots en 8 minutos", () => {
    const created = createRoom({ name: "Luz", color: "rojo" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    created.room.seats[0]!.isBot = true;
    created.room.seats[0]!.connected = true;
    created.room.lastActivity = Date.now() - BOT_ONLY_PRUNE_MS - 10;
    expect(pruneRooms()).toBeGreaterThan(0);
  });

  it("maxHttpBufferSize está acotado", () => {
    expect(MAX_HTTP_BUFFER_SIZE).toBeLessThanOrEqual(100_000);
  });

  it("rate limit de acciones y create", () => {
    resetSecurityForTests();
    let ok = 0;
    for (let i = 0; i < ACTION_RATE.max + 5; i++) {
      if (allowRate("act:t", ACTION_RATE.windowMs, ACTION_RATE.max, 1_000)) ok += 1;
    }
    expect(ok).toBe(ACTION_RATE.max);
    resetSecurityForTests();
    ok = 0;
    for (let i = 0; i < CREATE_RATE.max + 3; i++) {
      if (allowRate("create:t", CREATE_RATE.windowMs, CREATE_RATE.max, 2_000)) ok += 1;
    }
    expect(ok).toBe(CREATE_RATE.max);
  });
});

describe("A4 banco oculto", () => {
  it("el rival no recibe el banco ni cantidades", () => {
    const state = testGame(3, 8);
    setupSnake(state);
    state.phase = "principal";
    const view = toClientView(state, state.players[1]!.id, {
      roomCode: "T",
      hostId: state.players[0]!.id,
      chat: [],
      connected: new Set(state.players.map((p) => p.id)),
    });
    expect(view.bank).toBeNull();
    expect(view.bankHas).toBeNull();
    const you = toClientView(state, state.players[0]!.id, {
      roomCode: "T",
      hostId: state.players[0]!.id,
      chat: [],
      connected: new Set(state.players.map((p) => p.id)),
    });
    expect(you.bank).toBeNull();
    expect(you.bankHas?.madera).toBe(true);
  });
});

describe("A5 CORS", () => {
  it("sin CORS_ORIGIN deniega; en producción exige la variable", () => {
    expect(resolveCorsOrigin({})).toBe(false);
    expect(resolveCorsOrigin({ NODE_ENV: "production" })).toBe(false);
    expect(productionNeedsCorsOrigin({ NODE_ENV: "production" })).toBe(true);
    expect(productionNeedsCorsOrigin({ NODE_ENV: "production", CORS_ORIGIN: "https://a.com" })).toBe(false);
    expect(() =>
      assertProductionCors({ NODE_ENV: "production", CORS_ORIGIN: "https://a.com" }),
    ).not.toThrow();
    expect(resolveCorsOrigin({ CORS_ORIGIN: "https://a.com" })).toEqual(["https://a.com"]);
  });
});

describe("nombres, IDs y chat objeto", () => {
  it("reserva Sistema", () => {
    const r = createRoom({ name: "Sistema", color: "rojo" });
    expect(r.ok).toBe(false);
  });

  it("rechaza IDs enormes en vez de truncar", () => {
    const parsed = parseAction({ type: "build_road", edgeId: "x".repeat(80) });
    expect(parsed.ok).toBe(false);
  });

  it("acepta chat como objeto { text }", () => {
    expect(extractChatBody({ text: "hola objeto" })).toBe("hola objeto");
    expect(extractChatBody("hola")).toBe("hola");
  });

  it("rechaza stealFromId enorme", () => {
    const parsed = parseAction({ type: "move_robber", hexId: "0,0", stealFromId: "x".repeat(80) });
    expect(parsed.ok).toBe(false);
  });
});

describe("QA ronda 3 (medios)", () => {
  it("Vite no usa server.hmr.* deprecado", () => {
    const src = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/hmr:\s*\{/);
    expect(src).toMatch(/ws:\s*\{\s*server:/);
  });

  it("el tablero no monta Html/drei extra (unmount síncrono)", () => {
    const src = readFileSync(new URL("../src/three/BoardScene.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/\bHtml\b/);
    const card = readFileSync(new URL("../src/three/CardReveal.tsx", import.meta.url), "utf8");
    expect(card).not.toMatch(/Canvas/);
  });

  it("humano caído en descarte pasa a bot al toque, sin esperar el turno", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 31 }).ok).toBe(true);
    const g = created.room.game!;
    setupSnake(g);
    const p = g.players[0]!;
    p.resources = { madera: 8, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    g.phase = "descarte";
    g.waitingDiscard = [p.id];
    g.discardNeeded = { [p.id]: 4 };
    dropPlayer(created.room, p.id);
    expect(g.waitingDiscard.includes(p.id)).toBe(false);
    expect(created.room.seats.find((s) => s.id === p.id)?.isBot).toBe(true);
  });

  it("un bot responde el trueque dirigido a un humano caído", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const b = joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    const c = joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    expect(b.ok && c.ok).toBe(true);
    if (!b.ok || !c.ok) return;
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 32 }).ok).toBe(true);
    const g = created.room.game!;
    setupSnake(g);
    g.phase = "principal";
    g.turnIndex = 0;
    const host = g.players[0]!;
    const target = g.players[1]!;
    host.resources = { madera: 2, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    target.resources = { madera: 0, ladrillo: 2, lana: 0, trigo: 0, mineral: 0 };
    expect(
      play(created.room, host.id, {
        type: "offer_trade",
        toId: target.id,
        give: { madera: 1 },
        want: { ladrillo: 1 },
      }).ok,
    ).toBe(true);
    expect(g.trades).toHaveLength(1);
    dropPlayer(created.room, target.id);
    expect(created.room.seats.find((s) => s.id === target.id)?.isBot).toBe(true);
    expect(g.trades.length === 0 || g.trades[0]?.toId !== target.id).toBe(true);
  });

  it("poda una sala sin humanos en línea y no toca una con humano conectado", () => {
    const live = createRoom({ name: "Luz", color: "rojo" });
    const dead = createRoom({ name: "Tomi", color: "azul" });
    expect(live.ok && dead.ok).toBe(true);
    if (!live.ok || !dead.ok) return;
    live.room.seats[0]!.connected = true;
    live.room.seats[0]!.isBot = false;
    live.room.lastActivity = Date.now() - IDLE_PRUNE_MS * 2;
    dead.room.seats[0]!.connected = true;
    dead.room.seats[0]!.isBot = true;
    dead.room.lastActivity = Date.now() - BOT_ONLY_PRUNE_MS - 50;
    expect(pruneRooms()).toBe(1);
    expect(getRoom(live.room.code)).toBeTruthy();
    expect(getRoom(dead.room.code)).toBeUndefined();
  });

  it("comprar carta marca unboxing sólo para el comprador", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 44 }).ok).toBe(true);
    const g = created.room.game!;
    setupSnake(g);
    g.phase = "principal";
    g.turnIndex = 0;
    const p = g.players[0]!;
    p.resources = { madera: 0, ladrillo: 0, lana: 1, trigo: 1, mineral: 1 };
    const res = play(created.room, p.id, { type: "buy_dev" });
    expect(res.ok).toBe(true);
    expect("reveal" in res && res.reveal).toBeTruthy();
    expect(created.room.unboxPlayerId).toBe(p.id);
    expect(created.room.busyUntil).toBeGreaterThan(Date.now());
  });

  it("Salir de una partida en curso pasa a bot al toque, sin esperar el timeout", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 33 }).ok).toBe(true);
    const g = created.room.game!;
    setupSnake(g);
    g.phase = "principal";
    g.turnIndex = 0;
    expect(leaveRoom(created.room, created.playerId, { forfeit: true }).ok).toBe(true);
    expect(created.room.seats.find((s) => s.id === created.playerId)?.isBot).toBe(true);
  });

  it("prepareDevUnbox deja canBuyDev y el click de compra revela", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 45 }).ok).toBe(true);
    expect(prepareDevUnbox(created.room, created.playerId).ok).toBe(true);
    const legal = legalMoves(created.room.game!, created.playerId);
    expect(legal.canBuyDev).toBe(true);
    const res = play(created.room, created.playerId, { type: "buy_dev" });
    expect(res.ok).toBe(true);
    expect("reveal" in res && res.reveal).toBeTruthy();
  });

  it("el comprador abre el unbox desde la vista, no sólo del ack", () => {
    const game = readFileSync(new URL("../src/screens/Game.tsx", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../src/ui/ActionPanel.tsx", import.meta.url), "utf8");
    expect(game).toMatch(/view\.hand\.devCards/);
    expect(game).toMatch(/revealCard: card\.kind/);
    expect(panel).toMatch(/testId="buy-dev"/);
    const card = readFileSync(new URL("../src/three/CardReveal.tsx", import.meta.url), "utf8");
    expect(card).toMatch(/createPortal/);
    expect(card).not.toMatch(/Canvas/);
  });

  it("la tira de asientos entra entera: una columna por jugador, sin scroll", () => {
    const src = readFileSync(new URL("../src/ui/Hud.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/data-testid="seat-chips"/);
    expect(src).toMatch(/repeat\(\$\{view\.players\.length\}, minmax\(0, 1fr\)\)/);
    expect(src).not.toMatch(/snap-mandatory/);
    expect(src).toMatch(/flex-1/);
    expect(src).toMatch(/const people = view\.players\.filter/);
    expect(src).toMatch(/exitMesa/);
  });
});
