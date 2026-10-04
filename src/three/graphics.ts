export type GraphicsMode = "normal" | "liviano";

const KEY = "colonos-graficos";

export function detectLite(opts: {
  width: number;
  coarse: boolean;
  memory?: number;
  cores: number;
}): boolean {
  if (typeof opts.memory === "number" && opts.memory <= 4) return true;
  if (opts.cores <= 4 && (opts.coarse || opts.width < 700)) return true;
  return opts.width < 700 && opts.coarse;
}

export function preferLiteDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return detectLite({
    width: window.innerWidth,
    coarse,
    memory: mem,
    cores: navigator.hardwareConcurrency ?? 8,
  });
}

export function loadGraphicsMode(): GraphicsMode {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "normal" || raw === "liviano") return raw;
  } catch {
    /* private mode */
  }
  return preferLiteDevice() ? "liviano" : "normal";
}

export function saveGraphicsMode(mode: GraphicsMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}
