import { useEffect, useRef, useState, type CSSProperties } from "react";
import { RESOURCES, type Resource } from "@shared/types";
import { useApp } from "../store";
import { ResourceIcon } from "./icons/GameIcon";
import { HEX_SCREENS } from "../play/producing";
import { rollGainsFor } from "../play/diceHold";
import { reduceMotion } from "../audio/sfx";

type Fly = { id: string; resource: Resource; n: number; x: number; y: number; tx: number; ty: number };

/** Hay una tira por layout y la de escritorio sigue en el DOM oculta en el celu: vale la que se ve. */
function handTarget(resource: Resource): { x: number; y: number } {
  for (const el of Array.from(document.querySelectorAll(`[data-hand-res="${resource}"]`))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight - 48 };
}

/**
 * Íconos que vuelan del hex productor a la tira de mano. Se dispara al revelarse cada tirada (no
 * cuando llega el fx, que todavía ve revelada la anterior) y sólo con lo que esa tirada pagó.
 */
export function ProductionFly() {
  const revealed = useApp((s) => s.diceUi.revealed);
  const holdFrom = useApp((s) => s.diceUi.holdFromEventId);
  const [flies, setFlies] = useState<Fly[]>([]);
  // Si el HUD vuelve a montarse (tras revelar una carta), la tirada ya vista no se repite.
  const flownHold = useRef(revealed ? holdFrom : 0);

  useEffect(() => {
    if (!revealed || holdFrom <= 0 || flownHold.current === holdFrom) return;
    // Dos cuadros: el canvas proyecta los hexes productores recién cuando la tirada se revela.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        flownHold.current = holdFrom;
        const view = useApp.getState().view;
        const mine = view && rollGainsFor(view.events, { holdFromEventId: holdFrom }, view.youId);
        if (!mine) return;
        const next: Fly[] = [];
        for (const r of RESOURCES) {
          const n = mine[r] ?? 0;
          if (n <= 0) continue;
          const origin = HEX_SCREENS.find((h) => h.resource === r);
          const from = origin ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.45 };
          const to = handTarget(r);
          next.push({ id: `${holdFrom}-${r}`, resource: r, n, x: from.x, y: from.y, tx: to.x, ty: to.y });
        }
        setFlies(next);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [revealed, holdFrom]);

  useEffect(() => {
    if (!flies.length) return;
    const t = window.setTimeout(() => setFlies([]), reduceMotion() ? 200 : 1100);
    return () => window.clearTimeout(t);
  }, [flies]);

  if (!flies.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40" data-testid="production-fly" aria-hidden>
      {flies.map((f) => (
        <span
          key={f.id}
          className="colonos-fly-hud absolute inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-2xl bg-stone-950/92 px-2.5 py-1.5 ring-2 ring-amber-300"
          style={
            {
              left: f.x,
              top: f.y,
              "--dx": `${f.tx - f.x}px`,
              "--dy": `${f.ty - f.y}px`,
            } as CSSProperties
          }
        >
          <ResourceIcon resource={f.resource} size={32} decorative />
          <span className="text-3xl font-bold leading-none text-amber-50">+{f.n}</span>
        </span>
      ))}
    </div>
  );
}
