import { COSTS, RESOURCE_LABEL } from "@shared/constants";
import type { LegalMoves, Phase, Resource, Resources } from "@shared/types";
import { RESOURCES } from "@shared/types";

const CONFIRM_KEY = "colonos-confirmar";

export type Pending =
  | { kind: "vertex"; id: string; build: "poblado" | "ciudad" | "setup" }
  | { kind: "edge"; id: string; build: "camino" | "setup" | "carta" }
  | { kind: "robber"; id: string; knight: boolean }
  | { kind: "buy_dev" }
  | { kind: "play_roads" }
  | { kind: "year"; resources: [Resource, Resource] }
  | { kind: "mono"; resource: Resource }
  | { kind: "bank"; give: Partial<Resources>; want: Partial<Resources>; rate: number }
  | { kind: "offer"; toId: string | "todos"; give: Partial<Resources>; want: Partial<Resources> }
  | { kind: "accept"; tradeId: string }
  | { kind: "end_turn" };

export type Stage = { pending: Pending | null; run: boolean };

export interface PendingCopy {
  title: string;
  detail: string;
  cost: Partial<Record<Resource, number>> | null;
}

/** Lo justo para saber si la previsualización sigue siendo legal. */
export interface ConfirmView {
  phase: Phase;
  youId: string;
  robberHexId: string;
  pendingRoadBuilding: number;
  legal: LegalMoves;
  trades: Array<{ id: string; fromId: string; toId: string | "todos" }>;
  hand: { resources: Resources };
}

export function parseConfirmFlag(raw: string | null): boolean {
  if (raw === "0" || raw === "false") return false;
  return true;
}

export function loadConfirmActions(): boolean {
  try {
    if (typeof localStorage === "undefined") return true;
    return parseConfirmFlag(localStorage.getItem(CONFIRM_KEY));
  } catch {
    return true;
  }
}

export function saveConfirmActions(on: boolean): void {
  try {
    localStorage.setItem(CONFIRM_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

/**
 * Primer toque: deja la acción en espera. El mismo objetivo otra vez (o Confirmar): la corre.
 * Otro objetivo legal sólo cambia la previsualización. Con la opción apagada, corre al toque.
 */
export function stage(current: Pending | null, next: Pending, enabled: boolean): Stage {
  if (!enabled) return { pending: null, run: true };
  if (current && same(current, next)) return { pending: null, run: true };
  return { pending: next, run: false };
}

export function same(a: Pending, b: Pending): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "vertex":
      return b.kind === "vertex" && a.id === b.id && a.build === b.build;
    case "edge":
      return b.kind === "edge" && a.id === b.id;
    case "robber":
      return b.kind === "robber" && a.id === b.id && a.knight === b.knight;
    case "buy_dev":
    case "play_roads":
    case "end_turn":
      return true;
    case "year":
      return b.kind === "year" && yearKey(a.resources) === yearKey(b.resources);
    case "mono":
      return b.kind === "mono" && a.resource === b.resource;
    case "bank":
      return (
        b.kind === "bank" &&
        a.rate === b.rate &&
        bagKey(a.give) === bagKey(b.give) &&
        bagKey(a.want) === bagKey(b.want)
      );
    case "offer":
      return (
        b.kind === "offer" &&
        a.toId === b.toId &&
        bagKey(a.give) === bagKey(b.give) &&
        bagKey(a.want) === bagKey(b.want)
      );
    case "accept":
      return b.kind === "accept" && a.tradeId === b.tradeId;
  }
}

export function describePending(p: Pending, nameOf: (id: string) => string = (id) => id): PendingCopy {
  switch (p.kind) {
    case "vertex":
      if (p.build === "setup") {
        return { title: "Poblado inicial", detail: "Gratis. Después vas a poner el camino.", cost: null };
      }
      if (p.build === "ciudad") {
        return { title: "Ciudad", detail: "Mejora este poblado.", cost: COSTS.ciudad };
      }
      return { title: "Poblado", detail: "Queda en ese vértice.", cost: COSTS.poblado };
    case "edge":
      if (p.build === "setup") {
        return { title: "Camino inicial", detail: "Gratis, pegado al poblado.", cost: null };
      }
      if (p.build === "carta") {
        return { title: "Camino", detail: "Gratis, lo paga la carta de caminos.", cost: null };
      }
      return { title: "Camino", detail: "Lo tendés en esa arista.", cost: COSTS.camino };
    case "robber":
      return p.knight
        ? { title: "Caballero", detail: "El ladrón pasa a esa casilla y sumás un caballero.", cost: null }
        : { title: "Ladrón", detail: "Nadie cobra en esa casilla.", cost: null };
    case "buy_dev":
      return { title: "Carta de desarrollo", detail: "Se abre sólo en tu pantalla.", cost: COSTS.dev };
    case "play_roads":
      return { title: "Caminos", detail: "Jugás la carta y después marcás dos caminos.", cost: null };
    case "year": {
      const [a, b] = p.resources;
      const detail =
        a === b
          ? `Tomás 2 ${RESOURCE_LABEL[a]} del banco.`
          : `Tomás ${RESOURCE_LABEL[a]} y ${RESOURCE_LABEL[b]} del banco.`;
      return { title: "Año de abundancia", detail, cost: null };
    }
    case "mono":
      return {
        title: "Monopolio",
        detail: `Cada rival te entrega su ${RESOURCE_LABEL[p.resource]}.`,
        cost: null,
      };
    case "bank":
      return {
        title: "Banco",
        detail: `Das ${bagPhrase(p.give)} y recibís ${bagPhrase(p.want)}.`,
        cost: null,
      };
    case "offer": {
      const who = p.toId === "todos" ? "la mesa" : nameOf(p.toId);
      return {
        title: "Oferta",
        detail: `Das ${bagPhrase(p.give)} y pedís ${bagPhrase(p.want)} a ${who}.`,
        cost: null,
      };
    }
    case "accept":
      return {
        title: "Aceptar oferta",
        detail: "Entregás lo que piden y recibís lo que dan.",
        cost: null,
      };
    case "end_turn":
      return {
        title: "Pasar turno",
        detail: "Le pasa la mesa al siguiente. No se puede deshacer.",
        cost: null,
      };
  }
}

export function pendingStillLegal(p: Pending, view: ConfirmView): boolean {
  const legal = view.legal;
  switch (p.kind) {
    case "vertex":
      if (p.build === "setup") return view.phase === "colocacion_poblado" && legal.vertices.includes(p.id);
      if (p.build === "ciudad") return legal.cityVertices.includes(p.id);
      return view.phase !== "colocacion_poblado" && view.phase !== "colocacion_camino" && legal.vertices.includes(p.id);
    case "edge":
      if (!legal.edges.includes(p.id)) return false;
      if (p.build === "setup") return view.phase === "colocacion_camino";
      if (p.build === "carta") return view.pendingRoadBuilding > 0;
      return view.phase !== "colocacion_poblado" && view.phase !== "colocacion_camino" && view.pendingRoadBuilding <= 0;
    case "robber": {
      const listed = legal.robberHexes.includes(p.id) || legal.hexes.includes(p.id);
      if (p.knight) return legal.canPlayKnight && listed && p.id !== view.robberHexId;
      return view.phase === "ladron" && listed;
    }
    case "buy_dev":
      return legal.canBuyDev;
    case "play_roads":
      return legal.canPlayRoadBuilding;
    case "year":
      return legal.canPlayYearPlenty;
    case "mono":
      return legal.canPlayMonopoly;
    case "bank":
      return legal.canBankTrade && canAfford(view.hand.resources, p.give);
    case "offer":
      return legal.canTrade && canAfford(view.hand.resources, p.give);
    case "accept":
      return view.trades.some(
        (t) => t.id === p.tradeId && t.fromId !== view.youId && (t.toId === "todos" || t.toId === view.youId),
      );
    case "end_turn":
      return legal.canEndTurn;
  }
}

function canAfford(hand: Resources, bag: Partial<Resources>): boolean {
  return RESOURCES.every((r) => (hand[r] ?? 0) >= (bag[r] ?? 0));
}

function bagKey(bag: Partial<Resources>): string {
  return RESOURCES.map((r) => `${r}:${bag[r] ?? 0}`).join(",");
}

function yearKey(rs: readonly [Resource, Resource]): string {
  return rs[0] <= rs[1] ? `${rs[0]}|${rs[1]}` : `${rs[1]}|${rs[0]}`;
}

function bagPhrase(bag: Partial<Resources>): string {
  const parts = RESOURCES.filter((r) => (bag[r] ?? 0) > 0).map((r) => `${bag[r]} ${RESOURCE_LABEL[r]}`);
  if (parts.length === 0) return "nada";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}
