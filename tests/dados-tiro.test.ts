import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DIE_SIZE, FACE_NORMAL, diePipsGeometry, quatForFace } from "../src/three/dice/dieGeo.ts";
import { facePointingUp, planThrow, sampleDie, visualSeed } from "../src/three/dice/throw.ts";

const tray: [number, number, number] = [0, 0.04, 5.85];
const felt = tray[1] + 0.055;

function quatOf(s: { qx: number; qy: number; qz: number; qw: number }): THREE.Quaternion {
  return new THREE.Quaternion(s.qx, s.qy, s.qz, s.qw);
}

describe("cara del dado", () => {
  it("quatForFace deja esa cara hacia arriba, opuestos suman 7", () => {
    for (let n = 1; n <= 6; n++) {
      const q = quatForFace(n, 0.35 * n);
      const up = FACE_NORMAL[n]!.clone().applyQuaternion(q);
      expect(up.y).toBeGreaterThan(0.999);
      expect(Math.hypot(up.x, up.z)).toBeLessThan(0.02);
      expect(facePointingUp(q).face).toBe(n);
    }
    expect(FACE_NORMAL[1]!.dot(FACE_NORMAL[6]!)).toBeCloseTo(-1);
    expect(FACE_NORMAL[2]!.dot(FACE_NORMAL[5]!)).toBeCloseTo(-1);
    expect(FACE_NORMAL[3]!.dot(FACE_NORMAL[4]!)).toBeCloseTo(-1);
  });

  it("las pipas de arriba son el número de esa cara", () => {
    const geo = diePipsGeometry();
    const pos = geo.attributes.position!;
    const v = new THREE.Vector3();
    for (let n = 1; n <= 6; n++) {
      const q = quatForFace(n, 0.4);
      let maxY = -Infinity;
      const all: THREE.Vector3[] = [];
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyQuaternion(q);
        all.push(v.clone());
        if (v.y > maxY) maxY = v.y;
      }
      const centers: THREE.Vector3[] = [];
      for (const p of all) {
        if (p.y < maxY - 0.02) continue;
        if (!centers.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 0.09)) centers.push(p);
      }
      expect(centers.length, `cara ${n}`).toBe(n);
    }
  });
});

describe("tirada física compartida", () => {
  it("misma semilla, misma cinta; otra semilla, otro vuelo; la cara final es la del servidor", () => {
    const values: [number, number] = [3, 5];
    const a = planThrow({ seed: 42, values, tray });
    const b = planThrow({ seed: 42, values, tray });
    expect(a.a.map((s) => [s.px, s.py, s.pz, s.qx, s.qy, s.qz, s.qw])).toEqual(
      b.a.map((s) => [s.px, s.py, s.pz, s.qx, s.qy, s.qz, s.qw]),
    );
    const other = planThrow({ seed: 99, values, tray });
    const mid = Math.floor(a.a.length / 5);
    const moved =
      Math.hypot(a.a[mid]!.px - other.a[mid]!.px, a.a[mid]!.py - other.a[mid]!.py, a.a[mid]!.pz - other.a[mid]!.pz) >
      0.02;
    expect(moved).toBe(true);

    const end = a.a.at(-1)!;
    const endB = a.b.at(-1)!;
    expect(facePointingUp(quatOf(end)).face).toBe(3);
    expect(facePointingUp(quatOf(endB)).face).toBe(5);
    expect(facePointingUp(quatOf(end)).dot).toBeGreaterThan(0.99);
    expect(facePointingUp(quatOf(endB)).dot).toBeGreaterThan(0.99);
    expect(end.py - DIE_SIZE / 2).toBeGreaterThan(felt - 0.02);
    expect(endB.py - DIE_SIZE / 2).toBeGreaterThan(felt - 0.02);
    expect(a.hits.length).toBeGreaterThan(0);
    expect(a.settleAt).toBeLessThan(2.4);
    const jumped = Math.hypot(end.px - a.a.at(-2)!.px, end.py - a.a.at(-2)!.py, end.pz - a.a.at(-2)!.pz);
    expect(jumped).toBeLessThan(0.04);
  });

  it("las 36 caras caen planas, sin atravesar el paño, y el último frame no salta", () => {
    for (let d1 = 1; d1 <= 6; d1++) {
      for (let d2 = 1; d2 <= 6; d2++) {
        const clip = planThrow({ seed: 1000 + d1 * 10 + d2, values: [d1, d2], tray });
        for (const [die, value] of [
          [clip.a, d1],
          [clip.b, d2],
        ] as const) {
          const last = die.at(-1)!;
          const prev = die.at(-2)!;
          const up = facePointingUp(quatOf(last));
          expect(up.face, `${d1}+${d2}`).toBe(value);
          expect(up.dot, `${d1}+${d2}`).toBeGreaterThan(0.99);
          expect(last.py - DIE_SIZE / 2, `${d1}+${d2}`).toBeGreaterThan(felt - 0.02);
          expect(Math.hypot(last.px - prev.px, last.py - prev.py, last.pz - prev.pz)).toBeLessThan(0.05);
          const qDelta = quatOf(prev).angleTo(quatOf(last));
          expect(qDelta).toBeLessThan(0.15);
          for (const sample of die) {
            expect(sample.py - DIE_SIZE / 2, `${d1}+${d2} atraviesa`).toBeGreaterThan(felt - 0.012);
          }
        }
        const gap = Math.hypot(
          clip.a.at(-1)!.px - clip.b.at(-1)!.px,
          clip.a.at(-1)!.py - clip.b.at(-1)!.py,
          clip.a.at(-1)!.pz - clip.b.at(-1)!.pz,
        );
        expect(gap).toBeGreaterThan(DIE_SIZE * 0.9);
      }
    }
  });

  it("muestrear entre frames no teletransporta", () => {
    const clip = planThrow({ seed: 7, values: [1, 6], tray });
    const t = clip.a[10]!.t + 0.004;
    const s = sampleDie(clip.a, t);
    expect(s.t).toBeCloseTo(t);
    expect(s.py).toBeGreaterThan(Math.min(clip.a[10]!.py, clip.a[11]!.py) - 1e-6);
    expect(visualSeed(0, 4)).toBe(visualSeed(undefined, 4));
    expect(visualSeed(88, 4)).toBe(88);
  });
});
