import * as THREE from "three";
import type { ThemeId } from "../../theme/tokens";

/**
 * El nogal es oscuro y muy rojo (promedio sRGB 62/25/10). En normal lo levanta el brillo del barniz;
 * Lambert no tiene especular y el marco y la mesa quedaban casi negros. Liviano multiplica el color
 * por encima de 1 y suma un emisivo parejo que hace de ese brillo, escalado por tema para que la
 * noche siga a oscuras.
 */
const LIFT: Record<ThemeId, number> = { atardecer: 1, dia: 1.4, noche: 0.3, isla: 1.2 };

export function liteWood(part: "frame" | "table", theme: ThemeId): { color: THREE.Color; emissive: THREE.Color } {
  const k = LIFT[theme];
  return part === "frame"
    ? { color: new THREE.Color(1.3, 1.0, 0.85), emissive: new THREE.Color(0.075 * k, 0.052 * k, 0.042 * k) }
    : { color: new THREE.Color(0.62, 0.48, 0.42), emissive: new THREE.Color(0.05 * k, 0.038 * k, 0.033 * k) };
}
