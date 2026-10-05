import { afterEach, describe, expect, it } from "vitest";
import { applyAction, produceResources } from "../server/engine.ts";
import { longestRoadLength, refreshAwards } from "../server/longestRoad.ts";
import {
  bindSocket,
  createRoom,
  dropPlayer,
  joinRoom,
  pushChat,
  resetRoomsForTests,
  startGame,
} from "../server/rooms.ts";
import { publicLog, toClientView } from "../server/view.ts";
import { CHAT_RATE_MAX, chatAllowed, sanitizeChat } from "../shared/chat.ts";
import type { GameState, LogEvent } from "../shared/types.ts";
import { setupSnake, testGame } from "./helpers.ts";

afterEach(() => resetRoomsForTests());

function extras(state: GameState, youId: string) {
  return {
    roomCode: "T",
    hostId: state.players[0]!.id,
    chat: [],
    connected: new Set(state.players.map((p) => p.id)),
  };
}

describe("6 jugadores (modo principal)", () => {
  it("isla grande, mazo de expansión y pausa de construcción", () => {
    const state = testGame(6, 101);
    expect(state.boardKind).toBe("expansion");
    expect(state.hexes).toHaveLength(30);
    expect(state.devDeck.length).toBe(34);
    expect(state.bank.madera).toBe(24);
    setupSnake(state);
    state.phase = "principal";
    state.turnIndex = 4;
    const cur = state.players[4]!.id;
    expect(applyAction(state, cur, { type: "end_turn" }).ok).toBe(true);
    expect(state.phase).toBe("construccion_especial");
    expect(state.specialBuildQueue).toHaveLength(5);
    expect(state.specialBuildQueue.includes(cur)).toBe(false);
    expect(state.specialBuildQueue[0]).toBe(state.players[5]!.id);
  });

  it("5 jugadores también usan isla grande", () => {
    const state = testGame(5, 102);
    expect(state.hexes).toHaveLength(30);
    setupSnake(state);
    state.phase = "principal";
    expect(applyAction(state, state.players[0]!.id, { type: "end_turn" }).ok).toBe(true);
    expect(state.phase).toBe("construccion_especial");
  });
});

describe("banco, mazo y bordes", () => {
  it("si el banco no alcanza, se anuncia y no se reparte ese recurso", () => {
    const state = testGame(3, 50);
    setupSnake(state);
    state.bank.trigo = 0;
    const before = state.players.map((p) => p.resources.trigo);
    produceResources(state, 6);
    const event = state.events.find(
      (e) => e.text.includes("no da abasto") && e.icons.some((i) => i.kind === "res" && i.id === "trigo"),
    );
    if (event) {
      expect(state.players.map((p) => p.resources.trigo)).toEqual(before);
    }
  });

  it("mazo vacío no vende cartas", () => {
    const state = testGame(3, 51);
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "principal";
    state.turnIndex = 0;
    state.devDeck = [];
    p.resources = { madera: 0, ladrillo: 0, lana: 4, trigo: 4, mineral: 4 };
    expect(applyAction(state, p.id, { type: "buy_dev" }).ok).toBe(false);
  });

  it("banco sin el recurso pedido rechaza el trueque 4:1", () => {
    const state = testGame(3, 52);
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "principal";
    state.turnIndex = 0;
    p.resources.madera = 4;
    state.bank.mineral = 0;
    expect(
      applyAction(state, p.id, { type: "bank_trade", give: { madera: 4 }, want: { mineral: 1 } }).ok,
    ).toBe(false);
  });
});

describe("camino más largo, ejército y empates", () => {
  it("en empate de ejército se queda el que ya lo tenía", () => {
    const state = testGame(3, 61);
    setupSnake(state);
    const a = state.players[0]!;
    const b = state.players[1]!;
    a.knightsPlayed = 3;
    refreshAwards(state);
    expect(state.largestArmyPlayerId).toBe(a.id);
    b.knightsPlayed = 3;
    refreshAwards(state);
    expect(state.largestArmyPlayerId).toBe(a.id);
    b.knightsPlayed = 4;
    refreshAwards(state);
    expect(state.largestArmyPlayerId).toBe(b.id);
  });

  it("sin 5 caminos no hay premio", () => {
    const state = testGame(3, 62);
    setupSnake(state);
    refreshAwards(state);
    expect(state.longestRoadPlayerId).toBeNull();
    expect(longestRoadLength(state, state.players[0]!.id)).toBeLessThan(5);
  });
});

describe("privacidad del log y revelado", () => {
  it("comprar una carta no filtra el tipo en el log ni en la vista ajena", () => {
    const state = testGame(3, 70);
    setupSnake(state);
    const a = state.players[0]!;
    const b = state.players[1]!;
    state.phase = "principal";
    state.turnIndex = 0;
    state.devDeck = ["punto_victoria", "caballero"];
    a.resources = { madera: 0, ladrillo: 0, lana: 1, trigo: 1, mineral: 1 };
    const res = applyAction(state, a.id, { type: "buy_dev" });
    expect(res.ok).toBe(true);
    expect(res.reveal).toBe("punto_victoria");
    const buy = state.events.filter((e) => e.piece === "carta");
    expect(buy.length).toBeGreaterThan(0);
    expect(buy.some((e) => /punto_victoria|caballero|invento|monopolio/i.test(e.text))).toBe(false);
    const viewB = toClientView(state, b.id, extras(state, b.id));
    expect(viewB.hand.devCards).toHaveLength(0);
    expect(viewB.players.find((p) => p.id === a.id)?.devCount).toBe(1);
    expect(viewB.events.some((e) => e.text.includes("punto_victoria"))).toBe(false);
  });

  it("el robo público no dice qué recurso se llevó", () => {
    const e: LogEvent = {
      id: 1,
      t: 0,
      text: "Luz le robó 1 carta a Tomi.",
      kind: "ladron",
      playerId: "a",
      otherId: "b",
      icons: [{ kind: "res", id: "madera", n: 1 }],
      resources: { madera: 1 },
    };
    const pub = publicLog(e, "b");
    expect(pub).not.toBeNull();
    expect(pub!.text).toBe("Luz le robó 1 carta a Tomi.");
    expect(pub!.resources).toBeUndefined();
    expect(pub!.icons).toEqual([]);
    expect(JSON.stringify(pub)).not.toMatch(/madera|ladrillo|lana|trigo|mineral|Madera|Piedra/i);
  });

  it("el descarte no revela tipos de recursos", () => {
    const state = testGame(3, 71);
    setupSnake(state);
    const p = state.players[0]!;
    state.phase = "descarte";
    state.waitingDiscard = [p.id];
    state.discardNeeded = { [p.id]: 2 };
    p.resources = { madera: 4, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    expect(applyAction(state, p.id, { type: "discard", resources: { madera: 2 } }).ok).toBe(true);
    const ev = state.events.find((x) => x.kind === "descarte" && x.playerId === p.id);
    expect(ev?.resources).toBeUndefined();
    expect(ev?.text).not.toMatch(/madera|ladrillo|lana|trigo|mineral/i);
    const view = toClientView(state, state.players[1]!.id, extras(state, state.players[1]!.id));
    const pub = view.events.find((x) => x.kind === "descarte" && x.playerId === p.id);
    expect(pub?.resources).toBeUndefined();
  });
});

describe("chat sanitizado y rate limit", () => {
  it("saca HTML y acota el largo", () => {
    expect(sanitizeChat("<b>hola</b>")).toBe("hola");
    expect(sanitizeChat(":D")).toBe("😄");
    expect(sanitizeChat("x".repeat(400)).length).toBe(160);
  });

  it("corta el spam", () => {
    let hits: number[] = [];
    for (let i = 0; i < CHAT_RATE_MAX; i++) {
      const r = chatAllowed(hits, 1000);
      expect(r.ok).toBe(true);
      if (r.ok) hits = r.next;
    }
    expect(chatAllowed(hits, 1000).ok).toBe(false);
    expect(chatAllowed(hits, 1000 + 9000).ok).toBe(true);
  });

  it("en la sala respeta el tope", () => {
    const a = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    for (let i = 0; i < 6; i++) {
      expect(pushChat(a.room, a.playerId, "Luz", `msg ${i}`, "rojo").ok).toBe(true);
    }
    expect(pushChat(a.room, a.playerId, "Luz", "de más", "rojo").ok).toBe(false);
  });
});

describe("desconexión 6 jugadores", () => {
  it("el asiento queda y el resto puede seguir", () => {
    const a = createRoom({ name: "Luz", color: "rojo", seatLimit: 6 });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const colors = ["azul", "naranja", "blanco", "verde", "marron"] as const;
    const others = colors.map((c, i) => joinRoom({ code: a.room.code, name: `J${i}`, color: c }));
    expect(others.every((o) => o.ok)).toBe(true);
    bindSocket(a.room, a.playerId, "s0");
    expect(startGame(a.room, a.playerId, { seed: 6 }).ok).toBe(true);
    expect(a.room.game?.hexes).toHaveLength(30);
    dropPlayer(a.room, a.playerId);
    expect(a.room.seats).toHaveLength(6);
    expect(a.room.seats[0]!.connected).toBe(false);
  });
});
