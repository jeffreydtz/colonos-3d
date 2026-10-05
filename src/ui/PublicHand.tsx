import { COLOR_HEX } from "@shared/constants";
import type { ClientView } from "@shared/types";
import { handCaption, resourceCountShown } from "../play/publicHand";
import { useApp } from "../store";
import { DevIcon } from "./icons/GameIcon";
import { PieceIcon } from "./PieceIcon";

function CardBack({ tone }: { tone: "recurso" | "desarrollo" }) {
  const dev = tone === "desarrollo";
  return (
    <svg viewBox="0 0 16 22" className="h-4 w-3 shrink-0" aria-hidden>
      <rect
        x="0.7"
        y="0.7"
        width="14.6"
        height="20.6"
        rx="1.6"
        fill={dev ? "#1b4d3e" : "#f4e4c1"}
        stroke={dev ? "#e8c56b" : "#6b4a2a"}
        strokeWidth="1.2"
      />
      {dev ? (
        <path d="M8 5.4 11.1 11 8 16.6 4.9 11Z" fill="#e8c56b" />
      ) : (
        <rect x="3.1" y="3.4" width="9.8" height="15.2" rx="0.6" fill="none" stroke="#6b4a2a" strokeWidth="0.8" />
      )}
    </svg>
  );
}

function Stack({ n, tone }: { n: number; tone: "recurso" | "desarrollo" }) {
  const extra = n > 1 ? 2 : n === 0 ? 0 : 1;
  const backs = Math.max(1, extra);
  return (
    <span className="inline-flex items-center" aria-hidden>
      {Array.from({ length: backs }, (_, i) => (
        <span key={i} className={i === 0 ? "relative" : "relative -ml-1.5"}>
          <CardBack tone={tone} />
        </span>
      ))}
    </span>
  );
}

export function PublicHand({
  resources,
  devs,
  knights,
  largestArmy,
  dense,
  armyWord = true,
}: {
  resources: number;
  devs: number;
  knights: number;
  largestArmy: boolean;
  dense?: boolean;
  /** En el asiento angosto el escudo alcanza; el nombre va en el panel de puntos. */
  armyWord?: boolean;
}) {
  const caption = handCaption(resources, devs, knights, largestArmy);
  return (
    <span
      className={`flex min-w-0 flex-wrap items-center ${dense ? "max-w-full gap-x-1 gap-y-0.5" : "gap-1.5"} text-[10px] leading-none text-amber-50`}
      data-testid="public-hand"
      data-tip={caption}
      aria-label={caption}
    >
      <span className="inline-flex items-center gap-0.5" data-testid="public-resources" data-count={resources}>
        <Stack n={resources} tone="recurso" />
        <span className="font-bold tabular-nums">{resources}</span>
      </span>
      <span className="inline-flex items-center gap-0.5" data-testid="public-devs" data-count={devs}>
        <Stack n={devs} tone="desarrollo" />
        <span className="font-bold tabular-nums">{devs}</span>
      </span>
      <span
        className={`inline-flex items-center gap-0.5 ${largestArmy ? "rounded bg-amber-200/15 px-0.5 ring-1 ring-amber-200/80" : ""}`}
        data-testid="public-knights"
        data-count={knights}
      >
        <DevIcon kind="caballero" size={dense ? 13 : 15} decorative />
        <span className="font-bold tabular-nums">{knights}</span>
        {largestArmy && (
          <span data-testid="public-army" className="inline-flex items-center gap-0.5">
            <PieceIcon id="premio_ejercito" />
            {armyWord && <span className="text-[9px] font-bold uppercase tracking-wide text-amber-100">Ejército</span>}
          </span>
        )}
      </span>
    </span>
  );
}

/** En la pestaña Jugadores: cada rival, sin abrir su mano. */
export function RivalHands({ view }: { view: ClientView }) {
  const diceUi = useApp((s) => s.diceUi);
  const rivals = view.players.filter((p) => p.id !== view.youId);
  return (
    <ul className="mb-2 space-y-1" data-testid="rival-hands" aria-label="Cartas de los rivales">
      {rivals.map((p) => (
        <li key={p.id} className="flex items-center gap-2 rounded-lg bg-black/30 px-2 py-1" data-testid="rival-row">
          <span className="h-2 w-2 shrink-0 rounded-full border border-white/30" style={{ background: COLOR_HEX[p.color] }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: COLOR_HEX[p.color] }}>
            {p.name}
            {p.isBot ? " · bot" : ""}
          </span>
          <PublicHand
            resources={resourceCountShown(p.resourceCount, p.id, view.events, diceUi)}
            devs={p.devCount}
            knights={p.knightsPlayed}
            largestArmy={p.hasLargestArmy}
          />
        </li>
      ))}
    </ul>
  );
}
