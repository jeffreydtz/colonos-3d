export type SetupCue = { title: string; detail: string };

/** Qué falta en la colocación inicial. Null fuera de ese momento. */
export function setupCue(input: {
  phase: string;
  yourTurn: boolean;
  currentName: string;
  yourBuildings: number;
  actorBuildings: number;
}): SetupCue | null {
  const { phase, yourTurn, currentName, yourBuildings, actorBuildings } = input;
  if (phase !== "colocacion_poblado" && phase !== "colocacion_camino") return null;
  if (yourTurn && phase === "colocacion_poblado") {
    if (yourBuildings > 0) {
      return {
        title: "Segundo poblado",
        detail: "Otra vez un solo paso: la casita. El camino viene después, no ahora.",
      };
    }
    return {
      title: "Poné tu poblado",
      detail: "Tocá un vértice libre. Después, en otro paso, el camino. No van las dos juntas.",
    };
  }
  if (yourTurn && phase === "colocacion_camino") {
    return {
      title: "Ahora el camino",
      detail: "Tiene que salir del poblado que acabás de poner. Recién después sigue el próximo.",
    };
  }
  if (phase === "colocacion_poblado") {
    return {
      title: `Turno de ${currentName}`,
      detail:
        actorBuildings > 0
          ? "Está eligiendo el segundo poblado. El camino es el paso siguiente."
          : "Está eligiendo el poblado. El camino viene después.",
    };
  }
  return {
    title: `Turno de ${currentName}`,
    detail: "Está pegando el camino a su poblado.",
  };
}

export function turnHeadline(yourTurn: boolean, currentName: string): string {
  return yourTurn ? "Es tu turno" : `Turno de ${currentName}`;
}
