import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { reduceMotion } from "../../audio/sfx";
import { SEA_DRIFT } from "../../motion/tokens";
import { SEA_Y, ensureCcw, offsetLoop } from "../geo";
import type { BoardLayout } from "../layout";
import { waterBump } from "../procTextures";
import type { ThemeId } from "../../theme/tokens";
import { seaLook, type SeaPalette } from "./seaPalette";

/** Ondas tenues: trazos claros cortos con semilla fija, para que el agua no sea un plano liso. */
function paintRipples(g: CanvasRenderingContext2D, size: number, k: number): void {
  let s = 1234567;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  g.save();
  g.filter = "none";
  g.lineCap = "round";
  const n = Math.round(size * 0.22);
  for (let i = 0; i < n; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = (0.12 + rnd() * 0.28) * k;
    const a = -0.25 + rnd() * 0.5;
    g.strokeStyle = `rgba(190,226,232,${0.035 + rnd() * 0.05})`;
    g.lineWidth = Math.max(1, (0.012 + rnd() * 0.012) * k);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 - 0.02 * k, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  g.restore();
}

function bounds(poly: THREE.Vector2[], center: THREE.Vector2) {
  let half = 0;
  for (const p of poly) half = Math.max(half, Math.abs(p.x - center.x), Math.abs(p.y - center.y));
  return half + 0.05;
}

/** Agua pintada en canvas: profundo → bajío turquesa → espuma en la costa; debajo de la tierra, base oscura. */
function paintSea(layout: BoardLayout, size: number, palette: SeaPalette): { tex: THREE.CanvasTexture; half: number } {
  const half = bounds(layout.sea, layout.center);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const k = size / (2 * half);
  const px = (x: number) => (x - (layout.center.x - half)) * k;
  const pz = (z: number) => (z - (layout.center.y - half)) * k;
  const path = (poly: THREE.Vector2[]) => {
    g.beginPath();
    poly.forEach((p, i) => (i === 0 ? g.moveTo(px(p.x), pz(p.y)) : g.lineTo(px(p.x), pz(p.y))));
    g.closePath();
  };
  g.fillStyle = palette.deep;
  g.fillRect(0, 0, size, size);
  const vignette = g.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size * 0.56);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,8,16,0.35)");
  g.fillStyle = vignette;
  g.fillRect(0, 0, size, size);
  // Bajío muy corto: un anillo claro alrededor de cada loseta se leía como halo.
  g.filter = `blur(${Math.round(size * 0.008)}px)`;
  g.fillStyle = palette.mid;
  path(offsetLoop(layout.coast, 0.11));
  g.fill();
  g.filter = `blur(${Math.round(size * 0.003)}px)`;
  g.fillStyle = palette.shallow;
  path(offsetLoop(layout.coast, 0.03));
  g.fill();
  paintRipples(g, size, k);
  g.filter = `blur(${Math.max(1, Math.round(size * 0.0008))}px)`;
  g.strokeStyle = palette.foam;
  g.lineWidth = Math.max(1, 0.01 * k);
  g.lineJoin = "round";
  path(offsetLoop(layout.coast, 0.018));
  g.stroke();
  g.filter = "none";
  // Cartón oscuro que tapa el bajío: la junta clara la dibuja el labio 3D, no este halo.
  g.fillStyle = palette.ground;
  path(offsetLoop(layout.coast, 0.12));
  g.fill();
  path(layout.coast);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, half };
}

/** Polígono (x, z) → plano horizontal con la cara hacia arriba y UV del canvas. */
function flatPolygon(poly: THREE.Vector2[], y: number, center: THREE.Vector2, half: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.y)));
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const pos = g.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - (center.x - half)) / (2 * half);
    uv[i * 2 + 1] = 1 - (pos.getZ(i) - (center.y - half)) / (2 * half);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function Sea({ layout, lite, theme }: { layout: BoardLayout; lite: boolean; theme: ThemeId }) {
  const look = seaLook(lite, theme);
  const painted = useMemo(() => paintSea(layout, lite ? 512 : 1024, look.palette), [layout, lite, look.palette]);
  const geo = useMemo(() => flatPolygon(layout.sea, SEA_Y, layout.center, painted.half), [layout, painted]);
  const bump = useMemo(() => {
    if (lite) return null;
    const t = waterBump().clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(7, 7);
    return t;
  }, [lite]);
  useEffect(() => () => painted.tex.dispose(), [painted]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => bump?.dispose(), [bump]);

  useFrame((_, dt) => {
    if (!bump || reduceMotion()) return;
    bump.offset.x += dt * SEA_DRIFT.x;
    bump.offset.y += dt * SEA_DRIFT.y;
  });

  return (
    <group>
      <mesh geometry={geo} receiveShadow={!lite} raycast={() => {}}>
        {lite ? (
          <meshBasicMaterial map={painted.tex} color={look.tint ?? "#ffffff"} toneMapped={false} name="mat.sea" />
        ) : (
          <meshPhysicalMaterial
            map={painted.tex}
            bumpMap={bump}
            bumpScale={0.015}
            roughness={0.72}
            metalness={0}
            clearcoat={0.06}
            clearcoatRoughness={0.6}
            envMapIntensity={0.12}
            name="mat.sea"
          />
        )}
      </mesh>
      <CoastLip layout={layout} />
    </group>
  );
}

/** Cartón mate justo afuera de la costa: tapa el brillo del agua contra el canto de la loseta. */
function CoastLip({ layout }: { layout: BoardLayout }) {
  const geo = useMemo(() => {
    const coast = ensureCcw(layout.coast);
    const outer = offsetLoop(coast, 0.06).map((p) => new THREE.Vector2(p.x, -p.y)).reverse();
    const shape = new THREE.Shape(outer);
    shape.holes.push(new THREE.Path(coast.map((p) => new THREE.Vector2(p.x, -p.y))));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.022, 0);
    return g;
  }, [layout]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} raycast={() => {}} renderOrder={2}>
      <meshBasicMaterial color="#140e0a" name="mat.coast" polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}
