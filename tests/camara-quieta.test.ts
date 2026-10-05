import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RESTORE_SHARPNESS,
  cameraCueForActor,
  cameraEventStamp,
  cueAfterEvent,
  restoreRemain,
  shouldKeepHeld,
  type CameraEvent,
} from "../src/play/spotlight.ts";

const AJENAS: CameraEvent[] = ["dice", "robber", "build", "trade", "card", "turn"];

describe("la cámara no sigue acciones de los demás", () => {
  it("dados, ladrón, obra, trueque, carta y turno ajeno no mueven la toma", () => {
    for (const kind of AJENAS) {
      expect(cameraCueForActor("me", "other", kind)).toBeNull();
      expect(cameraCueForActor("me", null, kind)).toBeNull();
    }
    expect(cameraCueForActor("me", "me", "build")).toBeNull();
    expect(cameraCueForActor("me", "me", "trade")).toBeNull();
    expect(cameraCueForActor("me", "me", "card")).toBeNull();
    expect(cameraCueForActor("me", "me", "turn")).toBeNull();
    expect(cameraCueForActor("me", "me", "dice")).toBe("dados");
    expect(cameraCueForActor("me", "me", "robber")).toBe("ladron");
  });

  it("el rig no recentra al cambiar el turno y Centrar sigue siendo un gesto propio", () => {
    const cam = readFileSync("src/three/cam/CinematicRig.tsx", "utf8");
    expect(cam).toContain("cameraCueForActor");
    expect(cam).not.toContain("lastTurn");
    expect(cam).not.toContain("view.currentPlayerId");
    expect(cam).toContain("recenterNonce");
    expect(cam).toContain('cue.current = "volver"');
    expect(cam).toContain('cue.current = "dados"');
    expect(cam).toContain('cue.current = "ladron"');
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain("recenterNonce");
    expect(hud).toContain("Centrar");
  });

  it("si una toma mueve la cámara, vuelve a la vista guardada en una transición corta", () => {
    expect(cueAfterEvent(true, true)).toBe("restaurar");
    expect(cueAfterEvent(true, false)).toBe("restaurar");
    expect(cueAfterEvent(false, true)).toBe("tactica");
    expect(cueAfterEvent(false, false)).toBe("volver");
    expect(shouldKeepHeld("dados")).toBe(true);
    expect(shouldKeepHeld("ladron")).toBe(true);
    expect(shouldKeepHeld("restaurar")).toBe(true);
    expect(shouldKeepHeld("tactica")).toBe(false);
    expect(shouldKeepHeld("intro")).toBe(false);
    expect(cameraEventStamp(true, 12)).toBe("d:12");
    expect(cameraEventStamp(false, null)).toBe("r:0");
    expect(RESTORE_SHARPNESS).toBeGreaterThan(4.2);
    expect(restoreRemain(0.6)).toBeLessThan(0.02);
    expect(restoreRemain(0.15)).toBeGreaterThan(0.2);
    const cam = readFileSync("src/three/cam/CinematicRig.tsx", "utf8");
    expect(cam).toContain("cueAfterEvent");
    expect(cam).toContain("shouldKeepHeld");
    expect(cam).toContain('cue.current === "restaurar"');
    expect(cam).toContain("RESTORE_SHARPNESS");
    expect(cam).toContain("held.current = null");
  });
});
