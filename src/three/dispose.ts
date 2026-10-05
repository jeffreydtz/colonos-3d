import { useEffect } from "react";
import * as THREE from "three";

/** Libera una geometría, material o textura propia del componente. Los atlas compartidos no pasan por acá. */
export function useDispose(obj: { dispose: () => void } | null | undefined): void {
  useEffect(() => {
    return () => obj?.dispose();
  }, [obj]);
}

/**
 * Reusa el atributo de atlas (aCell) para no dejar buffers de GPU huérfanos
 * cada vez que se agregan piezas o se cambia liviano/noche.
 */
export function reuseVec2(
  geo: THREE.BufferGeometry,
  name: string,
  cells: Float32Array,
  capacity = cells.length,
): void {
  const prev = geo.getAttribute(name);
  if (prev && prev.array instanceof Float32Array && prev.itemSize === 2 && prev.array.length >= cells.length) {
    prev.array.set(cells);
    prev.needsUpdate = true;
    return;
  }
  const buf = new Float32Array(Math.max(capacity, cells.length));
  buf.set(cells);
  geo.setAttribute(name, new THREE.InstancedBufferAttribute(buf, 2));
}
