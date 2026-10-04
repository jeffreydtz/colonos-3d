import { nanoid } from "nanoid";
import {
  boardKindForCount,
  DEFAULT_SEAT_LIMIT,
  DEFAULT_VICTORY,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from "../shared/constants.ts";
import { chatAllowed, sanitizeChat } from "../shared/chat.ts";
import { cleanPlayerName } from "../shared/names.ts";
import { COLORS } from "../shared/types.ts";
import type {
  Action,
  ChatMessage,
  ColorId,
  GameState,
  LobbyView,
} from "../shared/types.ts";
import { applyBotStep } from "./bots.ts";
import { applyAction, createGame } from "./engine.ts";
import { currentPlayer, legalMoves, legalSettlementVertices } from "./legal.ts";
import { pickDiscard } from "./resources.ts";
import { parseCreatePayload, parseJoinPayload } from "./validate.ts";
import { toClientView } from "./view.ts";
import { BOT_ONLY_PRUNE_MS, noteRoomCreate, noteRoomGone, resetSecurityForTests, roomCreateAllowed } from "./security.ts";

export interface Seat {
  id: string;
  token: string;
  name: string;
  color: ColorId;
  connected: boolean;
  socketId: string | null;
  isBot: boolean;
}

export interface Room {
  code: string;
  hostId: string;
  victoryPoints: number;
  seatLimit: number;
  seats: Seat[];
  game: GameState | null;
  chat: ChatMessage[];
  createdAt: number;
  lastActivity: number;
  timer: ReturnType<typeof setTimeout> | null;
  botTimer: ReturnType<typeof setTimeout> | null;
  deadlineAt: number | null;
  botDelayMs: number;
  unboxPlayerId: string | null;
  busyUntil: number;
  /** Un solo busy:true por unbox; no se recicla al vencer busyUntil. */
  unboxExtended: boolean;
  /** Deadline que había antes de que la pausa de unbox lo estirara; se restaura al cerrar. */
  deadlineBeforeBusy: number | null;
  /** Bots que entraron seguidos: se anuncian en una sola línea mientras siga siendo la última del chat. */
  botJoin: { chatId: string; names: string[] } | null;
}

export const MAX_ROOMS = 200;
export const TURN_TIMEOUT_MS = 45_000;
export const DISCARD_TIMEOUT_MS = 30_000;
export const IDLE_PRUNE_MS = 30 * 60 * 1000;
export { BOT_ONLY_PRUNE_MS };
export const DISCONNECT_GRACE_MS = 2_000;
export const DEFAULT_BOT_DELAY_MS = 900;
export const REVEAL_PAUSE_MS = 22_000;
/** Margen mínimo al cerrar la carta antes de tiempo: que no venza en el mismo tick. */
export const UNBUSY_GRACE_MS = 3_000;

const BOT_NAMES = ["Tomi", "Mora", "Fede", "Nico", "Sol", "Luz"];

const rooms = new Map<string, Room>();
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const chatHits = new Map<string, number[]>();

let broadcast: (code: string) => void = () => {};
let defaultBotDelayMs = DEFAULT_BOT_DELAY_MS;

export function setBroadcast(fn: (code: string) => void): void {
  broadcast = fn;
}

export function setDefaultBotDelayMs(ms: number): void {
  defaultBotDelayMs = ms;
}

function touch(room: Room): void {
  room.lastActivity = Date.now();
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint8Array(6);
  globalThis.crypto.getRandomValues(buf);
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[buf[i]! % alphabet.length];
  return rooms.has(code) ? makeCode() : code;
}

function newToken(): string {
  return nanoid(32);
}

function nameTaken(room: Room, name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  if (!key) return false;
  return room.seats.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === key);
}

function uniqueName(room: Room, raw: string, fallback: string, exceptId?: string): string {
  const cleaned = cleanPlayerName(raw, fallback);
  const base = cleaned.ok ? cleaned.name : fallback;
  if (!nameTaken(room, base, exceptId)) return base;
  for (let n = 2; n < 20; n++) {
    const candidate = `${base.slice(0, 16)} ${n}`;
    if (!nameTaken(room, candidate, exceptId)) return candidate;
  }
  return `${base.slice(0, 12)} ${nanoid(4)}`;
}

function unusedColor(room: Room, preferred?: ColorId): ColorId | null {
  if (preferred && !room.seats.some((s) => s.color === preferred)) return preferred;
  return COLORS.find((c) => !room.seats.some((s) => s.color === c)) ?? null;
}

function humansLeft(room: Room): boolean {
  return room.seats.some((s) => !s.isBot);
}

function forgetRoom(code: string): void {
  rooms.delete(code);
  noteRoomGone(code);
}

export function createRoom(
  raw: unknown,
  ctx?: { ip?: string },
):
  | { ok: true; room: Room; token: string; playerId: string }
  | { ok: false; error: string } {
  pruneRooms();
  if (rooms.size >= MAX_ROOMS) {
    return { ok: false, error: "Hay demasiadas mesas abiertas. Probá en un rato." };
  }
  const ip = ctx?.ip ?? "";
  if (ip && !roomCreateAllowed(ip)) {
    return { ok: false, error: "Ya abriste demasiadas mesas desde esta red." };
  }
  const parsed = parseCreatePayload(raw);
  if (!parsed.ok) return parsed;
  const opts = parsed.value;
  const named = cleanPlayerName(opts.name, "Anfitrión");
  if (!named.ok) return named;
  const code = makeCode();
  const playerId = nanoid(10);
  const token = newToken();
  const seat: Seat = {
    id: playerId,
    token,
    name: named.name,
    color: opts.color,
    connected: true,
    socketId: null,
    isBot: false,
  };
  const now = Date.now();
  const room: Room = {
    code,
    hostId: playerId,
    victoryPoints: Math.min(15, Math.max(5, opts.victoryPoints ?? DEFAULT_VICTORY)),
    seatLimit: opts.seatLimit ?? DEFAULT_SEAT_LIMIT,
    seats: [seat],
    game: null,
    chat: [],
    createdAt: now,
    lastActivity: now,
    timer: null,
    botTimer: null,
    deadlineAt: null,
    botDelayMs: defaultBotDelayMs,
    unboxPlayerId: null,
    busyUntil: 0,
    unboxExtended: false,
    deadlineBeforeBusy: null,
    botJoin: null,
  };
  rooms.set(code, room);
  if (ip) noteRoomCreate(ip, code);
  return { ok: true, room, token, playerId };
}

export function getRoom(code: string): Room | undefined {
  if (!code || typeof code !== "string") return undefined;
  return rooms.get(code.toUpperCase());
}

export function joinRoom(raw: unknown):
  | { ok: true; room: Room; token: string; playerId: string }
  | { ok: false; error: string } {
  const parsed = parseJoinPayload(raw);
  if (!parsed.ok) return parsed;
  const opts = parsed.value;
  const named = cleanPlayerName(opts.name, opts.token ? "Jugador" : "Jugador");
  if (!named.ok) return named;
  const room = getRoom(opts.code);
  if (!room) return { ok: false, error: "No hay una sala con ese código." };
  touch(room);

  if (opts.token) {
    const existing = room.seats.find((s) => s.token === opts.token);
    if (existing) {
      existing.connected = true;
      existing.isBot = false;
      if (opts.name.trim()) existing.name = uniqueName(room, named.name, existing.name, existing.id);
      return { ok: true, room, token: existing.token, playerId: existing.id };
    }
  }

  if (room.game) return { ok: false, error: "La partida ya arrancó. Pedile el token a tu asiento." };
  if (room.seats.length >= room.seatLimit) {
    return { ok: false, error: `La sala está llena (máximo ${room.seatLimit}).` };
  }
  if (room.seats.some((s) => s.color === opts.color)) {
    return { ok: false, error: "Ese color ya está usado." };
  }

  const playerId = nanoid(10);
  const token = newToken();
  room.seats.push({
    id: playerId,
    token,
    name: uniqueName(room, named.name, "Jugador"),
    color: opts.color,
    connected: true,
    socketId: null,
    isBot: false,
  });
  return { ok: true, room, token, playerId };
}

export function bindSocket(room: Room, playerId: string, socketId: string): void {
  const seat = room.seats.find((s) => s.id === playerId);
  if (seat) {
    const prev = seat.socketId;
    if (prev && disconnectTimers.has(prev)) {
      clearTimeout(disconnectTimers.get(prev));
      disconnectTimers.delete(prev);
    }
    seat.socketId = socketId;
    seat.connected = true;
    seat.isBot = false;
    rememberSocket(room.code, playerId, socketId);
  }
}

export function transferHost(room: Room): boolean {
  const host = room.seats.find((s) => s.id === room.hostId);
  if (host?.connected && !host.isBot) return false;
  const nextHuman = room.seats.find((s) => s.connected && !s.isBot);
  if (!nextHuman || nextHuman.id === room.hostId) return false;
  room.hostId = nextHuman.id;
  pushChat(room, null, "Sistema", `${nextHuman.name} queda de anfitrión.`);
  return true;
}

export function leaveRoom(
  room: Room,
  playerId: string,
  opts?: { forfeit?: boolean },
): { ok: true; removed: boolean } | { ok: false; error: string } {
  const idx = room.seats.findIndex((s) => s.id === playerId);
  if (idx < 0) return { ok: false, error: "No te encuentro en la mesa." };
  const seat = room.seats[idx]!;
  if (room.game) {
    seat.connected = false;
    seat.socketId = null;
    transferHost(room);
    if (opts?.forfeit) {
      seat.token = newToken();
      pushChat(room, null, "Sistema", `${seat.name} dejó la mesa. Entra un bot a su asiento.`);
      if (room.game.phase === "descarte") autoDiscardPlayer(room, playerId);
      promoteToBot(room, playerId);
      scheduleBots(room);
    } else {
      pushChat(room, null, "Sistema", `${seat.name} se cortó. El asiento queda para reconectar.`);
      maybeResolveDisconnect(room, playerId);
    }
    armRoomTimer(room);
    return { ok: true, removed: false };
  }
  room.seats.splice(idx, 1);
  if (room.seats.length === 0 || !humansLeft(room)) {
    clearRoomTimer(room);
    forgetRoom(room.code);
    return { ok: true, removed: true };
  }
  if (room.hostId === playerId) transferHost(room);
  pushChat(room, null, "Sistema", `${seat.name} dejó la mesa.`);
  return { ok: true, removed: true };
}

export function markDisconnected(socketId: string): Room | null {
  for (const room of rooms.values()) {
    const seat = room.seats.find((s) => s.socketId === socketId);
    if (seat) {
      if (seat.isBot) return room;
      seat.connected = false;
      seat.socketId = null;
      transferHost(room);
      return room;
    }
  }
  return null;
}

const lastSocketOwner = new Map<string, { code: string; playerId: string }>();

export function rememberSocket(code: string, playerId: string, socketId: string): void {
  lastSocketOwner.set(socketId, { code, playerId });
}

export function onSocketGone(socketId: string): Room | null {
  const pending = lastSocketOwner.get(socketId);
  lastSocketOwner.delete(socketId);
  const room = pending ? getRoom(pending.code) : markDisconnected(socketId);
  const playerId = pending?.playerId;
  if (!pending) return room ?? null;
  if (!room) return null;
  const seat = room.seats.find((s) => s.id === playerId);
  if (!seat) return null;
  if (seat.isBot) return room;
  if (seat.socketId && seat.socketId !== socketId) return room;
  seat.connected = false;
  seat.socketId = null;
  transferHost(room);
  if (!room.game) {
    const otherHumans = room.seats.filter((s) => !s.isBot && s.id !== seat.id);
    if (otherHumans.length === 0 && room.seats.some((s) => s.isBot)) {
      return room;
    }
    const code = room.code;
    leaveRoom(room, seat.id);
    return getRoom(code) ?? room;
  }
  pushChat(room, null, "Sistema", `${seat.name} se desconectó.`);
  maybeResolveDisconnect(room, seat.id);
  armRoomTimer(room);
  return room;
}

export function scheduleDisconnect(socketId: string, graceMs = DISCONNECT_GRACE_MS): void {
  if (disconnectTimers.has(socketId)) {
    clearTimeout(disconnectTimers.get(socketId));
  }
  const t = setTimeout(() => {
    disconnectTimers.delete(socketId);
    const room = onSocketGone(socketId);
    if (room) broadcast(room.code);
  }, graceMs);
  disconnectTimers.set(socketId, t);
}

export function addBot(
  room: Room,
  requesterId: string,
  opts: { name?: string; color?: ColorId } = {},
): { ok: true; botId: string } | { ok: false; error: string } {
  if (room.hostId !== requesterId) return { ok: false, error: "Sólo el anfitrión puede meter bots." };
  if (room.game) return { ok: false, error: "La partida ya arrancó." };
  if (room.seats.length >= room.seatLimit) {
    return { ok: false, error: `La mesa ya está llena (${room.seatLimit}).` };
  }
  const color = unusedColor(room, opts.color);
  if (!color) return { ok: false, error: "No queda color libre." };
  const fallback = BOT_NAMES.find((n) => !nameTaken(room, n)) ?? "Bot";
  const playerId = nanoid(10);
  room.seats.push({
    id: playerId,
    token: newToken(),
    name: uniqueName(room, opts.name ?? fallback, fallback),
    color,
    connected: true,
    socketId: null,
    isBot: true,
  });
  announceBot(room, room.seats.at(-1)!.name);
  touch(room);
  return { ok: true, botId: playerId };
}

const namesList = new Intl.ListFormat("es", { type: "conjunction" });

function announceBot(room: Room, name: string): void {
  const last = room.chat.at(-1);
  if (room.botJoin && last && last.id === room.botJoin.chatId) {
    room.botJoin.names.push(name);
    last.text = sanitizeChat(`${namesList.format(room.botJoin.names)} entran como bots.`);
    last.t = Date.now();
    return;
  }
  pushChat(room, null, "Sistema", `${name} entra como bot.`);
  room.botJoin = { chatId: room.chat.at(-1)!.id, names: [name] };
}

export function removeBot(
  room: Room,
  requesterId: string,
  botId: string,
): { ok: true } | { ok: false; error: string } {
  if (room.hostId !== requesterId) return { ok: false, error: "Sólo el anfitrión puede sacar bots." };
  if (room.game) return { ok: false, error: "La partida ya arrancó." };
  const idx = room.seats.findIndex((s) => s.id === botId && s.isBot);
  if (idx < 0) return { ok: false, error: "Ese asiento no es un bot." };
  const seat = room.seats[idx]!;
  room.seats.splice(idx, 1);
  if (room.hostId === botId) transferHost(room);
  pushChat(room, null, "Sistema", `${seat.name} sale de la mesa.`);
  touch(room);
  return { ok: true };
}

export function setSeatLimit(
  room: Room,
  requesterId: string,
  seatLimit: number,
): { ok: true } | { ok: false; error: string } {
  if (room.hostId !== requesterId) return { ok: false, error: "Sólo el anfitrión cambia los asientos." };
  if (room.game) return { ok: false, error: "La partida ya arrancó." };
  if (!Number.isInteger(seatLimit) || seatLimit < MIN_PLAYERS || seatLimit > MAX_PLAYERS) {
    return { ok: false, error: `La mesa es de ${MIN_PLAYERS} a ${MAX_PLAYERS}.` };
  }
  if (seatLimit < room.seats.length) {
    return { ok: false, error: `Ya hay ${room.seats.length} en la mesa. Sacá a alguien primero.` };
  }
  room.seatLimit = seatLimit;
  touch(room);
  return { ok: true };
}

export function startGame(
  room: Room,
  requesterId: string,
  opts?: { seed?: number },
): { ok: true } | { ok: false; error: string } {
  if (room.hostId !== requesterId) return { ok: false, error: "Sólo el anfitrión puede empezar." };
  if (room.game) return { ok: false, error: "La partida ya está en curso." };
  if (room.seats.length < MIN_PLAYERS) {
    return { ok: false, error: `Hacen falta al menos ${MIN_PLAYERS} jugadores.` };
  }
  room.game = createGame({
    victoryPoints: room.victoryPoints,
    seed: opts?.seed,
    players: room.seats.map((s) => ({ id: s.id, name: s.name, color: s.color })),
  });
  const kind = boardKindForCount(room.seats.length);
  pushChat(
    room,
    null,
    "Sistema",
    kind === "expansion"
      ? "Arrancó la partida en la isla grande. Suerte, no se dejen robar."
      : "Arrancó la partida en la isla clásica. Suerte, no se dejen robar.",
  );
  touch(room);
  armRoomTimer(room);
  scheduleBots(room);
  return { ok: true };
}

function completeSetupIfNeeded(state: GameState): void {
  const need = state.players.length * 2;
  if (state.buildings.length >= need) return;
  const n = state.players.length;
  const order = [...Array(n).keys(), ...[...Array(n).keys()].reverse()];
  for (const idx of order) {
    if (state.buildings.filter((b) => b.playerId === state.players[idx]!.id).length >= 2) continue;
    const p = state.players[idx]!;
    state.turnIndex = idx;
    state.phase = "colocacion_poblado";
    const v = legalSettlementVertices(state, p.id, true)[0];
    if (!v) return;
    const placed = applyAction(state, p.id, { type: "place_settlement", vertexId: v });
    if (!placed.ok) return;
    const e = legalMoves(state, p.id).edges[0];
    if (!e) return;
    applyAction(state, p.id, { type: "place_road", edgeId: e });
  }
}

/** Sólo tests / COLONOS_DEV: deja la mesa lista para comprar una carta de desarrollo. */
export function prepareDevUnbox(
  room: Room,
  playerId: string,
): { ok: true } | { ok: false; error: string } {
  if (!room.game) return { ok: false, error: "La partida no arrancó." };
  const g = room.game;
  if (g.phase === "fin") return { ok: false, error: "Ya terminó." };
  completeSetupIfNeeded(g);
  const idx = g.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return { ok: false, error: "No estás en la mesa." };
  g.phase = "principal";
  g.turnIndex = idx;
  g.pendingRoadBuilding = 0;
  g.waitingDiscard = [];
  g.discardNeeded = {};
  g.trades = [];
  const p = g.players[idx]!;
  p.resources = {
    ...p.resources,
    lana: Math.max(1, p.resources.lana),
    trigo: Math.max(1, p.resources.trigo),
    mineral: Math.max(1, p.resources.mineral),
  };
  clearBotTimer(room);
  touch(room);
  armRoomTimer(room);
  return { ok: true };
}

export function play(room: Room, playerId: string, action: Action) {
  if (!room.game) return { ok: false as const, error: "La partida no arrancó." };
  const result = applyAction(room.game, playerId, action);
  if (result.ok) {
    touch(room);
    if ("reveal" in result && result.reveal) {
      room.unboxPlayerId = playerId;
      room.busyUntil = Date.now() + REVEAL_PAUSE_MS;
      room.unboxExtended = true;
    }
    armRoomTimer(room);
    scheduleBots(room);
  }
  return result;
}

export function pushChat(
  room: Room,
  playerId: string | null,
  name: string,
  text: string,
  color: ColorId | null = null,
): { ok: true } | { ok: false; error: string } {
  const clean = sanitizeChat(text);
  if (!clean) return { ok: false, error: "El mensaje está vacío." };
  if (playerId) {
    const key = `${room.code}:${playerId}`;
    const allowed = chatAllowed(chatHits.get(key) ?? []);
    if (!allowed.ok) return { ok: false, error: "Más despacio con el chat." };
    chatHits.set(key, allowed.next);
  }
  room.chat.push({
    id: nanoid(8),
    playerId,
    name,
    color,
    text: clean,
    t: Date.now(),
  });
  if (room.chat.length > 160) room.chat.splice(0, room.chat.length - 160);
  touch(room);
  return { ok: true };
}

export function connectedSet(room: Room): Set<string> {
  return new Set(room.seats.filter((s) => s.connected || s.isBot).map((s) => s.id));
}

export function botSet(room: Room): Set<string> {
  return new Set(room.seats.filter((s) => s.isBot).map((s) => s.id));
}

export function lobbyView(room: Room, youId: string): LobbyView {
  return {
    roomCode: room.code,
    sharePath: `/?sala=${room.code}`,
    hostId: room.hostId,
    youId,
    youAreHost: room.hostId === youId,
    victoryPoints: room.victoryPoints,
    seatLimit: room.seatLimit,
    boardKind: boardKindForCount(room.seats.length),
    status: "lobby",
    players: room.seats.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      connected: s.connected || s.isBot,
      isHost: s.id === room.hostId,
      isBot: s.isBot,
    })),
  };
}

export function gameView(room: Room, youId: string) {
  if (!room.game) return null;
  return toClientView(room.game, youId, {
    roomCode: room.code,
    hostId: room.hostId,
    chat: room.chat,
    connected: connectedSet(room),
    bots: botSet(room),
    deadlineAt: room.deadlineAt,
    unboxPlayerId: room.unboxPlayerId,
  });
}

export function takenColors(room: Room): ColorId[] {
  return room.seats.map((s) => s.color);
}

export function allColors(): ColorId[] {
  return [...COLORS];
}

function clearBotTimer(room: Room): void {
  if (room.botTimer) clearTimeout(room.botTimer);
  room.botTimer = null;
}

function clearRoomTimer(room: Room): void {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.deadlineAt = null;
  clearBotTimer(room);
}

function timeoutMs(room: Room): number {
  if (!room.game) return TURN_TIMEOUT_MS;
  if (room.game.phase === "descarte") return DISCARD_TIMEOUT_MS;
  return TURN_TIMEOUT_MS;
}

function expireUnboxPause(room: Room, now = Date.now()): void {
  if (room.busyUntil > 0 && now >= room.busyUntil) {
    room.busyUntil = 0;
    room.unboxPlayerId = null;
    room.unboxExtended = false;
    room.deadlineBeforeBusy = null;
  }
}

function scheduleRoomTimeout(room: Room, ms: number): void {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  const now = Date.now();
  room.deadlineAt = now + ms;
  room.timer = setTimeout(() => {
    room.timer = null;
    expireUnboxPause(room);
    if (Date.now() < room.busyUntil) {
      armRoomTimer(room);
      return;
    }
    applyIdleTimeout(room);
    broadcast(room.code);
    armRoomTimer(room);
    scheduleBots(room);
  }, ms);
}

export function armRoomTimer(room: Room, opts?: { preserveDeadline?: boolean }): void {
  expireUnboxPause(room);
  if (!room.game || room.game.phase === "fin") {
    clearRoomTimer(room);
    return;
  }
  const now = Date.now();
  let ms = timeoutMs(room);
  if (room.busyUntil > now) {
    ms = Math.max(ms, room.busyUntil - now);
  }
  if (opts?.preserveDeadline && room.timer && room.deadlineAt != null && room.deadlineAt > now) {
    if (room.busyUntil > room.deadlineAt) {
      scheduleRoomTimeout(room, room.busyUntil - now);
    }
    return;
  }
  scheduleRoomTimeout(room, ms);
}

export function setUiBusy(
  room: Room,
  playerId: string,
  busy: boolean,
): { ok: true } | { ok: false; error: string } {
  expireUnboxPause(room);
  if (room.unboxPlayerId !== playerId) {
    return { ok: false, error: "No hay una carta para abrir." };
  }
  if (busy) {
    const now = Date.now();
    if (room.unboxExtended) {
      return { ok: false, error: "La pausa ya se usó." };
    }
    if (room.busyUntil > now) {
      room.unboxExtended = true;
      return { ok: false, error: "La pausa ya está activa." };
    }
    room.unboxExtended = true;
    room.deadlineBeforeBusy = room.deadlineAt;
    room.busyUntil = now + REVEAL_PAUSE_MS;
    armRoomTimer(room, { preserveDeadline: true });
    return { ok: true };
  }
  room.busyUntil = 0;
  room.unboxPlayerId = null;
  room.unboxExtended = false;
  // Cerrar la carta no regala un turno nuevo: queda el deadline previo a la pausa.
  const before = room.deadlineBeforeBusy;
  room.deadlineBeforeBusy = null;
  const now = Date.now();
  if (room.game && room.timer && room.deadlineAt != null) {
    // Vencido pero con el timeout todavía en cola: un rearme completo regalaría 45 s.
    const target = before != null && before < room.deadlineAt ? before : room.deadlineAt;
    if (target !== room.deadlineAt || target <= now) {
      scheduleRoomTimeout(room, Math.max(target - now, UNBUSY_GRACE_MS));
    }
    return { ok: true };
  }
  armRoomTimer(room, { preserveDeadline: true });
  return { ok: true };
}

function autoAct(room: Room, playerId: string): boolean {
  if (!room.game) return false;
  return applyBotStep(room.game, playerId);
}

export function autoDiscardPlayer(room: Room, playerId: string): boolean {
  if (!room.game || room.game.phase !== "descarte") return false;
  const need = room.game.discardNeeded[playerId] ?? 0;
  if (need <= 0) return false;
  const player = room.game.players.find((p) => p.id === playerId);
  if (!player) return false;
  const res = applyAction(room.game, playerId, {
    type: "discard",
    resources: pickDiscard(player.resources, need),
  });
  if (res.ok) {
    pushChat(room, null, "Sistema", `${player.name} no descartó a tiempo: el servidor tiró sus cartas.`);
  }
  return res.ok;
}

/** Al caerse: descarte y ladrón no esperan los 45 s; un bot toma el asiento. */
export function maybeResolveDisconnect(room: Room, playerId: string): void {
  if (!room.game || room.game.phase === "fin") return;
  const seat = room.seats.find((s) => s.id === playerId);
  if (!seat || seat.isBot) return;

  const waiting = room.game.phase === "descarte" && room.game.waitingDiscard.includes(playerId);
  if (waiting) autoDiscardPlayer(room, playerId);

  const targeted = room.game.trades.some((t) => t.toId === playerId);
  const actor = currentPlayer(room.game);
  const urgent =
    waiting ||
    targeted ||
    (actor?.id === playerId && (room.game.phase === "descarte" || room.game.phase === "ladron"));
  if (!urgent) return;
  promoteToBot(room, playerId);
  scheduleBots(room);
}

function skipStuckPlayer(room: Room, playerId: string, note: string): void {
  if (!room.game) return;
  const name = room.game.players.find((p) => p.id === playerId)?.name ?? "Alguien";
  let progressed = false;
  for (let i = 0; i < 14; i++) {
    if (!room.game || room.game.phase === "fin") break;
    if (room.game.phase === "descarte") {
      if (!room.game.waitingDiscard.includes(playerId)) break;
      autoDiscardPlayer(room, playerId);
      progressed = true;
      continue;
    }
    const actor = currentPlayer(room.game);
    if (!actor || actor.id !== playerId) break;
    if (!autoAct(room, playerId)) break;
    progressed = true;
  }
  if (progressed) pushChat(room, null, "Sistema", note.replace("Alguien", name));
}

export function promoteToBot(room: Room, playerId: string): boolean {
  const seat = room.seats.find((s) => s.id === playerId);
  if (!seat || seat.isBot) return false;
  seat.isBot = true;
  seat.connected = true;
  seat.socketId = null;
  pushChat(room, null, "Sistema", `${seat.name} no volvió: entra un bot a su asiento.`);
  return true;
}

export function applyIdleTimeout(room: Room): void {
  expireUnboxPause(room);
  if (!room.game || room.game.phase === "fin") return;
  if (room.game.phase === "descarte") {
    for (const pid of [...room.game.waitingDiscard]) {
      const seat = room.seats.find((s) => s.id === pid);
      if (seat && !seat.connected && !seat.isBot) promoteToBot(room, pid);
      if (seat?.isBot) autoAct(room, pid);
      else autoDiscardPlayer(room, pid);
    }
    scheduleBots(room);
    return;
  }
  const actor = currentPlayer(room.game);
  if (!actor) return;
  const seat = room.seats.find((s) => s.id === actor.id);
  if (seat && !seat.isBot && !seat.connected) {
    promoteToBot(room, actor.id);
    scheduleBots(room);
    return;
  }
  skipStuckPlayer(room, actor.id, `${actor.name} no jugó a tiempo: el servidor siguió.`);
  scheduleBots(room);
}

function pendingBotIds(room: Room): string[] {
  if (!room.game || room.game.phase === "fin") return [];
  const bots = botSet(room);
  if (bots.size === 0) return [];
  if (room.game.phase === "descarte") {
    return room.game.waitingDiscard.filter((id) => bots.has(id));
  }
  const ids: string[] = [];
  for (const t of room.game.trades) {
    if (t.toId === "todos") {
      for (const id of bots) if (id !== t.fromId && !ids.includes(id)) ids.push(id);
    } else if (bots.has(t.toId) && t.toId !== t.fromId && !ids.includes(t.toId)) {
      ids.push(t.toId);
    }
  }
  if (ids.length) return ids;
  const actor = currentPlayer(room.game);
  if (actor && bots.has(actor.id)) return [actor.id];
  return [];
}

function stepOneBot(room: Room): boolean {
  if (!room.game || room.game.phase === "fin") return false;
  const ids = pendingBotIds(room);
  if (!ids.length) return false;
  const playerId = ids[0]!;
  return autoAct(room, playerId);
}

export function scheduleBots(room: Room): void {
  clearBotTimer(room);
  if (!room.game || room.game.phase === "fin") return;
  if (room.botDelayMs <= 0) {
    let guard = 0;
    while (stepOneBot(room) && guard++ < 20_000) {
      /* drain */
    }
    return;
  }
  if (!pendingBotIds(room).length) return;
  const setup =
    room.game.phase === "colocacion_poblado" || room.game.phase === "colocacion_camino";
  const extra = setup && room.botDelayMs > 0 ? room.botDelayMs + 400 : 0;
  const jitter = room.botDelayMs > 0 ? 80 + Math.floor(Math.random() * 180) : 0;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    const acted = stepOneBot(room);
    if (acted) {
      touch(room);
      armRoomTimer(room);
      broadcast(room.code);
    }
    scheduleBots(room);
  }, room.botDelayMs + extra + jitter);
}

export function pruneRooms(maxIdleMs = IDLE_PRUNE_MS): number {
  const now = Date.now();
  let removed = 0;
  for (const [code, room] of rooms) {
    const humansOnline = room.seats.some((s) => s.connected && !s.isBot);
    if (humansOnline) continue;
    const idle = now - room.lastActivity;
    const noHumans = !humansLeft(room);
    const limit = noHumans ? Math.min(maxIdleMs, BOT_ONLY_PRUNE_MS) : maxIdleMs;
    if (idle > limit) {
      clearRoomTimer(room);
      forgetRoom(code);
      removed += 1;
    }
  }
  for (const [key, times] of chatHits) {
    const keep = times.filter((t) => now - t < 60_000);
    if (keep.length) chatHits.set(key, keep);
    else chatHits.delete(key);
  }
  return removed;
}

export function findRoomBySocket(socketId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.seats.some((s) => s.socketId === socketId)) return room;
  }
  return undefined;
}

export function roomCount(): number {
  return rooms.size;
}

export function resetRoomsForTests(): void {
  for (const room of rooms.values()) clearRoomTimer(room);
  rooms.clear();
  for (const t of disconnectTimers.values()) clearTimeout(t);
  disconnectTimers.clear();
  lastSocketOwner.clear();
  defaultBotDelayMs = 0;
  chatHits.clear();
  resetSecurityForTests();
}

export function dropPlayer(room: Room, playerId: string): void {
  const seat = room.seats.find((s) => s.id === playerId);
  if (!seat) return;
  const sid = seat.socketId ?? `gone-${playerId}`;
  rememberSocket(room.code, playerId, sid);
  seat.socketId = sid;
  onSocketGone(sid);
}

export function allRooms(): Room[] {
  return [...rooms.values()];
}
