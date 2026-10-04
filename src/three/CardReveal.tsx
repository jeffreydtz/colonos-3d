import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { DevKind } from "@shared/types";
import { setBusy } from "../socket";
import { useApp } from "../store";
import { Deadline } from "../ui/Deadline";
import { DevIcon } from "../ui/icons/GameIcon";

/** Cuánto queda el sobre cerrado a la vista del resto de la mesa. */
export const SPECTATOR_HOLD_MS = 3500;
/** Sobre cerrado, después se abre y sube la carta, después gira. Un toque adelanta el paso. */
const OPEN_AFTER_MS = 650;
const FLIP_AFTER_MS = 700;

type Stage = "sealed" | "open" | "front";

const ART: Record<DevKind, { title: string; subtitle: string; hue: string; accent: string }> = {
  caballero: {
    title: "Caballero",
    subtitle: "Mové el ladrón y robá una carta",
    hue: "#7f1d1d",
    accent: "#fca5a5",
  },
  progreso_caminos: {
    title: "Caminos",
    subtitle: "Tendé dos caminos gratis",
    hue: "#78350f",
    accent: "#fcd34d",
  },
  progreso_invento: {
    title: "Invento",
    subtitle: "Tomá dos recursos del banco",
    hue: "#14532d",
    accent: "#86efac",
  },
  progreso_monopolio: {
    title: "Monopolio",
    subtitle: "Te llevás un recurso de todos",
    hue: "#1e3a8a",
    accent: "#93c5fd",
  },
  punto_victoria: {
    title: "Punto de victoria",
    subtitle: "Se queda oculta hasta el final",
    hue: "#713f12",
    accent: "#fde68a",
  },
};

function playWhoosh(on: boolean) {
  if (!on || typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(180, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.45);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.72);
    window.setTimeout(() => void ctx.close(), 900);
  } catch {
    /* audio opcional */
  }
}

function HexMark() {
  return (
    <svg viewBox="0 0 40 44" className="h-12 w-11" aria-hidden>
      <path d="M20 2 37 12v20L20 42 3 32V12Z" fill="none" stroke="#e8c26a" strokeWidth="2.5" />
      <path d="M20 11 29 16v12l-9 5-9-5V16Z" fill="#e8c26a" opacity="0.85" />
    </svg>
  );
}

export function CardReveal({
  kind,
  owner,
  playerName,
  onClose,
  sfx,
  deadlineAt,
}: {
  kind: DevKind | null;
  owner: boolean;
  playerName?: string;
  onClose: () => void;
  sfx: boolean;
  deadlineAt?: number | null;
}) {
  const [stage, setStage] = useState<Stage>("sealed");
  const spec = kind ? ART[kind] : null;
  const closeRef = useRef(onClose);
  const sfxRef = useRef(sfx);

  useEffect(() => {
    closeRef.current = onClose;
    sfxRef.current = sfx;
  }, [onClose, sfx]);

  useEffect(() => {
    if (owner) {
      void setBusy(true);
      return;
    }
    const t = window.setTimeout(() => closeRef.current(), SPECTATOR_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [owner]);

  useEffect(() => {
    if (!owner || stage === "front") return;
    if (stage === "open") playWhoosh(sfxRef.current);
    const t = window.setTimeout(
      () => setStage(stage === "sealed" ? "open" : "front"),
      stage === "sealed" ? OPEN_AFTER_MS : FLIP_AFTER_MS,
    );
    return () => window.clearTimeout(t);
  }, [owner, stage]);

  function close() {
    if (owner) void setBusy(false);
    onClose();
  }

  function advance() {
    if (stage === "sealed") setStage("open");
    else if (stage === "open") setStage("front");
    else close();
  }

  function tilt(e: PointerEvent<HTMLDivElement>) {
    if (stage !== "front") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.style.setProperty("--ry", `${((x - 0.5) * 18).toFixed(1)}deg`);
    el.style.setProperty("--rx", `${((0.5 - y) * 14).toFixed(1)}deg`);
    el.style.setProperty("--gx", `${Math.round(x * 100)}%`);
    el.style.setProperty("--gy", `${Math.round(y * 100)}%`);
  }

  function untilt(e: PointerEvent<HTMLDivElement>) {
    for (const p of ["--rx", "--ry", "--gx", "--gy"]) e.currentTarget.style.removeProperty(p);
  }

  const opened = owner && stage !== "sealed";
  const flipped = owner && stage === "front";

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden bg-black/90 p-4"
      onClick={close}
      role="presentation"
      data-testid={owner ? "unbox-owner" : "unbox-spectator"}
      data-stage={owner ? stage : "sealed"}
    >
      {deadlineAt ? (
        <div className="pointer-events-none absolute top-3 left-0 right-0 z-[81] flex justify-center">
          <Deadline
            at={deadlineAt}
            className="rounded-full bg-black/70 px-3 py-1 text-sm font-semibold text-amber-100"
          />
        </div>
      ) : null}
      <div
        className="relative h-72 w-52 md:h-80 md:w-56"
        onClick={(e) => {
          e.stopPropagation();
          if (owner && stage !== "front") advance();
        }}
      >
        {owner && spec && (
          <div
            className={`reveal-burst ${flipped ? "is-on" : ""}`}
            style={{ "--accent": spec.accent } as CSSProperties}
            aria-hidden
          >
            <div className="reveal-rays" />
          </div>
        )}
        <div className={`reveal-card ${opened ? "is-out" : ""}`}>
          <div className="reveal-tilt touch-none" onPointerMove={tilt} onPointerLeave={untilt}>
            <div className="reveal-flip" data-flipped={flipped}>
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border-4 border-amber-200/70 shadow-2xl"
                style={{
                  backfaceVisibility: "hidden",
                  background: "radial-gradient(circle at 50% 40%, #57534e 0%, #1c1917 70%)",
                }}
              >
                <HexMark />
                <p className="display text-xl text-amber-100">Colonos</p>
              </div>
              {owner && spec && (
                <div
                  className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border-4 p-3 text-center shadow-2xl"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    background: `linear-gradient(180deg, ${spec.hue}, #0c0a09)`,
                    borderColor: spec.accent,
                  }}
                >
                  <p className="display text-xl leading-tight text-amber-50 md:text-2xl">{spec.title}</p>
                  <div
                    className="mt-2 flex flex-1 items-center justify-center rounded-xl border"
                    style={{
                      borderColor: `${spec.accent}66`,
                      background: `radial-gradient(circle at 50% 45%, ${spec.accent}55 0%, transparent 70%)`,
                    }}
                  >
                    {kind && <DevIcon kind={kind} size={84} />}
                  </div>
                  <p className="mt-3 min-h-10 text-sm leading-snug text-amber-100/85">{spec.subtitle}</p>
                  <div className="reveal-holo" aria-hidden />
                  <div className="reveal-glare" aria-hidden />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={`reveal-pack ${opened ? "is-open" : ""}`} aria-hidden={opened}>
          <div className="reveal-pack-top" />
          <div className="reveal-pack-body">
            <HexMark />
            <p className="display text-2xl text-amber-100">Colonos</p>
            <p className="text-xs text-amber-100/80">
              {owner ? "Carta de desarrollo" : `${playerName ?? "Alguien"} compró una carta`}
            </p>
            <div className="foil-sheen h-1.5 w-24 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-8 flex min-h-28 flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {flipped ? (
          <p className="max-w-xs text-center text-sm text-amber-100/80" data-testid="unbox-hint">
            {kind === "punto_victoria"
              ? "Cuenta sola: no hace falta jugarla."
              : "Se juega desde Construir, a partir de tu próximo turno."}
          </p>
        ) : (
          <>
            <p className="display text-xl text-amber-50" data-testid="unbox-title">
              {owner ? "Carta nueva" : "Sobre cerrado"}
            </p>
            <p className="max-w-xs text-center text-sm text-amber-100/80">
              {owner
                ? "Sólo vos ves el frente."
                : "El comprador está abriendo su carta. El frente es sólo para esa persona."}
            </p>
          </>
        )}
        {owner && (
          <div className="mt-1 flex gap-2">
            <button
              className="min-h-11 rounded-xl bg-black/50 px-3 py-2 text-xs text-amber-100"
              onClick={() => useApp.getState().set({ sfxOn: !sfx })}
            >
              {sfx ? "Sonido: activado" : "Sonido: apagado"}
            </button>
            <button
              className="min-h-11 rounded-xl bg-amber-200 px-6 py-2 font-semibold text-stone-900"
              data-testid="unbox-next"
              onClick={advance}
            >
              {flipped ? "Seguir" : "Abrir"}
            </button>
          </div>
        )}
        {!owner && (
          <button className="min-h-11 rounded-xl bg-amber-200 px-6 py-2 font-semibold text-stone-900" onClick={close}>
            Seguir
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
