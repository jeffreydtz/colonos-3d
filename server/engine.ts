import { buildBoard } from "../shared/board.ts";
import {
  BANK_EACH_EXPANSION,
  BANK_EACH_STANDARD,
  boardKindForCount,
  COSTS,
  DEFAULT_VICTORY,
  DEV_DECK_EXPANSION,
  DEV_DECK_STANDARD,
  EMPTY_RESOURCES,
  FULL_BANK,
  MAX_OPEN_OFFERS,
  PIECES,
  RESOURCE_LABEL,
} from "../shared/constants.ts";
import type { BoardKind } from "../shared/constants.ts";
import { mulberry32, pickInt, shuffle } from "../shared/rng.ts";
import { cryptoInt, freshSeed } from "./fairDice.ts";
import { RESOURCES } from "../shared/types.ts";
import type {
  Action,
  ColorId,
  DevKind,
  GameState,
  LogEvent,
  LogIcon,
  PlayerState,
  Resource,
  Resources,
} from "../shared/types.ts";
import {
  bestBankRate,
  currentPlayer,
  distanceOk,
  legalCityVertices,
  legalRoadEdges,
  legalSettlementVertices,
  playerTouchesVertex,
  robberMoverId,
  stealCandidates,
  turnRole,
} from "./legal.ts";
import { longestRoadLength, refreshAwards } from "./longestRoad.ts";
import {
  asCount,
  grant,
  hasResources,
  pay,
  randomResourceInHand,
  sumResources,
  transfer,
} from "./resources.ts";
import { parseAction } from "./validate.ts";

export interface EngineResult {
  ok: boolean;
  error?: string;
  animations?: string[];
  /** Sólo el comprador recibe el tipo; nunca va al log ni al broadcast. */
  reveal?: DevKind;
}

function resIcons(bag: Partial<Resources>): LogIcon[] {
  const icons: LogIcon[] = [];
  for (const k of RESOURCES) {
    const n = asCount(bag[k]);
    if (n > 0) icons.push({ kind: "res", id: k, n });
  }
  return icons;
}

/** Lo que se da, una flecha y lo que se pide: el log lo lee igual que la bandeja de ofertas. */
function tradeIcons(give: Partial<Resources>, want: Partial<Resources>): LogIcon[] {
  return [...resIcons(give), { kind: "sep" }, ...resIcons(want)];
}

export function appendLog(state: GameState, text: string, playerId: string | null = null): void {
  log(state, text, "turno", { playerId });
}

function log(
  state: GameState,
  text: string,
  kind: LogEvent["kind"] = "sistema",
  extra: Partial<Pick<LogEvent, "playerId" | "otherId" | "icons" | "dice" | "resources" | "piece" | "audience" | "conceal">> = {},
): void {
  state.events.push({
    id: state.nextEventId++,
    t: Date.now(),
    text,
    kind,
    playerId: extra.playerId ?? null,
    otherId: extra.otherId ?? null,
    icons: extra.icons ?? [],
    dice: extra.dice,
    resources: extra.resources,
    piece: extra.piece,
    ...(extra.audience ? { audience: extra.audience } : {}),
    ...(extra.conceal ? { conceal: true } : {}),
  });
  if (state.events.length > 400) state.events.splice(0, state.events.length - 400);
}

function awards(state: GameState): void {
  const prevRoad = state.longestRoadPlayerId;
  const prevArmy = state.largestArmyPlayerId;
  refreshAwards(state);
  if (state.longestRoadPlayerId !== prevRoad) {
    if (state.longestRoadPlayerId) {
      const p = state.players.find((x) => x.id === state.longestRoadPlayerId);
      log(state, `${p?.name ?? "Alguien"} se queda con el camino más largo.`, "victoria", {
        playerId: state.longestRoadPlayerId,
        piece: "premio_camino",
        icons: [{ kind: "piece", id: "premio_camino" }],
      });
    } else if (prevRoad) {
      const p = state.players.find((x) => x.id === prevRoad);
      log(state, `${p?.name ?? "Alguien"} pierde el camino más largo.`, "victoria", {
        playerId: prevRoad,
        piece: "premio_camino",
      });
    }
  }
  if (state.largestArmyPlayerId !== prevArmy) {
    if (state.largestArmyPlayerId) {
      const p = state.players.find((x) => x.id === state.largestArmyPlayerId);
      log(state, `${p?.name ?? "Alguien"} se queda con el ejército más grande.`, "victoria", {
        playerId: state.largestArmyPlayerId,
        piece: "premio_ejercito",
        icons: [{ kind: "piece", id: "premio_ejercito" }],
      });
    } else if (prevArmy) {
      const p = state.players.find((x) => x.id === prevArmy);
      log(state, `${p?.name ?? "Alguien"} pierde el ejército más grande.`, "victoria", {
        playerId: prevArmy,
        piece: "premio_ejercito",
      });
    }
  }
}

function secretInt(state: GameState, min: number, max: number): number {
  if (state.entropy !== "test") return cryptoInt(min, max);
  state.entropySeq = (state.entropySeq + 1) | 0;
  return pickInt(
    mulberry32((state.deckSeed + state.entropySeq * 0x45d9f3b + state.turnNumber * 1117) >>> 0),
    min,
    max,
  );
}

/** Dos dados independientes, 1 a 6, sólo `crypto.randomInt`. Lo usa la tirada en vivo. */
export function rollFairDice(): [number, number] {
  return [cryptoInt(1, 6), cryptoInt(1, 6)];
}

function rollPair(state: GameState): [number, number] {
  if (state.entropy === "test") return [secretInt(state, 1, 6), secretInt(state, 1, 6)];
  return rollFairDice();
}

export function visibleVp(state: GameState, playerId: string): number {
  let vp = 0;
  for (const b of state.buildings) {
    if (b.playerId !== playerId) continue;
    vp += b.kind === "ciudad" ? 2 : 1;
  }
  if (state.longestRoadPlayerId === playerId) vp += 2;
  if (state.largestArmyPlayerId === playerId) vp += 2;
  return vp;
}

export function totalVp(state: GameState, playerId: string): number {
  const p = state.players.find((x) => x.id === playerId);
  const hidden = p?.devCards.filter((c) => c.kind === "punto_victoria").length ?? 0;
  return visibleVp(state, playerId) + hidden;
}

/** Cierra la partida si `playerId` llegó a los puntos. Devuelve si la partida terminó. */
function checkWin(state: GameState, playerId: string): boolean {
  if (state.phase === "fin") return true;
  // En 5–6 la pausa no es tu turno: los puntos esperan a que te toque tirar.
  if (state.phase === "construccion_especial") return false;
  if (totalVp(state, playerId) < state.victoryPoints) return false;
  state.phase = "fin";
  state.winnerId = playerId;
  const p = state.players.find((x) => x.id === playerId);
  log(
    state,
    `¡${p?.name ?? "Alguien"} llegó a ${state.victoryPoints} puntos y se queda con la isla!`,
    "victoria",
    { playerId },
  );
  return true;
}

function hasPlayableDev(
  player: PlayerState,
  kind: PlayerState["devCards"][number]["kind"],
  turnNumber: number,
): boolean {
  return player.devCards.some((c) => c.kind === kind && c.purchasedTurn < turnNumber);
}

function consumeDev(
  player: PlayerState,
  kind: PlayerState["devCards"][number]["kind"],
  turnNumber: number,
): boolean {
  const idx = player.devCards.findIndex((c) => c.kind === kind && c.purchasedTurn < turnNumber);
  if (idx < 0) return false;
  player.devCards.splice(idx, 1);
  return true;
}

export function createGame(opts: {
  players: Array<{ id: string; name: string; color: ColorId }>;
  seed?: number;
  victoryPoints?: number;
  entropy?: "test" | "crypto";
  /** Índice de quien abre. Si no viene, en vivo se sortea con crypto; con semilla de test queda el primer asiento. */
  startIndex?: number;
}): GameState {
  const boardKind: BoardKind = boardKindForCount(opts.players.length);
  // Producción ignora semilla y entropy de test: el tablero y los dados salen de crypto.randomInt.
  const production = process.env.NODE_ENV === "production";
  const entropy: "test" | "crypto" = production
    ? "crypto"
    : (opts.entropy ?? (opts.seed != null ? "test" : "crypto"));
  const useSeed = !production && opts.seed != null;
  const seed = useSeed ? opts.seed! : freshSeed();
  const deckSeed = useSeed ? (opts.seed! ^ 0x9e3779b9) >>> 0 : freshSeed();
  const boardRng = mulberry32(seed);
  const deckRng = mulberry32(deckSeed);
  const board = buildBoard(boardRng, boardKind);
  const players: PlayerState[] = opts.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    resources: EMPTY_RESOURCES(),
    devCards: [],
    knightsPlayed: 0,
    pieces: { ...PIECES },
  }));
  const nPlayers = players.length;
  const startIndex =
    opts.startIndex != null && Number.isInteger(opts.startIndex)
      ? ((opts.startIndex % nPlayers) + nPlayers) % nPlayers
      : entropy === "crypto" && (production || opts.seed == null)
        ? cryptoInt(0, Math.max(0, nPlayers - 1))
        : 0;
  const starter = players[startIndex];

  const state: GameState = {
    id: `g-${seed}`,
    seed,
    deckSeed,
    entropy,
    boardKind,
    victoryPoints: opts.victoryPoints ?? DEFAULT_VICTORY,
    hexes: board.hexes,
    vertices: board.vertices,
    edges: board.edges,
    robberHexId: board.robberHexId,
    buildings: [],
    roads: [],
    players,
    startIndex,
    turnIndex: startIndex,
    turnNumber: 0,
    phase: "colocacion_poblado",
    setupRound: 1,
    lastSettlementVertexId: null,
    dice: null,
    rollNo: 0,
    diceThrow: 0,
    waitingDiscard: [],
    discardNeeded: {},
    bank: FULL_BANK(boardKind === "expansion" ? BANK_EACH_EXPANSION : BANK_EACH_STANDARD),
    devDeck: shuffle(boardKind === "expansion" ? DEV_DECK_EXPANSION : DEV_DECK_STANDARD, deckRng),
    longestRoadPlayerId: null,
    largestArmyPlayerId: null,
    playedDevThisTurn: false,
    events: [],
    nextEventId: 1,
    trades: [],
    winnerId: null,
    specialBuildQueue: [],
    pendingRoadBuilding: 0,
    knightBeforeRoll: false,
    pendingStealHexId: null,
    robberActorId: null,
    roadCardPlayerId: null,
    entropySeq: 0,
  };
  log(
    state,
    boardKind === "expansion"
      ? `Isla grande (30 hexágonos). Sorteo: empieza ${starter?.name ?? "alguien"}.`
      : `Isla clásica (19 hexágonos). Sorteo: empieza ${starter?.name ?? "alguien"}.`,
    "turno",
    { playerId: starter?.id ?? null },
  );
  return state;
}

function giveFromBank(state: GameState, player: PlayerState, gain: Partial<Resources>): number {
  let given = 0;
  for (const k of RESOURCES) {
    const want = asCount(gain[k]);
    if (want <= 0) continue;
    const n = Math.min(want, state.bank[k]);
    state.bank[k] -= n;
    player.resources[k] += n;
    given += n;
  }
  return given;
}

function returnToBank(state: GameState, player: PlayerState, cost: Partial<Resources>): void {
  for (const k of RESOURCES) {
    const n = asCount(cost[k]);
    if (!n) continue;
    player.resources[k] -= n;
    state.bank[k] += n;
  }
}

function produce(state: GameState, total: number): void {
  const pending: Partial<Record<Resource, Array<{ player: PlayerState; n: number }>>> = {};
  for (const hex of state.hexes) {
    if (hex.number !== total) continue;
    if (hex.id === state.robberHexId) continue;
    if (hex.terrain === "desierto") continue;
    const res = hex.terrain;
    for (const b of state.buildings) {
      const v = state.vertices[b.vertexId];
      if (!v?.hexIds.includes(hex.id)) continue;
      const player = state.players.find((p) => p.id === b.playerId);
      if (!player) continue;
      const n = b.kind === "ciudad" ? 2 : 1;
      const list = pending[res] ?? [];
      list.push({ player, n });
      pending[res] = list;
    }
  }
  const gained = new Map<string, Resources>();
  const empty = () => EMPTY_RESOURCES();
  for (const res of RESOURCES) {
    const list = pending[res] ?? [];
    const need = list.reduce((s, x) => s + x.n, 0);
    if (need === 0) continue;
    if (state.bank[res] < need) {
      log(state, "El banco no da abasto: nadie cobra", "dados", { icons: [{ kind: "res", id: res }] });
      continue;
    }
    for (const item of list) {
      item.player.resources[res] += item.n;
      state.bank[res] -= item.n;
      const bag = gained.get(item.player.id) ?? empty();
      bag[res] += item.n;
      gained.set(item.player.id, bag);
    }
  }
  for (const [pid, bag] of gained) {
    const who = state.players.find((p) => p.id === pid);
    log(state, `${who?.name ?? "Alguien"} cobró`, "dados", {
      playerId: pid,
      resources: bag,
      icons: resIcons(bag),
    });
  }
}

function grantSecondSettlement(state: GameState, vertexId: string, player: PlayerState): void {
  const v = state.vertices[vertexId];
  if (!v) return;
  const gain = EMPTY_RESOURCES();
  for (const hid of v.hexIds) {
    const hex = state.hexes.find((h) => h.id === hid);
    if (!hex || hex.terrain === "desierto") continue;
    gain[hex.terrain] += 1;
  }
  const before = { ...player.resources };
  giveFromBank(state, player, gain);
  const got: Partial<Resources> = {};
  for (const k of RESOURCES) {
    const n = player.resources[k] - before[k];
    if (n > 0) got[k] = n;
  }
  if (sumResources(got) > 0) {
    // Es la recompensa de la colocación, no una tirada: va con las obras y no se confunde con «Dados».
    log(state, `${player.name} cobró del segundo poblado.`, "build", {
      playerId: player.id,
      resources: got,
      icons: resIcons(got),
    });
  }
}

function nextSetup(state: GameState): void {
  const n = state.players.length;
  const start = ((state.startIndex % n) + n) % n;
  if (state.setupRound === 1) {
    const next = (state.turnIndex + 1) % n;
    if (next !== start) {
      state.turnIndex = next;
      state.phase = "colocacion_poblado";
    } else {
      state.setupRound = 2;
      state.phase = "colocacion_poblado";
    }
  } else if (state.turnIndex !== start) {
    state.turnIndex = (state.turnIndex - 1 + n) % n;
    state.phase = "colocacion_poblado";
  } else {
    state.phase = "dados";
    state.turnNumber = 1;
    const opener = state.players[start];
    log(state, `Listo el setup. ${opener?.name ?? "Alguien"} tira los dados.`, "turno", {
      playerId: opener?.id ?? null,
    });
    checkWin(state, state.players[state.turnIndex]!.id);
  }
  state.lastSettlementVertexId = null;
}

function startDiscardOrRobber(state: GameState): void {
  const waiting: string[] = [];
  const needed: Record<string, number> = {};
  for (const p of state.players) {
    const total = sumResources(p.resources);
    if (total > 7) {
      waiting.push(p.id);
      needed[p.id] = Math.floor(total / 2);
    }
  }
  state.waitingDiscard = waiting;
  state.discardNeeded = needed;
  if (waiting.length) {
    state.phase = "descarte";
    log(state, "Salió 7: quien tenga más de 7 cartas tira la mitad.", "descarte");
  } else {
    state.phase = "ladron";
    log(state, "Salió 7: hay que mover el ladrón.", "ladron");
  }
}

function afterRobber(state: GameState): void {
  state.trades = [];
  state.robberActorId = null;
  if (state.knightBeforeRoll) {
    state.knightBeforeRoll = false;
    state.phase = "dados";
  } else {
    state.phase = "principal";
  }
}

function maybeSpecialBuild(state: GameState): void {
  if (state.players.length >= 5) {
    const n = state.players.length;
    const queue: string[] = [];
    for (let i = 1; i < n; i++) {
      queue.push(state.players[(state.turnIndex + i) % n]!.id);
    }
    state.specialBuildQueue = queue;
    state.phase = "construccion_especial";
    const first = state.players.find((p) => p.id === state.specialBuildQueue[0]);
    log(state, `Pausa de construcción: le toca a ${first?.name ?? "otro"}.`, "turno", {
      playerId: first?.id ?? null,
    });
    return;
  }
  advanceTurn(state);
}

function advanceTurn(state: GameState): void {
  state.turnIndex = (state.turnIndex + 1) % state.players.length;
  state.turnNumber += 1;
  state.phase = "dados";
  state.playedDevThisTurn = false;
  state.pendingRoadBuilding = 0;
  state.roadCardPlayerId = null;
  state.robberActorId = null;
  state.knightBeforeRoll = false;
  state.dice = null;
  state.trades = [];
  const p = state.players[state.turnIndex];
  log(state, `Turno de ${p?.name ?? "alguien"}.`, "turno", { playerId: p?.id ?? null });
  if (p) checkWin(state, p.id);
}

function fail(error: string): EngineResult {
  return { ok: false, error };
}

/** Lo que la pareja puede hacer en el turno del dueño. Dados, ladrón del 7 y pasar quedan del dueño. */
const PAIRED_ACTIONS = new Set<Action["type"]>([
  "build_road",
  "build_settlement",
  "build_city",
  "buy_dev",
  "play_knight",
  "play_year_plenty",
  "play_monopoly",
  "play_road_building",
  "bank_trade",
]);

export function applyAction(state: GameState, playerId: string, action: Action): EngineResult {
  try {
    return applyActionInner(state, playerId, action);
  } catch (err) {
    console.error(err);
    return fail("Esa jugada no se pudo procesar.");
  }
}

function applyActionInner(state: GameState, playerId: string, action: Action): EngineResult {
  const parsed = parseAction(action);
  if (!parsed.ok) return fail(parsed.error);
  action = parsed.value;

  if (state.phase === "fin") return fail("La partida ya terminó.");
  if (state.phase === "construccion_especial" && state.specialBuildQueue.length === 0) {
    advanceTurn(state);
  }
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("No estás en esta partida.");

  if (action.type === "discard") {
    return actDiscard(state, player, action.resources);
  }

  if (
    action.type === "reject_trade" ||
    action.type === "accept_trade" ||
    action.type === "counter_trade"
  ) {
    return actTradeResponse(state, player, action);
  }

  if (action.type === "move_robber") {
    if (robberMoverId(state) !== playerId) return fail("Eso lo hace quien tiene el turno.");
    return actRobber(state, player, action.hexId, action.stealFromId, false);
  }

  const role = turnRole(state, playerId);
  if (!role) return fail("No te toca.");
  if (role === "paired" && !PAIRED_ACTIONS.has(action.type)) {
    return fail("Eso lo hace quien tiene el turno.");
  }

  switch (action.type) {
    case "place_settlement":
      return actPlaceSettlement(state, player, action.vertexId);
    case "place_road":
      return actPlaceRoad(state, player, action.edgeId);
    case "roll":
      return actRoll(state, player);
    case "build_road":
      return actBuildRoad(state, player, action.edgeId);
    case "build_settlement":
      return actBuildSettlement(state, player, action.vertexId);
    case "build_city":
      return actBuildCity(state, player, action.vertexId);
    case "buy_dev":
      return actBuyDev(state, player);
    case "play_knight":
      return actPlayKnight(state, player, action.hexId, action.stealFromId);
    case "play_year_plenty":
      return actYearPlenty(state, player, action.resources);
    case "play_monopoly":
      return actMonopoly(state, player, action.resource);
    case "play_road_building":
      return actRoadBuilding(state, player);
    case "offer_trade":
      return actOffer(state, player, action);
    case "cancel_trades":
      state.trades = state.trades.filter((t) => t.fromId !== player.id);
      return { ok: true };
    case "bank_trade":
      return actBank(state, player, action.give, action.want);
    case "end_turn":
      return actEndTurn(state, player);
    default:
      return fail("Esa jugada no existe.");
  }
}

function actPlaceSettlement(state: GameState, player: PlayerState, vertexId: string): EngineResult {
  if (state.phase !== "colocacion_poblado") return fail("Ahora no se coloca poblado.");
  if (!legalSettlementVertices(state, player.id, true).includes(vertexId)) {
    return fail("Ese vértice no sirve: tiene que respetar la regla de distancia.");
  }
  state.buildings.push({ vertexId, playerId: player.id, kind: "poblado" });
  player.pieces.poblados -= 1;
  state.lastSettlementVertexId = vertexId;
  if (state.setupRound === 2) grantSecondSettlement(state, vertexId, player);
  state.phase = "colocacion_camino";
  log(state, `${player.name} plantó un poblado.`, "build", {
    playerId: player.id,
    piece: "poblado",
    icons: [{ kind: "piece", id: "poblado" }],
  });
  return { ok: true, animations: ["build"] };
}

function actPlaceRoad(state: GameState, player: PlayerState, edgeId: string): EngineResult {
  if (state.phase !== "colocacion_camino") return fail("Ahora no se coloca camino.");
  if (!legalRoadEdges(state, player.id, state.lastSettlementVertexId).includes(edgeId)) {
    return fail("El camino tiene que salir del poblado que acabás de poner.");
  }
  state.roads.push({ edgeId, playerId: player.id });
  player.pieces.caminos -= 1;
  log(state, `${player.name} tendió un camino.`, "build", {
    playerId: player.id,
    piece: "camino",
    icons: [{ kind: "piece", id: "camino" }],
  });
  nextSetup(state);
  return { ok: true, animations: ["build"] };
}

function actRoll(state: GameState, player: PlayerState): EngineResult {
  if (state.phase !== "dados") return fail("No es momento de tirar.");
  if (checkWin(state, player.id)) return { ok: true };
  const [d1, d2] = rollPair(state);
  state.dice = [d1, d2];
  state.rollNo += 1;
  // La trayectoria es otra tirada criptográfica. No entra en el stream de los números
  // de test, así las partidas con semilla siguen siendo reproducibles.
  state.diceThrow =
    state.entropy === "test"
      ? (Math.imul((state.seed ^ Math.imul(state.rollNo, 0x9e3779b9)) >>> 0, 0x85ebca6b) >>> 0) || 1
      : cryptoInt(1, 0x7fff_ffff);
  const total = d1 + d2;
  log(state, `${player.name} sacó ${total}`, "dados", {
    playerId: player.id,
    dice: [d1, d2],
    icons: [
      { kind: "dice", n: d1 },
      { kind: "dice", n: d2 },
    ],
  });
  if (total === 7) {
    startDiscardOrRobber(state);
  } else {
    produce(state, total);
    state.phase = "principal";
  }
  return { ok: true, animations: ["dice"] };
}

function actDiscard(
  state: GameState,
  player: PlayerState,
  resources: Partial<Resources>,
): EngineResult {
  if (state.phase !== "descarte") return fail("Nadie está descartando.");
  const need = state.discardNeeded[player.id] ?? 0;
  if (need <= 0) return fail("No tenés que descartar.");
  const n = sumResources(resources);
  if (n !== need) return fail(`Tenés que tirar exactamente ${need} cartas.`);
  if (!hasResources(player.resources, resources)) return fail("No tenés esas cartas.");
  returnToBank(state, player, resources);
  state.waitingDiscard = state.waitingDiscard.filter((id) => id !== player.id);
  delete state.discardNeeded[player.id];
  log(state, `${player.name} descartó ${need} cartas.`, "descarte", {
    playerId: player.id,
  });
  if (state.waitingDiscard.length === 0) {
    state.phase = "ladron";
  }
  return { ok: true };
}

function stealOne(state: GameState, thief: PlayerState, victimId: string): void {
  const victim = state.players.find((p) => p.id === victimId);
  if (!victim) return;
  const res = randomResourceInHand(victim.resources, () => secretInt(state, 0, 999_999) / 1_000_000);
  if (res) {
    victim.resources[res] -= 1;
    thief.resources[res] += 1;
    const label = RESOURCE_LABEL[res];
    log(state, `${thief.name} le robó 1 carta a ${victim.name}.`, "ladron", {
      playerId: thief.id,
      otherId: victim.id,
    });
    log(state, `${thief.name} te robó 1 ${label}.`, "ladron", {
      playerId: thief.id,
      otherId: victim.id,
      resources: { [res]: 1 },
      icons: [{ kind: "res", id: res, n: 1 }],
      audience: [victim.id],
      conceal: true,
    });
  }
}

/** Valida el movimiento del ladrón sobre un snapshot; no muta. */
function validateRobber(
  state: GameState,
  player: PlayerState,
  hexId: string,
  stealFromId: string | null,
  asKnight: boolean,
): EngineResult {
  if (state.phase !== "ladron" && !asKnight) return fail("No hay que mover el ladrón ahora.");
  if (state.pendingStealHexId) {
    if (hexId !== state.pendingStealHexId && hexId !== state.robberHexId) {
      return fail("Primero tenés que elegir a quién robarle.");
    }
    const targets = stealCandidates(state, state.pendingStealHexId, player.id);
    if (stealFromId) {
      if (!targets.includes(stealFromId)) return fail("No podés robarle a esa persona.");
    } else if (targets.length > 0) {
      return fail("Tenés que elegir a quién robarle.");
    }
    return { ok: true };
  }
  if (hexId === state.robberHexId) return fail("El ladrón tiene que cambiar de hexágono.");
  if (!state.hexes.some((h) => h.id === hexId)) return fail("Ese hexágono no está en el tablero.");
  const targets = stealCandidates(state, hexId, player.id);
  if (stealFromId && !targets.includes(stealFromId)) {
    return fail("No podés robarle a esa persona.");
  }
  return { ok: true };
}

function actRobber(
  state: GameState,
  player: PlayerState,
  hexId: string,
  stealFromId: string | null,
  asKnight: boolean,
): EngineResult {
  const check = validateRobber(state, player, hexId, stealFromId, asKnight);
  if (!check.ok) return check;

  if (state.pendingStealHexId) {
    if (stealFromId) stealOne(state, player, stealFromId);
    state.pendingStealHexId = null;
    if (!asKnight) afterRobber(state);
    return { ok: true, animations: ["robber"] };
  }

  const targets = stealCandidates(state, hexId, player.id);
  state.robberHexId = hexId;
  if (stealFromId) {
    stealOne(state, player, stealFromId);
    state.pendingStealHexId = null;
  } else if (targets.length > 0) {
    state.pendingStealHexId = hexId;
    state.phase = "ladron";
    log(state, `${player.name} movió el ladrón. Falta elegir a quién robarle.`, "ladron", {
      playerId: player.id,
    });
    return { ok: true, animations: ["robber"] };
  } else {
    state.pendingStealHexId = null;
    log(state, `${player.name} movió el ladrón.`, "ladron", { playerId: player.id });
  }
  if (!asKnight) afterRobber(state);
  return { ok: true, animations: ["robber"] };
}

function canBuildPhase(state: GameState): boolean {
  return state.phase === "principal" || state.phase === "construccion_especial";
}

function actBuildRoad(state: GameState, player: PlayerState, edgeId: string): EngineResult {
  if (!canBuildPhase(state) && state.pendingRoadBuilding <= 0) {
    return fail("Ahora no se construye.");
  }
  if (!legalRoadEdges(state, player.id, null).includes(edgeId)) {
    return fail("Ahí no podés tender un camino.");
  }
  if (state.pendingRoadBuilding > 0) {
    player.pieces.caminos -= 1;
    state.roads.push({ edgeId, playerId: player.id });
    state.pendingRoadBuilding -= 1;
    if (state.pendingRoadBuilding > 0 && legalRoadEdges(state, player.id, null).length === 0) {
      state.pendingRoadBuilding = 0;
    }
    if (state.pendingRoadBuilding === 0) state.roadCardPlayerId = null;
    log(state, `${player.name} construyó un camino (carta).`, "build", {
      playerId: player.id,
      piece: "camino",
      icons: [{ kind: "piece", id: "camino" }],
    });
    awards(state);
    checkWin(state, player.id);
    return { ok: true, animations: ["build"] };
  }
  if (player.pieces.caminos <= 0) return fail("No te quedan caminos.");
  if (!hasResources(player.resources, COSTS.camino)) return fail("Te faltan recursos para el camino.");
  returnToBank(state, player, COSTS.camino);
  player.pieces.caminos -= 1;
  state.roads.push({ edgeId, playerId: player.id });
  log(state, `${player.name} construyó un camino.`, "build", {
    playerId: player.id,
    piece: "camino",
    icons: [{ kind: "piece", id: "camino" }],
  });
  awards(state);
  checkWin(state, player.id);
  return { ok: true, animations: ["build"] };
}

function actBuildSettlement(state: GameState, player: PlayerState, vertexId: string): EngineResult {
  if (!canBuildPhase(state)) return fail("Ahora no se construye.");
  if (player.pieces.poblados <= 0) return fail("No te quedan poblados.");
  if (!hasResources(player.resources, COSTS.poblado)) return fail("Te faltan recursos para el poblado.");
  if (!distanceOk(state, vertexId)) return fail("Regla de distancia: muy pegado a otro poblado.");
  if (!playerTouchesVertex(state, player.id, vertexId)) {
    return fail("El poblado tiene que conectar con un camino tuyo.");
  }
  returnToBank(state, player, COSTS.poblado);
  player.pieces.poblados -= 1;
  state.buildings.push({ vertexId, playerId: player.id, kind: "poblado" });
  log(state, `${player.name} levantó un poblado.`, "build", {
    playerId: player.id,
    piece: "poblado",
    icons: [{ kind: "piece", id: "poblado" }],
  });
  awards(state);
  checkWin(state, player.id);
  return { ok: true, animations: ["build"] };
}

function actBuildCity(state: GameState, player: PlayerState, vertexId: string): EngineResult {
  if (!canBuildPhase(state)) return fail("Ahora no se construye.");
  if (player.pieces.ciudades <= 0) return fail("No te quedan ciudades.");
  if (!hasResources(player.resources, COSTS.ciudad)) return fail("Te faltan recursos para la ciudad.");
  if (!legalCityVertices(state, player.id).includes(vertexId)) {
    return fail("Sólo podés mejorar un poblado tuyo.");
  }
  returnToBank(state, player, COSTS.ciudad);
  player.pieces.ciudades -= 1;
  player.pieces.poblados += 1;
  const b = state.buildings.find((x) => x.vertexId === vertexId)!;
  b.kind = "ciudad";
  log(state, `${player.name} mejoró a ciudad.`, "build", {
    playerId: player.id,
    piece: "ciudad",
    icons: [{ kind: "piece", id: "ciudad" }],
  });
  checkWin(state, player.id);
  return { ok: true, animations: ["build"] };
}

function actBuyDev(state: GameState, player: PlayerState): EngineResult {
  if (state.pendingRoadBuilding > 0) return fail("Primero terminá los caminos de la carta.");
  if (state.phase === "construccion_especial") {
    return fail("En la pausa de construcción no se compran cartas.");
  }
  if (state.phase !== "principal") return fail("Ahora no se compran cartas.");
  if (!hasResources(player.resources, COSTS.dev)) return fail("Te faltan recursos para la carta.");
  if (state.devDeck.length === 0) return fail("Se acabaron las cartas de desarrollo.");
  returnToBank(state, player, COSTS.dev);
  const card = state.devDeck.shift()!;
  player.devCards.push({ kind: card, purchasedTurn: state.turnNumber });
  log(state, `${player.name} compró una carta de desarrollo.`, "dev", {
    playerId: player.id,
    piece: "carta",
    icons: [{ kind: "piece", id: "carta" }],
  });
  checkWin(state, player.id);
  return { ok: true, reveal: card };
}

function actPlayKnight(
  state: GameState,
  player: PlayerState,
  hexId: string,
  stealFromId: string | null,
): EngineResult {
  if (state.phase !== "dados" && state.phase !== "principal") {
    return fail("Ahora no se juega el caballero.");
  }
  if (state.playedDevThisTurn) return fail("Ya jugaste una carta este turno.");
  if (!hasPlayableDev(player, "caballero", state.turnNumber)) {
    return fail("No tenés un caballero jugable.");
  }
  const check = validateRobber(state, player, hexId, stealFromId, true);
  if (!check.ok) return check;
  consumeDev(player, "caballero", state.turnNumber);
  state.playedDevThisTurn = true;
  player.knightsPlayed += 1;
  state.robberActorId = player.id;
  if (state.phase === "dados") state.knightBeforeRoll = true;
  log(state, `${player.name} jugó :caballero:`, "dev", {
    playerId: player.id,
    piece: "caballero",
  });
  const res = actRobber(state, player, hexId, stealFromId, true);
  awards(state);
  if (checkWin(state, player.id)) {
    state.pendingStealHexId = null;
    return { ok: true, animations: ["robber"] };
  }
  if (res.ok && !state.pendingStealHexId) {
    afterRobber(state);
    return { ok: true, animations: ["robber"] };
  }
  state.phase = "ladron";
  return { ok: true, animations: ["robber"] };
}

function actYearPlenty(
  state: GameState,
  player: PlayerState,
  pair: [Resource, Resource],
): EngineResult {
  if (state.phase !== "principal") return fail("Ahora no se juega esa carta.");
  if (state.playedDevThisTurn) return fail("Ya jugaste una carta este turno.");
  if (!RESOURCES.includes(pair[0]) || !RESOURCES.includes(pair[1])) {
    return fail("Invento pide dos recursos de la isla.");
  }
  if (!hasPlayableDev(player, "progreso_invento", state.turnNumber)) {
    return fail("No tenés Invento.");
  }
  consumeDev(player, "progreso_invento", state.turnNumber);
  const gain: Partial<Resources> = {};
  gain[pair[0]] = (gain[pair[0]] ?? 0) + 1;
  gain[pair[1]] = (gain[pair[1]] ?? 0) + 1;
  const before = { ...player.resources };
  giveFromBank(state, player, gain);
  const got: Partial<Resources> = {};
  for (const k of RESOURCES) {
    const n = player.resources[k] - before[k];
    if (n > 0) got[k] = n;
  }
  state.playedDevThisTurn = true;
  if (sumResources(got) > 0) {
    log(state, `${player.name} jugó :invento: y tomó`, "dev", {
      playerId: player.id,
      piece: "invento",
      resources: got,
      icons: resIcons(got),
    });
  } else {
    log(state, `${player.name} jugó :invento:, pero el banco no tenía.`, "dev", {
      playerId: player.id,
      piece: "invento",
    });
  }
  return { ok: true };
}

function actMonopoly(state: GameState, player: PlayerState, resource: Resource): EngineResult {
  if (state.phase !== "principal") return fail("Ahora no se juega esa carta.");
  if (state.playedDevThisTurn) return fail("Ya jugaste una carta este turno.");
  if (!RESOURCES.includes(resource)) return fail("Ese recurso no existe.");
  if (!hasPlayableDev(player, "progreso_monopolio", state.turnNumber)) {
    return fail("No tenés Monopolio.");
  }
  consumeDev(player, "progreso_monopolio", state.turnNumber);
  let taken = 0;
  for (const other of state.players) {
    if (other.id === player.id) continue;
    const n = other.resources[resource];
    other.resources[resource] = 0;
    player.resources[resource] += n;
    taken += n;
  }
  state.playedDevThisTurn = true;
  log(state, `${player.name} jugó :monopolio: y se llevó`, "dev", {
    playerId: player.id,
    piece: "monopolio",
    resources: { [resource]: taken },
    icons: [{ kind: "res", id: resource, n: taken }],
  });
  return { ok: true };
}

function actRoadBuilding(state: GameState, player: PlayerState): EngineResult {
  if (state.phase !== "principal") return fail("Ahora no se juega esa carta.");
  if (state.playedDevThisTurn) return fail("Ya jugaste una carta este turno.");
  if (player.pieces.caminos < 1) return fail("No te quedan piezas de camino.");
  if (!hasPlayableDev(player, "progreso_caminos", state.turnNumber)) {
    return fail("No tenés Construcción de caminos.");
  }
  const spots = legalRoadEdges(state, player.id, null);
  if (spots.length < 1) return fail("No tenés dónde poner un camino.");
  consumeDev(player, "progreso_caminos", state.turnNumber);
  state.playedDevThisTurn = true;
  state.pendingRoadBuilding = Math.min(2, player.pieces.caminos);
  state.roadCardPlayerId = player.id;
  log(state, `${player.name} jugó :caminos:`, "dev", {
    playerId: player.id,
    piece: "caminos",
  });
  return { ok: true };
}

function actOffer(
  state: GameState,
  player: PlayerState,
  action: Extract<Action, { type: "offer_trade" }>,
): EngineResult {
  if (state.phase !== "principal") return fail("El comercio entre jugadores es en tu turno.");
  if (action.toId !== "todos") {
    if (action.toId === player.id) return fail("No podés ofrecerte a vos.");
    if (!state.players.some((p) => p.id === action.toId)) return fail("Ese jugador no está en la mesa.");
  }
  if (sumResources(action.give) <= 0 || sumResources(action.want) <= 0) {
    return fail("La oferta tiene que dar y pedir algo.");
  }
  if (!hasResources(player.resources, action.give)) return fail("No tenés lo que estás ofreciendo.");
  if (openOffers(state, player.id) >= MAX_OPEN_OFFERS) {
    return fail(`Ya tenés ${MAX_OPEN_OFFERS} ofertas abiertas: cancelá alguna.`);
  }
  state.trades.push({
    id: `t-${state.nextEventId}`,
    fromId: player.id,
    toId: action.toId,
    give: action.give,
    want: action.want,
  });
  const directed = action.toId !== "todos";
  const target = directed ? state.players.find((p) => p.id === action.toId)?.name : null;
  log(state, target ? `${player.name} le ofrece a ${target}.` : `${player.name} ofrece a la mesa.`, "comercio", {
    playerId: player.id,
    otherId: directed ? action.toId : null,
    resources: action.give,
    icons: tradeIcons(action.give, action.want),
    ...(directed ? { audience: [player.id, action.toId] } : {}),
  });
  return { ok: true };
}

function openOffers(state: GameState, playerId: string): number {
  return state.trades.filter((t) => t.fromId === playerId).length;
}

function actTradeResponse(
  state: GameState,
  player: PlayerState,
  action: Extract<Action, { type: "accept_trade" } | { type: "reject_trade" } | { type: "counter_trade" }>,
): EngineResult {
  const trade = state.trades.find((t) => t.id === action.tradeId);
  if (!trade) return fail("Esa oferta ya no está.");
  if (action.type === "reject_trade") {
    if (trade.fromId === player.id) {
      state.trades = state.trades.filter((t) => t.id !== trade.id);
      return { ok: true };
    }
    if (trade.toId === "todos") {
      const declined = new Set(trade.declinedBy ?? []);
      declined.add(player.id);
      trade.declinedBy = [...declined];
      return { ok: true };
    }
    if (trade.toId !== player.id) return fail("Esa oferta no es para vos.");
    state.trades = state.trades.filter((t) => t.id !== trade.id);
    return { ok: true };
  }
  if (action.type === "counter_trade") {
    if (trade.fromId === player.id) return fail("Contraofertale a otro.");
    if (trade.declinedBy?.includes(player.id)) return fail("Ya pasaste de esa oferta.");
    if (trade.toId !== "todos" && trade.toId !== player.id) {
      return fail("Esa oferta no es para vos.");
    }
    if (sumResources(action.give) <= 0 || sumResources(action.want) <= 0) {
      return fail("La contraoferta tiene que dar y pedir algo.");
    }
    if (!hasResources(player.resources, action.give)) return fail("No tenés lo que contraofertás.");
    if (openOffers(state, player.id) >= MAX_OPEN_OFFERS) {
      return fail(`Ya tenés ${MAX_OPEN_OFFERS} ofertas abiertas: cancelá alguna.`);
    }
    state.trades = state.trades.filter((t) => t.id !== trade.id);
    state.trades.push({
      id: `t-${state.nextEventId}`,
      fromId: player.id,
      toId: trade.fromId,
      give: action.give,
      want: action.want,
    });
    const origin = state.players.find((p) => p.id === trade.fromId)?.name ?? "otro";
    log(state, `${player.name} le manda una contraoferta a ${origin}.`, "comercio", {
      playerId: player.id,
      otherId: trade.fromId,
      icons: tradeIcons(action.give, action.want),
      audience: [player.id, trade.fromId],
    });
    return { ok: true };
  }
  if (state.phase !== "principal") return fail("El comercio ya no está abierto.");
  if (trade.fromId === player.id) return fail("No podés aceptar tu propia oferta.");
  if (trade.declinedBy?.includes(player.id)) return fail("Ya pasaste de esa oferta.");
  if (trade.toId !== "todos" && trade.toId !== player.id) return fail("Esa oferta no es para vos.");
  const from = state.players.find((p) => p.id === trade.fromId);
  if (!from) return fail("El otro jugador no está.");
  if (!hasResources(from.resources, trade.give)) return fail("El otro ya no tiene esos recursos.");
  if (!hasResources(player.resources, trade.want)) return fail("No tenés lo que pide.");
  pay(from.resources, trade.give);
  grant(player.resources, trade.give);
  pay(player.resources, trade.want);
  grant(from.resources, trade.want);
  state.trades = [];
  log(state, `${player.name} aceptó la oferta de ${from.name}.`, "comercio", {
    playerId: player.id,
    otherId: from.id,
    icons: tradeIcons(trade.give, trade.want),
  });
  return { ok: true };
}

function actBank(
  state: GameState,
  player: PlayerState,
  give: Partial<Resources>,
  want: Partial<Resources>,
): EngineResult {
  if (state.phase !== "principal") return fail("Con el banco se comercia en tu turno.");
  const giveN = sumResources(give);
  const wantN = sumResources(want);
  if (wantN <= 0) return fail("Pedí algo al banco.");
  const giveTypes = RESOURCES.filter((k) => (give[k] ?? 0) > 0);
  if (giveTypes.length !== 1) return fail("Al banco se le da un solo tipo de recurso por trato.");
  const res = giveTypes[0]!;
  const rate = bestBankRate(state, player.id, res);
  if (giveN !== rate * wantN) {
    return fail(rate === 4 ? "El cambio con el banco es 4:1." : `Con tu puerto el cambio es ${rate}:1.`);
  }
  if (!hasResources(player.resources, give)) return fail("No te alcanza para el banco.");
  if (!hasResources(state.bank, want)) return fail("El banco no tiene eso.");
  transfer(player.resources, state.bank, give);
  transfer(state.bank, player.resources, want);
  log(state, `${player.name} cambió con el banco.`, "comercio", {
    playerId: player.id,
    resources: want,
    icons: tradeIcons(give, want),
  });
  return { ok: true };
}

function actEndTurn(state: GameState, player: PlayerState): EngineResult {
  if (state.pendingRoadBuilding > 0) {
    const who = state.roadCardPlayerId ?? player.id;
    const spots = legalRoadEdges(state, who, null);
    if (spots.length > 0) {
      return fail(who === player.id ? "Todavía te faltan caminos de la carta." : "Faltan los caminos de la carta.");
    }
    state.pendingRoadBuilding = 0;
    state.roadCardPlayerId = null;
  }
  if (state.phase === "construccion_especial") {
    state.specialBuildQueue.shift();
    if (state.specialBuildQueue.length === 0) {
      advanceTurn(state);
    } else {
      const nxt = state.players.find((p) => p.id === state.specialBuildQueue[0]);
      log(state, `Sigue la pausa de construcción: ${nxt?.name}.`, "turno", {
        playerId: nxt?.id ?? null,
      });
    }
    return { ok: true };
  }
  if (state.phase !== "principal") return fail("Todavía no podés pasar.");
  if (checkWin(state, player.id)) return { ok: true };
  maybeSpecialBuild(state);
  return { ok: true };
}

export { currentPlayer, longestRoadLength };

export function produceResources(state: GameState, total: number): void {
  produce(state, total);
}
