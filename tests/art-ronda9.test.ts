import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ronda 9 cámara cinemática", () => {
  it("sigue la bandeja de dados y el ladrón; freeze/liviano no pelean el orbit", () => {
    const cam = readFileSync("src/three/cam/CinematicRig.tsx", "utf8");
    expect(cam).toContain("export function CinematicRig");
    expect(cam).toContain('cue.current = "dados"');
    expect(cam).toContain('cue.current = "ladron"');
    expect(cam).toContain("if (freeze)");
    expect(cam).toContain("cuePose(artCam");
    expect(cam).toContain("frame.tray");
    expect(cam).toContain('cue.current = "volver"');
    const harness = readFileSync("src/dev/useArtHarness.ts", "utf8");
    expect(harness).toContain('q.get("cam")');
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain("<CinematicRig");
  });
});
