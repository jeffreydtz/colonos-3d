import * as THREE from "three";

/** Fracción del canvas tapada por HUD en cada borde (0 = libre). */
export type SafeInsets = { top: number; bottom: number; left: number; right: number };

export type FitOptions = {
  elevation: number;
  fovY: number;
  aspect: number;
  safe: SafeInsets;
};

export type FitResult = { position: THREE.Vector3; target: THREE.Vector3; distance: number };

const cam = new THREE.PerspectiveCamera();
const tmp = new THREE.Vector3();

function place(target: THREE.Vector3, d: number, o: FitOptions): void {
  cam.fov = o.fovY;
  cam.aspect = o.aspect;
  cam.near = 0.1;
  cam.far = 1000;
  cam.position.set(target.x, target.y + Math.sin(o.elevation) * d, target.z + Math.cos(o.elevation) * d);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
}

type Box = { x0: number; x1: number; y0: number; y1: number; behind: boolean };

function projectBox(points: THREE.Vector3[]): Box {
  const b: Box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, behind: false };
  for (const p of points) {
    tmp.copy(p).applyMatrix4(cam.matrixWorldInverse);
    if (tmp.z > -0.05) {
      b.behind = true;
      continue;
    }
    tmp.applyMatrix4(cam.projectionMatrix);
    b.x0 = Math.min(b.x0, tmp.x);
    b.x1 = Math.max(b.x1, tmp.x);
    b.y0 = Math.min(b.y0, tmp.y);
    b.y1 = Math.max(b.y1, tmp.y);
  }
  return b;
}

function usable(o: FitOptions) {
  const s = o.safe;
  return {
    x0: -1 + 2 * s.left,
    x1: 1 - 2 * s.right,
    y0: -1 + 2 * s.bottom,
    y1: 1 - 2 * s.top,
  };
}

function fitsAt(points: THREE.Vector3[], target: THREE.Vector3, d: number, o: FitOptions): boolean {
  place(target, d, o);
  const b = projectBox(points);
  const u = usable(o);
  return !b.behind && b.x0 >= u.x0 && b.x1 <= u.x1 && b.y0 >= u.y0 && b.y1 <= u.y1;
}

function minDistance(points: THREE.Vector3[], target: THREE.Vector3, o: FitOptions): number {
  let lo = 0.5;
  let hi = 400;
  if (!fitsAt(points, target, hi, o)) return hi;
  for (let i = 0; i < 34; i++) {
    const mid = (lo + hi) / 2;
    if (fitsAt(points, target, mid, o)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Cámara que encuadra `points` (mundo) dentro de la zona libre del canvas, mirando
 * desde +z con `elevation` sobre el horizonte. Recentra el target para que el tablero
 * quede al medio de la zona libre (no del canvas entero).
 */
export function fitBoard(points: THREE.Vector3[], center: THREE.Vector3, o: FitOptions): FitResult {
  const safe: SafeInsets = {
    top: clampInset(o.safe.top),
    bottom: clampInset(o.safe.bottom),
    left: clampInset(o.safe.left),
    right: clampInset(o.safe.right),
  };
  const opts = { ...o, safe, aspect: Math.max(0.2, o.aspect) };
  const target = center.clone();
  let d = minDistance(points, target, opts);
  const u = usable(opts);
  const want = new THREE.Vector2((u.x0 + u.x1) / 2, (u.y0 + u.y1) / 2);
  for (let iter = 0; iter < 5; iter++) {
    place(target, d, opts);
    const b = projectBox(points);
    const off = new THREE.Vector2((b.x0 + b.x1) / 2 - want.x, (b.y0 + b.y1) / 2 - want.y);
    if (Math.abs(off.x) < 0.004 && Math.abs(off.y) < 0.004) break;
    const t0 = tmp.copy(target).project(cam).clone();
    const tx = tmp.copy(target).add(new THREE.Vector3(1, 0, 0)).project(cam).clone();
    const tz = tmp.copy(target).add(new THREE.Vector3(0, 0, 1)).project(cam).clone();
    // La cámara sigue al target: mover el target +1 corre el tablero −k en NDC.
    const dxNdc = tx.x - t0.x;
    const dzNdc = tz.y - t0.y;
    if (Math.abs(dxNdc) > 1e-6) target.x += off.x / dxNdc;
    if (Math.abs(dzNdc) > 1e-6) target.z += off.y / dzNdc;
    d = minDistance(points, target, opts);
  }
  place(target, d, opts);
  return { position: cam.position.clone(), target: target.clone(), distance: d };
}

/** Ancho / alto de la zona del canvas que no tapa el HUD. */
export function freeAspect(aspect: number, safe: SafeInsets): number {
  const w = 1 - clampInset(safe.left) - clampInset(safe.right);
  const h = 1 - clampInset(safe.top) - clampInset(safe.bottom);
  return (aspect * Math.max(0.1, w)) / Math.max(0.1, h);
}

function clampInset(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(0.42, Math.max(0, v));
}

/** Insets del HUD sobre el canvas, medidos en el DOM (`data-hud-edge`). */
export function measureHudInsets(canvas: HTMLElement, pad = 10): SafeInsets {
  const rect = canvas.getBoundingClientRect();
  const out: SafeInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  if (rect.width < 2 || rect.height < 2) return out;
  let topPx = 0;
  let bottomPx = 0;
  let rightPx = 0;
  document.querySelectorAll<HTMLElement>("[data-hud-edge]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (el.dataset.hudEdge === "right") {
      // Paneles altos y angostos (acciones en escritorio): cuentan si tapan un buen tramo de alto.
      const overlapY = Math.min(r.bottom, rect.bottom) - Math.max(r.top, rect.top);
      if (overlapY >= rect.height * 0.25) rightPx = Math.max(rightPx, rect.right - r.left);
      return;
    }
    const overlapX = Math.min(r.right, rect.right) - Math.max(r.left, rect.left);
    if (overlapX < rect.width * 0.25) return;
    if (el.dataset.hudEdge === "top") topPx = Math.max(topPx, r.bottom - rect.top);
    if (el.dataset.hudEdge === "bottom") bottomPx = Math.max(bottomPx, rect.bottom - r.top);
  });
  out.top = topPx > 0 ? (topPx + pad) / rect.height : pad / rect.height;
  out.bottom = bottomPx > 0 ? (bottomPx + pad) / rect.height : pad / rect.height;
  out.left = pad / rect.width;
  out.right = rightPx > 0 ? (rightPx + pad) / rect.width : pad / rect.width;
  return out;
}
