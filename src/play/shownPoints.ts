import type { ClientView } from "@shared/types";

/** Puntos que esta vista puede mostrar: los tuyos incluyen cartas ocultas. */
export function shownPoints(view: Pick<ClientView, "youId" | "hand">, playerId: string, visibleVp: number): number {
  return playerId === view.youId ? view.hand.totalVp : visibleVp;
}

/**
 * El ganador puede pasar la meta. Si sos vos, se muestra el total real.
 * Si es otro y las cartas ocultas no alcanzan a verse, se muestra la meta.
 */
export function winnerShownPoints(
  view: Pick<ClientView, "youId" | "hand" | "victoryPoints" | "winnerId" | "players">,
): number {
  const winner = view.players.find((p) => p.id === view.winnerId);
  if (!winner) return view.victoryPoints;
  if (winner.id === view.youId) return view.hand.totalVp;
  return Math.max(winner.visibleVp, view.victoryPoints);
}
