import { create } from "zustand";
import type { ClientView, ColorId, DevKind, KickoffInfo, LobbyView, LogKind, Resource } from "@shared/types";

/** Un error es texto. El robo trae el recurso para el ícono, y sólo lo arma la víctima. */
export type AppToast = string | { text: string; resource: Resource };
import { defaultSoundPrefs, loadSoundPrefs, type SfxMute } from "./audio/prefs";
import { loadTheme, type ThemeId } from "./theme/tokens";
import { loadGraphicsMode, type GraphicsMode } from "./three/graphics";
import { loadConfirmActions, type Pending } from "./play/confirm";

const bootSound = typeof window === "undefined" ? defaultSoundPrefs() : loadSoundPrefs();

type Screen = "home" | "lobby" | "game";

export type DiceUi = {
  revealed: boolean;
  presenting: boolean;
  rollNo: number;
  holdFromEventId: number;
};
export type SheetId = null | "build" | "mesa";
export type ActionTab = "construir" | "banco" | "jugadores";
export type ArtCam = "tactica" | "cinematica" | "dados" | "ladron";

export interface AppState {
  screen: Screen;
  name: string;
  color: ColorId;
  code: string;
  token: string | null;
  playerId: string | null;
  lobby: LobbyView | null;
  view: ClientView | null;
  kickoff: KickoffInfo | null;
  kickoffKey: string | null;
  error: string | null;
  /** Error de una acción (texto) o el aviso de un robo (texto + recurso). Se va solo. */
  toast: AppToast | null;
  /** Indicación ("tocá el tablero"): neutra, se va sola más rápido. */
  hint: string | null;
  lastFx: { animations: string[]; at: number } | null;
  stealForHex: string | null;
  knightArmed: boolean;
  sheet: SheetId;
  netDown: boolean;
  recenterNonce: number;
  revealCard: DevKind | null;
  mesaOpen: boolean;
  mesaTab: "log" | "chat";
  chatUnread: number;
  logFilter: LogKind | "todos";
  sfxOn: boolean;
  /** 0 a 1. */
  sfxVolume: number;
  sfxMute: SfxMute;
  /** El navegador ya soltó el AudioContext con un gesto. */
  sfxUnlocked: boolean;
  unboxHidden: boolean;
  graphics: GraphicsMode;
  theme: ThemeId;
  actionsOpen: boolean;
  artFreeze: boolean;
  artCam: ArtCam;
  iconSheet: boolean;
  diceUi: DiceUi;
  shortcutsOpen: boolean;
  bankTradeFrom: Resource | null;
  /** Pestaña del panel de acciones; la comparten el dock, los atajos B / T y el escritorio. */
  actionTab: ActionTab;
  /** Primer toque marca; el segundo ejecuta. Prendido por defecto. */
  confirmActions: boolean;
  pending: Pending | null;
  /** Sube cuando una oferta propia se envió, para vaciar el formulario. */
  offerEpoch: number;
  set: (p: Partial<AppState>) => void;
}

export const useApp = create<AppState>((set) => ({
  screen: "home",
  name: "",
  color: "rojo",
  code: "",
  token: null,
  playerId: null,
  lobby: null,
  view: null,
  kickoff: null,
  kickoffKey: null,
  error: null,
  toast: null,
  hint: null,
  lastFx: null,
  stealForHex: null,
  knightArmed: false,
  sheet: null,
  netDown: false,
  recenterNonce: 0,
  revealCard: null,
  mesaOpen: true,
  mesaTab: "log",
  chatUnread: 0,
  logFilter: "todos",
  sfxOn: bootSound.enabled,
  sfxVolume: bootSound.volume,
  sfxMute: bootSound.mute,
  sfxUnlocked: false,
  unboxHidden: false,
  graphics: typeof window === "undefined" ? "normal" : loadGraphicsMode(),
  theme: typeof window === "undefined" ? "atardecer" : loadTheme(),
  actionsOpen: false,
  artFreeze: false,
  artCam: "tactica",
  iconSheet: false,
  diceUi: { revealed: true, presenting: false, rollNo: 0, holdFromEventId: 0 },
  shortcutsOpen: false,
  bankTradeFrom: null,
  actionTab: "construir",
  confirmActions: typeof window === "undefined" ? true : loadConfirmActions(),
  pending: null,
  offerEpoch: 0,
  set: (p) => set(p),
}));
