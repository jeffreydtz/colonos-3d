import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { THEME } from "../src/theme/tokens.ts";

describe("ronda 12 día / noche", () => {
  it("día más claro y noche con dos velas", () => {
    expect(THEME.dia.keyInt).toBeGreaterThan(THEME.atardecer.keyInt);
    expect(THEME.dia.ambient).toBeGreaterThan(THEME.noche.ambient);
    expect(THEME.noche.bg).toBe("#05060c");
    const light = readFileSync("src/three/env/Lighting.tsx", "utf8");
    expect(light).toContain("candles");
    expect(light).toContain("c2[0], 1.05, c2[1]");
    const sky = readFileSync("src/three/env/SkyDome.tsx", "utf8");
    expect(sky).toContain("#8eb8d8");
    expect(sky).toContain("#070b16");
  });
});
