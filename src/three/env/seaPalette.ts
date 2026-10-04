import type { ThemeId } from "../../theme/tokens";

export type SeaPalette = { deep: string; mid: string; shallow: string; foam: string; ground: string };

/** Normal: albedo bajo un material con brillo; el especular y el entorno lo levantan en pantalla. */
const PALETTE: Record<"mesa" | "isla", SeaPalette> = {
  mesa: { deep: "#0e3350", mid: "#123e5e", shallow: "#164868", foam: "rgba(214,236,232,0.22)", ground: "#140e0a" },
  isla: { deep: "#2a74a2", mid: "#3182ad", shallow: "#3a92b8", foam: "rgba(224,242,240,0.32)", ground: "#251b12" },
};

/**
 * Liviano no tiene brillo especular ni entorno, y con Lambert ACES aplasta el mar casi a negro.
 * Ahí el mar va sin luz y con estos colores finales (los que muestra el modo normal de día),
 * oscurecidos por tema con `LITE_TINT`.
 */
const LITE_PALETTE: Record<"mesa" | "isla", SeaPalette> = {
  mesa: { deep: "#4b7eab", mid: "#4f84b0", shallow: "#5a93bb", foam: "rgba(230,244,246,0.22)", ground: "#140e0a" },
  isla: { deep: "#2f7ba6", mid: "#3888b1", shallow: "#479bbf", foam: "rgba(230,244,246,0.32)", ground: "#251b12" },
};

const LITE_TINT: Record<ThemeId, string> = {
  atardecer: "#c1c3c3",
  dia: "#ffffff",
  noche: "#586074",
  isla: "#ffffff",
};

/** Paleta del canvas del mar y, en liviano, el tinte del material sin luz. */
export function seaLook(lite: boolean, theme: ThemeId): { palette: SeaPalette; tint: string | null } {
  const key = theme === "isla" ? "isla" : "mesa";
  return lite ? { palette: LITE_PALETTE[key], tint: LITE_TINT[theme] } : { palette: PALETTE[key], tint: null };
}
