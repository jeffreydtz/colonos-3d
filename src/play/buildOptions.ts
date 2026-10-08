import { COSTS } from "@shared/constants";
import { RESOURCES } from "@shared/types";
import type { ClientView, LegalMoves, Resource } from "@shared/types";

export type BuildKind = "camino" | "poblado" | "ciudad";
type Bag = Partial<Record<Resource, number>>;

export type BuildState =
  | { kind: "ready" }
  | { kind: "wait"; note: string }
  | { kind: "noSpot"; note: string }
  | { kind: "short"; missing: Bag };

export type BuildOption = { kind: BuildKind; label: string; cost: Bag; state: BuildState };

const ROWS: Array<{ kind: BuildKind; label: string; spots: (l: LegalMoves) => string[]; noSpot: string }> = [
  { kind: "camino", label: "Camino", spots: (l) => l.edges, noSpot: "Sin lugar" },
  { kind: "poblado", label: "Poblado", spots: (l) => l.vertices, noSpot: "Sin lugar" },
  { kind: "ciudad", label: "Ciudad", spots: (l) => l.cityVertices, noSpot: "Sin poblado" },
];

export function missingFor(hand: Record<Resource, number>, cost: Bag): Bag {
  const out: Bag = {};
  for (const r of RESOURCES) {
    const need = (cost[r] ?? 0) - hand[r];
    if (need > 0) out[r] = need;
  }
  return out;
}

/**
 * Qué se puede construir ahora. El server sólo manda lugares legales si alcanza el material
 * (o si son gratis: colocación inicial, carta de 2 caminos), así que "hay lugar" manda primero.
 */
export function buildOptions(view: ClientView): BuildOption[] {
  return ROWS.map(({ kind, label, spots, noSpot }) => {
    const cost = COSTS[kind];
    const state = stateFor(view, spots(view.legal).length > 0, cost, noSpot);
    if (view.phase !== "colocacion_poblado" && view.phase !== "colocacion_camino") {
      return { kind, label, cost, state };
    }
    if (view.currentPlayerId !== view.youId) return { kind, label, cost, state: { kind: "wait", note: "En tu turno" } };
    return { kind, label, cost, state: { kind: "wait", note: "Gratis, en el tablero" } };
  });
}

/** La carta de desarrollo con la misma lectura que las obras; sin material ni turno pendiente, es el mazo. */
export function devOption(view: ClientView): { cost: Bag; state: BuildState } {
  const cost = COSTS.dev;
  if (view.phase === "colocacion_poblado" || view.phase === "colocacion_camino") {
    const note = view.currentPlayerId === view.youId ? "Después de colocar" : "En tu turno";
    return { cost, state: { kind: "wait", note } };
  }
  if (view.phase === "construccion_especial") {
    return { cost, state: { kind: "wait", note: "En la pausa no" } };
  }
  return { cost, state: stateFor(view, view.legal.canBuyDev, cost, "Mazo vacío") };
}

/** Dueño del turno, o la pareja en 5–6 mientras se puede construir o jugar cartas. */
export function actsWithTurn(view: ClientView): boolean {
  if (view.currentPlayerId === view.youId) return true;
  return (
    view.pairedPlayerId === view.youId && (view.phase === "principal" || view.phase === "dados")
  );
}

function stateFor(view: ClientView, ready: boolean, cost: Bag, blocked: string): BuildState {
  if (ready) return { kind: "ready" };
  if (!actsWithTurn(view)) return { kind: "wait", note: "En tu turno" };
  if (view.phase === "dados" && view.currentPlayerId !== view.youId) {
    return { kind: "wait", note: "Después de los dados" };
  }
  if (view.phase !== "principal" && view.phase !== "construccion_especial") {
    const note =
      view.phase === "dados"
        ? "Primero tirá"
        : view.phase === "descarte"
          ? "Primero descartá"
          : view.phase === "ladron"
            ? "Primero el ladrón"
            : view.phase === "fin"
              ? "Partida terminada"
              : "Ahora no";
    return { kind: "wait", note };
  }
  const missing = missingFor(view.hand.resources, cost);
  if (Object.keys(missing).length === 0) return { kind: "noSpot", note: blocked };
  return { kind: "short", missing };
}
