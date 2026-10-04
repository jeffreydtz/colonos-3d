import { useEffect } from "react";
import { playSfx, setSfxMuted } from "../audio/sfx";
import { useApp } from "../store";

/** Dispara SFX de Howler/WebAudio según fx de red y el mute del HUD. */
export function SfxDirector() {
  const sfxOn = useApp((s) => s.sfxOn);
  const lastFx = useApp((s) => s.lastFx);
  useEffect(() => {
    setSfxMuted(sfxOn);
  }, [sfxOn]);
  useEffect(() => {
    if (!sfxOn || !lastFx) return;
    if (lastFx.animations.includes("build")) playSfx("build");
    if (lastFx.animations.includes("dice")) playSfx("dice_throw", 0.6);
  }, [lastFx, sfxOn]);
  return null;
}
