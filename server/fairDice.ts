import { randomInt } from "node:crypto";

/**
 * Entero uniforme en `[min, max]` inclusive.
 * `crypto.randomInt` es exclusivo en el tope y no acepta semilla.
 */
export function cryptoInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new Error("cryptoInt: rango inválido");
  }
  if (max === min) return min;
  return randomInt(min, max + 1);
}

/** Semilla de tablero o de mazo. Independiente de la tirada de dados. */
export function freshSeed(): number {
  return randomInt(1, 0x1_0000_0000);
}
