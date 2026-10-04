import { useFrame } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { COLOR_HEX } from "@shared/constants";
import type { ClientView, ColorId } from "@shared/types";
import { reduceMotion } from "../../audio/sfx";
import { useApp } from "../../store";
import { PLAYER_GLYPHS } from "../../theme/tokens";
import { S, PIECE_SCALE, PIECE_Y, mergeSolid } from "../geo";
import { getMaterials } from "../materials";

const MAX_SETTLE = 30;
const MAX_CITY = 24;
const PLACE_MS = 280;

function gableHouse(halfW: number, wallH: number, peak: number, depth: number, bevel = 0.012): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-halfW, 0);
  s.lineTo(halfW, 0);
  s.lineTo(halfW, wallH);
  s.lineTo(0, peak);
  s.lineTo(-halfW, wallH);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

function houseGeo(): THREE.BufferGeometry {
  // techo a dos aguas que vuela sobre paredes más angostas: casa de madera, no un cubo
  const body = gableHouse(0.115, 0.1, 0.28, 0.17, 0.014);
  const plinth = new THREE.BoxGeometry(0.3, 0.035, 0.24);
  plinth.translate(0, 0.016, 0);
  const eaveL = new THREE.BoxGeometry(0.022, 0.03, 0.28);
  eaveL.rotateZ(0.7);
  eaveL.translate(-0.128, 0.148, 0);
  const eaveR = new THREE.BoxGeometry(0.022, 0.03, 0.28);
  eaveR.rotateZ(-0.7);
  eaveR.translate(0.128, 0.148, 0);
  const ridge = new THREE.CylinderGeometry(0.016, 0.016, 0.2, 8);
  ridge.rotateX(Math.PI / 2);
  ridge.translate(0, 0.272, 0);
  const chimney = new THREE.CylinderGeometry(0.022, 0.026, 0.1, 8);
  chimney.translate(0.06, 0.26, 0.03);
  const cap = new THREE.CylinderGeometry(0.03, 0.03, 0.016, 8);
  cap.translate(0.06, 0.312, 0.03);
  const door = new THREE.BoxGeometry(0.045, 0.07, 0.016);
  door.translate(0, 0.055, 0.11);
  const window = new THREE.BoxGeometry(0.04, 0.035, 0.012);
  window.translate(0.06, 0.11, 0.11);
  return mergeSolid([plinth, body, eaveL, eaveR, ridge, chimney, cap, door, window]);
}

function cityGeo(): THREE.BufferGeometry {
  const keep = gableHouse(0.14, 0.14, 0.28, 0.24, 0.012);
  keep.translate(0.07, 0, 0.03);
  const tower = new THREE.CylinderGeometry(0.068, 0.078, 0.26, 10);
  tower.translate(-0.12, 0.13, -0.04);
  const collar = new THREE.CylinderGeometry(0.082, 0.082, 0.03, 10);
  collar.translate(-0.12, 0.26, -0.04);
  const spire = new THREE.ConeGeometry(0.08, 0.12, 10);
  spire.translate(-0.12, 0.335, -0.04);
  const merlonA = new THREE.BoxGeometry(0.028, 0.04, 0.028);
  merlonA.translate(-0.12, 0.285, -0.1);
  const merlonB = new THREE.BoxGeometry(0.028, 0.04, 0.028);
  merlonB.translate(-0.12, 0.285, 0.02);
  const merlonC = new THREE.BoxGeometry(0.028, 0.04, 0.028);
  merlonC.translate(-0.05, 0.285, -0.04);
  const wing = gableHouse(0.09, 0.12, 0.22, 0.16, 0.01);
  wing.translate(0.16, 0, 0.09);
  return mergeSolid([keep, tower, collar, spire, merlonA, merlonB, merlonC, wing]);
}

function glyphAtlas(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 384, 64);
  g.fillStyle = "#f4e9d0";
  g.font = "700 56px Fraunces, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  PLAYER_GLYPHS.forEach((gl, i) => {
    g.fillText(gl, 32 + i * 64, 34);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Settlements({
  view,
  lite,
  freeze = false,
}: {
  view: ClientView;
  lite: boolean;
  freeze?: boolean;
}) {
  const settle = useMemo(() => view.buildings.filter((b) => b.kind === "poblado"), [view.buildings]);
  const cities = useMemo(() => view.buildings.filter((b) => b.kind === "ciudad"), [view.buildings]);
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of view.players) m.set(p.id, COLOR_HEX[p.color as ColorId]);
    return m;
  }, [view.players]);
  const seatOf = useMemo(() => {
    const m = new Map<string, number>();
    view.players.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [view.players]);
  const hGeo = useMemo(() => houseGeo(), []);
  const cGeo = useMemo(() => cityGeo(), []);
  const mats = getMaterials(lite ? "lite" : "normal");
  const pieceMat = useMemo(() => {
    const m = mats.piece.clone();
    m.name = "mat.piece";
    return m;
  }, [mats]);
  const outlineMat = useMemo(() => {
    const m = mats.outline.clone();
    m.name = "mat.outline";
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n transformed += normal * 0.005;",
      );
    };
    return m;
  }, [mats]);
  const sRef = useRef<THREE.InstancedMesh>(null);
  const sOut = useRef<THREE.InstancedMesh>(null);
  const cRef = useRef<THREE.InstancedMesh>(null);
  const cOut = useRef<THREE.InstancedMesh>(null);
  const gRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const glyphs = useMemo(() => glyphAtlas(), []);
  const born = useRef(new Map<string, number>());

  function stampBorn(tNow: number) {
    for (const b of [...settle, ...cities]) {
      if (!born.current.has(b.vertexId)) {
        born.current.set(b.vertexId, freeze ? tNow - PLACE_MS : tNow);
      }
    }
  }

  function place(
    mesh: THREE.InstancedMesh | null,
    items: typeof settle,
    y: number,
    scale: number,
    tNow: number,
  ) {
    if (!mesh) return;
    items.forEach((b, i) => {
      const v = view.vertices.find((x) => x.id === b.vertexId);
      if (!v) return;
      const t0 = born.current.get(b.vertexId) ?? tNow;
      const u = freeze ? 1 : Math.min(1, (tNow - t0) / PLACE_MS);
      // Entra con un pequeño rebote, como si la apoyaras en el vértice.
      const c1 = 1.35;
      const ease = u >= 1 ? 1 : 1 + (c1 + 1) * (u - 1) ** 3 + c1 * (u - 1) ** 2;
      dummy.position.set(v.x * S, y, v.y * S);
      dummy.rotation.set(0, (seatOf.get(b.playerId) ?? 0) * 0.4, 0);
      dummy.scale.setScalar(Math.max(0.04, scale * ease));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.set(colorOf.get(b.playerId) ?? "#ccc");
      mesh.setColorAt?.(i, col);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  function layoutGlyphs() {
    const gMesh = gRef.current;
    if (!gMesh) return;
    const all = [...settle, ...cities];
    all.forEach((b, i) => {
      const v = view.vertices.find((x) => x.id === b.vertexId);
      if (!v) return;
      dummy.position.set(v.x * S, PIECE_Y + (b.kind === "ciudad" ? 0.3 : 0.282) * PIECE_SCALE, v.y * S);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      gMesh.setMatrixAt(i, dummy.matrix);
    });
    gMesh.count = all.length;
    gMesh.instanceMatrix.needsUpdate = true;
    gMesh.computeBoundingSphere();
    const cells = new Float32Array(Math.max(all.length, 1) * 2);
    all.forEach((b, i) => {
      const seat = seatOf.get(b.playerId) ?? 0;
      cells[i * 2] = (seat % 6) / 6;
      cells[i * 2 + 1] = 0;
    });
    gMesh.geometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
  }

  function placeAll(tNow: number) {
    stampBorn(tNow);
    place(sRef.current, settle, PIECE_Y, PIECE_SCALE, tNow);
    place(sOut.current, settle, PIECE_Y, PIECE_SCALE * 1.025, tNow);
    place(cRef.current, cities, PIECE_Y, PIECE_SCALE, tNow);
    place(cOut.current, cities, PIECE_Y, PIECE_SCALE * 1.02, tNow);
  }

  useLayoutEffect(() => {
    placeAll(performance.now());
    layoutGlyphs();
  }, [settle, cities, view.vertices, colorOf, seatOf, freeze, lite]);

  useFrame(() => {
    if (freeze) return;
    placeAll(performance.now());
  });

  const glyphMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      map: glyphs,
      transparent: true,
      depthWrite: false,
      name: "mat.glyph",
    });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aCell;")
        .replace(
          "#include <uv_vertex>",
          "#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * vec2(0.1667, 1.0) + aCell;\n#endif\n",
        );
    };
    return m;
  }, [glyphs]);

  return (
    <group>
      <instancedMesh ref={sRef} args={[hGeo, undefined, MAX_SETTLE]} material={pieceMat} castShadow={!lite} frustumCulled={false} />
      {!lite && (
        <instancedMesh ref={sOut} args={[hGeo, undefined, MAX_SETTLE]} material={outlineMat} frustumCulled={false} raycast={() => {}} />
      )}
      <instancedMesh ref={cRef} args={[cGeo, undefined, MAX_CITY]} material={pieceMat} castShadow={!lite} frustumCulled={false} />
      {!lite && (
        <instancedMesh ref={cOut} args={[cGeo, undefined, MAX_CITY]} material={outlineMat} frustumCulled={false} raycast={() => {}} />
      )}
      <instancedMesh
        ref={gRef}
        args={[undefined, glyphMat, MAX_SETTLE + MAX_CITY]}
        frustumCulled={false}
        raycast={() => {}}
      >
        <planeGeometry args={[0.12, 0.12]} />
      </instancedMesh>
    </group>
  );
}

export function GhostSpots({
  spots,
  accent,
  onPick,
}: {
  spots: Array<{ id: string; x: number; y: number }>;
  accent: string;
  onPick: (id: string) => void;
}) {
  const ring = useRef<THREE.InstancedMesh>(null);
  const rim = useRef<THREE.InstancedMesh>(null);
  const hit = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const freeze = useApp((s) => s.artFreeze);
  const layout = useCallback(
    (scale: number) => {
      for (const mesh of [ring.current, rim.current, hit.current]) {
        if (!mesh) continue;
        spots.forEach((s, i) => {
          dummy.position.set(s.x * S, PIECE_Y + 0.006, s.y * S);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.scale.setScalar(mesh === hit.current ? 1 : scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.count = spots.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    },
    [spots, dummy],
  );
  useLayoutEffect(() => {
    layout(1);
  }, [layout]);
  useFrame(({ clock }) => {
    if (freeze || reduceMotion() || spots.length === 0) return;
    layout(1 + Math.sin(clock.elapsedTime * 3.4) * 0.09);
  });
  if (spots.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={rim} args={[undefined, undefined, Math.max(1, spots.length)]} raycast={() => {}} renderOrder={2}>
        <ringGeometry args={[0.168, 0.186, 28]} />
        <meshBasicMaterial color="#120c08" transparent opacity={0.7} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={ring} args={[undefined, undefined, Math.max(1, spots.length)]} raycast={() => {}} renderOrder={3}>
        <ringGeometry args={[0.148, 0.168, 28]} />
        <meshBasicMaterial color={accent} depthWrite={false} />
      </instancedMesh>
      <instancedMesh
        ref={hit}
        args={[undefined, undefined, Math.max(1, spots.length)]}
        onClick={(e) => {
          e.stopPropagation();
          const idx = e.instanceId;
          const id = idx != null ? spots[idx]?.id : undefined;
          if (id) onPick(id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <circleGeometry args={[0.34, 16]} />
        <meshBasicMaterial transparent opacity={0} color={accent} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

export const PIECE_CAPS = { settle: MAX_SETTLE, city: MAX_CITY, placeMs: PLACE_MS };
