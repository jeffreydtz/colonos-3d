import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SFX_CATEGORIES, SFX_CATEGORY_LABEL } from "../audio/prefs";
import { countAfterHold, diceHeld, gainsWhileHeld, resourcesAfterHold, skipDiceHold } from "../play/diceHold";
import { COLOR_HEX, RESOURCE_LABEL } from "@shared/constants";
import { RESOURCES } from "@shared/types";
import type { ClientView, PublicPlayer, Resource } from "@shared/types";
import { previewOrRun } from "../play/commitAction";
import { pendingStillLegal, saveConfirmActions } from "../play/confirm";
import { sendAction, exitMesa } from "../socket";
import { useApp } from "../store";
import { PLAYER_GLYPHS, THEMES, THEME_LABEL, saveTheme } from "../theme/tokens";
import { saveGraphicsMode } from "../three/graphics";
import { offersForYou, tradeTabFor } from "../play/actionTabs";
import { stealNoticeForYou } from "../play/stealNotice";
import { dockLabel } from "../play/phaseCue";
import { shownPoints, winnerShownPoints } from "../play/shownPoints";
import { handCaption } from "../play/publicHand";
import { PublicHand } from "./PublicHand";
import { ActionPanel } from "./ActionPanel";
import { BagIcons, RateTag, ResourceIcon, ResourcePick, rateTip, settlementPortRate } from "./icons/GameIcon";
import { MesaPanel } from "./MesaPanel";
import { ProductionFly } from "./ProductionFly";
import { PieceIcon } from "./PieceIcon";
import { ConfirmBar } from "./ConfirmBar";
import { Hotkeys, ShortcutsHelp } from "./Hotkeys";
import { FocusTrap } from "./useFocusTrap";
import { Scoreboard } from "./Scoreboard";
import { TurnAnnounce } from "./TurnAnnounce";
import { TurnClock } from "./TurnClock";
import { useVisualViewportInset } from "./useVisualViewportInset";

const PHASE_YOURS: Record<string, string> = {
  colocacion_poblado: "Colocá un poblado en un vértice.",
  colocacion_camino: "Pegale un camino a ese poblado.",
  dados: "Tirate los dados cuando quieras.",
  descarte: "Hay que descartar: más de 7 cartas no va.",
  ladron: "Mové el ladrón a otro hexágono.",
  principal: "Construí, comerciá o pasá el turno.",
  construccion_especial: "Pausa de construcción: sólo caminos, poblados y ciudades.",
  fin: "Se terminó la partida.",
};

const PHASE_OTHERS: Record<string, string> = {
  colocacion_poblado: "está colocando un poblado.",
  colocacion_camino: "está tendiendo un camino.",
  dados: "está por tirar los dados.",
  descarte: "están descartando cartas.",
  ladron: "está moviendo el ladrón.",
  principal: "está en su turno.",
  construccion_especial: "está en la pausa de construcción.",
  fin: "Se terminó la partida.",
};

function phaseLine(view: ClientView, yourTurn: boolean, currentName: string): string {
  if (view.winnerId) {
    return `Ganó ${view.players.find((p) => p.id === view.winnerId)?.name ?? "alguien"}`;
  }
  if (view.pendingRoadBuilding > 0 && yourTurn) {
    return view.pendingRoadBuilding === 2 ? "Poné 2 caminos" : "Poné 1 camino";
  }
  if (view.phase === "descarte") {
    const names = view.waitingDiscard
      .map((id) => view.players.find((p) => p.id === id)?.name)
      .filter(Boolean);
    if (view.legal.mustDiscard > 0) return "Tenés que descartar la mitad de la mano.";
    if (names.length) return `Descartan ${names.join(" y ")}.`;
    return "Esperando a que descarten los demás.";
  }
  if (view.phase === "ladron" && view.legal.stealFrom.length > 0 && yourTurn) {
    return "Elegí a quién le afanás.";
  }
  if (yourTurn && view.phase === "colocacion_poblado") {
    const n = view.buildings.filter((b) => b.playerId === view.youId).length;
    return n > 0
      ? "Segundo poblado: sólo la casita. El camino viene después."
      : "Primer paso: poné un poblado. El camino es el siguiente.";
  }
  if (yourTurn && view.phase === "colocacion_camino") {
    return "Ahora el camino, pegado a ese poblado. Recién después pasa el turno.";
  }
  if (yourTurn) return PHASE_YOURS[view.phase] ?? "Te toca.";
  return `${currentName} ${PHASE_OTHERS[view.phase] ?? "está jugando."}`;
}

const PIP_LAYOUT: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** Cara de dado chica para el banner: se lee de un vistazo, el texto queda para lectores. */
function DieFace({ n }: { n: number }) {
  const on = new Set(PIP_LAYOUT[n] ?? []);
  return (
    <span
      aria-hidden
      className="inline-grid h-5 w-5 grid-cols-3 grid-rows-3 gap-[1px] rounded-[4px] bg-amber-50 p-[3px] shadow-sm"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`rounded-full ${on.has(i) ? "bg-stone-900" : ""}`} />
      ))}
    </span>
  );
}

function IconCenter() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
    </svg>
  );
}

function IconExit() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />
    </svg>
  );
}

const SETTING_ROW = "min-h-10 rounded-xl bg-black/30 px-3 text-left text-xs font-semibold text-amber-100 hover:bg-black/45";

function SeatChip({
  p,
  i,
  view,
  inline,
  cards,
}: {
  p: PublicPlayer;
  i: number;
  view: ClientView;
  inline?: boolean;
  cards?: number;
}) {
  const current = p.id === view.currentPlayerId;
  const you = p.id === view.youId;
  const tint = COLOR_HEX[p.color];
  const glyph = PLAYER_GLYPHS[i % PLAYER_GLYPHS.length];
  const cardCount = cards ?? p.resourceCount;
  const hand = handCaption(cardCount, p.devCount, p.knightsPlayed, p.hasLargestArmy);
  const layout = inline ? "gap-0.5 px-1.5" : "gap-[3px] px-1 sm:px-2";
  return (
    <div
      className={`panel flex min-w-0 flex-col justify-center rounded-lg py-1 ${layout} ${
        current ? "ring-2 ring-amber-300 bg-amber-200/15" : ""
      } ${you ? "border-amber-200/60" : ""}`}
      data-testid="seat-chip"
      data-seat={p.id}
      aria-current={current ? "true" : undefined}
      title={`${glyph} ${p.name}${p.isBot ? " (bot)" : ""} · ${p.visibleVp} puntos · ${hand}`}
    >
      <div className="flex min-w-0 items-center gap-[3px] sm:gap-1">
        <span className="hidden h-2 w-2 shrink-0 rounded-full border border-white/40 sm:block" style={{ background: tint }} aria-hidden />
        <span
          className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[11px] leading-none sm:text-xs"
          style={{ color: tint }}
          aria-hidden
          data-testid={i === 0 ? "seat-glyph" : "seat-glyph-n"}
        >
          {glyph}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-none sm:text-xs"
          style={{ color: tint }}
          data-testid={i === 0 ? "chip-name-first" : "chip-name"}
        >
          {you ? `Vos: ${p.name}` : p.name}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1 text-[10px] leading-none text-amber-100/80">
        {p.isBot && (
          <span
            className="shrink-0 rounded-sm bg-sky-400/20 px-[3px] py-[1px] text-[8px] font-bold uppercase tracking-wide text-sky-300"
            title="bot"
            aria-label="bot"
            data-testid="chip-bot"
          >
            bot
          </span>
        )}
        {!p.connected && !p.isBot && (
          <span
            className="shrink-0 rounded-sm bg-red-400/20 px-[3px] py-[1px] text-[8px] font-bold uppercase text-red-300"
            title="sin conexión"
            aria-label="sin conexión"
            data-testid="chip-offline"
          >
            off
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-wrap items-center">
          <PublicHand
            dense
            armyWord={false}
            resources={cardCount}
            devs={p.devCount}
            knights={p.knightsPlayed}
            largestArmy={p.hasLargestArmy}
          />
        </span>
        {p.hasLongestRoad && (
          <span className="hidden shrink-0 lg:inline-flex">
            <PieceIcon id="premio_camino" />
          </span>
        )}
        <span className="ml-auto shrink-0 font-bold tabular-nums text-amber-50" aria-label={`${p.visibleVp} puntos`}>
          {p.visibleVp}
          <span className="ml-[1px] text-[8px] font-semibold text-amber-200/70">pt</span>
        </span>
      </div>
    </div>
  );
}

function TopButton({
  label,
  short,
  icon,
  onClick,
  title,
  testId,
  expanded,
  danger,
}: {
  label: string;
  short?: string;
  icon?: ReactNode;
  onClick: () => void;
  title?: string;
  testId?: string;
  expanded?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={`inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
        danger ? "border border-red-300/50 bg-red-800 text-red-50 shadow-lg" : "panel text-amber-100"
      }`}
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      aria-expanded={expanded}
      data-testid={testId}
    >
      {icon}
      <span className={icon ? "hidden md:inline" : ""}>{short ?? label}</span>
    </button>
  );
}

/** Indicador fijo: nombre del que juega, en su color, y el reloj. Va sobre la mano para no tapar el tablero ni el registro. */
function TurnBar({ view }: { view: ClientView }) {
  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const winner = view.winnerId ? view.players.find((p) => p.id === view.winnerId) : undefined;
  const yourTurn = view.currentPlayerId === view.youId && !view.winnerId;
  const shown = winner ?? current;
  const tint = COLOR_HEX[shown?.color ?? "naranja"];
  const label = winner ? `Ganó ${winner.name}` : yourTurn ? `Vos: ${current?.name ?? "…"}` : (current?.name ?? "…");
  return (
    <div
      className="pointer-events-none bg-[#0b0806] px-2 pt-1.5 pb-1 lg:bg-transparent lg:px-3 lg:pt-0 lg:pr-80 lg:pb-0"
      data-hud-edge="bottom"
      data-testid="turn-bar"
    >
      <div
        className="pointer-events-auto flex min-h-14 items-center gap-3 rounded-2xl border-2 bg-[#140d09] px-3 shadow-lg md:px-4"
        style={{ borderColor: tint }}
      >
        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/50" style={{ background: tint }} aria-hidden />
        <p className="flex min-w-0 flex-1 items-center gap-2" aria-live="polite">
          <span
            className="display min-w-0 truncate text-xl font-semibold leading-none md:text-2xl"
            style={{ color: tint }}
            data-testid={yourTurn ? "tu-turno" : undefined}
          >
            {label}
          </span>
          {!view.winnerId && !yourTurn && current?.isBot && (
            <span
              className="shrink-0 rounded-sm bg-sky-400/20 px-1 py-[1px] font-sans text-[9px] font-bold uppercase tracking-wide text-sky-300"
              data-testid="turn-bot"
            >
              bot
            </span>
          )}
        </p>
        {view.deadlineAt && view.phase !== "fin" && !view.winnerId && <TurnClock at={view.deadlineAt} phase={view.phase} />}
      </div>
    </div>
  );
}

export function Hud({ view }: { view: ClientView }) {
  const set = useApp((s) => s.set);
  const toast = useApp((s) => s.toast);
  const hint = useApp((s) => s.hint);
  const sheet = useApp((s) => s.sheet);
  const netDown = useApp((s) => s.netDown);
  const mesaOpen = useApp((s) => s.mesaOpen);
  const unread = useApp((s) => s.chatUnread);
  const graphics = useApp((s) => s.graphics);
  const theme = useApp((s) => s.theme);
  const actionsOpen = useApp((s) => s.actionsOpen);
  const actionTab = useApp((s) => s.actionTab);
  const diceUi = useApp((s) => s.diceUi);
  const sfxOn = useApp((s) => s.sfxOn);
  const sfxVolume = useApp((s) => s.sfxVolume);
  const sfxMute = useApp((s) => s.sfxMute);
  const sfxUnlocked = useApp((s) => s.sfxUnlocked);
  const confirmActions = useApp((s) => s.confirmActions);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const stealSeen = useRef<number | null>(null);
  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const yourTurn = view.currentPlayerId === view.youId;
  const manySeats = view.players.length >= 5;
  const incoming = view.trades.filter(
    (t) => t.toId === view.youId || t.toId === "todos" || t.fromId === view.youId,
  );
  const waiting = offersForYou(view);
  // Con la pestaña «Jugadores» abierta las ofertas ya están ahí: la bandeja sobre el tablero sobraba.
  const offersShownDesk = actionsOpen && actionTab === "jugadores";
  const offersShownSheet = sheet === "build" && actionTab === "jugadores";
  const kb = useVisualViewportInset();
  // Mientras ruedan los dados, nada en el HUD adelanta el resultado (fase, mano, cartas, descarte).
  const holdingDice = diceHeld(diceUi);
  const heldGains = useMemo(
    () => (holdingDice ? gainsWhileHeld(view.events, diceUi.holdFromEventId) : null),
    [holdingDice, view.events, diceUi.holdFromEventId],
  );

  useEffect(() => {
    if (!confirmExit) return;
    const id = window.setTimeout(() => setConfirmExit(false), 3500);
    return () => window.clearTimeout(id);
  }, [confirmExit]);

  useEffect(() => {
    const maxId = view.events.reduce((m, e) => Math.max(m, e.id), 0);
    if (stealSeen.current == null) {
      stealSeen.current = maxId;
      return;
    }
    const notice = stealNoticeForYou(view.events, view.youId, stealSeen.current);
    stealSeen.current = maxId;
    if (notice) set({ toast: notice });
  }, [view.events, view.youId, set]);

  useEffect(() => {
    if (!toast) return;
    const ms = typeof toast === "string" ? 4500 : 7000;
    const id = window.setTimeout(() => set({ toast: null }), ms);
    return () => window.clearTimeout(id);
  }, [toast, set]);

  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => set({ hint: null }), 3200);
    return () => window.clearTimeout(id);
  }, [hint, set]);

  useEffect(() => {
    const p = useApp.getState().pending;
    if (p && !pendingStillLegal(p, view)) set({ pending: null });
  }, [view, set]);

  function leave() {
    if (!confirmExit) {
      setConfirmExit(true);
      return;
    }
    void exitMesa().then(() => {
      set({
        screen: "home",
        lobby: null,
        view: null,
        token: null,
        playerId: null,
        code: "",
        error: null,
        revealCard: null,
        sheet: null,
        pending: null,
      });
    });
  }

  const primary = holdingDice
    ? null
    : view.legal.canRoll
      ? { label: "Tirar dados", tone: "amber" as const, key: "R", act: () => sendAction({ type: "roll" }) }
      : view.legal.canEndTurn
        ? {
            label: "Pasar turno",
            tone: "emerald" as const,
            key: "P",
            act: () => previewOrRun({ kind: "end_turn" }).then((r) => r ?? { ok: true }),
          }
        : null;
  function runPrimary() {
    if (!primary) return;
    void primary.act().then((r) => {
      if (primary.tone === "amber" && !r.ok) set({ toast: r.error ?? "No se pudo." });
    });
  }
  const phaseCueLabel = dockLabel(view.phase, yourTurn, current?.name ?? "");
  const phaseCue =
    !holdingDice && !primary && yourTurn && phaseCueLabel !== "Tu turno" && phaseCueLabel !== "Fin"
      ? phaseCueLabel
      : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col" role="complementary" aria-label="Controles de partida">
      <Hotkeys view={view} />
      <ShortcutsHelp />
      <a
        href="#mobile-dock"
        className="sr-only focus:not-sr-only focus:pointer-events-auto focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-amber-200 focus:px-3 focus:py-2 focus:text-stone-900"
      >
        Saltar a acciones
      </a>
      {netDown && (
        <div
          className="pointer-events-auto bg-red-900/90 px-3 py-2 text-center text-sm text-red-50"
          data-testid="net-down"
        >
          Se cortó la red. Reintentando… tu mano queda en el asiento.
        </div>
      )}

      <div className="relative z-20 shrink-0">
      <div
        className="pointer-events-auto flex h-14 items-center gap-2 px-2 md:h-16 md:px-3"
        data-hud-edge="top"
      >
        {sfxOn && !sfxUnlocked && (
          <p
            className="min-w-0 flex-1 truncate text-[11px] leading-none text-amber-100/80"
            data-testid="sfx-unlock"
            title="Tocá o pulsá una tecla para que el navegador deje sonar, también en el celular."
          >
            Tocá o pulsá una tecla para que el navegador deje sonar, también en el celular.
          </p>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {holdingDice ? (
            <button
              type="button"
              className="panel inline-flex min-h-10 items-center rounded-full px-3 text-xs font-semibold text-amber-100"
              data-testid="dice-hold"
              onClick={() => set({ diceUi: skipDiceHold(diceUi) })}
            >
              Dados en el aire
            </button>
          ) : (
            diceUi.revealed &&
            view.dice && (
              <p
                className="panel inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-amber-100"
                data-testid="dice-total"
                aria-label={`Dados: ${view.dice[0]} + ${view.dice[1]} = ${view.dice[0] + view.dice[1]}`}
              >
                <DieFace n={view.dice[0]} />
                <DieFace n={view.dice[1]} />
                <span aria-hidden>= {view.dice[0] + view.dice[1]}</span>
              </p>
            )
          )}
          <button
            className="panel relative hidden min-h-10 rounded-full px-3 text-xs font-semibold text-amber-100 lg:block"
            title="Mesa (M)"
            onClick={() => set({ mesaOpen: !mesaOpen })}
          >
            {mesaOpen ? "Ocultar mesa" : "Mesa"}
            {!mesaOpen && unread > 0 && <Badge n={unread} />}
          </button>
          <TopButton
            label="Opciones"
            testId="settings-toggle"
            expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          />
        </div>
      </div>

      <div className="pointer-events-auto relative px-2 md:px-3 lg:pr-[19.5rem]">
        {/* 5–6 asientos en un celu: dos filas de tres chips de una línea, así nombre, BOT, cartas y puntos entran sin cortarse. */}
        <div
          className={`grid gap-1 ${manySeats ? `grid-cols-3 ${view.players.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-6"}` : ""}`}
          style={manySeats ? undefined : { gridTemplateColumns: `repeat(${view.players.length}, minmax(0, 1fr))` }}
          data-testid="seat-chips"
          data-hud-edge="top"
        >
          {view.players.map((p, i) => (
            <SeatChip
              key={p.id}
              p={p}
              i={i}
              view={view}
              inline={manySeats}
              cards={heldGains ? countAfterHold(p.resourceCount, heldGains.get(p.id)) : undefined}
            />
          ))}
        </div>
        {mesaOpen && (
          <div
            aria-hidden
            data-testid="chip-fade"
            className="pointer-events-none absolute inset-y-0 right-[19.5rem] hidden w-6 bg-gradient-to-l from-[#071824]/60 to-transparent lg:block"
          />
        )}
      </div>

      {settingsOpen && (
        <>
          <button
            className="pointer-events-auto fixed inset-0 z-30 cursor-default"
            aria-label="Cerrar ajustes"
            onClick={() => setSettingsOpen(false)}
          />
          <div
            className="panel panel-solid pointer-events-auto absolute inset-x-2 top-full z-40 mt-1 flex max-h-[min(28rem,calc(100dvh-22rem))] flex-col gap-1.5 overflow-y-auto rounded-2xl p-2 md:inset-x-3 lg:inset-x-auto lg:left-3 lg:w-80"
            data-testid="settings-panel"
            role="dialog"
            aria-label="Opciones"
          >
              <button
                className={SETTING_ROW}
                onClick={() => {
                  set({ recenterNonce: Date.now() });
                  setSettingsOpen(false);
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <IconCenter /> Centrar
                </span>
              </button>
              <button
                className={SETTING_ROW}
                data-testid="gfx-toggle"
                onClick={() => {
                  const next = graphics === "liviano" ? "normal" : "liviano";
                  saveGraphicsMode(next);
                  set({ graphics: next });
                }}
              >
                Gráficos: {graphics === "liviano" ? "liviano" : "normal"}
              </button>
              <button
                className={SETTING_ROW}
                data-testid="theme-toggle"
                onClick={() => {
                  const i = THEMES.indexOf(theme);
                  const next = THEMES[(i + 1) % THEMES.length]!;
                  saveTheme(next);
                  set({ theme: next });
                }}
              >
                Ambiente: {THEME_LABEL[theme]}
              </button>
              <button
                className={SETTING_ROW}
                data-testid="sfx-toggle"
                title="Sonido de mesa"
                onClick={() => set({ sfxOn: !sfxOn })}
              >
                Sonido: {sfxOn ? "activado" : "apagado"}
              </button>
              <button
                type="button"
                className={SETTING_ROW}
                data-testid="confirm-toggle"
                aria-pressed={confirmActions}
                onClick={() => {
                  const next = !confirmActions;
                  saveConfirmActions(next);
                  set({ confirmActions: next, pending: next ? useApp.getState().pending : null });
                }}
              >
                Confirmación: {confirmActions ? "activada" : "desactivada"}
              </button>
              <label className="flex min-h-11 flex-col justify-center gap-1 rounded-xl bg-black/30 px-3 py-1.5">
                <span className="text-xs font-semibold text-amber-100">Volumen general · {Math.round(sfxVolume * 100)}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(sfxVolume * 100)}
                  className="accent-amber-300"
                  aria-label="Volumen general"
                  data-testid="sfx-volume"
                  onChange={(e) => set({ sfxVolume: Number(e.target.value) / 100 })}
                />
              </label>
              {SFX_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className="min-h-11 rounded-xl bg-black/30 px-3 text-left text-xs font-semibold text-amber-100 hover:bg-black/45"
                  data-testid={`sfx-cat-${cat}`}
                  aria-pressed={!sfxMute[cat]}
                  onClick={() => set({ sfxMute: { ...sfxMute, [cat]: !sfxMute[cat] } })}
                >
                  {SFX_CATEGORY_LABEL[cat]}: {sfxMute[cat] ? "apagado" : "activado"}
                </button>
              ))}
              <button
                className={`${SETTING_ROW} pointer-coarse:hidden`}
                data-testid="shortcuts-toggle"
                title="Atajos (?)"
                onClick={() => {
                  setSettingsOpen(false);
                  set({ shortcutsOpen: true });
                }}
              >
                Atajos de teclado
              </button>
              <button
                className={`${SETTING_ROW} ${confirmExit ? "bg-red-800 text-red-50" : ""}`}
                data-testid="exit-mesa"
                onClick={leave}
              >
                <span className="inline-flex items-center gap-2">
                  <IconExit /> {confirmExit ? "¿Salir de la partida?" : "Salir"}
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      <div
        className="pointer-events-auto absolute top-16 right-3 bottom-40 z-10 hidden w-72 flex-col gap-2 lg:flex"
        data-hud-edge="right"
        data-testid="score-column"
      >
        <Scoreboard view={view} />
        {mesaOpen && (
          <div className="flex min-h-0 flex-1 flex-col" data-testid="mesa-panel">
            <MesaPanel view={view} onClose={() => set({ mesaOpen: false })} closeTestId="mesa-close" />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <TurnAnnounce view={view} />
      </div>
      {incoming.length > 0 && (
        <div
          className={`pointer-events-auto relative z-40 mx-auto mb-2 flex max-w-lg flex-col gap-1 px-2 ${
            offersShownDesk ? "lg:hidden" : ""
          } ${offersShownSheet ? "max-lg:hidden" : ""}`}
          data-testid="trade-inbox"
        >
          {incoming.slice(0, 3).map((t) => {
            const from = view.players.find((p) => p.id === t.fromId)?.name ?? "Alguien";
            const mine = t.fromId === view.youId;
            return (
              <div key={t.id} className="panel flex items-center gap-2 rounded-xl px-3 py-2 text-xs">
                <span className="flex-1 text-amber-50">
                  {mine ? "Tu oferta" : `${from} ofrece`}
                </span>
                <span className="inline-flex items-center gap-1">
                  <BagIcons bag={t.give} />
                  <span aria-hidden>→</span>
                  <BagIcons bag={t.want} />
                </span>
                {!mine && (
                  <button
                    className="min-h-9 rounded-lg bg-emerald-700 px-2 font-semibold"
                    data-testid="trade-accept"
                    onClick={() => void previewOrRun({ kind: "accept", tradeId: t.id })}
                  >
                    Aceptar
                  </button>
                )}
                <button
                  className="min-h-9 rounded-lg bg-black/40 px-2 text-amber-100/80"
                  aria-label={mine ? "Cancelar oferta" : t.toId === "todos" ? "Pasar de la oferta" : "Rechazar oferta"}
                  data-testid={mine ? "trade-cancel" : "trade-reject"}
                  onClick={() => void sendAction({ type: "reject_trade", tradeId: t.id })}
                >
                  {mine ? "Cancelar" : t.toId === "todos" ? "Paso" : "Rechazar"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <ProductionFly />

      {toast ? (
        typeof toast === "string" ? (
          <button
            className="pointer-events-auto relative z-30 mx-auto mb-2 rounded-xl bg-red-800 px-4 py-2 text-sm"
            data-testid="toast"
            role="alert"
            onClick={() => set({ toast: null })}
          >
            {toast}
          </button>
        ) : (
          <button
            className="pointer-events-auto relative z-30 mx-auto mb-2 flex max-w-md items-center gap-2.5 rounded-2xl border border-amber-200/55 bg-stone-950 px-4 py-3 text-base font-semibold text-amber-50 shadow-xl"
            data-testid="toast"
            data-kind="robo"
            data-resource={toast.resource}
            role="alert"
            onClick={() => set({ toast: null })}
          >
            <ResourceIcon resource={toast.resource} size={28} decorative />
            <span>{toast.text}</span>
          </button>
        )
      ) : (
        hint && (
          <button
            className="pointer-events-auto mx-auto mb-2 rounded-xl border border-amber-200/25 bg-stone-900/90 px-4 py-2 text-sm text-amber-50"
            data-testid="hint"
            role="status"
            onClick={() => set({ hint: null })}
          >
            {hint}
          </button>
        )
      )}

      <ConfirmBar view={view} />

      <TurnBar view={view} />

      <div className="pointer-events-auto hidden items-end justify-between gap-3 p-3 lg:flex lg:pr-80">
        <div className="min-w-0 flex-1" data-hud-edge="bottom">
          <HandStrip view={view} />
        </div>
        {actionsOpen ? (
          <div className="flex min-h-0" data-testid="actions-panel" data-hud-edge="right">
            <ActionPanel view={view} onClose={() => set({ actionsOpen: false })} closeTestId="actions-hide" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {primary && (
              <button
                className={`min-h-11 rounded-full px-5 text-sm font-semibold shadow-lg ${
                  primary.tone === "emerald" ? "bg-emerald-600 text-white" : "bg-amber-200 text-stone-900"
                }`}
                data-testid="desk-primary"
                onClick={runPrimary}
              >
                {primary.label}
                <kbd className="ml-2 rounded bg-black/15 px-1.5 py-px text-[10px] font-bold">{primary.key}</kbd>
              </button>
            )}
            {phaseCue && (
              <button
                type="button"
                className="min-h-11 rounded-full bg-amber-200 px-5 text-sm font-semibold text-stone-900 shadow-lg"
                data-testid="desk-phase"
                aria-label={phaseLine(view, yourTurn, current?.name ?? "otro")}
                onClick={() => set({ hint: phaseLine(view, yourTurn, current?.name ?? "otro") })}
              >
                {phaseCue}
              </button>
            )}
            <button
              className="panel min-h-11 rounded-full px-4 text-xs font-semibold text-amber-100"
              data-testid="actions-show"
              data-tip="Obras y cartas · B"
              onClick={() => set({ actionsOpen: true, actionTab: "construir" })}
            >
              Construir
            </button>
            <button
              className="panel relative min-h-11 rounded-full px-4 text-xs font-semibold text-amber-100"
              data-testid="trade-show"
              data-tip="Banco y trueque · T"
              onClick={() => set({ actionsOpen: true, actionTab: tradeTabFor(view) })}
            >
              Comerciar
              {waiting > 0 && <Badge n={waiting} />}
            </button>
          </div>
        )}
      </div>

      <div
        className="pointer-events-auto lg:hidden"
        data-testid="mobile-chrome"
        style={kb ? { transform: `translateY(-${kb}px)` } : undefined}
      >
        {sheet === "build" && (
          <Sheet label="Construir y comerciar">
            <ActionPanel view={view} compact onClose={() => set({ sheet: null })} closeTestId="sheet-close" />
          </Sheet>
        )}
        {sheet === "mesa" && (
          <Sheet label="Registro y chat">
            <div className="flex h-[min(46vh,26rem)] max-h-[calc(100dvh-16rem)] min-h-0 flex-col">
              <MesaPanel view={view} compact onClose={() => set({ sheet: null })} closeTestId="sheet-close" />
            </div>
          </Sheet>
        )}
        <div data-hud-edge="bottom">
          <HandStrip view={view} />
          <div
            className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-1 bg-[#0b0806] px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            data-testid="mobile-dock"
            id="mobile-dock"
          >
            {primary ? (
              <DockBtn
                label={primary.label}
                tone={primary.tone as "amber" | "emerald"}
                testId="dock-primary"
                onClick={runPrimary}
              />
            ) : (
              <DockBtn
                label={dockLabel(view.phase, yourTurn, current?.name ?? "")}
                tone={yourTurn ? "amber" : "muted"}
                testId="dock-primary"
                ariaLabel={phaseLine(view, yourTurn, current?.name ?? "otro")}
                onClick={() => set({ hint: phaseLine(view, yourTurn, current?.name ?? "otro") })}
              />
            )}
            <DockBtn
              label="Construir"
              tone="nav"
              testId="dock-build"
              active={sheet === "build" && actionTab === "construir"}
              onClick={() =>
                set(
                  sheet === "build" && actionTab === "construir"
                    ? { sheet: null }
                    : { sheet: "build", actionTab: "construir" },
                )
              }
            />
            <DockBtn
              label="Comerciar"
              tone="nav"
              testId="dock-trade"
              active={sheet === "build" && actionTab !== "construir"}
              badge={waiting ? String(waiting) : undefined}
              onClick={() =>
                set(
                  sheet === "build" && actionTab !== "construir"
                    ? { sheet: null }
                    : { sheet: "build", actionTab: tradeTabFor(view) },
                )
              }
            />
            <DockBtn
              label="Mesa"
              tone="nav"
              testId="dock-mesa"
              active={sheet === "mesa"}
              badge={unread ? String(unread) : undefined}
              onClick={() => set({ sheet: sheet === "mesa" ? null : "mesa", chatUnread: 0 })}
            />
          </div>
        </div>
      </div>

      {!holdingDice && view.legal.mustDiscard > 0 && <DiscardModal view={view} />}
      {!holdingDice && view.legal.stealFrom.length > 0 && <StealSheet view={view} />}
      {view.phase === "fin" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 flex justify-center px-3 md:bottom-6 md:left-3 md:right-auto md:justify-start">
          <div
            className="colonos-victory pointer-events-auto panel max-h-[50vh] w-full max-w-sm overflow-y-auto rounded-3xl p-4 text-left shadow-lg md:p-5"
            role="status"
            aria-labelledby="game-over-title"
            data-testid="game-over"
          >
            <h2 id="game-over-title" className="display text-3xl">
              Se terminó
            </h2>
            <p className="mt-2 text-amber-100">
              {view.players.find((p) => p.id === view.winnerId)?.name} se queda con la isla (
              {winnerShownPoints(view)} puntos).
            </p>
            <ul className="mx-auto mt-4 max-w-xs space-y-1 text-left text-sm text-amber-50">
              {[...view.players]
                .sort((a, b) => shownPoints(view, b.id, b.visibleVp) - shownPoints(view, a.id, a.visibleVp))
                .map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {p.name}
                      {p.id === view.winnerId ? " · ganó" : ""}
                    </span>
                    <span className="shrink-0 tabular-nums">{shownPoints(view, p.id, p.visibleVp)}</span>
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-amber-100/70">
              Tus puntos cuentan las cartas ocultas. El resto, lo que se ve en la mesa.
            </p>
            <button
              className="mt-5 min-h-11 rounded-xl bg-amber-200 px-6 py-2 font-semibold text-stone-900"
              onClick={() => {
                void exitMesa().then(() => {
                  set({
                    screen: "home",
                    lobby: null,
                    view: null,
                    token: null,
                    playerId: null,
                    code: "",
                    error: null,
                    sheet: null,
                    pending: null,
                  });
                });
              }}
            >
              Volver al inicio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HandStrip({ view }: { view: ClientView }) {
  const bankTradeFrom = useApp((s) => s.bankTradeFrom);
  const diceUi = useApp((s) => s.diceUi);
  const set = useApp((s) => s.set);
  const youTurn = view.currentPlayerId === view.youId;
  const holding = diceHeld(diceUi);
  const shown = useMemo(() => {
    if (!holding) return view.hand.resources;
    const gain = gainsWhileHeld(view.events, diceUi.holdFromEventId).get(view.youId);
    return resourcesAfterHold(view.hand.resources, gain);
  }, [holding, view.hand.resources, view.events, view.youId, diceUi.holdFromEventId]);
  const devCount = view.hand.devCards.length;
  return (
    <div className="relative">
      <div
        className="flex items-stretch justify-around gap-0.5 bg-[#0b0806] px-1 py-1 lg:rounded-xl lg:bg-black/70"
        data-testid="hand-strip"
      >
        {RESOURCES.map((r) => {
          const rate = settlementPortRate(view, view.youId, r);
          const can = youTurn && view.legal.canBankTrade && view.hand.resources[r] >= rate;
          return (
            <button
              key={r}
              type="button"
              data-hand-res={r}
              className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-lg hover:bg-white/10 ${
                can ? "ring-1 ring-amber-300/50" : ""
              }`}
              data-tip={`${RESOURCE_LABEL[r]} · ${can ? "cambiar" : rate === 4 ? "banco" : "puerto"} ${rate}:1`}
              aria-label={`${RESOURCE_LABEL[r]}: ${shown[r]}, ${rateTip(r, rate).toLowerCase()}`}
              onClick={() => {
                if (holding) {
                  set({ diceUi: skipDiceHold(diceUi) });
                  return;
                }
                if (!youTurn || !view.legal.canBankTrade) {
                  set({ toast: "Esperá tu turno para cambiar." });
                  return;
                }
                if (view.hand.resources[r] < rate) {
                  set({ toast: `Necesitás ${rate} para el banco.` });
                  return;
                }
                set({ bankTradeFrom: bankTradeFrom === r ? null : r });
              }}
            >
              <ResourceIcon resource={r} size={30} decorative />
              <span className="text-2xl font-bold leading-none tabular-nums text-amber-50" data-testid={`hand-count-${r}`}>
                {shown[r]}
              </span>
              <span
                className={`text-[9px] font-bold leading-none ${rate < 4 ? "text-amber-100" : "text-amber-200/60"}`}
                data-testid={`hand-rate-${r}`}
              >
                <RateTag resource={r} rate={rate} />
              </span>
            </button>
          );
        })}
        <div
          className="flex min-h-11 w-12 shrink-0 flex-col items-center justify-center rounded-lg border-l border-amber-100/10 text-amber-100/80"
          data-tip="Cartas de desarrollo y puntos (con los ocultos)"
          data-testid="hand-meta"
        >
          <span className="text-[10px] leading-tight">
            <PieceIcon id="carta" /> {devCount}
          </span>
          <span className="text-sm font-bold leading-tight text-amber-50 tabular-nums">
            {view.hand.totalVp}
            <span className="ml-[1px] text-[9px] font-semibold text-amber-200/70">pt</span>
          </span>
        </div>
      </div>
      {bankTradeFrom && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl bg-black/85 p-2" data-testid="bank-quick">
          <p className="mb-1 text-center text-[11px] text-amber-100/80">
            Das {settlementPortRate(view, view.youId, bankTradeFrom)} <ResourceIcon resource={bankTradeFrom} size={16} decorative /> · ¿qué pedís?
          </p>
          <div className="flex justify-around">
            {RESOURCES.filter((r) => r !== bankTradeFrom).map((want) => (
              <ResourcePick
                key={want}
                resource={want}
                size={24}
                onClick={() => {
                  const giveN = settlementPortRate(view, view.youId, bankTradeFrom);
                  void previewOrRun({
                    kind: "bank",
                    give: { [bankTradeFrom]: giveN },
                    want: { [want]: 1 },
                    rate: giveN,
                  }).then((res) => {
                    if (res?.ok) set({ bankTradeFrom: null });
                  });
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ n }: { n: number | string }) {
  return (
    <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-red-600 px-1.5 text-[10px] leading-4 text-white">
      {n}
    </span>
  );
}

/** Una sola acción fuerte (tirar / pasar); el resto del dock navega y se marca cuando su hoja está abierta. */
function DockBtn({
  label,
  onClick,
  badge,
  tone = "amber",
  active,
  testId,
  ariaLabel,
}: {
  label: string;
  onClick: () => void;
  badge?: string;
  tone?: "amber" | "emerald" | "muted" | "nav";
  active?: boolean;
  testId?: string;
  ariaLabel?: string;
}) {
  const color =
    tone === "emerald"
      ? "bg-emerald-600 text-white"
      : tone === "muted"
        ? "bg-stone-700 text-amber-100/80"
        : tone === "nav"
          ? active
            ? "bg-amber-200 text-stone-900"
            : "bg-stone-800 text-amber-50 ring-1 ring-inset ring-amber-200/25"
          : "bg-amber-200 text-stone-900";
  return (
    <button
      className={`relative min-h-11 min-w-0 truncate rounded-xl px-1.5 py-3 text-sm font-semibold ${color}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={tone === "nav" ? Boolean(active) : undefined}
      data-testid={testId}
    >
      {label}
      {badge && <Badge n={badge} />}
    </button>
  );
}

/** Hoja del celu: el contenido trae sus pestañas y la cruz, y scrollea por dentro sin perderlas. */
function Sheet({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative z-20 lg:hidden" data-testid="mobile-sheet" role="region" aria-label={label}>
      <div className="panel panel-solid flex max-h-[min(58dvh,30rem)] min-h-0 flex-col rounded-t-3xl px-3 pt-2 pb-2">
        {children}
      </div>
    </div>
  );
}

function StealSheet({ view }: { view: ClientView }) {
  const set = useApp((s) => s.set);
  const people = view.players.filter((p) => view.legal.stealFrom.includes(p.id));
  if (!people.length) return null;
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-[6.75rem] z-30 lg:bottom-24">
      <FocusTrap
        className="panel mx-auto w-full max-w-lg rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        data-testid="steal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="steal-title"
      >
        <p id="steal-title" className="mb-3 font-semibold">¿A quién le afanás?</p>
        <p className="mb-2 text-xs text-amber-100/70">Robás 1 carta al azar de esa mano.</p>
        <div className="flex flex-col gap-2">
          {people.map((p) => (
            <button
              key={p.id}
              className="flex min-h-12 items-center gap-3 rounded-xl bg-amber-200 px-3 py-2 text-left font-semibold text-stone-900"
              onClick={() => {
                void sendAction({
                  type: "move_robber",
                  hexId: view.robberHexId,
                  stealFromId: p.id,
                }).then((r) => {
                  set({ stealForHex: null, toast: r.error ?? null });
                });
              }}
            >
              <span className="h-4 w-4 rounded-full" style={{ background: COLOR_HEX[p.color] }} aria-hidden />
              <span aria-hidden>{PLAYER_GLYPHS[view.players.findIndex((x) => x.id === p.id)]}</span>
              <span className="flex-1">{p.name}</span>
              <span className="flex items-center gap-1" aria-label={`${p.resourceCount} cartas`}>
                <PieceIcon id="carta" />
                <span className="text-sm tabular-nums">{p.resourceCount}</span>
              </span>
            </button>
          ))}
        </div>
      </FocusTrap>
    </div>
  );
}

function DiscardModal({ view }: { view: ClientView }) {
  const set = useApp((s) => s.set);
  const need = view.legal.mustDiscard;
  const [sel, setSel] = useState<Partial<Record<Resource, number>>>({});
  const total = useMemo(() => RESOURCES.reduce((s, r) => s + (sel[r] ?? 0), 0), [sel]);
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/55 p-4">
      <FocusTrap
        className="panel w-full max-w-md rounded-2xl p-5 outline-none"
        data-testid="discard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-title"
      >
        <h2 id="discard-title" className="display text-2xl">
          Descartá {need} cartas
        </h2>
        <p className="mt-1 text-sm text-amber-100/80">Salió 7 y te pasaste de mano. Elegí cuáles tirás.</p>
        <div className="mt-3 grid grid-cols-5 gap-1">
          {RESOURCES.map((r) => {
            const have = view.hand.resources[r];
            const n = sel[r] ?? 0;
            return (
              <div key={r} className="flex flex-col items-center gap-1">
                <ResourcePick
                  resource={r}
                  qty={have}
                  selected={n > 0}
                  disabled={have === 0}
                  onClick={() => {
                    if (n >= have || total >= need) return;
                    setSel({ ...sel, [r]: n + 1 });
                  }}
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="h-11 w-11 rounded bg-black/40 text-sm"
                    aria-label={`Quitar ${RESOURCE_LABEL[r]}`}
                    disabled={n <= 0}
                    onClick={() => setSel({ ...sel, [r]: Math.max(0, n - 1) })}
                  >
                    −
                  </button>
                  <span className="w-4 text-center text-sm font-bold tabular-nums">{n}</span>
                  <button
                    type="button"
                    className="h-11 w-11 rounded bg-black/40 text-sm"
                    aria-label={`Agregar ${RESOURCE_LABEL[r]}`}
                    disabled={n >= have || total >= need}
                    onClick={() => setSel({ ...sel, [r]: n + 1 })}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          disabled={total !== need}
          className="mt-4 min-h-11 w-full rounded-xl bg-amber-200 py-2 font-semibold text-stone-900 disabled:bg-stone-600"
          onClick={() => {
            void sendAction({ type: "discard", resources: sel }).then((r) => {
              if (!r.ok) set({ toast: r.error ?? null });
            });
          }}
        >
          Tirar {total}/{need}
        </button>
      </FocusTrap>
    </div>
  );
}
