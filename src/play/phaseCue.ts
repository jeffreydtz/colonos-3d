/** Texto corto del botón de abajo cuando no hay una acción de un toque (tirar / pasar). */
export function dockLabel(phase: string, yourTurn: boolean, name: string): string {
  if (!yourTurn) {
    const who = name.trim().split(/\s+/)[0] ?? "";
    if (!who) return "Esperá";
    return who.length > 9 ? "Esperá" : who;
  }
  switch (phase) {
    case "colocacion_poblado":
      return "Poblado";
    case "colocacion_camino":
      return "Camino";
    case "descarte":
      return "Descartá";
    case "ladron":
      return "Ladrón";
    case "construccion_especial":
      return "Obras";
    case "fin":
      return "Fin";
    default:
      return "Tu turno";
  }
}
