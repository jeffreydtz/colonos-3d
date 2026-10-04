import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ronda 11 motion producción", () => {
  it("vuelo al HUD desde hexes y HEX_SCREENS", () => {
    const fly = readFileSync("src/ui/ProductionFly.tsx", "utf8");
    expect(fly).toContain("colonos-fly-hud");
    expect(fly).toContain("data-hand-res");
    expect(fly).toContain("HEX_SCREENS");
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toContain("colonos-fly-hud");
    const field = readFileSync("src/three/pieces/HexField.tsx", "utf8");
    expect(field).toContain("producing");
    expect(readFileSync("src/three/tiles.ts", "utf8")).toContain("#fff4d4");
  });
});
