import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ClientView, Terrain } from "@shared/types";
import { hexToPixel } from "@shared/hex";
import { BRICK, CRAG_H, CRAG_R, TREE_BASE_R, brickPose, forestPos, hash, peakPose } from "./decorLayout";
import { ROBBER_FOOT_R, S as SIZE, TILE_TOP, robberSpot } from "./geo";
const skipRaycast = () => {};
/** Un árbol o una oveja que caiga bajo el pie del ladrón se esconde: si no, lo atraviesa. */
const ROBBER_CLEAR = ROBBER_FOOT_R + 0.14;

function world(q: number, r: number) {
  const p = hexToPixel(q, r, SIZE);
  return [p.x, p.y] as const;
}

/** Cara superior de la loseta: igual para todos los terrenos (cartón parejo, piezas a nivel). */
export function hexHeight(_t: Terrain): number {
  return TILE_TOP;
}

/**
 * Montaña facetada: perfil apenas cóncavo (falda ancha, cumbre más empinada), cumbre corrida del
 * eje y aristas alternas salientes, así no se lee como un cono torneado. La nieve va pintada en la
 * malla (no se despega al inclinarla) y sólo en la variante de cumbre. Los vértices compartidos se
 * mueven igual: sin grietas entre caras.
 */
function cragGeo(snowy: boolean): THREE.BufferGeometry {
  const radial = 7;
  const g = new THREE.ConeGeometry(CRAG_R, CRAG_H, radial, 4).toNonIndexed();
  g.translate(0, CRAG_H / 2, 0);
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  const rockA = new THREE.Color(snowy ? "#30353c" : "#3a4047");
  const rockB = new THREE.Color(snowy ? "#59616b" : "#5f666f");
  const snow = new THREE.Color("#eef2f6");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = y / CRAG_H;
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    if (u > 0.02) {
      const seg = Math.round(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * radial) % 2;
      const ridge = u < 0.98 ? (seg === 0 ? 1.1 : 0.9) * (1 + (hash(key, 3) - 0.5) * 0.24) : 1;
      const k = ridge * Math.pow(1 - Math.min(u, 0.999), 0.18);
      const lean = u * u * CRAG_R;
      pos.setXYZ(i, x * k + lean * 0.3, y + (u < 0.98 ? (hash(key, 5) - 0.5) * 0.03 : 0), z * k - lean * 0.12);
    }
    c.copy(rockA).lerp(rockB, 0.25 + hash(key, 7) * 0.5 + u * 0.25);
    if (snowy) c.lerp(snow, THREE.MathUtils.smoothstep(u, 0.56, 0.74));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Anillo de props entre la ficha y el borde: lejos de vértices y de los caminos de las aristas. */
export function ringPos(id: string, i: number, _n: number, inner = 0.5, outer = 0.68) {
  const edge = i % 6;
  const a = (edge * Math.PI) / 3 + (hash(id, i + 3) - 0.5) * 0.4;
  const rad = inner + hash(id, i + 11) * (outer - inner);
  return { x: Math.cos(a) * rad, z: Math.sin(a) * rad, a };
}

function useInstances(
  count: number,
  items: unknown,
  layout: (dummy: THREE.Object3D, set: (i: number) => void) => void,
  clear: THREE.Vector2 | null,
) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let last = -1;
    layout(dummy, (i) => {
      if (clear && Math.hypot(dummy.position.x - clear.x, dummy.position.z - clear.y) < ROBBER_CLEAR) {
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      last = i;
    });
    mesh.count = last + 1;
    mesh.instanceMatrix.needsUpdate = true;
  }, [count, dummy, items, layout, clear]);
  return ref;
}

export function HexDecor({
  hexes,
  lite = false,
  robberHexId,
}: {
  hexes: ClientView["hexes"];
  lite?: boolean;
  robberHexId?: string;
}) {
  const clear = useMemo(() => {
    const h = hexes.find((x) => x.id === robberHexId);
    return h ? robberSpot(h) : null;
  }, [hexes, robberHexId]);
  const woods = useMemo(() => hexes.filter((h) => h.terrain === "madera"), [hexes]);
  const hills = useMemo(() => hexes.filter((h) => h.terrain === "ladrillo"), [hexes]);
  const peaks = useMemo(() => hexes.filter((h) => h.terrain === "mineral"), [hexes]);

  const treePer = lite ? 4 : 12;
  const brickStacks = lite ? 2 : 3;
  const brickPer = brickStacks * 3;
  const peakPer = lite ? 3 : 6;

  const treeN = Math.max(1, woods.length * treePer);
  const capN = treeN;
  const trunkN = treeN;
  const brickN = Math.max(1, hills.length * brickPer);
  const summitN = Math.max(1, peaks.length * 2);
  const rockN = Math.max(1, peaks.length * (peakPer - 2));

  const layoutTrees = useMemo(
    () => (d: THREE.Object3D, set: (i: number) => void) => {
      let i = 0;
      for (const h of woods) {
        const [wx, wz] = world(h.q, h.r);
        const y = hexHeight(h.terrain);
        for (let k = 0; k < treePer; k++) {
          const p = forestPos(h.id, k, treePer);
          const s = p.s;
          d.position.set(wx + p.x, y + 0.16 * s, wz + p.z);
          d.rotation.set(0, hash(h.id, k) * 6, 0);
          d.scale.set(s, s * (0.92 + hash(h.id, k + 4) * 0.22), s);
          set(i++);
        }
      }
    },
    [woods, treePer],
  );
  const layoutCaps = useMemo(
    () => (d: THREE.Object3D, set: (i: number) => void) => {
      let i = 0;
      for (const h of woods) {
        const [wx, wz] = world(h.q, h.r);
        const y = hexHeight(h.terrain);
        for (let k = 0; k < treePer; k++) {
          const p = forestPos(h.id, k, treePer);
          const s = p.s;
          d.position.set(wx + p.x, y + 0.3 * s, wz + p.z);
          d.scale.set(s * 0.55, s * 0.42, s * 0.55);
          set(i++);
        }
      }
    },
    [woods, treePer],
  );
  const layoutTrunks = useMemo(
    () => (d: THREE.Object3D, set: (i: number) => void) => {
      let i = 0;
      for (const h of woods) {
        const [wx, wz] = world(h.q, h.r);
        const y = hexHeight(h.terrain);
        for (let k = 0; k < treePer; k++) {
          const p = forestPos(h.id, k, treePer);
          const s = p.s;
          d.position.set(wx + p.x, y + 0.04, wz + p.z);
          d.scale.set(s * 0.4, s * 0.55, s * 0.4);
          set(i++);
        }
      }
    },
    [woods, treePer],
  );
  const layoutBricks = useMemo(
    () => (d: THREE.Object3D, set: (i: number) => void) => {
      let i = 0;
      for (const h of hills) {
        const [wx, wz] = world(h.q, h.r);
        const y = hexHeight(h.terrain);
        for (let k = 0; k < brickPer; k++) {
          const p = brickPose(h.id, k, brickStacks);
          d.position.set(wx + p.x, y + p.y, wz + p.z);
          d.rotation.set(0, p.yaw, 0);
          d.scale.setScalar(1);
          set(i++);
        }
      }
    },
    [hills, brickPer, brickStacks],
  );
  const layoutPeaks = useMemo(
    () => (snowy: boolean) => (d: THREE.Object3D, set: (i: number) => void) => {
      let i = 0;
      for (const h of peaks) {
        const [wx, wz] = world(h.q, h.r);
        const y = hexHeight(h.terrain);
        for (let k = 0; k < peakPer; k++) {
          const p = peakPose(h.id, k, peakPer);
          if (p.snow !== snowy) continue;
          d.position.set(wx + p.x, y - 0.004, wz + p.z);
          d.rotation.set(p.tilt, p.yaw, p.tilt * 0.6);
          d.scale.set(p.sxz, p.sy, p.sxz);
          set(i++);
        }
      }
    },
    [peaks, peakPer],
  );
  const layoutSummits = useMemo(() => layoutPeaks(true), [layoutPeaks]);
  const layoutRocks = useMemo(() => layoutPeaks(false), [layoutPeaks]);
  const summitGeo = useMemo(() => cragGeo(true), []);
  const rockGeo = useMemo(() => cragGeo(false), []);

  const trees = useInstances(treeN, woods, layoutTrees, clear);
  const caps = useInstances(capN, woods, layoutCaps, clear);
  const trunks = useInstances(trunkN, woods, layoutTrunks, clear);
  const bricks = useInstances(brickN, hills, layoutBricks, clear);
  const summits = useInstances(summitN, peaks, layoutSummits, clear);
  const rocks = useInstances(rockN, peaks, layoutRocks, clear);

  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, trunkN]} castShadow={!lite} raycast={skipRaycast}>
        <cylinderGeometry args={[0.035, 0.045, 0.14, 5]} />
        <meshStandardMaterial color="#4a2c12" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={trees} args={[undefined, undefined, treeN]} castShadow={!lite} raycast={skipRaycast}>
        <coneGeometry args={[TREE_BASE_R, 0.4, 6]} />
        <meshStandardMaterial color="#166534" roughness={0.82} flatShading />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, capN]} castShadow={!lite} raycast={skipRaycast}>
        <coneGeometry args={[0.09, 0.2, 6]} />
        <meshStandardMaterial color="#14532d" roughness={0.8} flatShading />
      </instancedMesh>
      <instancedMesh ref={bricks} args={[undefined, undefined, brickN]} castShadow={!lite} raycast={skipRaycast}>
        <boxGeometry args={[BRICK.l, BRICK.h, BRICK.d]} />
        <meshStandardMaterial color="#8f2f14" roughness={0.82} />
      </instancedMesh>
      {/* Ovejas y espigas en 3D quedaban de unos píxeles: pelusa sobre la loseta. Van pintadas en el pasto. */}
      <instancedMesh ref={summits} args={[summitGeo, undefined, summitN]} castShadow={!lite} raycast={skipRaycast}>
        <meshStandardMaterial vertexColors roughness={0.74} metalness={0.04} flatShading />
      </instancedMesh>
      <instancedMesh ref={rocks} args={[rockGeo, undefined, rockN]} castShadow={!lite} raycast={skipRaycast}>
        <meshStandardMaterial vertexColors roughness={0.8} metalness={0.02} flatShading />
      </instancedMesh>
    </group>
  );
}
