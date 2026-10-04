import { useEffect } from "react";
import { sendAction, sendChat } from "../socket";
import { THEMES, type ThemeId } from "../theme/tokens";
import type { GraphicsMode } from "../three/graphics";
import { saveGraphicsMode } from "../three/graphics";
import { useApp } from "../store";

declare global {
  interface Window {
    __colonosDev?: { useApp: typeof useApp; sendAction: typeof sendAction; sendChat: typeof sendChat };
  }
}

/**
 * Solo en DEV, para las capturas de partidas reales. Tras un hot reload Vite sirve
 * `/src/store.ts?t=…`: un `import("/src/store.ts")` desde afuera trae otra instancia, vacía.
 */
if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__colonosDev = { useApp, sendAction, sendChat };
}

/** Solo en DEV: `?scene=S0-vacio&seed=42&tier=normal&freeze=1`. */
export function useArtHarness(): void {
  const set = useApp((s) => s.set);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const q = new URLSearchParams(window.location.search);
    const scene = q.get("scene");
    if (!scene) return;
    const seed = Number(q.get("seed") ?? "42");
    const tier = q.get("tier");
    const freeze = q.get("freeze") === "1";
    const theme = q.get("theme");
    const cam = q.get("cam");
    if (tier === "liviano" || tier === "normal") {
      saveGraphicsMode(tier);
      set({ graphics: tier as GraphicsMode });
    }
    if (theme && (THEMES as readonly string[]).includes(theme)) {
      set({ theme: theme as ThemeId });
    }
    if (cam === "tactica" || cam === "cinematica" || cam === "dados" || cam === "ladron") {
      set({ artCam: cam });
    }
    if (freeze) {
      set({
        artFreeze: true,
        mesaOpen: false,
        actionsOpen: false,
        sheet: null,
        iconSheet: scene === "S7-iconos",
      });
    }
    if (scene === "S7-iconos") {
      set({ iconSheet: true });
    }
    const playersQ = q.get("players");
    const playersParam = playersQ ? `&players=${encodeURIComponent(playersQ)}` : "";
    void fetch(`/api/dev/scene?id=${encodeURIComponent(scene)}&seed=${seed}${playersParam}`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; view?: unknown }) => {
        if (!data.ok || !data.view) return;
        const view = data.view as import("@shared/types").ClientView;
        set({
          view,
          screen: "game",
          lobby: null,
          playerId: view.youId,
          code: view.roomCode,
          name: view.players[0]?.name ?? "Luz",
          color: view.players[0]?.color ?? "rojo",
        });
      })
      .catch(() => {
        /* harness only */
      });
  }, [set]);
}
