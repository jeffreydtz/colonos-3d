import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

export type ColonosPerf = {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  fpsP50: number;
  fpsP5: number;
  mode: string;
};

declare global {
  interface Window {
    __colonosPerf?: ColonosPerf;
    __colonosGfx?: { mode: string; calls: number; triangles: number };
    __colonosReady?: boolean;
  }
}

export function PerfProbe({ lite }: { lite: boolean }) {
  const acc = useRef({
    calls: 0,
    tris: 0,
    n: 0,
    dts: [] as number[],
    last: performance.now(),
  });
  useFrame(({ gl }) => {
    gl.info.autoReset = true;
    const r = gl.info.render;
    const now = performance.now();
    const dt = now - acc.current.last;
    acc.current.last = now;
    // Solo se descartan pausas de pestaña oculta: los cuadros lentos de SwiftShader cuentan.
    if (dt > 0 && dt < 2000) acc.current.dts.push(1000 / dt);
    acc.current.calls += r.calls;
    acc.current.tris += r.triangles;
    acc.current.n += 1;
    if (acc.current.n >= 8) {
      const fps = [...acc.current.dts].sort((a, b) => a - b);
      const p = (q: number) => fps[Math.max(0, Math.min(fps.length - 1, Math.floor(q * (fps.length - 1))))] ?? 0;
      const payload: ColonosPerf = {
        calls: Math.round(acc.current.calls / acc.current.n),
        triangles: Math.round(acc.current.tris / acc.current.n),
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        fpsP50: Math.round(p(0.5)),
        fpsP5: Math.round(p(0.05)),
        mode: lite ? "liviano" : "normal",
      };
      window.__colonosPerf = payload;
      window.__colonosGfx = { mode: payload.mode, calls: payload.calls, triangles: payload.triangles };
      window.__colonosReady = true;
      acc.current = { calls: 0, tris: 0, n: 0, dts: [], last: performance.now() };
    }
  });
  return null;
}
