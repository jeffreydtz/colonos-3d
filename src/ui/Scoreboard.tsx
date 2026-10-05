import { COLOR_HEX } from "@shared/constants";
import type { ClientView } from "@shared/types";
import { resourceCountShown } from "../play/publicHand";
import { shownPoints } from "../play/shownPoints";
import { useApp } from "../store";
import { PublicHand } from "./PublicHand";

export function Scoreboard({ view, layout }: { view: ClientView; layout: "column" | "row" }) {
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
  const rowClass = layout === "column" ? "flex flex-col gap-1" : "grid grid-cols-2 gap-1";

  return (
    <section
      className={`pointer-events-auto ${layout === "column" ? "panel shrink-0 rounded-2xl p-2" : "px-2"}`}
      data-testid={layout === "column" ? "scoreboard" : "scoreboard-mobile"}
      aria-label="Puntos de la mesa"
    >
      {layout === "column" && (
        <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-amber-200/70">Puntos</p>
      )}
      <ul className={rowClass}>
        {rows.map((p) => (
          <li
            key={p.id}
            className={`flex min-w-0 flex-col gap-0.5 rounded-lg px-2 py-1 ${
              layout === "row" ? "bg-black/45" : ""
            } ${p.active ? "bg-amber-200/15 ring-2 ring-amber-300" : ""}`}
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
              dense={layout === "row"}
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
