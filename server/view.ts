import type { ChatMessage, ClientView, GameState, LogEvent, PrivateHand, PublicPlayer } from "../shared/types.ts";
import { RESOURCES } from "../shared/types.ts";
import { currentPlayer, legalMoves } from "./legal.ts";
import { totalVp, visibleVp } from "./engine.ts";
import { sumResources } from "./resources.ts";

const SECRET = /punto_victoria|progreso_invento|progreso_monopolio|progreso_caminos/i;

/**
 * El log público nunca revela el tipo de una carta comprada ni una mano ajena. Una oferta
 * dirigida muestra qué da y qué pide sólo a quien la manda y a quien la recibe.
 */
export function publicLog(e: LogEvent, viewerId?: string): LogEvent {
  const piece = e.piece === "carta" ? "carta" : e.piece;
  let text = e.text;
  if (e.piece === "carta" && SECRET.test(text)) {
    text = text.replace(SECRET, "carta de desarrollo");
  }
  const sealed = e.audience != null && (viewerId == null || !e.audience.includes(viewerId));
  const hideBag = sealed || e.kind === "descarte" || e.kind === "ladron";
  return {
    id: e.id,
    t: e.t,
    kind: e.kind,
    playerId: e.playerId,
    otherId: e.otherId,
    text,
    icons: sealed || e.kind === "descarte" ? [] : (e.icons ?? []),
    dice: e.dice,
    resources: hideBag ? undefined : e.resources ? { ...e.resources } : undefined,
    piece,
  };
}

/** Cada uno ve las ofertas que le hacen, las abiertas a todes y las suyas. */
export function visibleTrades(state: GameState, playerId: string): GameState["trades"] {
  return state.trades
    .filter((t) => t.toId === playerId || t.toId === "todos" || t.fromId === playerId)
    .map((t) => ({ ...t, give: { ...t.give }, want: { ...t.want } }));
}


export function toClientView(
  state: GameState,
  playerId: string,
  extras: {
    roomCode: string;
    hostId: string;
    chat: ChatMessage[];
    connected: Set<string>;
    bots?: Set<string>;
    deadlineAt?: number | null;
    unboxPlayerId?: string | null;
  },
): ClientView {
  const you = state.players.find((p) => p.id === playerId);
  const actor = currentPlayer(state);
  const players: PublicPlayer[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    resourceCount: sumResources(p.resources),
    devCount: p.devCards.length,
    knightsPlayed: p.knightsPlayed,
    visibleVp: visibleVp(state, p.id),
    connected: extras.connected.has(p.id),
    isBot: extras.bots?.has(p.id) ?? false,
    hasLongestRoad: state.longestRoadPlayerId === p.id,
    hasLargestArmy: state.largestArmyPlayerId === p.id,
  }));

  const hand: PrivateHand = you
    ? {
        resources: { ...you.resources },
        devCards: you.devCards.map((c) => ({ ...c })),
        totalVp: totalVp(state, you.id),
      }
    : {
        resources: { madera: 0, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 },
        devCards: [],
        totalVp: 0,
      };

  return {
    roomCode: extras.roomCode,
    hostId: extras.hostId,
    status: state.phase === "fin" ? "ended" : "playing",
    boardKind: state.boardKind,
    victoryPoints: state.victoryPoints,
    youId: playerId,
    youAreHost: extras.hostId === playerId,
    players,
    hexes: state.hexes,
    vertices: Object.values(state.vertices).map((v) => ({
      id: v.id,
      x: v.x,
      y: v.y,
      port: v.port,
      hexIds: v.hexIds,
    })),
    edges: Object.values(state.edges).map((e) => ({
      id: e.id,
      vertexIds: e.vertexIds,
    })),
    robberHexId: state.robberHexId,
    buildings: state.buildings,
    roads: state.roads,
    bank: null,
    /** Booleanos de stock, nunca cantidades: habilitan el 4:1 del jugador actual. */
    bankHas:
      state.phase === "principal" && actor?.id === playerId
        ? Object.fromEntries(RESOURCES.map((r) => [r, state.bank[r] > 0]))
        : null,
    deadlineAt: extras.deadlineAt ?? null,
    phase: state.phase,
    currentPlayerId: actor?.id ?? null,
    turnNumber: state.turnNumber,
    dice: state.dice,
    rollNo: state.rollNo,
    legal: legalMoves(state, playerId),
    events: state.events.slice(-200).map((e) => publicLog(e, playerId)),
    trades: visibleTrades(state, playerId),
    chat: extras.chat.slice(-80),
    winnerId: state.winnerId,
    specialBuildPlayerId: state.phase === "construccion_especial" ? (state.specialBuildQueue[0] ?? null) : null,
    pendingRoadBuilding: actor?.id === playerId ? state.pendingRoadBuilding : 0,
    hand,
    waitingDiscard: state.waitingDiscard,
    unboxPlayerId: extras.unboxPlayerId ?? null,
  };
}
