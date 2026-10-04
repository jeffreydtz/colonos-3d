import { useEffect, useRef } from "react";
import type { ClientView, ColorId, LobbyView } from "@shared/types";
import { COLORS } from "@shared/types";
import { useArtHarness } from "./dev/useArtHarness";
import { joinSala, loadSession, saveSession, socket } from "./socket";
import { Game } from "./screens/Game";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { useApp } from "./store";
import { IconTips } from "./ui/icons/IconTips";

export default function App() {
  const screen = useApp((s) => s.screen);
  const set = useApp((s) => s.set);
  const theme = useApp((s) => s.theme);
  const booted = useRef(false);
  useArtHarness();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sala = params.get("sala")?.toUpperCase() ?? "";
    if (sala) set({ code: sala });

    const onLobby = (lobby: LobbyView) =>
      set({ lobby, screen: "lobby", view: null, playerId: lobby.youId, code: lobby.roomCode });
    const onView = (view: ClientView) =>
      set({ view, screen: "game", lobby: null, playerId: view.youId, code: view.roomCode });
    const onFx = (payload: { animations: string[] }) =>
      set({ lastFx: { animations: payload.animations, at: Date.now() } });

    socket.on("lobby", onLobby);
    socket.on("view", onView);
    socket.on("fx", onFx);

    const onDisconnect = () => set({ netDown: true });
    const onReconnect = () => {
      set({ netDown: false });
      const state = useApp.getState();
      const session = loadSession(state.code || sala || undefined);
      if (!session) return;
      if (state.screen === "home" && !sala) return;
      void applyJoin(session.code, session.name, session.color, session.token);
    };
    socket.on("disconnect", onDisconnect);
    socket.on("connect", onReconnect);

    async function applyJoin(
      code: string,
      name: string,
      color: ColorId,
      token?: string,
    ): Promise<boolean> {
      const r = await joinSala({ code, name, color, token });
      if (!r.ok || !r.token || !r.playerId || !r.code) {
        set({ error: r.error ?? "No se pudo reconectar." });
        return false;
      }
      saveSession(r.code, r.token, name, color);
      if (r.view) {
        set({
          screen: "game",
          view: r.view,
          token: r.token,
          playerId: r.playerId,
          code: r.code,
          name,
          color,
          error: null,
        });
        return true;
      }
      if (!r.lobby) return false;
      set({
        screen: "lobby",
        lobby: r.lobby,
        token: r.token,
        playerId: r.playerId,
        code: r.code,
        name,
        color,
        error: null,
      });
      return true;
    }

    async function resume(): Promise<void> {
      const session = loadSession(sala || undefined);
      if (session && (!sala || session.code === sala)) {
        const ok = await applyJoin(session.code, session.name, session.color, session.token);
        if (ok) return;
      }
      if (session) {
        set({ name: session.name, color: session.color });
      } else if (!useApp.getState().name) {
        const k = Math.floor(Math.random() * 89) + 10;
        const n = `Jugador ${k >= 69 ? k + 1 : k}`;
        set({ name: n, color: COLORS[Math.floor(Math.random() * COLORS.length)] as ColorId });
      }
    }

    if (!booted.current) {
      booted.current = true;
      if (!params.get("scene")) void resume();
    }

    return () => {
      socket.off("lobby", onLobby);
      socket.off("view", onView);
      socket.off("fx", onFx);
      socket.off("disconnect", onDisconnect);
      socket.off("connect", onReconnect);
    };
  }, [set]);

  return (
    <>
      {screen === "lobby" ? <Lobby /> : screen === "game" ? <Game /> : <Home />}
      <IconTips />
    </>
  );
}
