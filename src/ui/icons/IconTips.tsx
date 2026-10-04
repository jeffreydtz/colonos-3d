import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Tip = { text: string; x: number; top: number; bottom: number };

const HOVER_MS = 260;
export const HOLD_MS = 420;
const SHOW_MS = 1600;
const MOVE_PX = 10;
const EDGE = 8;
const GAP = 6;
const INTERACTIVE = "button, a[href], input, select, textarea, label, [role='button'], [role='tab']";

function tipFrom(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest("[data-tip]") : null;
}

/**
 * Un solo globo para todo lo que tenga `data-tip`: el ícono identifica y el nombre queda de ayuda.
 * Mouse: al pasar por encima. Táctil: toque largo (y ese toque no dispara el botón), o toque
 * corto si el ícono no es un botón.
 */
export function IconTips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: Element | null = null;
    let hoverT = 0;
    let holdT = 0;
    let hideT = 0;
    let down: { x: number; y: number; el: Element } | null = null;
    let eatClick = false;

    const hide = () => {
      window.clearTimeout(hoverT);
      window.clearTimeout(hideT);
      current = null;
      setTip(null);
    };
    const show = (el: Element, ms?: number) => {
      const text = el.getAttribute("data-tip");
      if (!text || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      current = el;
      setTip({ text, x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
      window.clearTimeout(hideT);
      if (ms) hideT = window.setTimeout(hide, ms);
    };

    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = tipFrom(e.target);
      if (el === current) return;
      window.clearTimeout(hoverT);
      if (!el) return;
      current = el;
      hoverT = window.setTimeout(() => show(el), HOVER_MS);
    };
    const out = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const to = tipFrom(e.relatedTarget);
      if (to && to === current) return;
      hide();
    };
    const pressStart = (e: PointerEvent) => {
      eatClick = false;
      window.clearTimeout(holdT);
      if (e.pointerType === "mouse") {
        hide();
        return;
      }
      const el = tipFrom(e.target);
      if (el !== current) hide();
      down = el ? { x: e.clientX, y: e.clientY, el } : null;
      if (!el) return;
      holdT = window.setTimeout(() => {
        if (!down) return;
        eatClick = true;
        show(down.el, SHOW_MS);
      }, HOLD_MS);
    };
    const pressMove = (e: PointerEvent) => {
      if (!down) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > MOVE_PX) {
        window.clearTimeout(holdT);
        down = null;
      }
    };
    const pressEnd = () => {
      window.clearTimeout(holdT);
      const d = down;
      down = null;
      if (!d || eatClick) return;
      if (!d.el.closest(INTERACTIVE)) show(d.el, SHOW_MS);
    };
    const pressCancel = () => {
      window.clearTimeout(holdT);
      down = null;
    };
    const click = (e: MouseEvent) => {
      if (!eatClick) return;
      eatClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const menu = (e: Event) => {
      if (tipFrom(e.target)) e.preventDefault();
    };

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", pressStart, true);
    document.addEventListener("pointermove", pressMove, { passive: true });
    document.addEventListener("pointerup", pressEnd, true);
    document.addEventListener("pointercancel", pressCancel, true);
    document.addEventListener("click", click, true);
    document.addEventListener("contextmenu", menu);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", hide);
    return () => {
      hide();
      window.clearTimeout(holdT);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", pressStart, true);
      document.removeEventListener("pointermove", pressMove);
      document.removeEventListener("pointerup", pressEnd, true);
      document.removeEventListener("pointercancel", pressCancel, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("contextmenu", menu);
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", hide);
    };
  }, []);

  // Arriba del ícono y dentro de la pantalla; si no entra arriba (chips del borde), abajo.
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!el || !tip) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = Math.min(Math.max(tip.x - w / 2, EDGE), window.innerWidth - EDGE - w);
    const above = tip.top - h - GAP;
    const y = above >= EDGE ? above : tip.bottom + GAP;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={bubble}
      role="tooltip"
      data-testid="icon-tip"
      className="pointer-events-none fixed top-0 left-0 z-[200] max-w-[16rem] rounded-lg border border-amber-200/30 bg-stone-950/95 px-2 py-1 text-xs font-semibold text-amber-50 shadow-lg"
    >
      {tip.text}
    </div>,
    document.body,
  );
}
