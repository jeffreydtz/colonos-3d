import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyAction } from "../server/engine.ts";
import { legalMoves, stealCandidates } from "../server/legal.ts";
import {
  bindSocket,
  createRoom,
  dropPlayer,
  gameView,
  joinRoom,
  resetRoomsForTests,
  startGame,
} from "../server/rooms.ts";
import { resetSecurityForTests } from "../server/security.ts";
import { toClientView } from "../server/view.ts";
import { setupSnake, testGame } from "./helpers.ts";

afterEach(() => {
  resetRoomsForTests();
  resetSecurityForTests();
});

function forceSeven(state: ReturnType<typeof testGame>, playerId: string): void {
  const p0 = state.players[0]!;
  const p1 = state.players[1]!;
  const p2 = state.players[2]!;
  for (let i = 0; i < 400; i++) {
    p0.resources = { madera: 3, ladrillo: 3, lana: 2, trigo: 0, mineral: 0 };
    p1.resources = { madera: 2, ladrillo: 2, lana: 2, trigo: 2, mineral: 0 };
    p2.resources = { madera: 1, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    state.phase = "dados";
    state.turnIndex = state.players.findIndex((p) => p.id === playerId);
    const r = applyAction(state, playerId, { type: "roll" });
    if (!r.ok) throw new Error(r.error);
    const dice = state.dice;
    if (dice && dice[0] + dice[1] === 7) return;
  }
  throw new Error("no salió 7");
}

describe("carta de 2 caminos", () => {
  it("juega la carta y pide dos caminos legales", () => {
    const state = testGame(3, 31);
    setupSnake(state);
    const p0 = state.players[0]!;
    state.phase = "principal";
    state.turnIndex = 0;
    state.turnNumber = 2;
    p0.devCards = [{ kind: "progreso_caminos", purchasedTurn: 0 }];
    const before = state.roads.filter((r) => r.playerId === p0.id).length;
    expect(applyAction(state, p0.id, { type: "play_road_building" }).ok).toBe(true);
    expect(state.pendingRoadBuilding).toBe(2);
    expect(legalMoves(state, p0.id).edges.length).toBeGreaterThan(0);

    const e1 = legalMoves(state, p0.id).edges[0]!;
    expect(applyAction(state, p0.id, { type: "build_road", edgeId: e1 }).ok).toBe(true);
    expect(state.pendingRoadBuilding).toBe(1);

    const e2 = legalMoves(state, p0.id).edges[0]!;
    expect(applyAction(state, p0.id, { type: "build_road", edgeId: e2 }).ok).toBe(true);
    expect(state.pendingRoadBuilding).toBe(0);
    expect(state.roads.filter((r) => r.playerId === p0.id).length).toBe(before + 2);
  });
});

describe("7 con descarte de 2+ jugadores", () => {
  it("dos manos de 8+ entran juntas a descarte", () => {
    const state = testGame(3, 44);
    setupSnake(state);
    const [p0, p1, p2] = state.players;
    if (!p0 || !p1 || !p2) throw new Error("faltan jugadores");
    forceSeven(state, p0.id);
    expect(state.phase).toBe("descarte");
    expect(state.waitingDiscard).toEqual(expect.arrayContaining([p0.id, p1.id]));
    expect(state.waitingDiscard).toHaveLength(2);
    expect(legalMoves(state, p0.id).mustDiscard).toBe(4);
    expect(legalMoves(state, p1.id).mustDiscard).toBe(4);
    expect(legalMoves(state, p2.id).mustDiscard).toBe(0);
  });
});

describe("ladrón con 2+ víctimas", () => {
  it("legal.stealFrom lista a dos vecinos y la vista alimenta StealSheet", () => {
    const state = testGame(3, 18);
    setupSnake(state);
    const actor = state.players[0]!;
    const p1 = state.players[1]!;
    const p2 = state.players[2]!;
    p1.resources = { madera: 2, ladrillo: 1, lana: 0, trigo: 0, mineral: 0 };
    p2.resources = { madera: 2, ladrillo: 1, lana: 0, trigo: 0, mineral: 0 };
    const hex = state.hexes.find((h) => h.id !== state.robberHexId)!;
    const verts = Object.values(state.vertices).filter((v) => v.hexIds.includes(hex.id));
    expect(verts.length).toBeGreaterThanOrEqual(2);
    state.buildings.push({ vertexId: verts[0]!.id, playerId: p1.id, kind: "poblado" });
    state.buildings.push({ vertexId: verts[1]!.id, playerId: p2.id, kind: "poblado" });
    expect(stealCandidates(state, hex.id, actor.id).length).toBeGreaterThanOrEqual(2);

    state.phase = "ladron";
    state.turnIndex = 0;
    expect(
      applyAction(state, actor.id, { type: "move_robber", hexId: hex.id, stealFromId: null }).ok,
    ).toBe(true);
    expect(state.pendingStealHexId).toBe(hex.id);
    const legal = legalMoves(state, actor.id);
    expect(legal.stealFrom.length).toBeGreaterThanOrEqual(2);

    const view = toClientView(state, actor.id, {
      roomCode: "TEST01",
      hostId: actor.id,
      chat: [],
      connected: new Set(state.players.map((p) => p.id)),
    });
    expect(view.legal.stealFrom.length).toBeGreaterThanOrEqual(2);
    const people = view.players.filter((p) => view.legal.stealFrom.includes(p.id));
    expect(people.length).toBeGreaterThanOrEqual(2);
  });
});

describe("corte de red propio y ajeno", () => {
  it("el otro se cae: connected false y el asiento queda", () => {
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
    expect(startGame(created.room, created.playerId, { seed: 9 }).ok).toBe(true);
    setupSnake(created.room.game!);
    created.room.game!.phase = "dados";

    dropPlayer(created.room, b.playerId);
    const mine = gameView(created.room, created.playerId)!;
    const theirs = mine.players.find((p) => p.id === b.playerId);
    expect(theirs?.connected).toBe(false);
    expect(theirs?.isBot).toBe(false);
    expect(created.room.seats.find((s) => s.id === b.playerId)).toBeTruthy();
  });

  it("si te caés vos, tu vista te marca desconectado y el banner de red existe", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 11 }).ok).toBe(true);
    dropPlayer(created.room, created.playerId);
    const view = gameView(created.room, created.playerId)!;
    const me = view.players.find((p) => p.id === created.playerId);
    expect(me?.connected).toBe(false);

    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('data-testid="net-down"');
    expect(hud).toContain("Se cortó la red");
  });
});

describe("sobre cerrado espectador", () => {
  it("el dorso se cierra solo entre 3 y 4 s y no revela el tipo", () => {
    const src = readFileSync("src/three/CardReveal.tsx", "utf8");
    const hold = src.match(/SPECTATOR_HOLD_MS = (\d+)/);
    expect(hold).toBeTruthy();
    expect(Number(hold![1])).toBeGreaterThanOrEqual(3000);
    expect(Number(hold![1])).toBeLessThanOrEqual(4000);
    expect(src).toContain("Sobre cerrado");
    expect(src).toContain("{owner && spec && (");
    expect(src).not.toMatch(/clearTimeout\(t\);\s*void setBusy\(false\)/);
    expect(src).toContain("if (owner) void setBusy(false)");
    const game = readFileSync("src/screens/Game.tsx", "utf8");
    expect(game).toContain("kind={null}");
    expect(game).toContain("owner={false}");
  });
});

describe("UX ronda 3 layout", () => {
  it("A1 chat: Enviar + composer y teclado visualViewport", () => {
    const mesa = readFileSync("src/ui/MesaPanel.tsx", "utf8");
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(mesa).toContain('data-testid="chat-send"');
    expect(mesa).toContain("Enviar");
    expect(mesa).toContain('data-testid="chat-composer"');
    expect(hud).toContain("useVisualViewportInset");
    expect(hud).toContain("mobile-dock");
    expect(hud).toContain("translateY(-${kb}px)");
  });

  it("A2 tira de recursos de ~24 px siempre visible en celu", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('data-testid="hand-strip"');
    expect(hud).toContain("text-2xl");
    expect(hud).toContain("<HandStrip");
  });

  it("A3 reloj arriba del unbox", () => {
    const reveal = readFileSync("src/three/CardReveal.tsx", "utf8");
    const clock = readFileSync("src/ui/Deadline.tsx", "utf8");
    expect(reveal).toContain("deadlineAt");
    expect(reveal).toContain("<Deadline");
    expect(clock).toContain("Tiempo:");
    expect(clock).toContain('data-testid="turn-clock"');
    const game = readFileSync("src/screens/Game.tsx", "utf8");
    expect(game).toContain("deadlineAt={view.deadlineAt}");
  });

  it("medios: fade de chips, puntito bot/offline, iconos dibujados, filtros en una línea", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('data-testid="chip-fade"');
    expect(hud).toContain('data-testid="chip-bot"');
    expect(hud).toContain('data-testid="chip-offline"');
    expect(hud).toContain("text-sky-300");
    expect(hud).toContain("text-red-300");
    expect(hud).toContain('data-testid="gfx-toggle"');
    expect(hud).toContain("Gráficos:");
    expect(hud).toContain('closeTestId="actions-hide"');
    expect(hud).not.toContain("hidden sm:inline");

    const mesa = readFileSync("src/ui/MesaPanel.tsx", "utf8");
    expect(mesa).toContain("PieceIcon");
    expect(mesa).toContain("<PieceIcon");
    expect(mesa).not.toMatch(/text-amber-100">\s*\{ic\.id\}/);
    expect(mesa).toContain('data-testid="log-filters"');
    expect(mesa).toContain("flex-nowrap");
    expect(mesa).toContain("overflow-x-auto");
    expect(mesa).toContain('data-testid="log-filters-fade"');
    expect(mesa).toContain('data-testid="chat-end"');
  });

  it("clic inválido en el canvas deja un toast", () => {
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain("Ahí no se puede construir.");
    expect(board).toContain("Ahí no podés tender un camino.");
    expect(board).toContain("Ahí no podés poner el ladrón.");
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('data-testid="toast"');
  });
});
