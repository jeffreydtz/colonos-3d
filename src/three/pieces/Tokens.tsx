import { hexToPixel, pips } from "@shared/hex";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ClientView } from "@shared/types";
import { TOKENS } from "../../theme/tokens";
import { S, TILE_TOP, TOKEN_H, TOKEN_R, digitScale } from "../geo";
import { repaintOnFont } from "../procTextures";

const NUMS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
const DIGIT_PX = 24;
const DIGIT_FONT = `700 ${DIGIT_PX}px Fraunces, Georgia, serif`;

let atlas: THREE.CanvasTexture | null = null;

function paintTokens(c: HTMLCanvasElement): void {
  const cols = 4;
  const rows = 3;
  const g = c.getContext("2d")!;
  g.fillStyle = TOKENS.tokenCream;
  g.fillRect(0, 0, c.width, c.height);
  NUMS.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = (col + 0.5) * (c.width / cols);
    const cy = (row + 0.5) * (c.height / rows);
    const hot = n === 6 || n === 8;
    g.fillStyle = TOKENS.tokenCream;
    g.beginPath();
    g.arc(cx, cy, 126, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#b08950";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, 119, 0, Math.PI * 2);
    g.stroke();
    const ink = hot ? TOKENS.tokenHot : TOKENS.tokenInk;
    g.fillStyle = ink;
    g.strokeStyle = ink;
    // Fraunces a 24 px usa su corte de texto (opsz bajo): los finos del corte display a 158 px
    // desaparecen con el mipmap a ~45 px en pantalla y el 4 se lee como una "i".
    // La ficha es más chica que antes; el número crece adentro para leerse igual de lejos.
    const k = 7.5 * digitScale(n);
    g.save();
    g.translate(cx, cy - 18);
    g.scale(k, k);
    g.font = DIGIT_FONT;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 4 / k;
    g.lineJoin = "round";
    g.strokeText(String(n), 0, 0);
    g.fillText(String(n), 0, 0);
    g.restore();
    const dots = pips(n);
    const start = cx - (dots - 1) * 13;
    for (let d = 0; d < dots; d++) {
      g.beginPath();
      g.arc(start + d * 26, cy + 86, 9.5, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function tokenAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 768;
  paintTokens(c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  atlas = t;
  repaintOnFont(DIGIT_FONT, () => {
    paintTokens(c);
    t.needsUpdate = true;
  });
  return t;
}

/** Disco de cartón: canto recto con bisel chico arriba, como la ficha física. */
function latheToken(): THREE.LatheGeometry {
  const h = TOKEN_H;
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(TOKEN_R * 0.96, 0),
    new THREE.Vector2(TOKEN_R, h * 0.2),
    new THREE.Vector2(TOKEN_R, h * 0.78),
    new THREE.Vector2(TOKEN_R * 0.95, h),
    new THREE.Vector2(0, h),
  ];
  const g = new THREE.LatheGeometry(pts, 32);
  g.computeVertexNormals();
  return g;
}

function faceGeo(): THREE.CircleGeometry {
  const g = new THREE.CircleGeometry(TOKEN_R * 0.93, 32);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Base de la ficha: hundida 4 mm en la loseta para que no flote. */
export const TOKEN_BASE_Y = TILE_TOP - 0.004;

function atlasMat(map: THREE.Texture, lite: boolean): THREE.Material {
  const m = lite
    ? new THREE.MeshLambertMaterial({ map, color: "#ffffff", name: "mat.token" })
    : new THREE.MeshPhysicalMaterial({
        map,
        color: "#ffffff",
        roughness: 0.42,
        clearcoat: 0.35,
        clearcoatRoughness: 0.4,
        name: "mat.token",
      });
  m.customProgramCacheKey = () => "colonos-token-atlas";
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aCell;")
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = aCell + vMapUv * vec2(0.25, 0.333333);\n#endif\n",
      );
  };
  return m;
}

export function Tokens({
  hexes,
  lite,
}: {
  hexes: ClientView["hexes"];
  lite: boolean;
}) {
  const items = useMemo(() => hexes.filter((h) => h.number != null), [hexes]);
  const body = useMemo(() => latheToken(), []);
  const face = useMemo(() => faceGeo(), []);
  const map = useMemo(() => tokenAtlas(), []);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const faceRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const faceMat = useMemo(() => atlasMat(map, lite), [map, lite]);
  const bodyMat = useMemo(
    () =>
      lite
        ? new THREE.MeshLambertMaterial({ color: TOKENS.tokenCream, name: "mat.token.body" })
        : new THREE.MeshPhysicalMaterial({
            color: TOKENS.tokenCream,
            roughness: 0.4,
            clearcoat: 0.5,
            clearcoatRoughness: 0.32,
            name: "mat.token.body",
          }),
    [lite],
  );

  useLayoutEffect(() => {
    const bMesh = bodyRef.current;
    const fMesh = faceRef.current;
    if (!fMesh) return;
    const cells = new Float32Array(Math.max(items.length, 1) * 2);
    items.forEach((h, i) => {
      const p = hexToPixel(h.q, h.r, S);
      const y = TOKEN_BASE_Y;
      dummy.position.set(p.x, y, p.y);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bMesh?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, y + (lite ? 0.012 : TOKEN_H + 0.0015), p.y);
      dummy.updateMatrix();
      fMesh.setMatrixAt(i, dummy.matrix);
      const idx = NUMS.indexOf(h.number ?? 2);
      const col = idx < 0 ? 0 : idx % 4;
      const row = idx < 0 ? 0 : Math.floor(idx / 4);
      cells[i * 2] = col * 0.25;
      cells[i * 2 + 1] = 1 - (row + 1) / 3;
    });
    if (bMesh) {
      bMesh.count = items.length;
      bMesh.instanceMatrix.needsUpdate = true;
      bMesh.computeBoundingSphere();
    }
    fMesh.count = items.length;
    fMesh.instanceMatrix.needsUpdate = true;
    fMesh.computeBoundingSphere();
    fMesh.geometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
  }, [items, dummy, lite]);

  if (items.length === 0) return null;
  const n = Math.max(1, items.length);
  return (
    <group>
      {!lite && (
        <instancedMesh
          ref={bodyRef}
          args={[body, bodyMat, n]}
          castShadow
          frustumCulled={false}
          raycast={() => {}}
        />
      )}
      <instancedMesh ref={faceRef} args={[face, faceMat, n]} frustumCulled={false} raycast={() => {}} />
    </group>
  );
}
