import { useState, type KeyboardEvent, type ReactNode } from "react";
import { RESOURCE_LABEL } from "@shared/constants";
import { RESOURCES } from "@shared/types";
import type { ClientView, DevKind, Resource, TradeOffer } from "@shared/types";
import { offersForYou } from "../play/actionTabs";
import { buildOptions, devOption, missingFor, type BuildState } from "../play/buildOptions";
import { sendAction } from "../socket";
import { useApp, type ActionTab } from "../store";
import { CloseButton } from "./CloseButton";
import {
  BagIcons,
  DEV_LABEL,
  DevIcon,
  RateTag,
  ResourceIcon,
  ResourcePick,
  settlementPortRate,
} from "./icons/GameIcon";

function bagAria(bag: Partial<Record<Resource, number>>): string {
  const parts = RESOURCES.filter((r) => (bag[r] ?? 0) > 0).map(
    (r) => `${bag[r]} ${RESOURCE_LABEL[r].toLowerCase()}`,
  );
  return parts.length ? parts.join(", ") : "nada";
}

const TABS: Array<{ id: ActionTab; label: string; tip: string }> = [
  { id: "construir", label: "Construir", tip: "Obras y cartas · B" },
  { id: "banco", label: "Banco", tip: "Banco y puertos · T" },
  { id: "jugadores", label: "Jugadores", tip: "Trueque con la mesa" },
];

type Act = (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;

/**
 * Construir, banco y trueque en pestañas: cada una entra en la hoja del celu sin scroll largo, y la
 * cruz vive en la misma fila (antes era un título con «Cerrar» encima y otro «Cerrar» por modo).
 */
export function ActionPanel({
  view,
  compact,
  onClose,
  closeTestId,
}: {
  view: ClientView;
  compact?: boolean;
  onClose: () => void;
  closeTestId: string;
}) {
  const set = useApp((s) => s.set);
  const tab = useApp((s) => s.actionTab);
  const legal = view.legal;
  const waiting = offersForYou(view);
  const idp = compact ? "sheet" : "desk";

  const act: Act = async (fn) => {
    const r = await fn();
    if (!r.ok) set({ toast: r.error ?? "No se pudo" });
    return r.ok;
  };

  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!;
    set({ actionTab: next.id });
    document.getElementById(`${idp}-tab-${next.id}`)?.focus();
  }

  return (
    <div
      className={`flex min-h-0 w-full flex-col ${compact ? "flex-1" : "panel max-h-[calc(100dvh-12rem)] rounded-2xl p-3 lg:w-80"}`}
      data-testid="action-panel"
    >
      <div className="mb-2 flex shrink-0 items-center gap-1">
        <div
          role="tablist"
          aria-label="Acciones"
          className="grid min-w-0 flex-1 grid-cols-3 gap-0.5 rounded-xl bg-black/35 p-0.5"
          onKeyDown={onTabKey}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`${idp}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`${idp}-tabpanel`}
              tabIndex={tab === t.id ? 0 : -1}
              data-testid={`tab-${t.id}`}
              data-tip={t.tip}
              className={`relative min-h-9 rounded-[10px] px-1 text-xs font-semibold ${
                tab === t.id ? "bg-amber-200 text-stone-900" : "text-amber-100/85 hover:bg-white/5"
              }`}
              onClick={() => set({ actionTab: t.id })}
            >
              {t.label}
              {t.id === "jugadores" && waiting > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white"
                  aria-label={`${waiting} ofertas`}
                  data-testid="offers-badge"
                >
                  {waiting}
                </span>
              )}
            </button>
          ))}
        </div>
        <CloseButton onClick={onClose} testId={closeTestId} />
      </div>
      <div
        id={`${idp}-tabpanel`}
        role="tabpanel"
        aria-labelledby={`${idp}-tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {tab === "construir" ? (
          <BuildTab view={view} compact={compact} act={act} />
        ) : tab === "banco" ? (
          <BankTrade view={view} />
        ) : (
          <PlayerTrade view={view} />
        )}
      </div>
      {/* Un solo botón de turno, el que toca ahora. En el celu ya está en el dock: repetirlo era ruido. */}
      {!compact && (
        <div className="mt-2 shrink-0">
          {legal.canRoll ? (
            <Btn testId="panel-roll" onClick={() => void act(() => sendAction({ type: "roll" }))}>
              Tirar dados
            </Btn>
          ) : (
            <Btn
              testId="panel-end-turn"
              tone="emerald"
              disabled={!legal.canEndTurn}
              onClick={() => void act(() => sendAction({ type: "end_turn" }))}
            >
              Pasar turno
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

function BuildTab({ view, compact, act }: { view: ClientView; compact?: boolean; act: Act }) {
  const set = useApp((s) => s.set);
  const legal = view.legal;
  const [invento, setInvento] = useState(false);
  const [mono, setMono] = useState(false);
  const held = new Set(view.hand.devCards.map((c) => c.kind));
  // En el celu la hoja tapa el tablero: lo que sigue se toca ahí, así que se cierra.
  const toBoard = compact ? { sheet: null } : {};
  const dev = devOption(view);
  const playable = (["progreso_invento", "progreso_monopolio", "caballero", "progreso_caminos"] as const).some((k) =>
    held.has(k),
  );
  return (
    <>
      <DevHeld view={view} />
      <div className="mb-2 space-y-1" data-testid="build-list">
        <p className="text-[11px] text-amber-100/70">
          {view.phase === "colocacion_poblado" || view.phase === "colocacion_camino"
            ? "La primera colocación es gratis: tocá el lugar marcado en el tablero."
            : "Se construye tocando el lugar marcado en el tablero."}
        </p>
        {buildOptions(view).map((o) => (
          <CostRow
            key={o.kind}
            label={o.label}
            cost={o.cost}
            state={o.state}
            hand={view.hand.resources}
            readyText="Tocá el tablero"
            testId={`build-${o.kind}`}
            onClick={() => set({ hint: `Tocá un lugar marcado para tu ${o.label.toLowerCase()}.`, ...toBoard })}
          />
        ))}
        <CostRow
          label="Carta"
          tip="Carta de desarrollo"
          cost={dev.cost}
          state={dev.state}
          hand={view.hand.resources}
          readyText="Comprar"
          testId="buy-dev"
          onClick={() =>
            void act(async () => {
              const r = await sendAction({ type: "buy_dev" });
              if (r.ok && r.reveal) set({ revealCard: r.reveal });
              return r;
            })
          }
        />
      </div>
      {/* Sólo las cartas que tenés en la mano: cuatro botones grises son ruido casi toda la partida. */}
      {playable && (
        <div className="grid grid-cols-2 gap-2">
          {held.has("progreso_invento") && (
            <PlayDev kind="progreso_invento" disabled={!legal.canPlayYearPlenty} onClick={() => setInvento(true)} />
          )}
          {held.has("progreso_monopolio") && (
            <PlayDev kind="progreso_monopolio" disabled={!legal.canPlayMonopoly} onClick={() => setMono(true)} />
          )}
          {held.has("caballero") && (
            <PlayDev
              kind="caballero"
              disabled={!legal.canPlayKnight}
              onClick={() => set({ knightArmed: true, hint: "Tocá un hexágono para mandar el ladrón.", ...toBoard })}
            />
          )}
          {held.has("progreso_caminos") && (
            <PlayDev
              kind="progreso_caminos"
              disabled={!legal.canPlayRoadBuilding}
              onClick={() =>
                void act(() => sendAction({ type: "play_road_building" })).then((ok) => {
                  if (ok) set({ hint: "Tocá dónde van los caminos gratis.", ...toBoard });
                })
              }
            />
          )}
        </div>
      )}
      {invento && <InventoBox view={view} onClose={() => setInvento(false)} />}
      {mono && <MonoBox onClose={() => setMono(false)} />}
    </>
  );
}

const BUILD_STATUS: Record<BuildState["kind"], string> = {
  ready: "text-emerald-300",
  wait: "text-amber-100/55",
  noSpot: "text-amber-200/80",
  short: "text-red-300",
};

/** Una obra (o la carta) con su costo a la vista y lo que falta; sólo se toca cuando está lista. */
function CostRow({
  label,
  tip,
  cost,
  state,
  hand,
  readyText,
  testId,
  onClick,
}: {
  label: string;
  tip?: string;
  cost: Partial<Record<Resource, number>>;
  state: BuildState;
  hand: Record<Resource, number>;
  readyText: string;
  testId: string;
  onClick: () => void;
}) {
  const ready = state.kind === "ready";
  const missing = missingFor(hand, cost);
  const status = ready ? readyText : state.kind === "short" ? "Te falta" : state.note;
  return (
    <button
      type="button"
      data-testid={testId}
      data-tip={tip}
      disabled={!ready}
      aria-label={`${tip ?? label}: cuesta ${bagAria(cost)}. ${status}.`}
      onClick={onClick}
      className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-2 py-1 text-left text-sm ${
        ready ? "bg-emerald-900/50 ring-1 ring-emerald-400/50" : "cursor-default bg-black/30"
      }`}
    >
      <span className="w-16 shrink-0 font-semibold text-amber-50">{label}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" aria-hidden>
        {RESOURCES.filter((r) => (cost[r] ?? 0) > 0).map((r) => {
          const short = (missing[r] ?? 0) > 0;
          return (
            <span key={r} className={`inline-flex items-center gap-0.5 ${short ? "opacity-50" : ""}`}>
              <ResourceIcon resource={r} size={22} decorative />
              <span className={`text-xs font-bold tabular-nums ${short ? "text-red-300" : "text-amber-50"}`}>{cost[r]}</span>
            </span>
          );
        })}
      </span>
      <span className={`shrink-0 text-[11px] font-semibold ${BUILD_STATUS[state.kind]}`}>{status}</span>
    </button>
  );
}

function Btn({
  children,
  disabled,
  onClick,
  testId,
  tip,
  label,
  tone = "amber",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
  tip?: string;
  label?: string;
  tone?: "amber" | "emerald";
}) {
  return (
    <button
      data-testid={testId}
      data-tip={tip}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 w-full rounded-xl px-2 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-stone-600 disabled:text-stone-300 ${
        tone === "emerald" ? "bg-emerald-600 text-white" : "bg-amber-200 text-stone-900"
      }`}
    >
      {children}
    </button>
  );
}

const DEV_EFFECT: Record<Exclude<DevKind, "punto_victoria">, string> = {
  caballero: "mové el ladrón y robá una carta",
  progreso_invento: "tomá 2 recursos del banco",
  progreso_monopolio: "llevate un recurso de todes",
  progreso_caminos: "2 caminos gratis",
};

/** La carta se reconoce por la silueta; el botón sólo dice qué hace, y el nombre va al tooltip. */
function PlayDev({
  kind,
  disabled,
  onClick,
}: {
  kind: Exclude<DevKind, "punto_victoria">;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Btn
      testId={`play-${kind}`}
      disabled={disabled}
      onClick={onClick}
      tip={`${DEV_LABEL[kind]}: ${DEV_EFFECT[kind]}`}
      label={`Jugar ${DEV_LABEL[kind]}`}
    >
      <span className="inline-flex items-center justify-center gap-1.5">
        <DevIcon kind={kind} size={22} decorative />
        Jugar
      </span>
    </Btn>
  );
}

/** Las cartas de desarrollo en la mano: la tira las cuenta pero no las muestra (las de punto no tienen botón). */
function DevHeld({ view }: { view: ClientView }) {
  if (view.hand.devCards.length === 0) {
    return (
      <p className="mb-2 text-[11px] text-amber-100/55" data-testid="dev-held-empty">
        Todavía no tenés cartas de desarrollo.
      </p>
    );
  }
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px] text-amber-100/80" data-testid="dev-held">
      <span className="mr-0.5">Tus cartas:</span>
      {view.hand.devCards.map((c, i) => (
        <DevIcon key={`${c.kind}-${i}`} kind={c.kind as DevKind} size={20} />
      ))}
    </div>
  );
}

function InventoBox({ view, onClose }: { view: ClientView; onClose: () => void }) {
  const set = useApp((s) => s.set);
  const [a, setA] = useState<Resource>("trigo");
  const [b, setB] = useState<Resource>("mineral");
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-black/30 p-2 text-sm">
      <p>Elegí dos recursos del banco.</p>
      <div className="grid grid-cols-5 gap-1">
        {RESOURCES.map((r) => (
          <ResourcePick
            key={r}
            resource={r}
            size={28}
            selected={a === r || b === r}
            disabled={view.bankHas?.[r] === false}
            onClick={() => {
              if (a === r) return;
              setB(a);
              setA(r);
            }}
          />
        ))}
      </div>
      <p className="flex items-center gap-2 text-xs text-amber-100/80">
        Tomás <ResourceIcon resource={a} size={20} /> + <ResourceIcon resource={b} size={20} />
      </p>
      <div className="flex gap-2">
        <button
          className="min-h-10 flex-1 rounded-lg bg-emerald-700 py-1 font-semibold"
          onClick={() => {
            void sendAction({ type: "play_year_plenty", resources: [a, b] }).then((r) => {
              if (!r.ok) set({ toast: r.error ?? null });
              else onClose();
            });
          }}
        >
          Tomar
        </button>
        <button className="min-h-10 rounded-lg bg-stone-700 px-3" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function MonoBox({ onClose }: { onClose: () => void }) {
  const set = useApp((s) => s.set);
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-black/30 p-2 text-sm">
      <p>¿Qué recurso monopolizás?</p>
      <div className="grid grid-cols-5 gap-1">
        {RESOURCES.map((r) => (
          <ResourcePick
            key={r}
            resource={r}
            size={28}
            onClick={() => {
              void sendAction({ type: "play_monopoly", resource: r }).then((res) => {
                if (!res.ok) set({ toast: res.error ?? null });
                else onClose();
              });
            }}
          />
        ))}
      </div>
      <button className="min-h-10 rounded-lg bg-stone-700 px-3" onClick={onClose}>
        Cancelar
      </button>
    </div>
  );
}

function TradeCard({ view, trade }: { view: ClientView; trade: TradeOffer }) {
  const set = useApp((s) => s.set);
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? "Alguien";
  const mine = trade.fromId === view.youId;
  const forMe = trade.toId === "todos" || trade.toId === view.youId;
  const to = trade.toId === "todos" ? "a la mesa" : trade.toId === view.youId ? "para vos" : `para ${name(trade.toId)}`;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-black/30 p-2 text-xs" data-testid="trade-card">
      <p className="min-w-0 flex-1 text-amber-50">
        <b>{mine ? "Tu oferta" : name(trade.fromId)}</b> <span className="text-amber-100/60">{to}</span>
      </p>
      <p className="flex items-center gap-1" aria-label={`da ${bagAria(trade.give)}, pide ${bagAria(trade.want)}`}>
        <BagIcons bag={trade.give} />
        <span aria-hidden className="text-amber-100/60">
          →
        </span>
        <BagIcons bag={trade.want} />
      </p>
      <div className="flex w-full justify-end gap-1">
        {forMe && !mine && (
          <button
            className="min-h-9 rounded-lg bg-emerald-700 px-3 font-semibold"
            onClick={() =>
              void sendAction({ type: "accept_trade", tradeId: trade.id }).then((r) => {
                if (!r.ok) set({ toast: r.error ?? null });
              })
            }
          >
            Aceptar
          </button>
        )}
        {(forMe || mine) && (
          <button
            className="min-h-9 rounded-lg bg-black/40 px-3 text-amber-100/85"
            onClick={() => void sendAction({ type: "reject_trade", tradeId: trade.id })}
          >
            {mine ? "Cancelar" : "Rechazar"}
          </button>
        )}
      </div>
    </div>
  );
}

type Bag = Partial<Record<Resource, number>>;

function bagTotal(bag: Bag): number {
  return RESOURCES.reduce((s, r) => s + (bag[r] ?? 0), 0);
}

function Stepper({
  resource,
  n,
  max,
  onChange,
  hint,
}: {
  resource: Resource;
  n: number;
  max: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5" data-testid={`stepper-${resource}`}>
      <ResourceIcon resource={resource} size={22} />
      {hint && <span className="text-[9px] leading-none text-amber-100/60 tabular-nums">{hint}</span>}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="h-7 w-6 rounded bg-black/40 text-sm disabled:opacity-30"
          aria-label={`Menos ${RESOURCE_LABEL[resource]}`}
          disabled={n <= 0}
          onClick={() => onChange(Math.max(0, n - 1))}
        >
          −
        </button>
        <span className={`w-4 text-center text-sm font-bold tabular-nums ${n ? "text-amber-50" : "text-amber-100/40"}`}>{n}</span>
        <button
          type="button"
          className="h-7 w-6 rounded bg-black/40 text-sm disabled:opacity-30"
          aria-label={`Más ${RESOURCE_LABEL[resource]}`}
          disabled={n >= max}
          onClick={() => onChange(Math.min(max, n + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Note({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="rounded-lg bg-black/30 px-2 py-1.5 text-[11px] text-amber-100/75" data-testid={testId}>
      {children}
    </p>
  );
}

function closedNote(view: ClientView, what: "banco" | "jugadores"): string {
  if (view.phase === "construccion_especial") return "En la pausa de construcción no se comercia.";
  if (view.currentPlayerId === view.youId && view.legal.canRoll) return "Primero tirá los dados.";
  return what === "banco"
    ? "El banco abre en tu turno, después de tirar."
    : "Ofrecés en tu turno, después de tirar. Las ofertas que te hagan aparecen acá.";
}

function BankTrade({ view }: { view: ClientView }) {
  const set = useApp((s) => s.set);
  const rateOf = (r: Resource) => settlementPortRate(view, view.youId, r);
  // Arranca en lo que sí podés cambiar (lo que más tenés a tu tasa), no en madera con 0 en la mano.
  const [giveR, setGiveR] = useState<Resource>(() => {
    const ok = RESOURCES.filter((r) => view.hand.resources[r] >= rateOf(r));
    return [...ok].sort((a, b) => view.hand.resources[b] - view.hand.resources[a])[0] ?? "madera";
  });
  const [wantR, setWantR] = useState<Resource>(() => {
    const free = (r: Resource) => r !== giveR && view.bankHas?.[r] !== false;
    return free("trigo") ? "trigo" : (RESOURCES.find(free) ?? "trigo");
  });
  const open = view.legal.canBankTrade;
  const rate = rateOf(giveR);
  const bankOk = open && view.hand.resources[giveR] >= rate && giveR !== wantR && view.bankHas?.[wantR] !== false;
  const anyGive = RESOURCES.some((r) => view.hand.resources[r] >= rateOf(r));

  async function submit() {
    const r = await sendAction({ type: "bank_trade", give: { [giveR]: rate }, want: { [wantR]: 1 } });
    if (!r.ok) set({ toast: r.error ?? null });
  }

  return (
    <div className="space-y-2 text-sm" data-testid="trade-bank">
      {!open ? (
        <Note testId="trade-closed">{closedNote(view, "banco")}</Note>
      ) : (
        !anyGive && <Note>Para el banco necesitás 4 iguales (3 o 2 si tenés el puerto).</Note>
      )}
      <p className="text-[11px] font-semibold text-amber-100/80">
        Das <span className="font-normal text-amber-100/55">· tu tasa abajo</span>
      </p>
      <div className="grid grid-cols-5 gap-1">
        {RESOURCES.map((r) => (
          <div key={`g-${r}`} className="flex flex-col items-center gap-0.5">
            <ResourcePick
              resource={r}
              size={24}
              selected={anyGive && giveR === r}
              qty={view.hand.resources[r]}
              disabled={view.hand.resources[r] < rateOf(r)}
              onClick={() => setGiveR(r)}
            />
            <RateTag resource={r} rate={rateOf(r)} tip className="text-[10px] leading-none text-amber-100/70" />
          </div>
        ))}
      </div>
      <p className="text-[11px] font-semibold text-amber-100/80">Pedís</p>
      <div className="grid grid-cols-5 gap-1">
        {RESOURCES.map((r) => (
          <ResourcePick
            key={`w-${r}`}
            resource={r}
            size={24}
            selected={wantR === r}
            disabled={r === giveR || view.bankHas?.[r] === false}
            onClick={() => setWantR(r)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <p className="flex shrink-0 items-center gap-1 text-xs font-bold tabular-nums" data-testid="bank-rate">
          {rate}
          <ResourceIcon resource={giveR} size={18} />
          <span aria-hidden className="px-0.5 text-amber-100/60">
            →
          </span>
          1
          <ResourceIcon resource={wantR} size={18} />
        </p>
        <button
          className="min-h-10 flex-1 rounded-lg bg-emerald-700 py-1 font-semibold disabled:bg-stone-700 disabled:text-stone-400"
          data-testid="bank-submit"
          disabled={!bankOk}
          onClick={() => void submit()}
        >
          Cambiar
        </button>
      </div>
    </div>
  );
}

function PlayerTrade({ view }: { view: ClientView }) {
  const set = useApp((s) => s.set);
  const [give, setGive] = useState<Bag>({});
  const [want, setWant] = useState<Bag>({});
  const [toId, setToId] = useState("todos");
  const canOffer = view.legal.canTrade;
  const overlap = RESOURCES.some((r) => (give[r] ?? 0) > 0 && (want[r] ?? 0) > 0);
  const offerOk = canOffer && bagTotal(give) > 0 && bagTotal(want) > 0 && !overlap;

  async function submitOffer() {
    const r = await sendAction({ type: "offer_trade", toId: toId === "todos" ? "todos" : toId, give, want });
    if (!r.ok) set({ toast: r.error ?? null });
    else {
      setGive({});
      setWant({});
    }
  }

  return (
    <div className="space-y-2 text-sm" data-testid="trade-players">
      {canOffer ? (
        <>
          <p className="text-[11px] font-semibold text-amber-100/80">Das</p>
          <div className="grid grid-cols-5 gap-1">
            {RESOURCES.map((r) => (
              <Stepper
                key={`og-${r}`}
                resource={r}
                n={give[r] ?? 0}
                max={view.hand.resources[r]}
                hint={`tenés ${view.hand.resources[r]}`}
                onChange={(n) => setGive({ ...give, [r]: n })}
              />
            ))}
          </div>
          <p className="text-[11px] font-semibold text-amber-100/80">Pedís</p>
          <div className="grid grid-cols-5 gap-1">
            {RESOURCES.map((r) => (
              <Stepper key={`ow-${r}`} resource={r} n={want[r] ?? 0} max={9} onChange={(n) => setWant({ ...want, [r]: n })} />
            ))}
          </div>
          {overlap && <p className="text-[11px] text-red-300">No pidas lo mismo que das.</p>}
          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">
              Para
              <select
                className="min-h-10 min-w-0 flex-1 rounded-lg bg-stone-900 px-1"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
              >
                <option value="todos">A todes</option>
                {view.players
                  .filter((p) => p.id !== view.youId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isBot ? " (bot)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="min-h-10 shrink-0 rounded-lg bg-emerald-700 px-4 font-semibold disabled:bg-stone-700 disabled:text-stone-400"
              data-testid="offer-submit"
              disabled={!offerOk}
              onClick={() => void submitOffer()}
            >
              Ofrecer
            </button>
          </div>
        </>
      ) : (
        <Note testId="trade-closed">{closedNote(view, "jugadores")}</Note>
      )}
      {view.trades.length > 0 ? (
        <div className="space-y-1.5" data-testid="trade-offers">
          {view.trades.map((t) => (
            <TradeCard key={t.id} view={view} trade={t} />
          ))}
        </div>
      ) : (
        !canOffer && <p className="px-1 text-[11px] text-amber-100/50">No hay ofertas abiertas.</p>
      )}
    </div>
  );
}
