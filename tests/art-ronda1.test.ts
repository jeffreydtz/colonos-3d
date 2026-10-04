import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ronda 1 entorno de mesa", () => {
  it("BoardScene usa mesa, lighting, ACES y no el vacío azul hardcodeado", () => {
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain("ACESFilmicToneMapping");
    expect(board).toContain("<Lighting");
    expect(board).toContain("<Table");
    expect(board).toContain("<SkyDome");
    expect(board).toContain('shadows={lite ? false : "soft"}');
    expect(board).toContain("dpr={lite ? [1, 1] : [1, 1.5]}");
    expect(board).not.toContain('args={["#062033"]}');
  });

  it("el harness acepta ?theme= y el HUD cicla ambiente", () => {
    const harness = readFileSync("src/dev/useArtHarness.ts", "utf8");
    expect(harness).toContain('q.get("theme")');
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('data-testid="theme-toggle"');
    expect(hud).toContain("saveTheme");
  });

  it("materiales de entorno tienen nombre para Spector", () => {
    const table = readFileSync("src/three/env/Table.tsx", "utf8");
    expect(table).toContain('name="mat.table"');
    expect(table).not.toContain("mat.felt");
    expect(readFileSync("src/three/env/Frame.tsx", "utf8")).toContain('name="mat.frame"');
    expect(readFileSync("src/three/env/Sea.tsx", "utf8")).toContain('name="mat.sea"');
    const light = readFileSync("src/three/env/Lighting.tsx", "utf8");
    expect(light).toContain("RoomEnvironment");
  });
});
