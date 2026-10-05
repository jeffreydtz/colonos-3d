import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createGame } from "../server/engine.ts";
import { toClientView } from "../server/view.ts";
import type { LogEvent } from "../shared/types.ts";
import { handCaption, resourceCountShown } from "../src/play/publicHand.ts";
import { setupSnake } from "./helpers.ts";

describe("manos que se pueden mirar", () => {
  it("nombra cantidades y el ejército, no el tipo de lo que sigue boca abajo", () => {
    expect(handCaption(1, 1, 1, false)).toBe(
      "1 carta de recurso boca abajo, 1 carta de desarrollo boca abajo, 1 caballero jugado",
    );
    expect(handCaption(4, 2, 3, true)).toBe(
      "4 cartas de recurso boca abajo, 2 cartas de desarrollo boca abajo, 3 caballeros jugados, Ejército más grande",
    );
    expect(handCaption(4, 2, 0, false)).not.toMatch(/punto|invento|monopolio|caminos|madera|ladrillo|lana|trigo|piedra/i);
  });

  it("mientras los dados están en el aire no adelanta las cartas recién cobradas", () => {
    const events = [
      {
        id: 2,
        t: 0,
        text: "cobró",
        kind: "dados",
        playerId: "p",
        otherId: null,
        icons: [],
        resources: { madera: 2 },
      },
    ] satisfies LogEvent[];
    const held = { presenting: true, revealed: false, holdFromEventId: 1 };
    expect(resourceCountShown(5, "p", events, held)).toBe(3);
    expect(resourceCountShown(5, "otro", events, held)).toBe(5);
    expect(resourceCountShown(5, "p", events, { ...held, revealed: true })).toBe(5);
  });

  it("el rival publica el conteo y los caballeros, no las cartas de la mano", () => {
    const state = createGame({
      seed: 4,
      victoryPoints: 10,
      players: [
        { id: "p0", name: "Luz", color: "rojo" },
        { id: "p1", name: "Tomi", color: "azul" },
        { id: "p2", name: "Mora", color: "naranja" },
      ],
    });
    setupSnake(state);
    const tomi = state.players[1]!;
    tomi.resources = { madera: 3, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    tomi.devCards = [
      { kind: "punto_victoria", purchasedTurn: 0 },
      { kind: "caballero", purchasedTurn: 0 },
    ];
    tomi.knightsPlayed = 3;
    state.largestArmyPlayerId = tomi.id;
    const view = toClientView(state, "p0", {
      roomCode: "MANO",
      hostId: "p0",
      chat: [],
      connected: new Set(["p0", "p1", "p2"]),
    });
    const pub = view.players.find((p) => p.id === "p1")!;
    expect(pub.resourceCount).toBe(3);
    expect(pub.devCount).toBe(2);
    expect(pub.knightsPlayed).toBe(3);
    expect(pub.hasLargestArmy).toBe(true);
    expect(JSON.stringify(pub)).not.toMatch(/punto_victoria|caballero|invento|monopolio/);
    expect(view.hand.devCards).toEqual([]);
  });

  it("el panel de puntos, los asientos y Jugadores muestran boca abajo, caballeros y ejército", () => {
    const hand = readFileSync("src/ui/PublicHand.tsx", "utf8");
    const board = readFileSync("src/ui/Scoreboard.tsx", "utf8");
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    const actions = readFileSync("src/ui/ActionPanel.tsx", "utf8");
    expect(hand).toContain('data-testid="public-resources"');
    expect(hand).toContain('data-testid="public-devs"');
    expect(hand).toContain('data-testid="public-knights"');
    expect(hand).toContain('data-testid="public-army"');
    expect(hand).toContain('kind="caballero"');
    expect(hand).not.toMatch(/punto_victoria|progreso_invento|progreso_monopolio|progreso_caminos/);
    expect(hand).toContain('data-testid="rival-hands"');
    expect(board).toContain("p.devCount");
    expect(board).toContain("p.knightsPlayed");
    expect(board).toContain("p.hasLargestArmy");
    expect(board).toContain("<PublicHand");
    expect(board).not.toContain("devCards");
    expect(hud).toContain("devs={p.devCount}");
    expect(hud).toContain("knights={p.knightsPlayed}");
    expect(actions).toContain("<RivalHands");
  });
});
