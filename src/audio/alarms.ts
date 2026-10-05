export type AlarmName = "warn10" | "warn5";

export type AlarmHit = { name: AlarmName; delayMs: number };

/**
 * Cuándo disparar las alarmas respecto de un deadline absoluto.
 * Lo ya pasado (más allá de la gracia) no se recupera: entrar mirando el reloj no suena.
 */
export function alarmPlan(now: number, deadlineMs: number, graceMs = 400): AlarmHit[] {
  const hits: AlarmHit[] = [];
  const specs = [
    ["warn10", 10_000],
    ["warn5", 5_000],
  ] as const;
  for (const [name, before] of specs) {
    const delay = deadlineMs - before - now;
    if (delay < -graceMs) continue;
    hits.push({ name, delayMs: Math.max(0, delay) });
  }
  return hits;
}
