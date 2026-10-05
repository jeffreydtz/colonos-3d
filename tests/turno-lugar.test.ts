import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("indicador de turno sobre la mano", () => {
  it("es fijo, con nombre y reloj, y no vuelve arriba ni tapa el registro", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    const barAt = hud.indexOf("<TurnBar");
    const confirmAt = hud.indexOf("<ConfirmBar");
    const handAt = hud.indexOf("<HandStrip");
    expect(barAt).toBeGreaterThan(confirmAt);
    expect(barAt).toBeLessThan(handAt);
    expect(hud).toContain('data-testid="turn-bar"');
    expect(hud).not.toContain("turn-banner");
    expect(hud).toContain('data-hud-edge="bottom"');
    expect(hud).toContain("lg:pr-80");
    expect(hud).toContain("COLOR_HEX");
    expect(hud).toContain("<TurnClock");
    expect(hud).toContain("text-xl");
    expect(hud).toContain("aria-live");
    const clock = readFileSync("src/ui/TurnClock.tsx", "utf8");
    expect(clock).toContain("text-2xl");
    expect(clock).toContain("md:text-3xl");
    expect(clock).not.toContain("playSfx");
    expect(clock).toContain('data-testid="hud-clock"');
  });

  it("el aviso temporal «Es tu turno» y el sonido siguen", () => {
    const announce = readFileSync("src/ui/TurnAnnounce.tsx", "utf8");
    const cues = readFileSync("src/audio/cues.ts", "utf8");
    const headline = readFileSync("src/play/setupCue.ts", "utf8");
    expect(announce).toContain("turnHeadline");
    expect(announce).toContain('data-testid="turn-announce"');
    expect(announce).toContain('data-testid="setup-banner"');
    expect(headline).toContain('return yourTurn ? "Es tu turno"');
    expect(cues).toContain('name: yours ? "turn" : "turn_soft"');
  });
});
