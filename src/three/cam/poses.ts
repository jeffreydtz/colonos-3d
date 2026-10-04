import * as THREE from "three";
import { hexToPixel } from "@shared/hex";
import { S, TILE_TOP } from "../geo";

/**
 * Ángulo sobre el horizonte y FOV vertical.
 * 62° en el celular lo dejaba casi cenital (un diagrama). 44°/54° se lee como mesa.
 */
export function lensFor(aspect: number): { elevation: number; fovY: number } {
  const tall = aspect < 1;
  const elevation = ((tall ? 54 : 44) * Math.PI) / 180;
  const fovY = tall ? Math.min(48, 28 + (1 - aspect) * 32) : 32;
  return { elevation, fovY };
}

export type Pose = { pos: THREE.Vector3; target: THREE.Vector3 };

export function cuePose(
  cue: "dados" | "ladron" | "cinematica",
  home: Pose,
  tray: [number, number, number],
  robber: { q: number; r: number } | undefined,
  dice?: Pose | null,
): Pose {
  if (cue === "dados") {
    // Encuadre de costa + bandeja (lo arma `fitBoard`): se acerca a los dados sin cortar la isla.
    // El primer plano fijo de la bandeja dejaba en el celular media isla afuera y el HUD encima.
    if (dice) return dice;
    const t = new THREE.Vector3(tray[0] - 0.6, 0.12, tray[2] - 0.5);
    return { pos: t.clone().add(new THREE.Vector3(1.4, 6.2, 5.6)), target: t };
  }
  if (cue === "ladron" && robber) {
    const p = hexToPixel(robber.q, robber.r, S);
    const t = new THREE.Vector3(p.x, TILE_TOP + 0.15, p.y);
    return { pos: t.clone().add(new THREE.Vector3(2.6, 4.2, 3.6)), target: t };
  }
  const t = home.target.clone();
  const dist = home.pos.distanceTo(t);
  return {
    pos: t.clone().add(new THREE.Vector3(dist * 0.42, dist * 0.36, dist * 0.62)),
    target: t,
  };
}
