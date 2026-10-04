import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyAction } from "../server/engine.ts";
import { legalMoves } from "../server/legal.ts";
import {
  bindSocket,
  createRoom,
  gameView,
  joinRoom,
  leaveRoom,
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

function leakKeys(payload: unknown): string[] {
  const json = JSON.stringify(payload);
  const hits: string[] = [];
  if (json.includes('"devRemaining"')) hits.push("devRemaining");
  if (json.includes('"devDeck"')) hits.push("devDeck");
  return hits;
}

describe("V-A1 mazo de desarrollo no viaja en la view", () => {
  it("ninguna view de toClientView ni gameView trae devRemaining ni devDeck", () => {
    const state = testGame(4, 19);
    setupSnake(state);
    state.phase = "principal";
    state.turnIndex = 0;
    for (const p of state.players) {
      const view = toClientView(state, p.id, {
        roomCode: "VA1TST",
        hostId: state.players[0]!.id,
        chat: [],
        connected: new Set(state.players.map((x) => x.id)),
        unboxPlayerId: null,
      });
      expect(view).not.toHaveProperty("devRemaining");
      expect(leakKeys(view)).toEqual([]);
      expect(view.legal.canBuyDev).toBeTypeOf("boolean");
    }

    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 6 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    joinRoom({ code: created.room.code, name: "Fede", color: "blanco" });
    joinRoom({ code: created.room.code, name: "Nico", color: "verde" });
    joinRoom({ code: created.room.code, name: "Sol", color: "marron" });
    bindSocket(created.room, created.playerId, "s-host");
    expect(startGame(created.room, created.playerId, { seed: 41 }).ok).toBe(true);
    setupSnake(created.room.game!);
    created.room.game!.phase = "principal";
    for (const seat of created.room.seats) {
      const view = gameView(created.room, seat.id);
      expect(view).toBeTruthy();
      expect(view).not.toHaveProperty("devRemaining");
      expect(leakKeys(view)).toEqual([]);
      expect(JSON.stringify(view)).not.toMatch(/"devDeck"/);
    }
  });

  it("canBuyDev sigue siendo la señal de compra cuando el mazo tiene cartas", () => {
    const state = testGame(3, 7);
    setupSnake(state);
    const p0 = state.players[0]!;
    state.phase = "principal";
    state.turnIndex = 0;
    p0.resources = { madera: 0, ladrillo: 0, lana: 1, trigo: 1, mineral: 1 };
    expect(legalMoves(state, p0.id).canBuyDev).toBe(true);
    const view = toClientView(state, p0.id, {
      roomCode: "T",
      hostId: p0.id,
      chat: [],
      connected: new Set(state.players.map((p) => p.id)),
    });
    expect(view.legal.canBuyDev).toBe(true);
    expect(view).not.toHaveProperty("devRemaining");
  });
});

describe("Vera: Salir en descarte auto-descarta", () => {
  it("forfeit durante descarte saca el id de waitingDiscard al toque", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const b = joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    const c = joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    expect(b.ok && c.ok).toBe(true);
    if (!b.ok || !c.ok) return;
    bindSocket(created.room, created.playerId, "s-a");
    bindSocket(created.room, b.playerId, "s-b");
    expect(startGame(created.room, created.playerId, { seed: 55 }).ok).toBe(true);
    const g = created.room.game!;
    setupSnake(g);
    const host = g.players.find((p) => p.id === created.playerId)!;
    const other = g.players.find((p) => p.id === b.playerId)!;
    host.resources = { madera: 4, ladrillo: 4, lana: 0, trigo: 0, mineral: 0 };
    other.resources = { madera: 4, ladrillo: 4, lana: 0, trigo: 0, mineral: 0 };
    g.phase = "descarte";
    g.waitingDiscard = [host.id, other.id];
    g.discardNeeded = { [host.id]: 4, [other.id]: 4 };

    expect(leaveRoom(created.room, created.playerId, { forfeit: true }).ok).toBe(true);
    expect(g.waitingDiscard).not.toContain(created.playerId);
    expect(created.room.seats.find((s) => s.id === created.playerId)?.isBot).toBe(true);
    expect(g.waitingDiscard).toEqual([other.id]);
    expect(g.phase).toBe("descarte");

    const left = applyAction(g, other.id, {
      type: "discard",
      resources: { madera: 2, ladrillo: 2 },
    });
    expect(left.ok).toBe(true);
    expect(g.waitingDiscard).toHaveLength(0);
    expect(g.phase).toBe("ladron");
  });

  it("si era el único en waitingDiscard, Salir no deja la mesa colgada", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 56 }).ok).toBe(true);
    const g = created.room.game!;
    setupSnake(g);
    const p = g.players.find((x) => x.id === created.playerId)!;
    p.resources = { madera: 8, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    g.phase = "descarte";
    g.waitingDiscard = [p.id];
    g.discardNeeded = { [p.id]: 4 };
    expect(leaveRoom(created.room, created.playerId, { forfeit: true }).ok).toBe(true);
    expect(g.waitingDiscard).toHaveLength(0);
    expect(g.phase).not.toBe("descarte");
  });
});

describe("Vera: chips 390 px", () => {
  it("el primer chip tiene más flex y testid de nombre", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('data-testid={i === 0 ? "chip-name-first"');
    expect(hud).toContain("min-w-0 flex-1 truncate");
    expect(hud).toContain('data-testid="chip-bot"');
  });
});

describe("arte 3D de terrenos", () => {
  it("hexes usan textura/bump, instancias por tipo y no roban hitbox ni token", () => {
    const tile = readFileSync("src/three/HexTile.tsx", "utf8");
    expect(tile).toContain("bumpMap");
    expect(tile).toContain("roughnessMap");
    expect(tile).toContain("circleGeometry args={[0.56, 28]}");
    expect(readFileSync("src/three/tiles.ts", "utf8")).toContain("TILE_R_TOP * 1.008");
    expect(tile).not.toContain("rotation.set(0, Math.PI / 6, 0)");
    const decor = readFileSync("src/three/HexDecor.tsx", "utf8");
    expect(decor).toContain("instancedMesh");
    expect(decor).toContain("raycast={skipRaycast}");
    expect(decor).toContain('h.terrain === "madera"');
    expect(decor).toContain('h.terrain === "ladrillo"');
    expect(decor).toContain('h.terrain === "mineral"');
    const tex = readFileSync("src/three/procTextures.ts", "utf8");
    expect(tex).toContain('kind === "trigo"');
    expect(tex).toContain("stampFlock");
    // Sin props en el desierto (los lomos 3D se veían como manchas blancas): el relieve va en el bump.
    expect(decor).not.toContain('h.terrain === "desierto"');
    expect(readFileSync("src/three/procTextures.ts", "utf8")).toMatch(
      /kind === "desierto"\) \{\s*const \{ dune, ripple \} = sand\(ax, ay\)/,
    );
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain('shadows={lite ? false : "soft"}');
    expect(board).toContain("HexDecor");
    expect(board).toContain("HexField");
    expect(board).toContain("Sea");
    expect(board).toContain("Frame");
    expect(board).not.toMatch(/\bHtml\b/);
    const game = readFileSync("src/screens/Game.tsx", "utf8");
    expect(game).toContain('lazy(() => import("../three/BoardScene")');
  });
});
