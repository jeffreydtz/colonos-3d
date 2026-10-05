import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COLOR_HEX, TERRAIN_COLOR } from "../shared/constants.ts";
import { PLAYER_GLYPHS, TOKENS } from "../src/theme/tokens.ts";
import { TILE_R_TOP, TOKEN_R } from "../src/three/geo.ts";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16) / 255,
    Number.parseInt(h.slice(2, 4), 16) / 255,
    Number.parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relLum(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a: string, b: string): number {
  const l1 = relLum(a);
  const l2 = relLum(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

describe("ronda 3 fichas y piezas", () => {
  it("BoardScene instancia Tokens, Settlements, Roads, Robber y GhostSpots", () => {
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain("<Tokens");
    expect(board).toContain("<Settlements");
    expect(board).toContain("<Roads");
    expect(board).toContain("<Robber");
    expect(board).toContain("<GhostSpots");
    expect(board).not.toContain("AnimatedRobber");
    expect(board).not.toContain("LiteMarks");
    expect(board).not.toContain("function House");
    expect(board).not.toContain("function RoadMesh");
    expect(board).toContain('shadows={lite ? false : "soft"}');
    expect(board).toContain("dpr={lite ? [1, 1] : [1, 1.5]}");
  });

  it("fichas lathe con atlas, 6/8 calientes y cerca del tamaño físico", () => {
    const src = readFileSync("src/three/pieces/Tokens.tsx", "utf8");
    expect(src).toContain("LatheGeometry");
    expect(src).toContain('name: "mat.token"');
    expect(src).toContain("aCell");
    expect(src).toContain("instancedMesh");
    // Físico: 25 mm sobre 79 mm de loseta (32%). Hasta ~40% para que el número se lea en el celular.
    const ratio = (2 * TOKEN_R) / (Math.sqrt(3) * TILE_R_TOP);
    expect(ratio).toBeGreaterThan(0.33);
    expect(ratio).toBeLessThan(0.41);
    expect(src).toContain("n === 6 || n === 8");
    expect(contrast(TOKENS.tokenInk, TOKENS.tokenCream)).toBeGreaterThanOrEqual(7);
    expect(contrast(TOKENS.tokenHot, TOKENS.tokenCream)).toBeGreaterThanOrEqual(5);
  });

  it("poblados, ciudades y caminos instanciados con cupos fijos y contorno", () => {
    const settle = readFileSync("src/three/pieces/Settlements.tsx", "utf8");
    expect(settle).toContain("instancedMesh");
    expect(settle).toContain("mat.outline");
    expect(settle).toContain("PLAYER_GLYPHS");
    expect(settle).toContain("const MAX_SETTLE = 30");
    expect(settle).toContain("const MAX_CITY = 24");
    expect(settle).toContain("pieceDrop");
    expect(settle).toContain("upgradeRise");
    expect(settle).toContain("DURATION.place");
    expect(settle).toContain("DURATION.upgrade");
    expect(settle).toContain("techo a dos aguas");
    expect(settle).toContain("chimney");
    expect(settle).toContain("tower");
    expect(settle).toContain("0.12, 0.12");
    const roads = readFileSync("src/three/pieces/Roads.tsx", "utf8");
    expect(roads).toContain("instancedMesh");
    expect(roads).toContain("bevelEnabled: true");
    expect(roads).toContain("const MAX_ROAD = 90");
    const ports = readFileSync("src/three/pieces/Ports.tsx", "utf8");
    expect(ports).toContain("instancedMesh");
    expect(readFileSync("src/three/pieces/portLayout.ts", "utf8")).toContain("PORT_OFFSET");
    expect(ports).toContain("mat.dock");
    expect(ports).toContain("paintResource");
    const robber = readFileSync("src/three/pieces/Robber.tsx", "utf8");
    expect(robber).toContain("mat.robber");
    expect(robber).toContain("export const ROBBER_JUMP_MS = DURATION.robber");
    expect(robber).toContain("robberPose");
    expect(roads).toContain("roadLay");
  });

  it("HUD muestra glifo Okabe por asiento y el ladrón marca el hex bloqueado", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain("PLAYER_GLYPHS");
    expect(hud).toContain('data-testid={i === 0 ? "seat-glyph"');
    expect(PLAYER_GLYPHS).toEqual(["●", "▲", "■", "◆", "★", "✚"]);
    const field = readFileSync("src/three/pieces/HexField.tsx", "utf8");
    expect(field).toContain("RobberBlock");
    expect(field).toContain("LiteHexField");
    expect(field).not.toContain("numberOf");
  });

  it("el contorno oscuro contrasta ≥ 3:1 contra los seis terrenos HUD", () => {
    for (const terrain of Object.values(TERRAIN_COLOR)) {
      expect(contrast(TOKENS.outline, terrain)).toBeGreaterThanOrEqual(3);
    }
    for (const color of Object.values(COLOR_HEX)) {
      expect(contrast(TOKENS.outline, color)).toBeGreaterThanOrEqual(3);
    }
  });
});
