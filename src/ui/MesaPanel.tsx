import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { COLOR_HEX, RESOURCE_LABEL } from "@shared/constants";
import type { ClientView, LogEvent, LogIcon, LogKind, Resource } from "@shared/types";
import { sendChat } from "../socket";
import { eventsWhileHeld } from "../play/diceHold";
import { useApp } from "../store";
import { CloseButton } from "./CloseButton";
import { PieceIcon } from "./PieceIcon";
import {
  CHAT_RESOURCE_TOKEN,
  ChatRichText,
  ResourceIcon,
  ResourceQty,
} from "./icons/GameIcon";
import { RESOURCES } from "@shared/types";

const FILTERS: Array<{ id: LogKind | "todos"; label: string }> = [
  { id: "todos", label: "Todo" },
  { id: "dados", label: "Dados" },
  { id: "build", label: "Obras" },
  { id: "comercio", label: "Trueque" },
  { id: "dev", label: "Cartas" },
  { id: "ladron", label: "Ladrón" },
  { id: "descarte", label: "Descartes" },
  { id: "victoria", label: "Premios" },
];

/**
 * Con algo scrolleado arriba, el borde superior se esfuma: una entrada cortada a la mitad se leía
 * como un ícono suelto. Sin scroll no hay máscara y la primera línea queda entera.
 */
const SCROLL_FADE = "[mask-image:linear-gradient(to_bottom,transparent,#000_28px)]";

const EMOTES = [
  { k: ":)", g: "🙂" },
  { k: ":D", g: "😄" },
  { k: ":fire:", g: "🔥" },
  { k: ":isla:", g: "🏝️" },
  { k: ":dado:", g: "🎲" },
  { k: ":up:", g: "👍" },
];

function colorOf(view: ClientView, playerId: string | null): string {
  if (!playerId) return "#f4e4c1";
  const p = view.players.find((x) => x.id === playerId);
  return p ? COLOR_HEX[p.color] : "#f4e4c1";
}

function Res({ id, n }: { id: string; n?: number }) {
  return <ResourceQty resource={id as Resource} n={n} size={16} />;
}

function Dice({ n }: { n: number }) {
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-amber-50 px-0.5 text-[10px] font-bold text-stone-900">
      {n}
    </span>
  );
}

function LogGlyph({ icon }: { icon: LogIcon }) {
  if (icon.kind === "res" && icon.id) return <Res id={icon.id} n={icon.n} />;
  if (icon.kind === "dice" && icon.n != null) return <Dice n={icon.n} />;
  if (icon.kind === "sep") {
    return (
      <span aria-label="por" className="text-amber-100/60">
        →
      </span>
    );
  }
  if (icon.kind === "piece") return <PieceIcon id={icon.id} />;
  return null;
}

/** Una frase por evento: los recursos y cartas van como íconos dentro de la línea, no repetidos abajo. */
function EventLine({ view, e }: { view: ClientView; e: LogEvent }) {
  const tint = colorOf(view, e.playerId);
  const name = e.playerId ? view.players.find((p) => p.id === e.playerId)?.name : null;
  const kind = FILTERS.find((f) => f.id === e.kind)?.label ?? e.kind;
  const text = e.icons.length > 0 ? e.text.replace(/\.$/, "") : e.text;
  return (
    <div className="mb-2 flex gap-2 border-b border-amber-100/10 pb-2 text-xs leading-relaxed text-amber-50 md:text-sm" data-testid="log-line">
      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tint }} />
      <p className="min-w-0 [&_svg]:inline [&_svg]:align-[-3px]">
        <span className="mr-1 rounded bg-black/40 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
          {kind}
        </span>
        {name ? paintName(text, name, tint) : <ChatRichText text={text} size={16} />}
        {e.icons.length > 0 && (
          <span className="ml-1.5 inline-flex flex-wrap items-center gap-1.5 align-middle" data-testid="log-icons">
            {e.icons.map((ic, i) => (
              <LogGlyph key={`${e.id}-${i}`} icon={ic} />
            ))}
          </span>
        )}
      </p>
    </div>
  );
}

function paintName(text: string, name: string, color: string) {
  const i = text.indexOf(name);
  if (i < 0) return <ChatRichText text={text} size={16} />;
  return (
    <>
      <ChatRichText text={text.slice(0, i)} size={16} />
      <b style={{ color }}>{name}</b>
      <ChatRichText text={text.slice(i + name.length)} size={16} />
    </>
  );
}

export function MesaPanel({
  view,
  compact,
  onClose,
  closeTestId,
}: {
  view: ClientView;
  compact?: boolean;
  onClose?: () => void;
  closeTestId?: string;
}) {
  const set = useApp((s) => s.set);
  const tab = useApp((s) => s.mesaTab);
  const filter = useApp((s) => s.logFilter);
  const unread = useApp((s) => s.chatUnread);
  const diceUi = useApp((s) => s.diceUi);
  const [text, setText] = useState("");
  const [behind, setBehind] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastChat = useRef(view.chat.length);
  const seenInThread = useRef(view.chat.length);
  const pinned = useRef(true);
  const logPinned = useRef(true);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [filtersMore, setFiltersMore] = useState(false);
  const [logFaded, setLogFaded] = useState(false);
  const [chatFaded, setChatFaded] = useState(false);

  // El degradé sólo avisa que hay más filtros a la derecha; si entran todos, sobre la hoja era un bloque oscuro.
  useLayoutEffect(() => {
    const el = filtersRef.current;
    if (!el || !compact || tab !== "log") return;
    const check = () => setFiltersMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro?.disconnect();
    };
  }, [compact, tab]);

  const events = useMemo(() => {
    const gated = eventsWhileHeld(view.events, diceUi);
    const filtered = filter === "todos" ? gated : gated.filter((e) => e.kind === filter);
    return filtered.slice(-120);
  }, [view.events, filter, diceUi]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (logPinned.current) el.scrollTop = el.scrollHeight;
    setLogFaded(el.scrollTop > 2);
  }, [events.length, tab, filter]);

  useLayoutEffect(() => {
    if (tab !== "chat") return;
    pinned.current = true;
    seenInThread.current = view.chat.length;
    setBehind(0);
    const el = chatRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setChatFaded(el.scrollTop > 2);
    }
    // Sólo cambia de pestaña: el resto de los mensajes los maneja el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Pegado al fondo salvo que el usuario haya subido a leer; si mandó él, siempre baja.
  useLayoutEffect(() => {
    const el = chatRef.current;
    if (!el || tab !== "chat") return;
    const added = view.chat.slice(seenInThread.current);
    seenInThread.current = view.chat.length;
    if (!added.length) return;
    const mine = added.some((c) => c.playerId === view.youId);
    if (pinned.current || mine) {
      el.scrollTop = el.scrollHeight;
      pinned.current = true;
      setBehind(0);
      setChatFaded(el.scrollTop > 2);
    } else {
      setBehind((n) => n + added.length);
    }
  }, [view.chat, tab, view.youId]);

  function onChatScroll() {
    const el = chatRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (pinned.current) setBehind(0);
    setChatFaded(el.scrollTop > 2);
  }

  function jumpToNewest() {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    pinned.current = true;
    setBehind(0);
  }

  useEffect(() => {
    if (view.chat.length > lastChat.current) {
      const added = view.chat.slice(lastChat.current);
      const foreign = added.some((c) => c.playerId && c.playerId !== view.youId);
      if (foreign && tab !== "chat") {
        set({ chatUnread: unread + added.length });
      }
    }
    lastChat.current = view.chat.length;
  }, [view.chat, tab, unread, set, view.youId]);

  async function submit() {
    if (!text.trim()) return;
    const r = await sendChat(text);
    if (!r.ok) set({ toast: r.error ?? "No se pudo mandar." });
    else setText("");
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${compact ? "" : "panel rounded-2xl"}`}>
      <div className={`flex shrink-0 items-center gap-1 ${compact ? "pb-2" : "p-2"}`}>
        <Tab
          active={tab === "log"}
          onClick={() => set({ mesaTab: "log" })}
          label="Registro"
        />
        <Tab
          active={tab === "chat"}
          onClick={() => set({ mesaTab: "chat", chatUnread: 0 })}
          label="Chat"
          badge={unread > 0 && tab !== "chat" ? unread : undefined}
        />
        {onClose && <CloseButton onClick={onClose} testId={closeTestId} />}
      </div>
      {tab === "log" ? (
        <>
          <div className="relative shrink-0">
            {/* En la hoja del celu se desliza con el dedo; en el panel de escritorio, con mouse, los
                filtros cortados no se descubren: ahí van en dos renglones. */}
            <div
              ref={filtersRef}
              className={
                compact
                  ? "flex flex-nowrap gap-1 overflow-x-auto px-2 pb-1 [scrollbar-width:thin]"
                  : "flex flex-wrap gap-1 px-2 pb-1"
              }
              data-testid="log-filters"
            >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => set({ logFilter: f.id })}
                className={`shrink-0 whitespace-nowrap rounded-full ${compact ? "min-h-8 px-3 text-xs" : "px-2 py-0.5 text-[11px]"} ${
                  filter === f.id ? "bg-amber-200 text-stone-900" : "bg-black/30 text-amber-100/80"
                }`}
              >
                {f.label}
              </button>
            ))}
            </div>
            {compact && filtersMore && (
              <div
                aria-hidden
                data-testid="log-filters-fade"
                className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#25160c] to-transparent"
              />
            )}
          </div>
          <div
            ref={logRef}
            className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-1 pb-2 ${logFaded ? SCROLL_FADE : ""}`}
            data-testid="log-list"
            onScroll={(e) => {
              const el = e.currentTarget;
              logPinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
              setLogFaded(el.scrollTop > 2);
            }}
          >
            {events.length === 0 && <p className="text-xs text-amber-100/50">Todavía no pasó nada.</p>}
            {events.map((e) => (
              <EventLine key={e.id} view={view} e={e} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="relative min-h-0 flex-1">
            {/* Columna con mt-auto: pocos mensajes quedan pegados al campo de texto, como en
                cualquier chat; con muchos, scrollea normal (justify-end rompería el scroll). */}
            <div
              ref={chatRef}
              className={`flex h-full flex-col overflow-y-auto overscroll-contain px-2 pt-1 pb-2 ${chatFaded ? SCROLL_FADE : ""}`}
              data-testid="chat-thread"
              onScroll={onChatScroll}
            >
              <div className="mt-auto">
                {view.chat.length === 0 && (
                  <p className="text-xs text-amber-100/50">Todavía nadie escribió. El chat no muestra las cartas de nadie.</p>
                )}
                {view.chat.map((c) => {
                  const col =
                    c.color && COLOR_HEX[c.color]
                      ? COLOR_HEX[c.color]
                      : colorOf(view, c.playerId);
                  const system = !c.playerId;
                  return (
                    <p
                      key={c.id}
                      className={`mb-1 break-words text-xs leading-relaxed [&_svg]:inline [&_svg]:align-[-3px] ${
                        system ? "text-amber-100/60 italic" : "text-amber-50"
                      }`}
                    >
                      <b className="not-italic" style={{ color: system ? undefined : col }}>
                        {c.name}:
                      </b>{" "}
                      <ChatRichText text={c.text} size={16} />
                    </p>
                  );
                })}
              </div>
              <div ref={chatEndRef} data-testid="chat-end" className="h-3 shrink-0" />
            </div>
            {behind > 0 && (
              <button
                className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-200 px-3 py-1 text-[11px] font-semibold text-stone-900 shadow-lg"
                data-testid="chat-new"
                onClick={jumpToNewest}
              >
                {behind === 1 ? "1 mensaje nuevo" : `${behind} mensajes nuevos`} ↓
              </button>
            )}
          </div>
          {/* Caras y recursos son dos grupos: si no entran en un renglón, baja el grupo entero. */}
          <div className="flex shrink-0 flex-wrap gap-x-2 gap-y-1 px-2 pb-1" data-testid="chat-quick">
            <div className="flex gap-1">
              {EMOTES.map((e) => (
                <button
                  key={e.k}
                  className="rounded bg-black/30 px-1.5 py-0.5 text-sm"
                  onClick={() => setText((t) => `${t}${e.g}`)}
                  title={e.k}
                >
                  {e.g}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {RESOURCES.map((r) => (
                <button
                  key={r}
                  className="rounded bg-black/30 p-1"
                  onClick={() => setText((t) => `${t}${CHAT_RESOURCE_TOKEN[r]}`)}
                  data-tip={RESOURCE_LABEL[r]}
                  aria-label={`Insertar ${RESOURCE_LABEL[r].toLowerCase()}`}
                >
                  <ResourceIcon resource={r} size={18} decorative />
                </button>
              ))}
            </div>
          </div>
          <form
            className="flex shrink-0 items-center gap-1 p-2 pt-0"
            data-testid="chat-composer"
            onSubmit={(ev) => {
              ev.preventDefault();
              void submit();
            }}
          >
            <input
              data-testid="chat-input"
              className="min-h-10 flex-1 rounded-lg bg-black/40 px-2 py-1 text-sm"
              value={text}
              maxLength={160}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribí al chat…"
            />
            <button
              type="submit"
              data-testid="chat-send"
              className="min-h-10 shrink-0 rounded-lg bg-amber-200 px-3 text-sm font-semibold text-stone-900"
            >
              Enviar
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative min-h-8 flex-1 rounded-lg py-1 text-sm font-semibold ${
        active ? "bg-amber-200 text-stone-900" : "bg-black/30 text-amber-100"
      }`}
    >
      {label}
      {badge != null && (
        <span className="absolute -top-1 -right-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
