/** Tono del reloj según los segundos que quedan. */
export function clockTone(sec: number): "ok" | "warn" | "danger" | "expired" {
  if (sec <= 0) return "expired";
  if (sec <= 5) return "danger";
  if (sec <= 10) return "warn";
  return "ok";
}

export function clockLabel(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Aviso al cruzar 10 o 5. El primer valor (al entrar a la partida) no dispara. */
export function crossedWarning(before: number | null, sec: number): 10 | 5 | null {
  if (before == null) return null;
  if (before > 10 && sec <= 10 && sec > 5) return 10;
  if (before > 5 && sec <= 5 && sec > 0) return 5;
  return null;
}

export function timeoutCopy(phase: string, expired: boolean): string {
  if (phase === "colocacion_poblado") {
    return expired
      ? "Se acabó el tiempo. El servidor pone un poblado y frena: el camino es otro paso."
      : "Si se acaba, el servidor pone un poblado y se detiene. El camino queda para después.";
  }
  if (phase === "colocacion_camino") {
    return expired
      ? "Se acabó el tiempo. El servidor pone el camino y pasa al siguiente."
      : "Si se acaba, el servidor pone el camino y le toca al siguiente.";
  }
  if (phase === "dados") {
    return expired ? "Se acabó el tiempo. El servidor tira los dados." : "Si se acaba, el servidor tira los dados.";
  }
  if (phase === "descarte") {
    return expired
      ? "Se acabó el tiempo. El servidor descarta las cartas que sobran."
      : "Si se acaba, el servidor descarta por quien no eligió.";
  }
  if (phase === "ladron") {
    return expired ? "Se acabó el tiempo. El servidor mueve el ladrón." : "Si se acaba, el servidor mueve el ladrón.";
  }
  return expired
    ? "Se acabó el tiempo. El servidor cierra este paso y la mesa sigue."
    : "Si se acaba, el servidor cierra este paso y la mesa sigue.";
}
