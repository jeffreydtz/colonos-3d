import { useEffect } from "react";
import type { ClientView } from "@shared/types";
import { previewOrRun } from "../play/commitAction";
import { skipDiceHold } from "../play/diceHold";
import { sendAction } from "../socket";
import { useApp } from "../store";
import { tradeTabFor } from "../play/actionTabs";
import { FocusTrap } from "./useFocusTrap";

/** Atajos de partida. Ignora inputs. */
export function Hotkeys({ view }: { view: ClientView }) {
  const set = useApp((s) => s.set);
  const mesaOpen = useApp((s) => s.mesaOpen);
  const shortcutsOpen = useApp((s) => s.shortcutsOpen);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        const ui = useApp.getState().diceUi;
        set({ shortcutsOpen: false, sheet: null, bankTradeFrom: null, pending: null, diceUi: skipDiceHold(ui) });
        return;
      }
      if (k === "?" || k === "h") {
        e.preventDefault();
        set({ shortcutsOpen: !shortcutsOpen });
        return;
      }
      if (k === "r" && view.legal.canRoll) {
        e.preventDefault();
        void sendAction({ type: "roll" }).then((r) => {
          if (!r.ok) set({ toast: r.error ?? "No se pudo tirar." });
        });
      }
      if (k === "p" && view.legal.canEndTurn) {
        e.preventDefault();
        void previewOrRun({ kind: "end_turn" });
      }
      if (k === "b") {
        e.preventDefault();
        set({ actionsOpen: true, sheet: "build", actionTab: "construir" });
      }
      if (k === "t") {
        e.preventDefault();
        set({ actionsOpen: true, sheet: "build", actionTab: tradeTabFor(view) });
      }
      if (k === "m") {
        e.preventDefault();
        set({ mesaOpen: !mesaOpen, sheet: mesaOpen ? null : "mesa" });
      }
      if (k === "c") {
        e.preventDefault();
        set({ recenterNonce: Date.now() });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, mesaOpen, shortcutsOpen, set]);
  return null;
}

export function ShortcutsHelp() {
  const set = useApp((s) => s.set);
  const open = useApp((s) => s.shortcutsOpen);
  if (!open) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4" data-testid="shortcuts-help">
      <FocusTrap
        className="panel w-full max-w-sm rounded-2xl p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <p id="shortcuts-title" className="display mb-2 text-lg">Atajos</p>
        <ul className="space-y-1 text-sm text-amber-50">
          <li><kbd className="kbd">R</kbd> Tirar dados</li>
          <li><kbd className="kbd">P</kbd> Pasar turno</li>
          <li><kbd className="kbd">B</kbd> Construir y cartas</li>
          <li><kbd className="kbd">T</kbd> Comerciar: banco o jugadores</li>
          <li><kbd className="kbd">M</kbd> Mesa (log / chat)</li>
          <li><kbd className="kbd">C</kbd> Centrar cámara</li>
          <li><kbd className="kbd">?</kbd> Esta ayuda</li>
          <li><kbd className="kbd">Esc</kbd> Cerrar o cancelar la acción marcada</li>
        </ul>
        <p className="mt-2 text-[11px] text-amber-100/70">En la tira de mano: tocá un recurso para cambiarlo al banco (2:1 / 3:1 / 4:1).</p>
        <button className="mt-3 min-h-11 w-full rounded-xl bg-amber-200 font-semibold text-stone-900" onClick={() => set({ shortcutsOpen: false })}>
          Listo
        </button>
      </FocusTrap>
    </div>
  );
}
