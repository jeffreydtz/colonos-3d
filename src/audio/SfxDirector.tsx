import { useEffect, useRef } from "react";
import type { ClientView } from "@shared/types";
import { useApp } from "../store";
import { nextCues, type CueView, type Heard } from "./cues";
import { saveSoundPrefs, wantsKeepAlive, type SoundPrefs } from "./prefs";
import {
  applySoundPrefs,
  audioRunning,
  cancelTurnAlarms,
  installAudioUnlock,
  playSfx,
  resumeAudio,
  scheduleTurnAlarms,
  setKeepAlive,
} from "./sfx";

function toPrefs(s: { sfxOn: boolean; sfxVolume: number; sfxMute: SoundPrefs["mute"] }): SoundPrefs {
  return { enabled: s.sfxOn, volume: s.sfxVolume, mute: s.sfxMute };
}

function toCueView(view: ClientView): CueView {
  return {
    youId: view.youId,
    currentPlayerId: view.currentPlayerId,
    winnerId: view.winnerId,
    events: view.events.map((e) => ({
      id: e.id,
      kind: e.kind,
      playerId: e.playerId,
      otherId: e.otherId,
      text: e.text,
      resources: e.resources ?? null,
    })),
    chat: view.chat.map((c) => ({ id: c.id, playerId: c.playerId })),
    trades: view.trades.map((t) => ({ id: t.id, fromId: t.fromId, toId: t.toId })),
  };
}

function rearmAlarms(): void {
  const s = useApp.getState();
  const view = s.view;
  if (!view || s.artFreeze || view.phase === "fin" || view.winnerId || !view.deadlineAt) {
    cancelTurnAlarms();
    return;
  }
  scheduleTurnAlarms(view.deadlineAt, view.currentPlayerId === view.youId);
}

function syncKeepAlive(): void {
  const s = useApp.getState();
  setKeepAlive(wantsKeepAlive(document.hidden, toPrefs(s)) && audioRunning());
}

/** Pistas de la mesa. El mute y el volumen viven en el store; el grafo es Web Audio. */
export function SfxDirector() {
  const sfxOn = useApp((s) => s.sfxOn);
  const sfxVolume = useApp((s) => s.sfxVolume);
  const sfxMute = useApp((s) => s.sfxMute);
  const view = useApp((s) => s.view);
  const lastFx = useApp((s) => s.lastFx);
  const revealed = useApp((s) => s.diceUi.revealed);
  const artFreeze = useApp((s) => s.artFreeze);
  const heard = useRef<Heard | null>(null);

  useEffect(() => {
    const prefs = { enabled: sfxOn, volume: sfxVolume, mute: sfxMute };
    applySoundPrefs(prefs);
    saveSoundPrefs(prefs);
    syncKeepAlive();
  }, [sfxOn, sfxVolume, sfxMute]);

  useEffect(() => {
    const off = installAudioUnlock(() => {
      useApp.getState().set({ sfxUnlocked: true });
      syncKeepAlive();
      rearmAlarms();
    });
    const onVis = () => {
      const s = useApp.getState();
      if (!s.sfxUnlocked && !audioRunning()) return;
      if (audioRunning()) syncKeepAlive();
      void resumeAudio().then(() => {
        syncKeepAlive();
        rearmAlarms();
      });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVis);
      setKeepAlive(false);
      cancelTurnAlarms();
    };
  }, []);

  useEffect(() => {
    if (!view) {
      heard.current = null;
      return;
    }
    const { cues, heard: next } = nextCues(heard.current, toCueView(view), lastFx, revealed, document.hidden);
    heard.current = next;
    if (artFreeze) return;
    for (const cue of cues) playSfx(cue.name, cue.gain ?? 1);
  }, [view, lastFx, revealed, artFreeze]);

  useEffect(() => {
    rearmAlarms();
  }, [view?.deadlineAt, view?.phase, view?.currentPlayerId, view?.winnerId, view?.youId, artFreeze, sfxOn, sfxVolume, sfxMute]);

  return null;
}
