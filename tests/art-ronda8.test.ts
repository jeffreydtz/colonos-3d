import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ronda 8 partículas y VFX", () => {
  it("chispas de producción y puff del ladrón; liviano las salta", () => {
    const src = readFileSync("src/three/vfx/Sparks.tsx", "utf8");
    expect(src).toContain("export function ProductionSparks");
    expect(src).toContain("export function RobberPuff");
    expect(src).toContain("mat.vfx.spark");
    expect(src).toContain("if (lite || reduceMotion()) return null");
    expect(src).toContain("artFreeze");
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain("<ProductionSparks");
    expect(board).toContain("<RobberPuff");
  });
});
