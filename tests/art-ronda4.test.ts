import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyAction } from "../server/engine.ts";
import { setupSnake, testGame } from "./helpers.ts";

describe("ronda 4 dados físicos y sin spoiler", () => {
  it("rollNo avanza y secretInt usa cryptoInt fuera de test", () => {
    const engine = readFileSync("server/engine.ts", "utf8");
    expect(engine).toContain("state.rollNo += 1");
    expect(engine).toContain("cryptoInt(min, max)");
    expect(engine).toContain("function secretInt");
    const state = testGame(3, 11);
    setupSnake(state);
    expect(state.rollNo).toBe(0);
    const p = state.players[0]!;
    expect(applyAction(state, p.id, { type: "roll" }).ok).toBe(true);
    expect(state.rollNo).toBe(1);
    expect(state.dice).toHaveLength(2);
  });

  it("view expone rollNo; HUD no muestra el total hasta settle", () => {
    const view = readFileSync("server/view.ts", "utf8");
    expect(view).toContain("rollNo: state.rollNo");
    const types = readFileSync("shared/types.ts", "utf8");
    expect(types).toContain("rollNo: number");
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain("diceUi.revealed");
    expect(hud).toContain('data-testid="dice-hold"');
    expect(hud).toContain('data-testid="dice-total"');
    const game = readFileSync("src/screens/Game.tsx", "utf8");
    expect(game).toContain("DICE_HOLD_MS");
    const rig = readFileSync("src/three/dice/DiceRig.tsx", "utf8");
    const hold = readFileSync("src/play/diceHold.ts", "utf8");
    const toss = readFileSync("src/three/dice/throw.ts", "utf8");
    expect(hold).toContain("export const DICE_HOLD_MS = 3200");
    expect(rig).toContain("DICE_HOLD_MS");
    expect(toss).toContain("cannon-es");
    expect(rig).toContain("planThrow");
    expect(rig).toContain("playDiceHit");
    expect(rig).toContain("mat.dice");
    expect(toss).toContain("world.step");
    const geo = readFileSync("src/three/dice/dieGeo.ts", "utf8");
    expect(geo).toContain("roundedBox");
    expect(geo).toContain("quatForFace");
    expect(geo).toContain("diePipsGeometry");
    expect(rig).toContain("mat.dice.pips");
    expect(rig).toContain("dice_settle");
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain("<DiceRig");
    expect(board).not.toContain("function Die(");
  });
});
