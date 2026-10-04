import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildArtView } from "../server/devFixtures.ts";
import { TOKEN_ZONE_R, VERTEX_CLEAR_R, FRAME_W, SEA_MARGIN, landOutline, loopArea, offsetLoop, ensureCcw } from "../src/three/geo.ts";
import { ringPos } from "../src/three/HexDecor.tsx";
import { portPairs } from "../src/three/pieces/portLayout.ts";

describe("ronda 2 geometría", () => {
  it("props quedan fuera de la zona de ficha y lejos de vértices", () => {
    for (let i = 0; i < 9; i++) {
      const p = ringPos("hex-test", i, 9);
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(TOKEN_ZONE_R);
      const corners = [0, 1, 2, 3, 4, 5].map((k) => {
        const a = (Math.PI / 180) * (60 * k - 30);
        return { x: Math.cos(a) * 1.05, z: Math.sin(a) * 1.05 };
      });
      const near = corners.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < VERTEX_CLEAR_R);
      expect(near).toBe(false);
    }
  });

  it("el marco es un polígono cerrado sin auto-área nula", () => {
    for (const kind of ["standard", "expansion"] as const) {
      const inner = ensureCcw(landOutline(kind));
      expect(inner.length).toBeGreaterThan(10);
      const first = inner[0]!;
      const last = inner[inner.length - 1]!;
      const gap = Math.hypot(first.x - last.x, first.y - last.y);
      expect(gap).toBeLessThan(1.2);
      const outer = offsetLoop(inner, FRAME_W);
      const aIn = Math.abs(loopArea(inner));
      const aOut = Math.abs(loopArea(outer));
      expect(aOut).toBeGreaterThan(aIn);
      expect(aOut - aIn).toBeGreaterThan(5);
    }
  });

  it("el mar entra justo para el puerto y el canto de la loseta es cartón, no un halo", () => {
    expect(SEA_MARGIN).toBeLessThanOrEqual(0.95);
    expect(SEA_MARGIN).toBeGreaterThanOrEqual(0.8);
    const sea = readFileSync("src/three/env/Sea.tsx", "utf8");
    expect(sea).toContain('name="mat.coast"');
    expect(sea).toContain("clearcoat={0.06}");
    const field = readFileSync("src/three/pieces/HexField.tsx", "utf8");
    expect(field).toContain('name="mat.tile.side"');
    expect(readFileSync("src/three/HexTile.tsx", "utf8")).toContain("bumpMap={bump}");
  });

  it("cada puerto tiene exactamente dos postes", () => {
    const s1 = buildArtView("S1-lleno", 42);
    const pairs = portPairs(s1.vertices);
    expect(pairs.length).toBeGreaterThan(5);
    for (const p of pairs) {
      expect(Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y)).toBeGreaterThan(0.4);
      expect(Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y)).toBeLessThan(1.2);
    }
  });

  it("BoardScene compone Sea, Frame, HexField y Ports", () => {
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain("<Sea");
    expect(board).toContain("<Frame");
    expect(board).toContain("<HexField");
    expect(board).toContain("<Ports");
    const sea = readFileSync("src/three/env/Sea.tsx", "utf8");
    expect(sea).toContain("waterBump");
    expect(sea).toContain("paintSea");
  });
});
