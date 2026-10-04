import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ronda 5 sonido", () => {
  it("Howler más WebAudio; impacto de dado por impulso", () => {
    const sfx = readFileSync("src/audio/sfx.ts", "utf8");
    expect(sfx).toContain('from "howler"');
    expect(sfx).toContain("AudioContext");
    expect(sfx).toContain("export function playDiceHit");
    expect(sfx).toContain("impulse");
    expect(sfx).toContain("Howler.mute");
    const dir = readFileSync("src/audio/SfxDirector.tsx", "utf8");
    expect(dir).toContain("playSfx");
    expect(dir).toContain("dice_throw");
    expect(dir).toContain("build");
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('data-testid="sfx-toggle"');
    const game = readFileSync("src/screens/Game.tsx", "utf8");
    expect(game).toContain("SfxDirector");
    const pkg = readFileSync("package.json", "utf8");
    expect(pkg).toContain("howler");
    expect(pkg).toContain("cannon-es");
  });
});
