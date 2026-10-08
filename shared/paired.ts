/**
 * Asiento pareado de la variante 5–6.
 * Tres lugares después del dueño del turno, con vuelta: en 5 es 1→4, 2→5, 3→1, 4→2, 5→3
 * (índices 0→3, 1→4, 2→0, 3→1, 4→2) y en 6 el de enfrente (1↔4, 2↔5, 3↔6).
 * En 3 y 4 no hay pareja. `owner` es el índice del dueño, de 0 a n−1.
 */
export function pairedSeat(owner: number, n: number): number | null {
  if (n !== 5 && n !== 6) return null;
  if (!Number.isInteger(owner) || owner < 0 || owner >= n) return null;
  return (owner + 3) % n;
}

/**
 * Índice de quien abre, mezclado a partir de la semilla. No es siempre 0.
 * En vivo el servidor no usa esto: tira `crypto.randomInt` una sola vez.
 */
export function starterIndexFromSeed(seed: number, n: number): number {
  if (n <= 1) return 0;
  const mixed = Math.imul(seed >>> 0, 0x9e3779b9) >>> 0;
  return mixed % n;
}
