import { pairedSeat } from "@shared/paired";

const NO_PAIR = new Set([
  "colocacion_poblado",
  "colocacion_camino",
  "descarte",
  "construccion_especial",
  "fin",
]);

/** Misma regla que el servidor: tres asientos después, sólo en 5 y 6, y no durante la colocación ni la pausa. */
export function pairedIdFromSeats(
  players: Array<{ id: string }>,
  ownerId: string | null,
  phase: string,
): string | null {
  if (!ownerId || NO_PAIR.has(phase)) return null;
  const owner = players.findIndex((p) => p.id === ownerId);
  if (owner < 0) return null;
  const idx = pairedSeat(owner, players.length);
  if (idx == null) return null;
  const id = players[idx]?.id ?? null;
  return id === ownerId ? null : id;
}

export function turnBarLabel(opts: {
  winnerName: string | null;
  ownerName: string;
  pairedName: string | null;
  youOwn: boolean;
}): string {
  if (opts.winnerName) return `Ganó ${opts.winnerName}`;
  if (!opts.pairedName) return opts.youOwn ? `Vos: ${opts.ownerName}` : opts.ownerName;
  const head = opts.youOwn ? "Tu turno" : `Turno de ${opts.ownerName}`;
  return `${head} · también juega ${opts.pairedName}`;
}
