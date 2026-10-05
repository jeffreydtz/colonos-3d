import type { ClientView, KickoffInfo, LobbyView } from "@shared/types";

export const KICKOFF_SHOW_MS = 6800;

export function kickoffKey(roomCode: string, info: KickoffInfo): string {
  return `${roomCode}:${info.starterId}:${info.order.map((p) => p.id).join(",")}`;
}

/**
 * Una vista de lobby que llega tarde no puede devolver a la mesa a la sala.
 * Si es otra sala, sí: el jugador se fue y entró a otra.
 */
export function acceptLobby(view: Pick<ClientView, "roomCode" | "status"> | null, lobby: Pick<LobbyView, "roomCode">): boolean {
  if (!view) return true;
  if (view.roomCode !== lobby.roomCode) return true;
  return view.status !== "playing" && view.status !== "ended";
}

export function gameViewPatch(
  view: ClientView,
  prev: { kickoffKey: string | null },
): {
  view: ClientView;
  screen: "game";
  lobby: null;
  playerId: string;
  code: string;
  kickoff?: KickoffInfo;
  kickoffKey?: string;
} {
  const patch = {
    view,
    screen: "game" as const,
    lobby: null,
    playerId: view.youId,
    code: view.roomCode,
  };
  if (!view.kickoff) return patch;
  const key = kickoffKey(view.roomCode, view.kickoff);
  if (prev.kickoffKey === key) return patch;
  return { ...patch, kickoff: view.kickoff, kickoffKey: key };
}
