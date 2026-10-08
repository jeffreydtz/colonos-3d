import { useEffect, useRef } from "react";
import { COLOR_HEX, COLOR_LABEL } from "@shared/constants";
import type { KickoffInfo } from "@shared/types";
import { KICKOFF_SHOW_MS } from "../play/kickoff";
import { useFocusTrap } from "./useFocusTrap";

export function Kickoff({ info, onDone }: { info: KickoffInfo; onDone: () => void }) {
  const trap = useFocusTrap();
  const starter = info.order.find((p) => p.id === info.starterId) ?? info.order[0];
  const island = info.boardKind === "expansion" ? "Isla grande" : "Isla clásica";
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    const id = window.setTimeout(() => done.current(), KICKOFF_SHOW_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        done.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!starter) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#140d09]/90 p-3 sm:p-6" role="presentation">
      <div
        ref={trap}
        className="panel panel-solid kickoff-card max-h-full w-full max-w-lg overflow-y-auto rounded-3xl p-5 sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kickoff-title"
        data-testid="kickoff"
        tabIndex={-1}
      >
        <p className="text-xs tracking-[0.18em] text-amber-200/70 uppercase">{island}</p>
        <h2 id="kickoff-title" className="display mt-1 text-3xl text-amber-50 sm:text-4xl">
          Empieza la partida
        </h2>
        <p className="mt-3 flex items-center gap-2 text-lg text-amber-50" data-testid="kickoff-starter">
          <span className="h-4 w-4 shrink-0 rounded-full border border-white/40" style={{ background: COLOR_HEX[starter.color] }} />
          <span>
            Sorteo: arranca <b style={{ color: COLOR_HEX[starter.color] }}>{starter.name}</b>
            <span className="text-amber-100/70"> · {COLOR_LABEL[starter.color]}</span>
            {starter.isBot ? <span className="ml-2 text-xs font-bold tracking-wide text-sky-300 uppercase">bot</span> : null}
          </span>
        </p>
        <p className="mt-4 text-xs tracking-wide text-amber-200/70 uppercase">Orden de turnos</p>
        <ol className="mt-2 space-y-1.5" data-testid="kickoff-order">
          {info.order.map((p, i) => {
            const opens = p.id === info.starterId;
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${opens ? "bg-amber-200/15" : ""}`}
                data-testid="kickoff-seat"
              >
                <span className="w-5 text-center text-sm font-semibold text-amber-200/80">{i + 1}</span>
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/30" style={{ background: COLOR_HEX[p.color] }} />
                <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: COLOR_HEX[p.color] }}>
                  {p.name}
                </span>
                <span className="shrink-0 text-xs text-amber-100/70">{COLOR_LABEL[p.color]}</span>
                {p.isBot ? (
                  <span className="shrink-0 rounded-sm bg-sky-400/20 px-1 py-px text-[10px] font-bold tracking-wide text-sky-300 uppercase">
                    bot
                  </span>
                ) : null}
                {opens ? <span className="shrink-0 text-xs font-semibold text-amber-200">empieza</span> : null}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm text-amber-100/80">
          La segunda vuelta de la colocación recorre la mesa al revés y cierra en {starter.name}.
        </p>
        <button
          type="button"
          className="mt-5 w-full rounded-xl bg-amber-200 py-3 font-semibold text-stone-900"
          data-testid="kickoff-go"
          onClick={onDone}
        >
          A la mesa
        </button>
      </div>
    </div>
  );
}
