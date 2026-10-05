export type Resource = "madera" | "ladrillo" | "lana" | "trigo" | "mineral";
export type Terrain = Resource | "desierto";
export type DevKind =
  | "caballero"
  | "progreso_caminos"
  | "progreso_monopolio"
  | "progreso_invento"
  | "punto_victoria";

export type ColorId = "rojo" | "azul" | "naranja" | "blanco" | "verde" | "marron";

import type { BoardKind } from "./constants.ts";

/** Quién abre y en qué orden, congelado al apretar Empezar. */
export interface KickoffSeat {
  id: string;
  name: string;
  color: ColorId;
  isBot: boolean;
}

export interface KickoffInfo {
  starterId: string;
  boardKind: BoardKind;
  order: KickoffSeat[];
}

export type Phase =
  | "colocacion_poblado"
  | "colocacion_camino"
  | "dados"
  | "descarte"
  | "ladron"
  | "principal"
  | "construccion_especial"
  | "fin";

export interface Axial {
  q: number;
  r: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Port {
  type: Resource | "general";
  ratio: 2 | 3;
}

export interface HexTile {
  id: string;
  q: number;
  r: number;
  terrain: Terrain;
  number: number | null;
}

export interface Vertex {
  id: string;
  x: number;
  y: number;
  hexIds: string[];
  neighborIds: string[];
  edgeIds: string[];
  port: Port | null;
}

export interface Edge {
  id: string;
  vertexIds: [string, string];
  hexIds: string[];
}

export interface Building {
  vertexId: string;
  playerId: string;
  kind: "poblado" | "ciudad";
}

export interface Road {
  edgeId: string;
  playerId: string;
}

export interface DevCard {
  kind: DevKind;
  purchasedTurn: number;
}

export type Resources = Record<Resource, number>;

export interface PlayerState {
  id: string;
  name: string;
  color: ColorId;
  resources: Resources;
  devCards: DevCard[];
  knightsPlayed: number;
  pieces: {
    caminos: number;
    poblados: number;
    ciudades: number;
  };
}

export interface TradeOffer {
  id: string;
  fromId: string;
  toId: string | "todos";
  give: Partial<Resources>;
  want: Partial<Resources>;
  /** Quien pasó de una oferta a la mesa. No sale en la vista. */
  declinedBy?: string[];
}

export type LogKind =
  | "sistema"
  | "turno"
  | "dados"
  | "build"
  | "comercio"
  | "ladron"
  | "dev"
  | "descarte"
  | "victoria";

export type LogPiece = "poblado" | "ciudad" | "camino" | "carta" | "caballero" | "invento" | "monopolio" | "caminos" | "premio_camino" | "premio_ejercito";

export interface LogIcon {
  /** `sep` separa lo que se da de lo que se pide en una línea de comercio. */
  kind: "res" | "dice" | "piece" | "sep";
  id?: Resource | LogPiece | string;
  n?: number;
}

export interface LogEvent {
  id: number;
  t: number;
  text: string;
  kind: LogKind;
  playerId: string | null;
  otherId: string | null;
  icons: LogIcon[];
  dice?: [number, number];
  resources?: Partial<Resources>;
  piece?: LogPiece;
  /**
   * Sólo en el servidor. Si está, el resto no ve íconos ni recursos.
   * Con `conceal`, quien no está en la lista no recibe el evento.
   */
  audience?: string[];
  conceal?: boolean;
}

export interface GameState {
  id: string;
  seed: number;
  deckSeed: number;
  entropy: "test" | "crypto";
  boardKind: BoardKind;
  victoryPoints: number;
  hexes: HexTile[];
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  robberHexId: string;
  buildings: Building[];
  roads: Road[];
  players: PlayerState[];
  turnIndex: number;
  turnNumber: number;
  phase: Phase;
  setupRound: 1 | 2;
  lastSettlementVertexId: string | null;
  dice: [number, number] | null;
  rollNo: number;
  /** Semilla visual de la tirada. No decide el número: sólo la trayectoria, igual en todos los clientes. */
  diceThrow: number;
  waitingDiscard: string[];
  discardNeeded: Record<string, number>;
  bank: Resources;
  devDeck: DevKind[];
  longestRoadPlayerId: string | null;
  largestArmyPlayerId: string | null;
  playedDevThisTurn: boolean;
  events: LogEvent[];
  nextEventId: number;
  trades: TradeOffer[];
  winnerId: string | null;
  specialBuildQueue: string[];
  pendingRoadBuilding: number;
  knightBeforeRoll: boolean;
  pendingStealHexId: string | null;
  /** Contador de entropy de test: cada dado/robo avanza, independiente del mazo. */
  entropySeq: number;
}

export type Action =
  | { type: "place_settlement"; vertexId: string }
  | { type: "place_road"; edgeId: string }
  | { type: "roll" }
  | { type: "discard"; resources: Partial<Resources> }
  | { type: "move_robber"; hexId: string; stealFromId: string | null }
  | { type: "build_road"; edgeId: string }
  | { type: "build_settlement"; vertexId: string }
  | { type: "build_city"; vertexId: string }
  | { type: "buy_dev" }
  | { type: "play_knight"; hexId: string; stealFromId: string | null }
  | { type: "play_year_plenty"; resources: [Resource, Resource] }
  | { type: "play_monopoly"; resource: Resource }
  | { type: "play_road_building" }
  | { type: "offer_trade"; toId: string | "todos"; give: Partial<Resources>; want: Partial<Resources> }
  | { type: "counter_trade"; tradeId: string; give: Partial<Resources>; want: Partial<Resources> }
  | { type: "accept_trade"; tradeId: string }
  | { type: "reject_trade"; tradeId: string }
  | { type: "cancel_trades" }
  | { type: "bank_trade"; give: Partial<Resources>; want: Partial<Resources> }
  | { type: "end_turn" };

export interface LegalMoves {
  vertices: string[];
  cityVertices: string[];
  edges: string[];
  hexes: string[];
  stealFrom: string[];
  canRoll: boolean;
  canEndTurn: boolean;
  canBuyDev: boolean;
  canPlayKnight: boolean;
  canPlayYearPlenty: boolean;
  canPlayMonopoly: boolean;
  canPlayRoadBuilding: boolean;
  canTrade: boolean;
  canBankTrade: boolean;
  mustDiscard: number;
  robberHexes: string[];
}

export interface PublicPlayer {
  id: string;
  name: string;
  color: ColorId;
  resourceCount: number;
  devCount: number;
  knightsPlayed: number;
  visibleVp: number;
  connected: boolean;
  isBot: boolean;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
}

export interface PrivateHand {
  resources: Resources;
  devCards: DevCard[];
  totalVp: number;
}

export interface ChatMessage {
  id: string;
  playerId: string | null;
  name: string;
  color: ColorId | null;
  text: string;
  t: number;
}

export interface ClientView {
  roomCode: string;
  hostId: string;
  status: "lobby" | "playing" | "ended";
  boardKind: BoardKind;
  victoryPoints: number;
  youId: string;
  youAreHost: boolean;
  players: PublicPlayer[];
  hexes: HexTile[];
  vertices: Array<{
    id: string;
    x: number;
    y: number;
    port: Port | null;
    hexIds: string[];
  }>;
  edges: Array<{ id: string; vertexIds: [string, string] }>;
  robberHexId: string;
  buildings: Building[];
  roads: Road[];
  bank: Resources | null;
  deadlineAt: number | null;
  phase: Phase;
  currentPlayerId: string | null;
  turnNumber: number;
  dice: [number, number] | null;
  rollNo: number;
  /** Semilla visual compartida. Ausente en servidores viejos: el cliente deriva una igual para todos. */
  diceThrow?: number | null;
  /** Presente unos segundos después de Empezar. No vuelve en una reconexión tardía. */
  kickoff?: KickoffInfo | null;
  legal: LegalMoves;
  events: LogEvent[];
  trades: TradeOffer[];
  chat: ChatMessage[];
  winnerId: string | null;
  specialBuildPlayerId: string | null;
  pendingRoadBuilding: number;
  hand: PrivateHand;
  waitingDiscard: string[];
  bankHas: Partial<Record<Resource, boolean>> | null;
  unboxPlayerId: string | null;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  color: ColorId;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
}

export interface LobbyView {
  roomCode: string;
  sharePath: string;
  hostId: string;
  youId: string;
  youAreHost: boolean;
  players: LobbyPlayer[];
  victoryPoints: number;
  seatLimit: number;
  boardKind: BoardKind;
  status: "lobby";
}

export const RESOURCES: Resource[] = ["madera", "ladrillo", "lana", "trigo", "mineral"];
export const COLORS: ColorId[] = ["rojo", "azul", "naranja", "blanco", "verde", "marron"];
