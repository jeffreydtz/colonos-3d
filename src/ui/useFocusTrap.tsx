import { useEffect, useRef, type HTMLAttributes } from "react";

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])";

/** Mete el foco en el diálogo y no deja que Tab se escape al tablero. */
export function useFocusTrap() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = node;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items()[0];
    (first ?? root).focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const list = items();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const head = list[0]!;
      const tail = list[list.length - 1]!;
      const active = document.activeElement;
      const inside = active instanceof Node && root.contains(active);
      if (e.shiftKey && (active === head || !inside)) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (active === tail || !inside)) {
        e.preventDefault();
        head.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return ref;
}

/** Se monta con el diálogo: el foco entra al abrirse y sale al cerrarse. */
export function FocusTrap(props: HTMLAttributes<HTMLDivElement>) {
  const ref = useFocusTrap();
  return <div ref={ref} tabIndex={-1} {...props} />;
}
