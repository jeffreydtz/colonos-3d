import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ronda 5 sonido", () => {
  it("Web Audio sin assets; impacto de dado por impulso", () => {
    const sfx = readFileSync("src/audio/sfx.ts", "utf8");
    expect(sfx).not.toContain("howler");
    expect(sfx).toContain("AudioContext");
    expect(sfx).toContain("webkitAudioContext");
    expect(sfx).toContain("export function playDiceHit");
    expect(sfx).toContain("impulse");
    expect(sfx).toContain("export function installAudioUnlock");
    expect(sfx).toContain("export function setKeepAlive");
    expect(sfx).toContain("0.0006");
    expect(sfx).toContain("scheduleTurnAlarms");
    const dir = readFileSync("src/audio/SfxDirector.tsx", "utf8");
    expect(dir).toContain("playSfx");
    expect(dir).toContain("nextCues");
    expect(dir).toContain("scheduleTurnAlarms");
    expect(dir).toContain("installAudioUnlock");
    expect(dir).toContain("setKeepAlive");
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('data-testid="sfx-toggle"');
    expect(hud).toContain('data-testid="sfx-volume"');
    expect(hud).toContain("sfx-cat-");
    const game = readFileSync("src/screens/Game.tsx", "utf8");
    expect(game).toContain("SfxDirector");
    const pkg = readFileSync("package.json", "utf8");
    expect(pkg).not.toContain("howler");
    expect(pkg).toContain("cannon-es");
  });
});
