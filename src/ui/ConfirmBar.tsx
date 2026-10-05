import { RESOURCES } from "@shared/types";
import type { ClientView } from "@shared/types";
import { commitPending } from "../play/commitAction";
import { describePending, pendingStillLegal } from "../play/confirm";
import { useApp } from "../store";
import { ResourceIcon } from "./icons/GameIcon";

/** Tira fija, también en el celu: Cancelar o Confirmar grande, sin tapar el centro del tablero. */
export function ConfirmBar({ view }: { view: ClientView }) {
  const pending = useApp((s) => s.pending);
  const set = useApp((s) => s.set);
  if (!pending || !pendingStillLegal(pending, view)) return null;
  const copy = describePending(pending, (id) => view.players.find((p) => p.id === id)?.name ?? "alguien");
  const cost = copy.cost;
  return (
    <div
      className="pointer-events-auto z-30 mx-2 mb-1 flex shrink-0 items-stretch gap-2 rounded-2xl border border-amber-200/40 bg-stone-950/95 p-2 shadow-xl lg:mr-[19.5rem]"
      data-testid="confirm-bar"
      role="region"
      aria-label="Confirmar acción"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-amber-50">{copy.title}</p>
        <p className="text-xs leading-snug text-amber-100/80">{copy.detail}</p>
        {cost && (
          <p className="mt-1 flex flex-wrap items-center gap-1.5" data-testid="confirm-cost">
            {RESOURCES.filter((r) => (cost[r] ?? 0) > 0).map((r) => (
              <span key={r} className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-50">
                <ResourceIcon resource={r} size={18} decorative />
                {cost[r]}
              </span>
            ))}
          </p>
        )}
      </div>
      <button
        type="button"
        data-testid="confirm-cancel"
        className="min-h-12 shrink-0 rounded-xl bg-stone-700 px-3 text-sm font-semibold text-amber-50"
        onClick={() => set({ pending: null })}
      >
        Cancelar
      </button>
      <button
        type="button"
        data-testid="confirm-go"
        className="min-h-12 min-w-28 shrink-0 rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white"
        onClick={() => void commitPending(pending)}
      >
        Confirmar
      </button>
    </div>
  );
}
