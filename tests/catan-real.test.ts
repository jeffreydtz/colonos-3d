import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildBoard, numbersNotRedAdjacent, twinNumberPairs } from "../shared/board.ts";
import { mulberry32 } from "../shared/rng.ts";
import type { BoardKind } from "../shared/constants.ts";
import { landAxials } from "../shared/hex.ts";
import type { ClientView } from "../shared/types.ts";
import { CRAG_H, CRAG_R, peakPose } from "../src/three/decorLayout.ts";
import { TILE_TOP } from "../src/three/geo.ts";
import { boardLayout, framing } from "../src/three/layout.ts";
import { fitBoard } from "../src/three/cam/fit.ts";
import { cuePose, lensFor } from "../src/three/cam/poses.ts";
import { PLANK_W } from "../src/three/pieces/Ports.tsx";
import { plankShores, portAnchor, portPairs } from "../src/three/pieces/portLayout.ts";

type Board = ReturnType<typeof buildBoard>;

/** Aristas de costa en orden de recorrido (una vuelta a la isla). */
function coastWalk(b: Board) {
  const coast = Object.values(b.edges).filter((e) => e.hexIds.length === 1);
  const byVertex = new Map<string, typeof coast>();
  for (const e of coast) for (const v of e.vertexIds) byVertex.set(v, [...(byVertex.get(v) ?? []), e]);
  const order: typeof coast = [];
  const seen = new Set<string>();
  let cur: (typeof coast)[number] | undefined = coast[0];
  let from = cur?.vertexIds[0];
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    order.push(cur);
    const next: string = cur.vertexIds[0] === from ? cur.vertexIds[1] : cur.vertexIds[0];
    from = next;
    cur = (byVertex.get(next) ?? []).find((e) => !seen.has(e.id));
  }
  return order;
}

describe("tablero como el reglamento", () => {
  const cases: Array<[BoardKind, number, number]> = [
    ["standard", 30, 9],
    ["expansion", 38, 11],
  ];

  it.each(cases)("%s: %i aristas de costa y %i puertos repartidos parejo (huecos de 3 o 4)", (kind, coastN, portN) => {
    for (let seed = 1; seed <= 120; seed++) {
      const b = buildBoard(mulberry32(seed), kind);
      const walk = coastWalk(b);
      expect(walk).toHaveLength(coastN);
      const at = walk
        .map((e, i) => (b.vertices[e.vertexIds[0]]!.port && b.vertices[e.vertexIds[1]]!.port ? i : -1))
        .filter((i) => i >= 0);
      expect(at).toHaveLength(portN);
      const gaps = at.map((i, k) => (at[(k + 1) % at.length]! - i + coastN) % coastN);
      for (const g of gaps) expect([3, 4]).toContain(g);
      // Ningún tramo largo de costa sin puerto: el máximo hueco no pasa de 4 aristas.
      expect(Math.max(...gaps)).toBeLessThanOrEqual(4);
    }
  });

  it.each(cases)("%s: cada puerto tiene dos pasarelas, una a cada vértice que comercia", (kind) => {
    const b = buildBoard(mulberry32(3), kind);
    for (const pair of portPairs(Object.values(b.vertices) as ClientView["vertices"])) {
      const { token, a, b: v2 } = portAnchor(pair);
      const shores = plankShores(a, v2, token);
      expect(shores).toHaveLength(2);
      expect(shores[0]!.distanceTo(a)).toBeLessThan(0.1);
      expect(shores[1]!.distanceTo(v2)).toBeLessThan(0.1);
    }
    expect(PLANK_W).toBeGreaterThanOrEqual(0.1);
  });

  it.each(["standard", "expansion"] as const)("%s: 6 y 8 nunca vecinos, y dos fichas iguales tampoco", (kind) => {
    for (let seed = 1; seed <= 200; seed++) {
      const b = buildBoard(mulberry32(seed), kind);
      expect(numbersNotRedAdjacent(b.hexes)).toBe(true);
      expect(twinNumberPairs(b.hexes)).toBe(0);
      expect(b.hexes.filter((h) => h.terrain === "desierto").every((h) => h.number == null)).toBe(true);
    }
  });
});

describe("montañas y toma de dados", () => {
  const ids = ["0,0", "2,-1", "-1,2", "1,1", "-2,0", "0,-2", "3,-3"];

  it("macizo: dos cumbres nevadas más anchas que altas; el resto, roca baja sin nieve", () => {
    for (const per of [6, 3]) {
      for (const id of ids) {
        const poses = Array.from({ length: per }, (_, k) => peakPose(id, k, per));
        expect(poses.filter((p) => p.snow)).toHaveLength(2);
        for (const p of poses) {
          const width = 2 * CRAG_R * p.sxz;
          const height = CRAG_H * p.sy;
          // Más alto que ancho se leía como agujas de un skyline de juguete.
          expect(width).toBeGreaterThan(height * 1.1);
          if (!p.snow) expect(height).toBeLessThan(CRAG_H * 0.6);
        }
      }
    }
  });

  it.each([
    { label: "celular 390×844", aspect: 390 / 844, safe: { top: 0.2, bottom: 0.18, left: 0.03, right: 0.03 } },
    { label: "escritorio 1440×900", aspect: 1440 / 900, safe: { top: 0.14, bottom: 0.1, left: 0.01, right: 0.24 } },
  ])("$label: la toma de dados se acerca pero no deja costa afuera", ({ aspect, safe }) => {
    for (const kind of ["standard", "expansion"] as const) {
      const L = boardLayout(landAxials(kind));
      const f = framing(L, aspect);
      const center = new THREE.Vector3(L.center.x, TILE_TOP, L.center.y);
      const lens = lensFor(aspect);
      const opts = { elevation: lens.elevation, fovY: lens.fovY, aspect, safe };
      const home = fitBoard(f.points, center, opts);
      const dice = fitBoard(f.dice, center, opts);
      const pose = cuePose("dados", { pos: home.position, target: home.target }, f.tray, undefined, {
        pos: dice.position,
        target: dice.target,
      });
      expect(pose.pos.distanceTo(dice.position)).toBe(0);
      expect(dice.distance).toBeLessThanOrEqual(home.distance);
      const cam = new THREE.PerspectiveCamera(lens.fovY, aspect, 0.1, 1000);
      cam.position.copy(pose.pos);
      cam.lookAt(pose.target);
      cam.updateMatrixWorld();
      for (const p of L.coast) {
        const ndc = new THREE.Vector3(p.x, TILE_TOP, p.y).project(cam);
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
      }
    }
  });
});
