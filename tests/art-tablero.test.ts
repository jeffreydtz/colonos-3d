import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildArtView } from "../server/devFixtures.ts";
import { CAM_CLASSIC, CAM_EXPANSION, CAM_FOV, PIECE_Y, ROAD_PROFILE, ROAD_Y } from "../src/three/geo.ts";
import { hexHeight } from "../src/three/HexDecor.tsx";

describe("tablero vs Catán físico", () => {
  it("hexes de cartón casi planos, no tarta de pisos", () => {
    const heights = (["madera", "lana", "trigo", "ladrillo", "mineral", "desierto"] as const).map(hexHeight);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.08);
    expect(hexHeight("mineral")).toBeLessThan(0.28);
    expect(hexHeight("desierto")).toBeGreaterThan(0.12);
  });

  it("cámara de mesa, no dron", () => {
    expect(CAM_FOV).toBeLessThanOrEqual(38);
    // Pose inicial: mirando la isla desde ~50°, no desde arriba a pique ni rasante.
    for (const p of [CAM_CLASSIC, CAM_EXPANSION]) {
      const deg = (Math.atan2(p[1], p[2]) * 180) / Math.PI;
      expect(deg).toBeGreaterThan(45);
      expect(deg).toBeLessThan(62);
    }
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain("CAM_CLASSIC");
    expect(board).toContain("CAM_FOV");
  });

  it("piezas de madera sobre el hex, ciudades no rascacielos", () => {
    expect(PIECE_Y).toBeLessThan(0.25);
    expect(ROAD_Y).toBeLessThan(0.22);
    const settle = readFileSync("src/three/pieces/Settlements.tsx", "utf8");
    expect(settle).toContain("CylinderGeometry(0.068");
    expect(settle).toContain("PIECE_Y");
    const glow = readFileSync("src/three/vfx/ProducerGlow.tsx", "utf8");
    expect(glow).toContain("TOKEN_R + 0.05");
    const roads = readFileSync("src/three/pieces/Roads.tsx", "utf8");
    expect(roads).toContain("Sin rotateX");
    expect(roads).toContain("ROAD_PROFILE");
    const ys = ROAD_PROFILE.map(([, y]) => y);
    const top = Math.max(...ys);
    const halfAt = (y: number) => Math.max(...ROAD_PROFILE.filter(([, py]) => py === y).map(([x]) => Math.abs(x)));
    expect(halfAt(top)).toBeLessThan(halfAt(0));
    expect(top).toBeGreaterThan(0.06);
    expect(top).toBeLessThan(0.1);
  });

  it("S1 clásica 4 jugadores con piezas de partida, no un bosque de torres", () => {
    const s1 = buildArtView("S1-lleno", 42);
    expect(s1.players).toHaveLength(4);
    expect(s1.hexes).toHaveLength(19);
    expect(s1.buildings.filter((b) => b.kind === "ciudad").length).toBeLessThanOrEqual(4);
    expect(s1.buildings.filter((b) => b.kind === "poblado").length).toBe(8);
    expect(s1.roads.length).toBeGreaterThan(20);
    expect(s1.roads.length).toBeLessThan(40);
    const s6 = buildArtView("S1-lleno", 42, 6);
    expect(s6.players).toHaveLength(6);
    expect(s6.hexes).toHaveLength(30);
    const s3 = buildArtView("S0-vacio", 42, 3);
    expect(s3.players).toHaveLength(3);
    expect(s3.hexes).toHaveLength(19);
  });
});
