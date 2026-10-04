import * as THREE from "three";
import { mergeSolid } from "../geo";

export const DIE_SIZE = 0.42;
const HALF = DIE_SIZE / 2;

/** Caras locales: opuestos suman 7. +Y=1, -Y=6, +X=2, -X=5, +Z=3, -Z=4. */
export const FACE_NORMAL: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(0, 1, 0),
  2: new THREE.Vector3(1, 0, 0),
  3: new THREE.Vector3(0, 0, 1),
  4: new THREE.Vector3(0, 0, -1),
  5: new THREE.Vector3(-1, 0, 0),
  6: new THREE.Vector3(0, -1, 0),
};

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export function roundedBox(size: number, radius: number, seg = 6): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
  const pos = g.attributes.position!;
  const v = new THREE.Vector3();
  const half = size / 2 - radius;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const cx = THREE.MathUtils.clamp(v.x, -half, half);
    const cy = THREE.MathUtils.clamp(v.y, -half, half);
    const cz = THREE.MathUtils.clamp(v.z, -half, half);
    const dx = v.x - cx;
    const dy = v.y - cy;
    const dz = v.z - cz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-6) {
      v.set(cx + (dx / len) * radius, cy + (dy / len) * radius, cz + (dz / len) * radius);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function pipCyl(u: number, v: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.034, 0.03, 0.03, 12);
  g.translate(u * 0.108, HALF - 0.006, v * 0.108);
  return g;
}

function pipParts(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let face = 1; face <= 6; face++) {
    q.setFromUnitVectors(up, FACE_NORMAL[face]!);
    for (const [u, v] of PIPS[face]!) {
      const p = pipCyl(u, v);
      p.applyQuaternion(q);
      parts.push(p);
    }
  }
  return parts;
}

/** Cuerpo marfil redondeado, sin pipas (van en `diePipsGeometry`). */
export function dieGeometry(): THREE.BufferGeometry {
  const g = roundedBox(DIE_SIZE, 0.055, 5);
  g.computeVertexNormals();
  return g;
}

/** Pipas oscuras en una geometría, hijas del dado. */
export function diePipsGeometry(): THREE.BufferGeometry {
  const g = mergeSolid(pipParts());
  g.computeVertexNormals();
  return g;
}

export function quatForFace(value: number, twist = 0): THREE.Quaternion {
  const n = FACE_NORMAL[value] ?? FACE_NORMAL[1]!;
  const q = new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 1, 0));
  const t = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist);
  return t.multiply(q);
}
