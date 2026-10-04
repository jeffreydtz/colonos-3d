import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chooseBotAction } from "../server/bots.ts";
import { applyAction, totalVp } from "../server/engine.ts";
import { currentPlayer } from "../server/legal.ts";
import {
  addBot,
  applyIdleTimeout,
  bindSocket,
  createRoom,
  dropPlayer,
  getRoom,
  joinRoom,
  lobbyView,
  play,
  removeBot,
  resetRoomsForTests,
  setSeatLimit,
  startGame,
} from "../server/rooms.ts";
import { toClientView } from "../server/view.ts";
import { BANK_EACH_STANDARD, DEV_DECK_STANDARD } from "../shared/constants.ts";
import { phaseOf, setupSnake, testGame } from "./helpers.ts";

beforeEach(() => {
  resetRoomsForTests();
});
afterEach(() => {
  resetRoomsForTests();
});

describe("tablero según cantidad real", () => {
  it("3 y 4 jugadores: 19 hex, 9 puertos, mazo y banco clásicos, sin pausa especial", () => {
    for (const n of [3, 4]) {
      const state = testGame(n, 40 + n);
      expect(state.boardKind).toBe("standard");
      expect(state.hexes).toHaveLength(19);
      expect(state.devDeck).toHaveLength(DEV_DECK_STANDARD.length);
      expect(state.bank.trigo).toBe(BANK_EACH_STANDARD);
      const portVerts = Object.values(state.vertices).filter((v) => v.port);
      expect(portVerts.length).toBeGreaterThanOrEqual(16);
      setupSnake(state);
      state.phase = "principal";
      state.turnIndex = 0;
      expect(applyAction(state, state.players[0]!.id, { type: "end_turn" }).ok).toBe(true);
      expect(state.phase).toBe("dados");
      expect(state.specialBuildQueue).toHaveLength(0);
    }
  });

  it("5 y 6 jugadores: isla grande y pausa de construcción", () => {
    const state = testGame(5, 55);
    expect(state.boardKind).toBe("expansion");
    expect(state.hexes).toHaveLength(30);
    expect(state.bank.madera).toBe(24);
    setupSnake(state);
    state.phase = "principal";
    state.turnIndex = 0;
    expect(applyAction(state, state.players[0]!.id, { type: "end_turn" }).ok).toBe(true);
    expect(state.phase).toBe("construccion_especial");
  });

  it("el tablero se arma con los asientos reales al empezar, no con el cupo", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 6 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    addBot(created.room, created.playerId);
    addBot(created.room, created.playerId);
    expect(created.room.seats).toHaveLength(3);
    expect(lobbyView(created.room, created.playerId).boardKind).toBe("standard");
    const started = startGame(created.room, created.playerId, { seed: 88 });
    expect(started.ok).toBe(true);
    expect(created.room.game?.hexes).toHaveLength(19);
    expect(created.room.game?.boardKind).toBe("standard");
  });
});

describe("lobby: asientos y bots", () => {
  it("el anfitrión elige el cupo y puede agregar y sacar bots", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 4 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const room = created.room;
    expect(room.seatLimit).toBe(4);
    expect(addBot(room, created.playerId).ok).toBe(true);
    expect(addBot(room, created.playerId, { name: "Tomi", color: "azul" }).ok).toBe(true);
    expect(room.seats).toHaveLength(3);
    expect(room.seats.filter((s) => s.isBot)).toHaveLength(2);
    const extra = joinRoom({ code: room.code, name: "Mora", color: "blanco" });
    expect(extra.ok).toBe(true);
    const fifth = joinRoom({ code: room.code, name: "Nico", color: "blanco" });
    expect(fifth.ok).toBe(false);
    expect(setSeatLimit(room, created.playerId, 3).ok).toBe(false);
    expect(setSeatLimit(room, created.playerId, 6).ok).toBe(true);
    expect(room.seatLimit).toBe(6);
    const bot = room.seats.find((s) => s.isBot)!;
    expect(removeBot(room, created.playerId, bot.id).ok).toBe(true);
    expect(room.seats.filter((s) => s.isBot)).toHaveLength(1);
    expect(startGame(room, created.playerId, { seed: 3 }).ok).toBe(true);
  });

  it("una mesa puede ser un humano contra bots", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3, victoryPoints: 8 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    addBot(created.room, created.playerId);
    addBot(created.room, created.playerId);
    expect(created.room.seats.filter((s) => !s.isBot)).toHaveLength(1);
    expect(startGame(created.room, created.playerId, { seed: 9 }).ok).toBe(true);
    expect(created.room.game?.players).toHaveLength(3);
  });

  it("si el anfitrión se cae en lobby con bots, reconecta con el token y arranca", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    addBot(created.room, created.playerId);
    addBot(created.room, created.playerId);
    bindSocket(created.room, created.playerId, "s-host");
    dropPlayer(created.room, created.playerId);
    expect(getRoom(created.room.code)).toBeTruthy();
    const host = created.room.seats.find((s) => s.id === created.playerId);
    expect(host?.connected).toBe(false);
    expect(created.room.hostId).toBe(created.playerId);
    const again = joinRoom({
      code: created.room.code,
      name: "Luz",
      color: "rojo",
      token: created.token,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.playerId).toBe(created.playerId);
    bindSocket(created.room, created.playerId, "s-host-2");
    expect(startGame(created.room, created.playerId, { seed: 11 }).ok).toBe(true);
  });

  it("los bots que entran seguidos se anuncian en una sola línea", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 6 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const room = created.room;
    addBot(room, created.playerId, { name: "Ana" });
    addBot(room, created.playerId, { name: "Beto" });
    addBot(room, created.playerId, { name: "Inés" });
    expect(room.chat.map((c) => c.text)).toEqual(["Ana, Beto e Inés entran como bots."]);
    removeBot(room, created.playerId, room.seats.at(-1)!.id);
    addBot(room, created.playerId, { name: "Tomi" });
    expect(room.chat.map((c) => c.text)).toEqual([
      "Ana, Beto e Inés entran como bots.",
      "Inés sale de la mesa.",
      "Tomi entra como bot.",
    ]);
  });
});

describe("bots: vista ciega y partidas", () => {
  it("el monopolio no usa las manos ajenas", () => {
    const state = testGame(3, 77);
    setupSnake(state);
    const p0 = state.players[0]!;
    const p1 = state.players[1]!;
    const p2 = state.players[2]!;
    state.phase = "principal";
    state.turnIndex = 0;
    state.turnNumber = 6;
    p0.pieces = { caminos: 0, poblados: 0, ciudades: 0 };
    p0.devCards = [{ kind: "progreso_monopolio", purchasedTurn: 1 }];
    p0.resources = { madera: 2, ladrillo: 2, lana: 0, trigo: 2, mineral: 2 };
    p1.resources = { madera: 0, ladrillo: 0, lana: 0, trigo: 0, mineral: 14 };
    p2.resources = { madera: 0, ladrillo: 0, lana: 0, trigo: 0, mineral: 9 };
    const act = chooseBotAction(state, p0.id);
    expect(act?.type).toBe("play_monopoly");
    if (act?.type === "play_monopoly") {
      expect(act.resource).toBe("lana");
      expect(act.resource).not.toBe("mineral");
    }
    const view = toClientView(state, p0.id, {
      roomCode: "X",
      hostId: p0.id,
      chat: [],
      connected: new Set(state.players.map((p) => p.id)),
    });
    expect(view.hand.resources.lana).toBe(0);
    expect(view.players.find((p) => p.id === p1.id)?.resourceCount).toBe(14);
  });

  it("partida mixta humano + 2 bots termina en isla clásica", () => {
    const created = createRoom({
      name: "Luz",
      color: "rojo",
      seatLimit: 3,
      victoryPoints: 8,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const room = created.room;
    bindSocket(room, created.playerId, "s-host");
    addBot(room, created.playerId);
    addBot(room, created.playerId);
    expect(startGame(room, created.playerId, { seed: 2024 }).ok).toBe(true);
    let guard = 0;
    while (room.game && room.game.phase !== "fin" && guard++ < 12_000) {
      const g = room.game;
      if (g.phase === "descarte") {
        let did = false;
        for (const pid of [...g.waitingDiscard]) {
          const seat = room.seats.find((s) => s.id === pid);
          if (seat?.isBot) continue;
          const act = chooseBotAction(g, pid);
          if (act) {
            play(room, pid, act);
            did = true;
          }
        }
        if (!did) break;
        continue;
      }
      const actor = currentPlayer(g);
      if (!actor) break;
      const seat = room.seats.find((s) => s.id === actor.id);
      if (seat?.isBot) break;
      const act = chooseBotAction(g, actor.id) ?? { type: "end_turn" as const };
      const res = play(room, actor.id, act);
      if (!res.ok) {
        if (g.phase === "principal" || g.phase === "construccion_especial") {
          play(room, actor.id, { type: "end_turn" });
        } else break;
      }
    }
    expect(room.game?.phase).toBe("fin");
    expect(room.game?.hexes).toHaveLength(19);
    expect(room.game?.winnerId).toBeTruthy();
    if (room.game?.winnerId) {
      expect(totalVp(room.game, room.game.winnerId)).toBeGreaterThanOrEqual(8);
    }
  });

  it("6 bots en una sala de 6 asientos terminan en isla grande", () => {
    const created = createRoom({
      name: "Luz",
      color: "rojo",
      seatLimit: 6,
      victoryPoints: 8,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const room = created.room;
    for (let i = 0; i < 5; i++) expect(addBot(room, created.playerId).ok).toBe(true);
    for (const s of room.seats) s.isBot = true;
    expect(startGame(room, created.playerId, { seed: 2026 }).ok).toBe(true);
    expect(room.game?.hexes).toHaveLength(30);
    expect(room.game?.phase).toBe("fin");
    expect(room.game?.winnerId).toBeTruthy();
  });

  it("5 bots en isla grande terminan la partida", () => {
    const created = createRoom({
      name: "Luz",
      color: "rojo",
      seatLimit: 5,
      victoryPoints: 8,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    for (let i = 0; i < 4; i++) expect(addBot(created.room, created.playerId).ok).toBe(true);
    for (const s of created.room.seats) s.isBot = true;
    expect(startGame(created.room, created.playerId, { seed: 2025 }).ok).toBe(true);
    expect(created.room.game?.hexes).toHaveLength(30);
    expect(created.room.game?.phase).toBe("fin");
    expect(created.room.game?.winnerId).toBeTruthy();
  });

  it("al vencer el timeout de un humano desconectado, un bot toma el asiento", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const b = joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    const c = joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    expect(b.ok && c.ok).toBe(true);
    if (!b.ok || !c.ok) return;
    bindSocket(created.room, created.playerId, "s-a");
    bindSocket(created.room, b.playerId, "s-b");
    bindSocket(created.room, c.playerId, "s-c");
    expect(startGame(created.room, created.playerId, { seed: 12 }).ok).toBe(true);
    const g = created.room.game!;
    setupSnake(g);
    g.phase = "principal";
    g.turnIndex = 0;
    dropPlayer(created.room, created.playerId);
    expect(created.room.seats.find((s) => s.id === created.playerId)?.isBot).toBe(false);
    applyIdleTimeout(created.room);
    expect(created.room.seats.find((s) => s.id === created.playerId)?.isBot).toBe(true);
    expect(
      g.players[g.turnIndex]!.id !== created.playerId || phaseOf(g) === "dados" || phaseOf(g) === "fin",
    ).toBe(true);
  });
});
