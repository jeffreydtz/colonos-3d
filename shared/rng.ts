/** Semilla criptográfica independiente (tablero vs mazo). */
export function freshSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0] || 1) >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export function pickInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Entero uniforme con Web Crypto. El servidor, para los dados, usa `crypto.randomInt`
 * en `server/fairDice.ts` (mismo CSPRNG, API de Node).
 */
export function cryptoInt(min: number, max: number): number {
  const span = max - min + 1;
  if (span <= 0) return min;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / span) * span;
  let x = 0;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0]!;
  } while (x >= limit);
  return min + (x % span);
}
