import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyAction } from "../server/engine.ts";
import { legalMoves } from "../server/legal.ts";
import { bindSocket, createRoom, gameView, joinRoom, play, resetRoomsForTests, startGame } from "../server/rooms.ts";
import { cameraCueForActor, devRevealForYou } from "../src/play/spotlight.ts";
import { setupSnake } from "./helpers.ts";

afterEach(() => {
  resetRoomsForTests();
});

describe("la carta de desarrollo es sólo de quien la compró", () => {
  it("el otro cliente no recibe el unbox y sí el renglón del registro", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const tomi = joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    expect(tomi.ok).toBe(true);
    if (!tomi.ok) return;
    bindSocket(created.room, created.playerId, "s-a");
    bindSocket(created.room, tomi.playerId, "s-b");
    expect(startGame(created.room, created.playerId, { seed: 44 }).ok).toBe(true);
    const g = created.room.game!;
    setupSnake(g);
    g.phase = "principal";
    g.turnIndex = 0;
    const p = g.players[0]!;
    p.resources = { madera: 0, ladrillo: 0, lana: 1, trigo: 1, mineral: 1 };
    const res = play(created.room, p.id, { type: "buy_dev" });
    expect(res.ok).toBe(true);

    const buyer = gameView(created.room, p.id)!;
    const other = gameView(created.room, tomi.playerId)!;
    expect(buyer.unboxPlayerId).toBe(p.id);
    expect(other.unboxPlayerId).toBeNull();
    expect(devRevealForYou(buyer.youId, buyer.unboxPlayerId)).toBe(true);
    expect(devRevealForYou(other.youId, other.unboxPlayerId)).toBe(false);
    expect(other.events.some((e) => e.kind === "dev" && e.text === "Luz compró una carta de desarrollo.")).toBe(true);
    expect(other.events.some((e) => /caballero|invento|monopolio|punto_victoria|caminos/i.test(e.text))).toBe(false);
    expect(other.hand.devCards).toEqual([]);
    expect(buyer.hand.devCards.length).toBe(1);
  });

  it("jugar la carta no abre otro overlay y la cámara ajena no persigue el ladrón", () => {
    expect(cameraCueForActor("me", "other", "robber")).toBeNull();
    expect(cameraCueForActor("me", "me", "robber")).toBe("ladron");
    const cam = readFileSync("src/three/cam/CinematicRig.tsx", "utf8");
    expect(cam).toContain("cameraCueForActor");
    expect(cam).not.toContain("lastTurn");
    expect(cam).toContain('cue.current = "ladron"');
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    const over = hud.slice(hud.indexOf('data-testid="game-over"') - 400, hud.indexOf('data-testid="game-over"') + 80);
    expect(over).not.toContain("aria-modal");
    expect(over).not.toContain("bg-black/50");
    expect(over).toContain('role="status"');
  });

  it("monopolio y invento no revelan la carta al resto", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const tomi = joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    if (!tomi.ok) return;
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 8 }).ok).toBe(true);
    const g = created.room.game!;
    setupSnake(g);
    g.phase = "principal";
    g.turnIndex = 0;
    const p = g.players[0]!;
    g.turnNumber = 3;
    p.devCards.push({ kind: "progreso_monopolio", purchasedTurn: 0 });
    p.resources = { madera: 1, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    g.players[1]!.resources.madera = 2;
    expect(legalMoves(g, p.id).canPlayMonopoly).toBe(true);
    const played = applyAction(g, p.id, { type: "play_monopoly", resource: "madera" });
    expect(played.ok).toBe(true);
    expect("reveal" in played).toBe(false);
    const other = gameView(created.room, tomi.playerId)!;
    expect(other.unboxPlayerId).toBeNull();
    expect(other.events.some((e) => e.kind === "dev" && /monopolio/i.test(e.text))).toBe(true);
  });
});
