import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { detectLite } from "../src/three/graphics.ts";

describe("Iris ronda 4 rendimiento y UX", () => {
  it("detecta celu de gama media como liviano", () => {
    expect(detectLite({ width: 390, coarse: true, memory: 4, cores: 4 })).toBe(true);
    expect(detectLite({ width: 1440, coarse: false, cores: 8 })).toBe(false);
    expect(detectLite({ width: 1024, coarse: false, memory: 4, cores: 8 })).toBe(true);
  });

  it("el toggle de gráficos y el lazy del canvas están en el HUD / Game", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('data-testid="gfx-toggle"');
    expect(hud).toContain("Gráficos:");
    expect(hud).toContain("saveGraphicsMode");
    const game = readFileSync("src/screens/Game.tsx", "utf8");
    expect(game).toContain("lazy(");
    expect(game).toContain('import("../three/BoardScene")');
    expect(game).toContain("Suspense");
    const vite = readFileSync("vite.config.ts", "utf8");
    expect(vite).toMatch(/manualChunks|three/);
  });

  it("modo liviano apaga sombras, baja dpr y instancia hexes", () => {
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain("dpr={lite ? [1, 1] : [1, 1.5]}");
    expect(board).toContain("HexField");
    expect(board).toContain("GhostSpots");
    expect(board).toContain("<HexDecor hexes={view.hexes} lite={lite} robberHexId={view.robberHexId} />");
    expect(board).toContain("PerfProbe");
    const field = readFileSync("src/three/pieces/HexField.tsx", "utf8");
    expect(field).toContain("LiteHexField");
    const probe = readFileSync("src/three/perf/PerfProbe.tsx", "utf8");
    expect(probe).toContain("__colonosGfx");
    expect(probe).toContain("__colonosPerf");
    const decor = readFileSync("src/three/HexDecor.tsx", "utf8");
    expect(decor).toContain("lite ? 4 : 12");
    expect(decor).toContain("castShadow={!lite}");
    expect(decor).toContain("const capN = treeN");
  });

  it("puertos más afuera, acciones colapsables y chat al compositor", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    // La cruz va en la fila de pestañas del panel, no como pill flotando sobre el tablero.
    expect(hud).toContain('closeTestId="actions-hide"');
    expect(hud).not.toContain("absolute -top-9");
    expect(hud).toContain('data-testid="actions-show"');
    // Con el panel cerrado, tirar / pasar siguen a un clic en escritorio.
    expect(hud).toContain('data-testid="desk-primary"');
    const mesa = readFileSync("src/ui/MesaPanel.tsx", "utf8");
    expect(mesa).toContain('data-testid="chat-end"');
    expect(mesa).toContain('data-testid="chat-new"');
    expect(mesa).not.toContain("scrollIntoView");
    const ports = readFileSync("src/three/pieces/portLayout.ts", "utf8");
    expect(ports).toContain("PORT_OFFSET");
  });
});
