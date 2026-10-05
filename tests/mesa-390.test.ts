import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ownRobberToast } from "../src/play/phaseCue.ts";

describe("390 px con 6 jugadores", () => {
  it("bajo lg no duplica el scoreboard: los chips alcanzan y la columna es solo escritorio", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    const board = readFileSync("src/ui/Scoreboard.tsx", "utf8");
    expect(hud).toContain('data-testid="seat-chips"');
    expect(hud.match(/data-testid="seat-chips"/g)).toHaveLength(1);
    expect(hud).not.toContain('layout="row"');
    expect(hud).not.toContain("scoreboard-mobile");
    expect(hud).not.toContain("grid-cols-2");
    expect(board).not.toContain("grid-cols-2");
    expect(board).toContain('data-testid="scoreboard"');
    expect(hud).toMatch(/hidden w-72 flex-col gap-2 lg:flex"[\s\S]{0,80}data-testid="score-column"/);
    const chipsAt = hud.indexOf('data-testid="seat-chips"');
    const columnAt = hud.indexOf('data-testid="score-column"');
    expect(hud.slice(0, columnAt)).not.toContain("lg:hidden");
    expect(chipsAt).toBeGreaterThan(0);
    expect(columnAt).toBeGreaterThan(chipsAt);
  });

  it("el banner de turno es chico en el celu y recupera el tamaño desde lg", () => {
    const announce = readFileSync("src/ui/TurnAnnounce.tsx", "utf8");
    expect(announce).toContain("text-sm");
    expect(announce).toContain("lg:text-2xl");
    expect(announce).toContain("text-base");
    expect(announce).toContain("lg:text-3xl");
    expect(announce).toContain("py-1");
    expect(announce).not.toContain("text-xl");
    expect(announce).not.toContain("md:text-3xl");
    expect(announce).toContain('data-testid="setup-banner"');
    expect(announce).toContain('data-testid="turn-announce"');
  });

  it("Opciones se abre debajo de los chips, a la izquierda en escritorio", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    const chipsAt = hud.indexOf('data-testid="seat-chips"');
    const panelAt = hud.indexOf('data-testid="settings-panel"');
    expect(panelAt).toBeGreaterThan(chipsAt);
    expect(hud).toContain("top-full");
    expect(hud).not.toContain("top-14");
    expect(hud).not.toContain("md:top-16");
    expect(hud).toContain("lg:left-3");
    expect(hud).not.toContain("lg:right-3");
  });
});

describe("toast del ladrón propio", () => {
  it("al tocar una pieza en tu fase de ladrón dice el paso que falta", () => {
    expect(ownRobberToast("ladron", true, false)).toBe("Después de mover el ladrón");
    expect(ownRobberToast("ladron", true, true)).toBeNull();
    expect(ownRobberToast("ladron", false, false)).toBeNull();
    expect(ownRobberToast("principal", true, false)).toBeNull();
    const scene = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(scene).toContain("ownRobberToast");
    expect(scene.match(/ownRobberToast\(/g)?.length).toBe(2);
  });
});
