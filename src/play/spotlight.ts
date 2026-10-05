import { CAMERA_SHARP } from "../motion/tokens";

/**
 * Qué toma le corresponde a este cliente.
 * La carta de desarrollo se abre sólo para quien la compró.
 * La cámara no sigue acciones ajenas: dados y ladrón sólo si los hizo este jugador.
 */

export type CameraEvent = "dice" | "robber" | "build" | "trade" | "card" | "turn";

export function devRevealForYou(youId: string, unboxPlayerId: string | null): boolean {
  return unboxPlayerId != null && unboxPlayerId === youId;
}

/** Acercamiento automático. `null` deja la cámara donde la dejó el jugador. */
export function cameraCueForActor(
  youId: string,
  actorId: string | null,
  kind: CameraEvent,
): "dados" | "ladron" | null {
  if (actorId == null || actorId !== youId) return null;
  if (kind === "dice") return "dados";
  if (kind === "robber") return "ladron";
  return null;
}

/**
 * Qué tan rápido vuelve la cámara a la vista que el jugador tenía.
 * El intro usa 2.2: con 8, a los 0,6 s queda menos del 1 % del camino.
 */
export const RESTORE_SHARPNESS = CAMERA_SHARP.restore;

export function cameraEventStamp(presenting: boolean, fxAt: number | null): string {
  return `${presenting ? "d" : "r"}:${fxAt ?? 0}`;
}

/** No pisar la vista guardada si la toma sigue o ya estamos volviendo. */
export function shouldKeepHeld(cue: string): boolean {
  return cue === "dados" || cue === "ladron" || cue === "restaurar";
}

/**
 * Al terminar una toma (dados o ladrón), volver a la pose guardada.
 * Sin pose, al encuadre de la isla sólo si el jugador no la había movido.
 */
export function cueAfterEvent(hasHeld: boolean, userMoved: boolean): "restaurar" | "volver" | "tactica" {
  if (hasHeld) return "restaurar";
  return userMoved ? "tactica" : "volver";
}

/** Fracción de camino que falta después de `seconds` segundos de restauración. */
export function restoreRemain(seconds: number, sharpness = RESTORE_SHARPNESS): number {
  return Math.exp(-sharpness * seconds);
}
