/** Preferencias de sonido. Sin AudioContext: se pueden testear y guardar en localStorage. */

export const SFX_CATEGORIES = ["turno", "reloj", "dados", "mesa", "avisos"] as const;
export type SfxCategory = (typeof SFX_CATEGORIES)[number];

export const SFX_CATEGORY_LABEL: Record<SfxCategory, string> = {
  turno: "Turnos",
  reloj: "Reloj (10 s y 5 s)",
  dados: "Dados",
  mesa: "Mesa",
  avisos: "Chat, ofertas, robos y final",
};

export type SfxMute = Record<SfxCategory, boolean>;

export type SoundPrefs = {
  enabled: boolean;
  /** 0 a 1. El master del grafo. */
  volume: number;
  mute: SfxMute;
};

export const SOUND_KEY = "colonos-sound";

export function defaultMute(): SfxMute {
  return { turno: false, reloj: false, dados: false, mesa: false, avisos: false };
}

export function defaultSoundPrefs(): SoundPrefs {
  return { enabled: true, volume: 0.7, mute: defaultMute() };
}

export function clampVolume(n: number): number {
  if (!Number.isFinite(n)) return 0.7;
  return Math.min(1, Math.max(0, n));
}

export function sanitizeSoundPrefs(raw: unknown): SoundPrefs {
  const base = defaultSoundPrefs();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<SoundPrefs> & { mute?: Partial<SfxMute> };
  const mute = defaultMute();
  if (o.mute && typeof o.mute === "object") {
    for (const key of SFX_CATEGORIES) {
      if (typeof o.mute[key] === "boolean") mute[key] = o.mute[key];
    }
  }
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : base.enabled,
    volume: clampVolume(typeof o.volume === "number" ? o.volume : base.volume),
    mute,
  };
}

export function loadSoundPrefs(): SoundPrefs {
  if (typeof window === "undefined") return defaultSoundPrefs();
  try {
    const raw = window.localStorage.getItem(SOUND_KEY);
    if (!raw) return defaultSoundPrefs();
    return sanitizeSoundPrefs(JSON.parse(raw) as unknown);
  } catch {
    return defaultSoundPrefs();
  }
}

export function saveSoundPrefs(prefs: SoundPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_KEY, JSON.stringify(sanitizeSoundPrefs(prefs)));
  } catch {
    /* modo privado */
  }
}

export function shouldPlay(prefs: SoundPrefs, category: SfxCategory): boolean {
  return prefs.enabled && prefs.volume > 0 && !prefs.mute[category];
}

/** Un oscilador casi mudo mantiene el hilo de audio cuando la pestaña está atrás, para que el aviso de turno no se congele. */
export function wantsKeepAlive(hidden: boolean, prefs: SoundPrefs): boolean {
  if (!hidden || !prefs.enabled || prefs.volume <= 0) return false;
  return !prefs.mute.turno || !prefs.mute.reloj;
}
