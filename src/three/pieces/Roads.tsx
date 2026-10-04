import { useFrame } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { COLOR_HEX } from "@shared/constants";
import type { ClientView, ColorId } from "@shared/types";
import { reduceMotion } from "../../audio/sfx";
import { useApp } from "../../store";
import { PIECE_CAPS } from "./Settlements";
import { S, ROAD_LEN, ROAD_PROFILE, ROAD_Y, mergeSolid } from "../geo";
import { getMaterials } from "../materials";

const GHOST = "#facc15";

const MAX_ROAD = 90;

function roadGeo(): THREE.BufferGeometry {
  // Perfil en XY (Y = alto) extruido en Z = largo. Sin rotateX: así queda acostado sobre la arista.
  const s = new THREE.Shape(ROAD_PROFILE.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 1,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 2,
  });
  g.translate(0, 0, -0.5);
  const merged = mergeSolid([g]);
  merged.computeVertexNormals();
  return merged;
}

export function Roads({
  view,
  lite,
  onEdge,
}: {
  view: ClientView;
  lite: boolean;
  onEdge: (id: string) => void;
}) {
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
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of view.players) m.set(p.id, COLOR_HEX[p.color as ColorId]);
    return m;
  }, [view.players]);
  const placed = view.roads;
  const ghosts = useMemo(
    () => view.edges.filter((e) => !placed.some((r) => r.edgeId === e.id) && view.legal.edges.includes(e.id)),
    [view.edges, placed, view.legal.edges],
  );
  const geo = useMemo(() => roadGeo(), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const out = useRef<THREE.InstancedMesh>(null);
  const ghostRef = useRef<THREE.InstancedMesh>(null);
  const ghostBar = useRef<THREE.InstancedMesh>(null);
  const ghostRim = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const freeze = useApp((s) => s.artFreeze);
  const born = useRef(new Map<string, number>());

  const layout = useCallback(
    (tNow: number) => {
      for (const road of placed) {
        if (!born.current.has(road.edgeId)) born.current.set(road.edgeId, freeze ? tNow - PIECE_CAPS.placeMs : tNow);
      }
      function stamp(mesh: THREE.InstancedMesh | null, scaleY: number) {
        if (!mesh) return;
        placed.forEach((road, i) => {
          const edge = view.edges.find((e) => e.id === road.edgeId);
          if (!edge) return;
          const a = view.vertices.find((v) => v.id === edge.vertexIds[0]);
          const b = view.vertices.find((v) => v.id === edge.vertexIds[1]);
          if (!a || !b) return;
          const ax = a.x * S;
          const az = a.y * S;
          const bx = b.x * S;
          const bz = b.y * S;
          const t0 = born.current.get(road.edgeId) ?? tNow;
          const u = freeze ? 1 : Math.min(1, (tNow - t0) / PIECE_CAPS.placeMs);
          const grow = 0.2 + 0.8 * (1 - (1 - u) * (1 - u));
          dummy.position.set((ax + bx) / 2, ROAD_Y, (az + bz) / 2);
          dummy.rotation.set(0, Math.atan2(bx - ax, bz - az), 0);
          const len = Math.hypot(bx - ax, bz - az);
          dummy.scale.set(grow, scaleY * grow, Math.max(0.45, len * ROAD_LEN) * (0.35 + 0.65 * u));
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          col.set(colorOf.get(road.playerId) ?? "#ccc");
          mesh.setColorAt?.(i, col);
        });
        mesh.count = placed.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      stamp(ref.current, 1);
      stamp(out.current, 1.04);
    },
    [placed, view.edges, view.vertices, colorOf, dummy, col, freeze],
  );

  useLayoutEffect(() => {
    layout(performance.now());
  }, [layout, lite]);

  useFrame(() => {
    if (freeze) return;
    const tNow = performance.now();
    if (placed.some((r) => tNow - (born.current.get(r.edgeId) ?? tNow) < PIECE_CAPS.placeMs)) layout(tNow);
  });

  /**
   * Lugar libre para un camino: barrita del color de los anillos de vértice con borde oscuro, que
   * late igual. La caja ancha casi invisible es sólo para que el toque sea fácil.
   */
  const layoutGhosts = useCallback(
    (pulse: number) => {
      for (const mesh of [ghostRef.current, ghostBar.current, ghostRim.current]) {
        if (!mesh) continue;
        const hit = mesh === ghostRef.current;
        ghosts.forEach((e, i) => {
          const a = view.vertices.find((v) => v.id === e.vertexIds[0]);
          const b = view.vertices.find((v) => v.id === e.vertexIds[1]);
          if (!a || !b) return;
          const ax = a.x * S;
          const az = a.y * S;
          const bx = b.x * S;
          const bz = b.y * S;
          const len = Math.hypot(bx - ax, bz - az);
          dummy.position.set((ax + bx) / 2, hit ? ROAD_Y : ROAD_Y + 0.016, (az + bz) / 2);
          dummy.rotation.set(0, Math.atan2(bx - ax, bz - az), 0);
          if (hit) dummy.scale.set(1, 1, Math.max(len * 0.9, 0.72));
          else dummy.scale.set(pulse, 1, len * ROAD_LEN * 0.92);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.count = ghosts.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    },
    [ghosts, view.vertices, dummy],
  );
  useLayoutEffect(() => {
    layoutGhosts(1);
  }, [layoutGhosts]);
  useFrame(({ clock }) => {
    if (freeze || reduceMotion() || ghosts.length === 0) return;
    layoutGhosts(1 + Math.sin(clock.elapsedTime * 3.4) * 0.12);
  });

  return (
    <group>
      {/* El material va como prop y no en `args`: cambiar de calidad no recrea la malla sin matrices. */}
      <instancedMesh ref={ref} args={[geo, undefined, MAX_ROAD]} material={pieceMat} castShadow={!lite} frustumCulled={false} />
      {!lite && (
        <instancedMesh ref={out} args={[geo, undefined, MAX_ROAD]} material={outlineMat} frustumCulled={false} raycast={() => {}} />
      )}
      {ghosts.length > 0 && (
        <>
          <instancedMesh
            ref={ghostRim}
            args={[undefined, undefined, Math.max(1, ghosts.length)]}
            frustumCulled={false}
            raycast={() => {}}
            renderOrder={2}
          >
            <boxGeometry args={[0.13, 0.02, 1]} />
            <meshBasicMaterial color="#120c08" transparent opacity={0.55} depthWrite={false} />
          </instancedMesh>
          <instancedMesh
            ref={ghostBar}
            args={[undefined, undefined, Math.max(1, ghosts.length)]}
            frustumCulled={false}
            raycast={() => {}}
            renderOrder={3}
          >
            <boxGeometry args={[0.07, 0.03, 1]} />
            {/* Transparente (aunque opaco) para ordenarse después del borde: si no, el borde la tapa. */}
            <meshBasicMaterial color={GHOST} transparent opacity={1} depthWrite={false} />
          </instancedMesh>
          <instancedMesh
            ref={ghostRef}
            args={[undefined, undefined, Math.max(1, ghosts.length)]}
            frustumCulled={false}
            onClick={(ev) => {
              ev.stopPropagation();
              const idx = ev.instanceId;
              const id = idx != null ? ghosts[idx]?.id : undefined;
              if (id) onEdge(id);
            }}
            onPointerOver={(ev) => {
              ev.stopPropagation();
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              document.body.style.cursor = "default";
            }}
          >
            <boxGeometry args={[0.3, 0.09, 1]} />
            <meshBasicMaterial transparent opacity={0} color={GHOST} depthWrite={false} />
          </instancedMesh>
        </>
      )}
    </group>
  );
}

export const ROAD_CAP = MAX_ROAD;
