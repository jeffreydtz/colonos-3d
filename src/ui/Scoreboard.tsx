import { COLOR_HEX } from "@shared/constants";
import type { ClientView } from "@shared/types";
import { resourceCountShown } from "../play/publicHand";
import { shownPoints } from "../play/shownPoints";
import { useApp } from "../store";
import { PublicHand } from "./PublicHand";

/** Columna vertical. En el celu los chips ya muestran nombre, cartas y puntos. */
export function Scoreboard({ view }: { view: ClientView }) {
  const diceUi = useApp((s) => s.diceUi);
  const rows = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    you: p.id === view.youId,
    active: p.id === view.currentPlayerId && !view.winnerId,
    points: shownPoints(view, p.id, p.visibleVp),
    resources: resourceCountShown(p.resourceCount, p.id, view.events, diceUi),
    devs: p.devCount,
    knights: p.knightsPlayed,
    largestArmy: p.hasLargestArmy,
  }));
  const top = Math.max(0, ...rows.map((r) => r.points));
  const leaders = rows.filter((r) => r.points === top && top > 0);
  const leaderId = leaders.length === 1 ? leaders[0]!.id : null;
  return (
    <section
      className="panel pointer-events-auto shrink-0 rounded-2xl p-2"
      data-testid="scoreboard"
      aria-label="Puntos de la mesa"
    >
      <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-amber-200/70">Puntos</p>
      <ul className="flex flex-col gap-1">
        {rows.map((p) => (
          <li
            key={p.id}
            className={`flex min-w-0 flex-col gap-0.5 rounded-lg px-2 py-1 ${
              p.active ? "bg-amber-200/15 ring-2 ring-amber-300" : ""
            }`}
            aria-current={p.active ? "true" : undefined}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/40" style={{ background: COLOR_HEX[p.color] }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: COLOR_HEX[p.color] }}>
                {p.you ? `Vos: ${p.name}` : p.name}
              </span>
              {p.active && <span className="shrink-0 text-[9px] font-bold uppercase text-amber-100">juega</span>}
              {!p.active && p.id === leaderId && (
                <span className="shrink-0 text-[9px] font-bold uppercase text-amber-200/80">punta</span>
              )}
              <span className="shrink-0 text-sm font-bold tabular-nums text-amber-50">{p.points}</span>
            </span>
            <PublicHand
              resources={p.resources}
              devs={p.devs}
              knights={p.knights}
              largestArmy={p.largestArmy}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
