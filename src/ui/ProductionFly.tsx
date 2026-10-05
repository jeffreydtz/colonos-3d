import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Resource } from "@shared/types";
import { useApp } from "../store";
import { ResourceIcon } from "./icons/GameIcon";
import { HEX_SCREENS } from "../play/producing";
import { harvestFlights, harvestMotion, type HarvestFlight, type HarvestMotion } from "../play/harvest";
import { reduceMotion } from "../audio/sfx";

type Shown = HarvestFlight & { x: number; y: number; tx: number; ty: number };

/** Hay una tira por layout y la de escritorio sigue en el DOM oculta en el celu: vale la que se ve. */
function handTarget(resource: Resource): { x: number; y: number } | null {
  for (const el of Array.from(document.querySelectorAll(`[data-hand-res="${resource}"]`))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}

function hexOrigin(hexId: string): { x: number; y: number } | null {
  const hit = HEX_SCREENS.find((h) => h.id === hexId);
  return hit ? { x: hit.x, y: hit.y } : null;
}

function place(flight: HarvestFlight, motion: HarvestMotion): Shown {
  const origin = hexOrigin(flight.hexId) ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
  if (!flight.mine) return { ...flight, x: origin.x, y: origin.y, tx: origin.x, ty: origin.y };
  const hand = handTarget(flight.resource) ?? { x: window.innerWidth / 2, y: window.innerHeight - 48 };
  // Reducir movimiento: el +N ya está en la mano, sin recorrer la pantalla.
  if (motion === "reduce") return { ...flight, x: hand.x, y: hand.y, tx: hand.x, ty: hand.y };
  return { ...flight, x: origin.x, y: origin.y, tx: hand.x, ty: hand.y };
}

/**
 * Tras revelar la tirada, cada recurso sale de la casilla que lo produjo.
 * Lo tuyo arco hasta tu mano; lo de los demás es un +N corto sobre la casilla.
 * No toca la cámara ni captura el puntero.
 */
export function ProductionFly() {
  const revealed = useApp((s) => s.diceUi.revealed);
  const holdFrom = useApp((s) => s.diceUi.holdFromEventId);
  const [flies, setFlies] = useState<Shown[]>([]);
  // Si el HUD vuelve a montarse (tras revelar una carta), la tirada ya vista no se repite.
  const flownHold = useRef(revealed ? holdFrom : 0);

  useEffect(() => {
    if (!revealed || holdFrom <= 0 || flownHold.current === holdFrom) return;
    let cancelled = false;
    let raf = 0;
    let frames = 0;
    const step = () => {
      if (cancelled) return;
      frames += 1;
      const view = useApp.getState().view;
      if (!view) {
        flownHold.current = holdFrom;
        return;
      }
      const motion = harvestMotion({
        reduce: reduceMotion(),
        lite: useApp.getState().graphics === "liviano",
      });
      const planned = harvestFlights(view, { holdFromEventId: holdFrom }, motion);
      // El canvas proyecta los hexes al revelar. Unos cuadros alcanzan; si no hay WebGL, se usa el centro.
      if (planned.length > 0 && HEX_SCREENS.length === 0 && frames < 10) {
        raf = requestAnimationFrame(step);
        return;
      }
      flownHold.current = holdFrom;
      if (!planned.length) return;
      setFlies(planned.map((flight) => place(flight, motion)));
    };
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(step);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [revealed, holdFrom]);

  useEffect(() => {
    if (!flies.length) return;
    const timers: number[] = [];
    const caught = new Set<HTMLElement>();
    const pulsed = new Set<HTMLElement>();
    for (const flight of flies) {
      if (flight.mine && flight.lift !== 0) {
        const hand = visibleHand(flight.resource);
        if (hand) {
          timers.push(
            window.setTimeout(() => {
              hand.classList.add("colonos-hand-catch");
              caught.add(hand);
            }, flight.delayMs + Math.round(flight.flightMs * 0.78)),
          );
        }
      }
      if (!flight.mine && flight.flightMs > 200) {
        timers.push(
          window.setTimeout(() => {
            for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-seat="${flight.playerId}"]`))) {
              el.classList.add("colonos-seat-pulse");
              pulsed.add(el);
            }
          }, flight.delayMs),
        );
      }
    }
    const end = flies.reduce((max, flight) => Math.max(max, flight.delayMs + flight.flightMs), 0);
    const clear = window.setTimeout(() => {
      for (const el of caught) el.classList.remove("colonos-hand-catch");
      for (const el of pulsed) el.classList.remove("colonos-seat-pulse");
      setFlies([]);
    }, end + 40);
    return () => {
      window.clearTimeout(clear);
      for (const t of timers) window.clearTimeout(t);
      for (const el of caught) el.classList.remove("colonos-hand-catch");
      for (const el of pulsed) el.classList.remove("colonos-seat-pulse");
    };
  }, [flies]);

  if (!flies.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40" data-testid="production-fly" aria-hidden>
      {flies.map((f) => (
        <span
          key={f.id}
          data-flight={f.id}
          data-mine={f.mine ? "1" : "0"}
          data-resource={f.resource}
          data-hex={f.hexId}
          data-n={f.n}
          className={
            f.mine
              ? "colonos-fly-hud absolute inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-2xl bg-stone-950/92 px-2.5 py-1.5 ring-2 ring-amber-300"
              : "colonos-harvest-pop absolute inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-xl bg-stone-950/80 px-1.5 py-1 ring-1 ring-amber-200/70"
          }
          style={
            {
              left: f.x,
              top: f.y,
              "--dx": `${f.tx - f.x}px`,
              "--dy": `${f.ty - f.y}px`,
              "--lift": `${f.lift}px`,
              "--bounce": `${f.bounce}px`,
              animationDuration: `${f.flightMs}ms`,
              animationDelay: `${f.delayMs}ms`,
            } as CSSProperties
          }
        >
          <ResourceIcon resource={f.resource} size={f.mine ? 32 : 22} decorative />
          <span className={f.mine ? "text-3xl font-bold leading-none text-amber-50" : "text-lg font-bold leading-none text-amber-50"}>
            +{f.n}
          </span>
        </span>
      ))}
    </div>
  );
}

function visibleHand(resource: Resource): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-hand-res="${resource}"]`))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}
