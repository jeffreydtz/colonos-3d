import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildArtView } from "../server/devFixtures.ts";
import { producingHexes } from "../src/play/producing.ts";

describe("ronda 10 look-dev piezas", () => {
  it("casas con gable/aleros y caminos trapecio, no caja suelta", () => {
    const settle = readFileSync("src/three/pieces/Settlements.tsx", "utf8");
    expect(settle).toContain("function gableHouse");
    expect(settle).toContain("techo a dos aguas");
    expect(settle).toContain("chimney");
    expect(settle).toContain("tower");
    expect(settle).toContain("eaveL");
    const roads = readFileSync("src/three/pieces/Roads.tsx", "utf8");
    expect(roads).toContain("bevelEnabled: true");
    expect(roads).toContain("mergeSolid");
    expect(roads).toContain("ROAD_PROFILE");
  });

  it("aros de producción se leen a altura táctica", () => {
    const glow = readFileSync("src/three/vfx/ProducerGlow.tsx", "utf8");
    expect(glow).toContain("mat.vfx.ring");
    expect(glow).toContain("ringGeometry");
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain("<ProducerGlow");
    const s1 = buildArtView("S1-lleno", 42);
    expect(producingHexes(s1).length).toBeGreaterThan(0);
  });
});
