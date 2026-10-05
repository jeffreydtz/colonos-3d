import { useEffect, useState } from "react";
import { COLOR_HEX } from "@shared/constants";
import type { ClientView } from "@shared/types";
import { setupCue, turnHeadline } from "../play/setupCue";

const BASE_TITLE = "Colonos — la isla en 3D";

export function TurnAnnounce({ view }: { view: ClientView }) {
  const you = view.players.find((p) => p.id === view.youId);
  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const yourTurn = view.currentPlayerId === view.youId;
  const yourBuildings = view.buildings.filter((b) => b.playerId === view.youId).length;
  const actorBuildings = view.buildings.filter((b) => b.playerId === view.currentPlayerId).length;
  const cue = setupCue({
    phase: view.phase,
    yourTurn,
    currentName: current?.name ?? "alguien",
    yourBuildings,
    actorBuildings,
  });
  const [flash, setFlash] = useState<string | null>(null);
  const color = COLOR_HEX[(yourTurn ? you?.color : current?.color) ?? "naranja"];

  useEffect(() => {
    if (view.winnerId) return;
    const title = cue?.title ?? turnHeadline(yourTurn, current?.name ?? "alguien");
    setFlash(title);
    const id = window.setTimeout(() => setFlash(null), 3600);
    return () => window.clearTimeout(id);
  }, [view.currentPlayerId, view.phase, yourBuildings, view.winnerId, yourTurn, cue?.title, current?.name]);

  useEffect(() => {
    if (view.winnerId || !yourTurn) {
      document.title = BASE_TITLE;
      return;
    }
    const paint = () => {
      if (document.hidden) {
        document.title = document.title.startsWith("●") ? BASE_TITLE : "● Es tu turno";
      } else {
        document.title = "Es tu turno — Colonos";
      }
    };
    paint();
    const id = window.setInterval(paint, 900);
    document.addEventListener("visibilitychange", paint);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", paint);
      document.title = BASE_TITLE;
    };
  }, [yourTurn, view.currentPlayerId, view.winnerId]);

  if (view.winnerId) return null;

  return (
    <div className="pointer-events-none flex justify-center px-2 pt-1 lg:pt-2">
      {cue ? (
        <div
          key={`${view.currentPlayerId}:${view.phase}:${actorBuildings}`}
          className="w-full max-w-lg rounded-xl border bg-[#140d09]/92 px-2.5 py-1 text-center shadow-md lg:rounded-2xl lg:border-2 lg:px-4 lg:py-3 lg:shadow-lg"
          style={{ borderColor: color }}
          data-testid="setup-banner"
          role="status"
        >
          <p className="display text-sm font-semibold leading-tight text-amber-50 lg:text-2xl">{cue.title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-amber-100/80 lg:mt-1 lg:text-sm">{cue.detail}</p>
        </div>
      ) : (
        flash && (
          <div
            className="w-full max-w-sm rounded-xl border bg-[#140d09]/92 px-2.5 py-1 text-center shadow-md lg:max-w-md lg:rounded-2xl lg:border-2 lg:px-4 lg:py-3 lg:shadow-lg"
            style={{ borderColor: color }}
            data-testid="turn-announce"
            role="status"
          >
            <p className="display text-base font-semibold leading-none lg:text-3xl" style={{ color }}>
              {flash}
            </p>
          </div>
        )
      )}
    </div>
  );
}
