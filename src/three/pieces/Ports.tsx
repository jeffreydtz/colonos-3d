import { useLayoutEffect, useMemo, useRef } from "react";
import { reuseVec2, useDispose } from "../dispose";
import * as THREE from "three";
import { RESOURCES, type ClientView, type Resource } from "@shared/types";
import { paintAnchor, paintResource } from "../../ui/icons/GameIcon";
import { SEA_Y } from "../geo";
import { repaintOnFont } from "../procTextures";
import { plankShores, portAnchor, portPairs, portSignCell } from "./portLayout";

const MAX_PORT = 18;
const CELLS = 6;
const CELL = 256;
export const PORT_TOKEN_R = 0.35;
const PORT_TOKEN_H = 0.05;
/**
 * Como el marco impreso: dos pasarelas, una a cada vértice que comercia con el puerto. Anchas
 * (0,11) para que a 1440 px se lean como tablones y no como hilos.
 */
export const PLANK_W = 0.11;
const PLANK_H = 0.03;
const LABEL_FONT = `700 ${Math.round(CELL * 0.26)}px "Source Sans 3", "Segoe UI", system-ui, sans-serif`;

let atlas: THREE.CanvasTexture | null = null;

/** Atlas de caras: 3:1 con ancla y 2:1 con el ícono del recurso, legible desde arriba. */
export function portAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement("canvas");
  c.width = CELL * CELLS;
  c.height = CELL;
  paintPorts(c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  atlas = t;
  repaintOnFont(LABEL_FONT, () => {
    paintPorts(c);
    t.needsUpdate = true;
  });
  return t;
}

function paintPorts(c: HTMLCanvasElement): void {
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  for (let i = 0; i < CELLS; i++) {
    const cx = i * CELL + CELL / 2;
    const cy = CELL / 2;
    g.fillStyle = "#f1e4c3";
    g.beginPath();
    g.arc(cx, cy, CELL * 0.49, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#1d4e5f";
    g.lineWidth = CELL * 0.05;
    g.beginPath();
    g.arc(cx, cy, CELL * 0.45, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#1d2a33";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = LABEL_FONT;
    // El ícono manda (es lo que se busca de un vistazo) y la tasa va chica abajo.
    const s = CELL * 0.52;
    if (i === 0) {
      paintAnchor(g, cx - s / 2, cy - CELL * 0.37, s);
    } else {
      paintResource(g, RESOURCES[i - 1] as Resource, cx - s / 2, cy - CELL * 0.37, s);
    }
    g.fillStyle = "#1d2a33";
    g.fillText(i === 0 ? "3:1" : "2:1", cx, cy + CELL * 0.27);
  }
}

export function Ports({ vertices, lite }: { vertices: ClientView["vertices"]; lite: boolean }) {
  const pairs = useMemo(() => portPairs(vertices), [vertices]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const faceRef = useRef<THREE.InstancedMesh>(null);
  const plankRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);
  const map = useMemo(() => portAtlas(), []);
  const faceGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(PORT_TOKEN_R * 0.97, 32);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const faceMat = useMemo(() => {
    const m = lite
      ? new THREE.MeshLambertMaterial({ map, name: "mat.dock.sign" })
      : new THREE.MeshStandardMaterial({ map, roughness: 0.6, name: "mat.dock.sign" });
    m.customProgramCacheKey = () => "colonos-port-face";
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aCell;")
        .replace(
          "#include <uv_vertex>",
          "#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = aCell + vMapUv * vec2(0.16667, 1.0);\n#endif\n",
        );
    };
    return m;
  }, [lite, map]);
  useDispose(faceGeo);
  useDispose(faceMat);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const face = faceRef.current;
    const planks = plankRef.current;
    const posts = postRef.current;
    if (!body || !face || !planks) return;
    const cells = new Float32Array(Math.max(pairs.length, 1) * 2);
    let pi = 0;
    pairs.forEach((p, i) => {
      const { token, a, b } = portAnchor(p);
      dummy.position.set(token.x, SEA_Y + PORT_TOKEN_H / 2, token.y);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      dummy.position.set(token.x, SEA_Y + PORT_TOKEN_H + 0.002, token.y);
      dummy.updateMatrix();
      face.setMatrixAt(i, dummy.matrix);
      for (const shore of plankShores(a, b, token)) {
        const dir = token.clone().sub(shore);
        if (dir.lengthSq() < 1e-8) dir.set(0, 1);
        dir.normalize();
        const end = token.clone().addScaledVector(dir, -PORT_TOKEN_R * 0.9);
        const len = Math.max(0.05, end.distanceTo(shore));
        const mid = shore.clone().add(end).multiplyScalar(0.5);
        dummy.position.set(mid.x, SEA_Y + 0.012 + PLANK_H / 2, mid.y);
        dummy.rotation.set(0, Math.atan2(dir.x, dir.y), 0);
        dummy.scale.set(1, 1, len);
        dummy.updateMatrix();
        planks.setMatrixAt(pi, dummy.matrix);
        if (posts) {
          const foot = shore.clone().addScaledVector(dir, 0.08);
          dummy.position.set(foot.x, SEA_Y + 0.07, foot.y);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          posts.setMatrixAt(pi, dummy.matrix);
        }
        pi += 1;
      }
      cells[i * 2] = portSignCell(p) / CELLS;
      cells[i * 2 + 1] = 0;
    });
    body.count = pairs.length;
    face.count = pairs.length;
    planks.count = pi;
    for (const m of [body, face, planks]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    if (posts) {
      posts.count = pi;
      posts.instanceMatrix.needsUpdate = true;
      posts.computeBoundingSphere();
    }
    reuseVec2(face.geometry, "aCell", cells, MAX_PORT * 2);
  }, [pairs, dummy, lite]);

  if (pairs.length === 0) return null;
  const n = Math.min(MAX_PORT, Math.max(1, pairs.length));
  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, n]} castShadow={!lite} receiveShadow frustumCulled={false} raycast={() => {}}>
        <cylinderGeometry args={[PORT_TOKEN_R, PORT_TOKEN_R * 1.04, PORT_TOKEN_H, 32]} />
        <meshStandardMaterial color="#5a3b22" roughness={0.7} name="mat.dock" />
      </instancedMesh>
      <instancedMesh ref={faceRef} args={[faceGeo, undefined, n]} material={faceMat} frustumCulled={false} raycast={() => {}} />
      <instancedMesh ref={plankRef} args={[undefined, undefined, n * 2]} castShadow={!lite} receiveShadow frustumCulled={false} raycast={() => {}}>
        <boxGeometry args={[PLANK_W, PLANK_H, 1]} />
        <meshStandardMaterial color="#8a6644" roughness={0.8} name="mat.dock" />
      </instancedMesh>
      {!lite && (
        <instancedMesh ref={postRef} args={[undefined, undefined, n * 2]} castShadow frustumCulled={false} raycast={() => {}}>
          <cylinderGeometry args={[0.034, 0.038, 0.12, 8]} />
          <meshStandardMaterial color="#4a3222" roughness={0.75} name="mat.dock" />
        </instancedMesh>
      )}
    </group>
  );
}
