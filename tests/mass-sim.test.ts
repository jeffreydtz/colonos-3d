import { describe, expect, it } from "vitest";
import { runBotGame } from "../server/bots.ts";
import { totalVp } from "../server/engine.ts";

const SEEDS_6 = [7, 11, 23, 42, 99, 256, 512, 1024, 2024, 2026, 3333, 4096, 7777, 9001, 12345];
const SEEDS_OTHER = [8, 16, 32, 64];

describe("simulaciones masivas", () => {
  it.each([3, 4] as const)("%i jugadores terminan en isla clásica (varias semillas)", (n) => {
    for (const seed of SEEDS_OTHER) {
      const { state, winnerId } = runBotGame({
        players: n,
        seed,
        victoryPoints: 8,
        maxTurns: 450,
      });
      expect(state.hexes).toHaveLength(19);
      expect(state.boardKind).toBe("standard");
      expect(state.phase).toBe("fin");
      expect(winnerId).toBeTruthy();
      if (winnerId) expect(totalVp(state, winnerId)).toBeGreaterThanOrEqual(8);
    }
  });

  it.each([5, 6] as const)("%i jugadores terminan en isla grande (varias semillas)", (n) => {
    const seeds = n === 6 ? SEEDS_6 : SEEDS_OTHER;
    let finished = 0;
    for (const seed of seeds) {
      const { state, winnerId } = runBotGame({
        players: n,
        seed,
        victoryPoints: 8,
        maxTurns: 500,
      });
      expect(state.hexes).toHaveLength(30);
      expect(state.boardKind).toBe("expansion");
      expect(["fin", "dados", "principal", "descarte", "ladron", "construccion_especial"]).toContain(
        state.phase,
      );
      if (winnerId) {
        expect(state.phase).toBe("fin");
        expect(totalVp(state, winnerId)).toBeGreaterThanOrEqual(8);
        finished += 1;
      }
    }
    expect(finished).toBeGreaterThanOrEqual(Math.ceil(seeds.length * 0.8));
  });
});
