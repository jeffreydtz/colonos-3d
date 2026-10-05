import { useEffect, useState } from "react";

/** Inset del teclado virtual (iOS/Android) vía visualViewport. */
export function useVisualViewportInset(): number {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setKb(inset);
      document.documentElement.style.setProperty("--vv-bottom", `${inset}px`);
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.documentElement.style.removeProperty("--vv-bottom");
    };
  }, []);
  return kb;
}
