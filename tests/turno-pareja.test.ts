import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createGame } from "../server/engine.ts";
import { bestBankRate, legalMoves, legalSettlementVertices, pairedPlayerId, turnRole } from "../server/legal.ts";
import { addBot, createRoom, gameView, joinRoom, resetRoomsForTests, startGame } from "../server/rooms.ts";
import { toClientView } from "../server/view.ts";
import { pairedSeat, starterIndexFromSeed } from "../shared/paired.ts";
import type { GameState } from "../shared/types.ts";
import { pairedIdFromSeats, turnBarLabel } from "../src/play/turnLabel.ts";
import { phaseOf, setupSnake, testGame } from "./helpers.ts";

afterEach(() => {
  resetRoomsForTests();
});

function names(n: number) {
  const colors = ["rojo", "azul", "naranja", "blanco", "verde", "marron"] as const;
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: ["Ana", "Beto", "Ciro", "Dario", "Eva", "Fede"][i]!,
    color: colors[i]!,
  }));
}

function playSetup(state: GameState): string[] {
  const seen: string[] = [];
  let guard = 0;
  while (
    (phaseOf(state) === "colocacion_poblado" || phaseOf(state) === "colocacion_camino") &&
    guard++ < 80
  ) {
    const p = state.players[state.turnIndex]!;
    if (phaseOf(state) === "colocacion_poblado") {
      seen.push(p.id);
      const v = legalSettlementVertices(state, p.id, true)[0];
      expect(v, p.name).toBeTruthy();
      expect(applyAction(state, p.id, { type: "place_settlement", vertexId: v! }).ok).toBe(true);
      const outsider = state.players.find((x) => x.id !== p.id)!;
      expect(applyAction(state, outsider.id, { type: "place_road", edgeId: "no" }).ok).toBe(false);
    } else {
      const e = legalMoves(state, p.id).edges[0];
      expect(e, p.name).toBeTruthy();
      expect(applyAction(state, p.id, { type: "place_road", edgeId: e! }).ok).toBe(true);
    }
  }
  return seen;
}

function snakeFrom(start: number, n: number): string[] {
  const forward = Array.from({ length: n }, (_, i) => `p${(start + i) % n}`);
  return [...forward, ...[...forward].reverse()];
}

describe("sorteo de quien abre", () => {
  it("cambia con la semilla y no es siempre el anfitrión", () => {
    const drawn = new Set<number>();
    for (let seed = 1; seed <= 48; seed++) drawn.add(starterIndexFromSeed(seed, 6));
    expect(drawn.size).toBeGreaterThan(1);
    expect(drawn.has(0)).toBe(true);
    expect([...drawn].some((i) => i !== 0)).toBe(true);
  });

  it("en vivo el crypto no clava al primer asiento", () => {
    const drawn = new Set<number>();
    for (let i = 0; i < 24; i++) {
      const state = createGame({ players: names(4), victoryPoints: 10 });
      drawn.add(state.startIndex);
      expect(state.turnIndex).toBe(state.startIndex);
      expect(state.events.some((e) => e.text.includes("Sorteo") && e.text.includes(state.players[state.startIndex]!.name))).toBe(
        true,
      );
    }
    expect(drawn.size).toBeGreaterThan(1);
  });

  it("la serpiente sale del sorteado y el primer dado vuelve a esa persona", () => {
    for (const [n, start] of [
      [3, 2],
      [4, 1],
      [5, 3],
      [6, 4],
    ] as const) {
      const state = createGame({
        seed: 90 + n,
        victoryPoints: 10,
        players: names(n),
        startIndex: start,
      });
      expect(state.startIndex).toBe(start);
      expect(state.turnIndex).toBe(start);
      expect(playSetup(state)).toEqual(snakeFrom(start, n));
      expect(phaseOf(state)).toBe("dados");
      expect(state.turnIndex).toBe(start);
      expect(state.turnNumber).toBe(1);
      const opener = state.players[start]!;
      expect(applyAction(state, opener.id, { type: "roll" }).ok).toBe(true);
      const other = state.players[(start + 1) % n]!;
      expect(applyAction(state, other.id, { type: "roll" }).ok).toBe(false);
    }
  });

  it("reconectar no vuelve a sortear ni reordena los asientos", () => {
    const made = createRoom({ name: "Ana", color: "rojo", seatLimit: 4 });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(addBot(made.room, made.playerId).ok).toBe(true);
    expect(addBot(made.room, made.playerId).ok).toBe(true);
    made.room.botDelayMs = 60_000;
    expect(startGame(made.room, made.playerId).ok).toBe(true);
    const game = made.room.game!;
    const starter = game.players[game.startIndex]!.id;
    const order = game.players.map((p) => p.id);
    const back = joinRoom({ code: made.room.code, name: "Ana", color: "rojo", token: made.token });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const view = gameView(back.room, back.playerId);
    expect(view?.starterId).toBe(starter);
    expect(view?.currentPlayerId).toBe(starter);
    expect(view?.players.map((p) => p.id)).toEqual(order);
    expect(back.room.game!.startIndex).toBe(game.startIndex);
    expect(view?.events.some((e) => e.text.includes("Sorteo"))).toBe(true);
  });
});

function ready(n: number, turn: number) {
  const state = testGame(n, 40 + n + turn);
  setupSnake(state);
  state.phase = "principal";
  state.turnIndex = turn;
  state.turnNumber = 3;
  state.specialBuildQueue = [];
  const full = { madera: 8, ladrillo: 8, lana: 8, trigo: 8, mineral: 8 };
  for (const p of state.players) {
    p.resources = { ...full };
    p.devCards = [{ kind: "progreso_invento", purchasedTurn: 0 }];
  }
  return state;
}

function bank(state: GameState, playerId: string) {
  const rate = bestBankRate(state, playerId, "lana");
  return applyAction(state, playerId, { type: "bank_trade", give: { lana: rate }, want: { trigo: 1 } });
}

function viewOf(state: GameState, playerId: string) {
  return toClientView(state, playerId, {
    roomCode: "PAR",
    hostId: state.players[0]!.id,
    chat: [],
    connected: new Set(state.players.map((p) => p.id)),
  });
}

describe("pareja en 5 y 6", () => {
  it("el asiento es (dueño + 3) mod n, y en 3–4 no hay", () => {
    expect(pairedSeat(0, 3)).toBeNull();
    expect(pairedSeat(0, 4)).toBeNull();
    expect([0, 1, 2, 3, 4].map((i) => pairedSeat(i, 5))).toEqual([3, 4, 0, 1, 2]);
    expect([0, 1, 2, 3, 4, 5].map((i) => pairedSeat(i, 6))).toEqual([3, 4, 5, 0, 1, 2]);
  });

  it("en 3 y 4 sólo actúa el dueño", () => {
    for (const n of [3, 4]) {
      const state = ready(n, 0);
      const owner = state.players[0]!;
      expect(pairedPlayerId(state)).toBeNull();
      for (let i = 1; i < n; i++) {
        const other = state.players[i]!;
        expect(turnRole(state, other.id)).toBeNull();
        expect(applyAction(state, other.id, { type: "end_turn" }).ok).toBe(false);
        expect(bank(state, other.id).ok).toBe(false);
        expect(applyAction(state, other.id, { type: "roll" }).ok).toBe(false);
        const view = viewOf(state, other.id);
        expect(view.currentPlayerId).toBe(owner.id);
        expect(view.legal.canEndTurn).toBe(false);
        expect(view.legal.canBankTrade).toBe(false);
      }
      const own = viewOf(state, owner.id);
      expect(own.legal.canEndTurn).toBe(true);
      expect(own.legal.canBankTrade).toBe(true);
      expect(bank(state, owner.id).ok).toBe(true);
    }
  });

  it("en 5 y 6 acepta al dueño y a la pareja, y rechaza al resto y las jugadas del dueño", () => {
    for (const n of [5, 6]) {
      for (const turn of [0, 2, n - 1]) {
        const state = ready(n, turn);
        const owner = state.players[turn]!;
        const pair = state.players[(turn + 3) % n]!;
        expect(pairedPlayerId(state)).toBe(pair.id);
        expect(turnRole(state, owner.id)).toBe("owner");
        expect(turnRole(state, pair.id)).toBe("paired");

        const ownerView = viewOf(state, owner.id);
        const pairView = viewOf(state, pair.id);
        expect(ownerView.currentPlayerId).toBe(owner.id);
        expect(pairView.currentPlayerId).toBe(owner.id);
        expect(pairView.pairedPlayerId).toBe(pair.id);
        expect(pairedIdFromSeats(pairView.players, pairView.currentPlayerId, pairView.phase)).toBe(pair.id);
        expect(ownerView.legal.canEndTurn).toBe(true);
        expect(ownerView.legal.canRoll).toBe(false);
        expect(pairView.legal.canBankTrade).toBe(true);
        expect(pairView.legal.canBuyDev).toBe(true);
        expect(pairView.legal.canPlayYearPlenty).toBe(true);
        expect(pairView.legal.canEndTurn).toBe(false);
        expect(pairView.legal.canRoll).toBe(false);
        expect(pairView.legal.canTrade).toBe(false);
        expect(
          turnBarLabel({
            winnerName: null,
            ownerName: owner.name,
            pairedName: pair.name,
            youOwn: false,
          }),
        ).toBe(`Turno de ${owner.name} · también juega ${pair.name}`);

        for (let i = 0; i < n; i++) {
          if (i === turn || i === (turn + 3) % n) continue;
          const other = state.players[i]!;
          expect(bank(state, other.id).ok).toBe(false);
          expect(applyAction(state, other.id, { type: "end_turn" }).ok).toBe(false);
          expect(applyAction(state, other.id, { type: "buy_dev" }).ok).toBe(false);
          const view = viewOf(state, other.id);
          expect(view.currentPlayerId).toBe(owner.id);
          expect(view.legal.canBankTrade).toBe(false);
          expect(view.legal.canEndTurn).toBe(false);
          expect(view.legal.canBuyDev).toBe(false);
        }

        expect(applyAction(state, pair.id, { type: "roll" }).ok).toBe(false);
        expect(applyAction(state, pair.id, { type: "end_turn" }).ok).toBe(false);
        expect(applyAction(state, pair.id, { type: "offer_trade", toId: "todos", give: { lana: 1 }, want: { trigo: 1 } }).ok).toBe(
          false,
        );
        const hex = state.hexes.find((h) => h.id !== state.robberHexId)!;
        expect(applyAction(state, pair.id, { type: "move_robber", hexId: hex.id, stealFromId: null }).ok).toBe(false);
        expect(state.robberHexId).not.toBe(hex.id);

        expect(bank(state, pair.id).ok).toBe(true);
        expect(applyAction(state, pair.id, { type: "play_year_plenty", resources: ["madera", "ladrillo"] }).ok).toBe(true);
        expect(applyAction(state, pair.id, { type: "buy_dev" }).ok).toBe(true);

        state.phase = "dados";
        expect(legalMoves(state, pair.id).canRoll).toBe(false);
        expect(legalMoves(state, owner.id).canRoll).toBe(true);
        expect(applyAction(state, pair.id, { type: "roll" }).ok).toBe(false);
        expect(applyAction(state, owner.id, { type: "roll" }).ok).toBe(true);
      }
    }
  });

  it("la pausa de 5–6 sigue siendo de una persona por vez", () => {
    const state = ready(6, 0);
    const owner = state.players[0]!;
    const pair = state.players[3]!;
    expect(applyAction(state, owner.id, { type: "end_turn" }).ok).toBe(true);
    expect(phaseOf(state)).toBe("construccion_especial");
    expect(state.specialBuildQueue[0]).toBe(state.players[1]!.id);
    expect(pairedPlayerId(state)).toBeNull();
    expect(applyAction(state, pair.id, { type: "build_road", edgeId: "x" }).ok).toBe(false);
    expect(applyAction(state, owner.id, { type: "end_turn" }).ok).toBe(false);
    const builder = state.players[1]!;
    const view = viewOf(state, builder.id);
    expect(view.currentPlayerId).toBe(builder.id);
    expect(view.legal.canEndTurn).toBe(true);
    expect(viewOf(state, pair.id).legal.canEndTurn).toBe(false);
    expect(applyAction(state, builder.id, { type: "end_turn" }).ok).toBe(true);
    expect(state.specialBuildQueue[0]).toBe(state.players[2]!.id);
  });
});
