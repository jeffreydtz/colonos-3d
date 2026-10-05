import { lazy, Suspense, Component, useEffect, type ReactNode } from "react";
import { SfxDirector } from "../audio/SfxDirector";
import { reduceMotion } from "../audio/sfx";
import { CardReveal } from "../three/CardReveal";
import { beginDiceHold, DICE_HOLD_MS, DICE_HOLD_REDUCED_MS, skipDiceHold } from "../play/diceHold";
import { devRevealForYou } from "../play/spotlight";
import { Hud } from "../ui/Hud";
import { Kickoff } from "../ui/Kickoff";
import { IconSheet } from "../ui/icons/IconSheet";
import { useApp } from "../store";

const BoardScene = lazy(() => import("../three/BoardScene"));

class BoardGuard extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  render() {
    if (this.state.err) {
      return <p className="p-8 text-amber-100">No se pudo cargar el tablero 3D.</p>;
    }
    return this.props.children;
  }
}

export function Game() {
  const view = useApp((s) => s.view);
  const revealCard = useApp((s) => s.revealCard);
  const sfxOn = useApp((s) => s.sfxOn);
  const unboxHidden = useApp((s) => s.unboxHidden);
  const artFreeze = useApp((s) => s.artFreeze);
  const iconSheet = useApp((s) => s.iconSheet);
  const lastFx = useApp((s) => s.lastFx);
  const kickoff = useApp((s) => s.kickoff);
  const set = useApp((s) => s.set);
  useEffect(() => {
    set({ unboxHidden: false });
  }, [view?.unboxPlayerId, set]);
  useEffect(() => {
    if (artFreeze) {
      const v = useApp.getState().view;
      if (!v) return;
      set({
        diceUi: { revealed: true, presenting: false, rollNo: v.rollNo, holdFromEventId: 0 },
      });
      return;
    }
    if (!lastFx?.animations.includes("dice")) return;
    const v = useApp.getState().view;
    if (!v) return;
    const hold = reduceMotion() ? DICE_HOLD_REDUCED_MS : DICE_HOLD_MS;
    set({ diceUi: beginDiceHold(v) });
    const t = window.setTimeout(() => {
      const ui = useApp.getState().diceUi;
      if (ui.presenting && !ui.revealed) set({ diceUi: skipDiceHold(ui) });
    }, hold);
    return () => window.clearTimeout(t);
  }, [lastFx?.at, lastFx?.animations, artFreeze, set]);
  useEffect(() => {
    if (!view || unboxHidden || revealCard) return;
    if (!devRevealForYou(view.youId, view.unboxPlayerId)) return;
    const card = view.hand.devCards[view.hand.devCards.length - 1];
    if (card) set({ revealCard: card.kind });
  }, [view, unboxHidden, revealCard, set]);
  useEffect(() => {
    if (revealCard) set({ sheet: null });
  }, [revealCard, set]);
  if (!view) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        {iconSheet && <IconSheet />}
        {kickoff ? <Kickoff info={kickoff} onDone={() => set({ kickoff: null })} /> : null}
        <p className="p-8 text-amber-100">Cargando la isla…</p>
      </div>
    );
  }
  const showingUnbox = Boolean(revealCard);
  return (
    <div className="relative h-full w-full overflow-hidden">
      <SfxDirector />
      {/* La mesa llega a los bordes: el HUD flota encima y la cámara encuadra la isla en lo que queda libre. */}
      <div className="absolute inset-0">
        <Suspense fallback={<p className="p-8 text-amber-100">Cargando el tablero 3D…</p>}>
          <BoardGuard>
            <BoardScene view={view} />
          </BoardGuard>
        </Suspense>
      </div>
      {!showingUnbox && !artFreeze && <Hud view={view} />}
      {kickoff && !artFreeze ? <Kickoff info={kickoff} onDone={() => set({ kickoff: null })} /> : null}
      {iconSheet && <IconSheet />}
      {revealCard && (
        <CardReveal
          kind={revealCard}
          owner
          sfx={sfxOn}
          deadlineAt={view.deadlineAt}
          onClose={() => set({ revealCard: null, unboxHidden: true })}
        />
      )}
    </div>
  );
}
