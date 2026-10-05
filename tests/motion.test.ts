import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  boardRise,
  pieceDrop,
  roadLay,
  robberPose,
  tileOffset,
  tileUnit,
  upgradeRise,
} from "../src/motion/curves.ts";
import { introPlaying, resetBoardIntro, riseY, boardIntroT0 } from "../src/three/boardIntro.ts";
import {
  BEZIER,
  CAMERA_SHARP,
  DURATION,
  HARVEST_ARC,
  SEA_DRIFT,
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  motionMs,
} from "../src/motion/tokens.ts";

describe("tokens de motion", () => {
  it("las curvas salen de 0 y llegan a 1, y el back se pasa un poco", () => {
    for (const ease of [easeOutCubic, easeInCubic, easeInOutCubic, easeOutBack]) {
      expect(ease(0)).toBeCloseTo(0);
      expect(ease(1)).toBeCloseTo(1);
    }
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeInCubic(0.5)).toBeLessThan(0.5);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeOutBack(0.7)).toBeGreaterThan(1);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });

  it("liviano acorta y reducir movimiento deja la pose final", () => {
    expect(motionMs(100)).toBe(100);
    expect(motionMs(100, { lite: true })).toBe(62);
    expect(motionMs(100, { reduce: true })).toBe(0);
    expect(motionMs(100, { lite: true, reduce: true })).toBe(0);
  });

  it("cosecha, cámara y carta conservan los tiempos ya medidos", () => {
    expect(DURATION.harvestMine).toBe(780);
    expect(DURATION.harvestOther).toBe(460);
    expect(DURATION.harvestLiteMine).toBe(420);
    expect(DURATION.harvestReduce).toBe(160);
    expect(DURATION.harvestLimit).toBe(1400);
    expect(DURATION.cameraIntro).toBe(1700);
    expect(DURATION.cameraDice).toBe(2600);
    expect(DURATION.cameraRobber).toBe(1500);
    expect(CAMERA_SHARP.intro).toBe(2.2);
    expect(CAMERA_SHARP.event).toBe(4.2);
    expect(CAMERA_SHARP.restore).toBeGreaterThan(CAMERA_SHARP.event);
    expect(DURATION.cardBurst).toBe(900);
    expect(BEZIER.outCubic).toBe("cubic-bezier(0.33, 0, 0.2, 1)");
    expect(SEA_DRIFT.x).toBeGreaterThan(0);
    expect(SEA_DRIFT.y).toBeGreaterThan(0);
    expect(HARVEST_ARC.fullLift).toBe(-72);
    expect(HARVEST_ARC.otherLift).toBe(-18);
  });

  it("el CSS, la cosecha y la cámara leen estos números", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toContain(`--m-burst: ${DURATION.cardBurst}ms`);
    expect(css).toContain(`--m-rise: ${DURATION.cardRise}ms`);
    expect(css).toContain(`--m-flip: ${DURATION.cardFlip}ms`);
    expect(css).toContain(`--m-tear: ${DURATION.cardTear}ms`);
    expect(css).toContain(`--m-pack: ${DURATION.cardPack}ms`);
    expect(css).toContain(`--m-tilt: ${DURATION.cardTilt}ms`);
    expect(css).toContain(`--m-victory: ${DURATION.victory}ms`);
    expect(css).toContain(`--m-catch: ${DURATION.handCatch}ms`);
    expect(css).toContain(`--m-seat: ${DURATION.seatPulse}ms`);
    expect(css).toContain(`--m-out: ${BEZIER.outCubic}`);
    expect(css).toContain(`--m-back: ${BEZIER.outBack}`);
    expect(css).toContain(`--m-inout: ${BEZIER.inOut}`);
    expect(css).toContain(`--m-in: ${BEZIER.inCubic}`);
    expect(css).toContain(`--m-flip-ease: ${BEZIER.cardFlip}`);
    expect(css).toContain("var(--m-out)");
    expect(css).toContain(".colonos-victory");
    const cam = readFileSync("src/three/cam/CinematicRig.tsx", "utf8");
    expect(cam).toContain("DURATION.cameraDice");
    expect(cam).toContain("DURATION.cameraRobber");
    expect(cam).toContain("DURATION.cameraIntro");
    expect(cam).toContain("CAMERA_SHARP.intro");
    expect(cam).toContain("RESTORE_SHARPNESS");
    expect(readFileSync("src/play/spotlight.ts", "utf8")).toContain("CAMERA_SHARP.restore");
    const harvest = readFileSync("src/play/harvest.ts", "utf8");
    expect(harvest).toContain("DURATION.harvestMine");
    expect(harvest).toContain("HARVEST_ARC.otherLift");
    expect(readFileSync("src/ui/Hud.tsx", "utf8")).toContain("colonos-victory");
  });
});

describe("curvas de las piezas", () => {
  it("el poblado cae, se aplasta y termina apoyado", () => {
    const start = pieceDrop(0);
    expect(start.y).toBeGreaterThan(0.5);
    expect(start.sy).toBeGreaterThan(start.sx);
    const midAir = pieceDrop(0.2);
    expect(midAir.y).toBeLessThan(start.y);
    expect(midAir.y).toBeGreaterThan(0);
    const hit = pieceDrop(0.65);
    expect(hit.y).toBe(0);
    expect(hit.sy).toBeLessThan(1);
    expect(hit.sx).toBeGreaterThan(1);
    const hop = pieceDrop(0.82);
    expect(hop.y).toBeGreaterThan(0);
    expect(hop.y).toBeLessThan(0.08);
    const end = pieceDrop(1);
    expect(end).toEqual({ y: 0, sx: 1, sy: 1, sz: 1 });
    expect(pieceDrop(0.4, true)).toEqual(end);
  });

  it("la ciudad crece desde la base y puede pasarse un pelo", () => {
    const start = upgradeRise(0);
    expect(start.sy).toBeLessThan(0.3);
    expect(start.sx).toBeLessThan(1);
    let over = false;
    for (let i = 1; i < 20; i++) if (upgradeRise(i / 20).sy > 1) over = true;
    expect(over).toBe(true);
    expect(upgradeRise(1)).toEqual({ y: 0, sx: 1, sy: 1, sz: 1 });
    expect(upgradeRise(0.5, true).sy).toBe(1);
  });

  it("el camino se estira y baja", () => {
    const a = roadLay(0);
    const b = roadLay(0.4);
    const c = roadLay(1);
    expect(a.y).toBeGreaterThan(b.y);
    expect(b.length).toBeGreaterThan(a.length);
    expect(b.length).toBeLessThan(1);
    expect(c).toEqual({ y: 0, width: 1, length: 1, thick: 1 });
    expect(roadLay(0.2, true).length).toBe(1);
  });

  it("el ladrón levanta, cruza y apoya; liviano es más bajo; reducir lo deja puesto", () => {
    const from = { x: 0, y: 0.2, z: 0 };
    const to = { x: 2, y: 0.2, z: 1 };
    expect(robberPose(0, from, to)).toEqual(from);
    const lift = robberPose(0.1, from, to);
    expect(lift.x).toBeCloseTo(from.x);
    expect(lift.y).toBeGreaterThan(from.y);
    const air = robberPose(0.5, from, to);
    expect(air.x).toBeGreaterThan(from.x);
    expect(air.x).toBeLessThan(to.x);
    expect(air.y).toBeGreaterThan(lift.y);
    const lite = robberPose(0.5, from, to, { lite: true });
    expect(lite.y).toBeLessThan(air.y);
    const land = robberPose(0.9, from, to);
    expect(land.x).toBeCloseTo(to.x);
    expect(land.z).toBeCloseTo(to.z);
    expect(land.y).toBeGreaterThan(to.y);
    expect(robberPose(1, from, to)).toEqual(to);
    expect(robberPose(0.4, from, to, { reduce: true })).toEqual(to);
  });

  it("las losetas salen del agua, más lejos más tarde, y reducir las deja puestas", () => {
    expect(boardRise(0).y).toBeLessThan(-0.4);
    expect(boardRise(0.5).y).toBeGreaterThan(boardRise(0).y);
    expect(boardRise(0.5).y).toBeLessThan(0);
    expect(boardRise(1).y).toBe(0);
    expect(boardRise(0.2, true).y).toBe(0);
    expect(tileUnit(1000, 1000, 0)).toBe(0);
    expect(tileUnit(1000 + DURATION.boardRise, 1000, 0)).toBe(1);
    const near = tileUnit(1200, 1000, 0);
    const far = tileUnit(1200, 1000, 3);
    expect(near).toBeGreaterThan(far);
    expect(tileOffset(0, 0, 1, { reduce: true })).toBe(0);
    expect(DURATION.place).toBeGreaterThan(280);
    expect(DURATION.robber).toBeGreaterThan(550);
  });

  it("un tablero nuevo vuelve a salir del agua y reducir movimiento no lo mueve", () => {
    resetBoardIntro();
    const ids = "a|b";
    const hexes = [
      { q: 0, r: 0 },
      { q: 2, r: 0 },
    ];
    expect(introPlaying(ids, hexes, 1000)).toBe(true);
    const started = boardIntroT0(ids, 1000);
    expect(started).toBe(1000);
    expect(riseY(ids, 0, 0, 1000)).toBeLessThan(0);
    expect(riseY(ids, 2, 0, 1000)).toBeLessThan(riseY(ids, 0, 0, 1100));
    expect(introPlaying(ids, hexes, started + 8000)).toBe(false);
    expect(riseY(ids, 0, 0, started + 8000)).toBe(0);
    expect(riseY(ids, 0, 0, started + 10, { reduce: true })).toBe(0);
    expect(introPlaying(ids, hexes, started + 10, { reduce: true })).toBe(false);
    resetBoardIntro();
    const field = readFileSync("src/three/pieces/HexField.tsx", "utf8");
    expect(field).toContain("riseY");
    expect(field).not.toContain("onClick=");
    expect(readFileSync("src/three/pieces/Settlements.tsx", "utf8")).toContain("hoverId");
    expect(readFileSync("src/three/pieces/Roads.tsx", "utf8")).toContain("hoverId");
    expect(readFileSync("src/three/env/Sea.tsx", "utf8")).toContain("reduceMotion()");
    expect(readFileSync("src/three/env/Sea.tsx", "utf8")).toContain("SEA_DRIFT");
  });
});
