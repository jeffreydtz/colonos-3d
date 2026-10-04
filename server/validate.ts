import { MAX_PLAYERS, MIN_PLAYERS } from "../shared/constants.ts";
import { COLORS, RESOURCES } from "../shared/types.ts";
import type { Action, ColorId, Resource, Resources } from "../shared/types.ts";
import { MAX_ID_LEN } from "./security.ts";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown, max = 80): string | null {
  if (typeof v !== "string") return null;
  if (v.length === 0) return null;
  if (v.length > max) return null;
  return v;
}

export function parseResourceBag(raw: unknown): ParseResult<Partial<Resources>> {
  if (!isRecord(raw)) {
    return { ok: false, error: "Faltan los recursos de la jugada." };
  }
  const out: Partial<Resources> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!(RESOURCES as string[]).includes(key)) {
      return { ok: false, error: "Hay un recurso que no existe." };
    }
    if (typeof val !== "number" || !Number.isInteger(val) || val < 0) {
      return { ok: false, error: "Las cantidades tienen que ser enteros de 0 para arriba." };
    }
    if (val > 99) {
      return { ok: false, error: "Esa cantidad de cartas no cierra." };
    }
    if (val > 0) out[key as Resource] = val;
  }
  return { ok: true, value: out };
}

export function parseResource(raw: unknown): ParseResult<Resource> {
  if (typeof raw !== "string" || !(RESOURCES as string[]).includes(raw)) {
    return { ok: false, error: "Ese recurso no existe." };
  }
  return { ok: true, value: raw as Resource };
}

function needString(raw: unknown, field: string): ParseResult<string> {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: `Falta ${field}.` };
  }
  if (raw.length > 64) {
    return { ok: false, error: "Ese identificador no vale." };
  }
  return { ok: true, value: raw };
}

export function parseCreatePayload(raw: unknown): ParseResult<{
  name: string;
  color: ColorId;
  victoryPoints?: number;
  seatLimit?: number;
}> {
  if (raw == null || typeof raw === "function") {
    return { ok: false, error: "Faltan nombre y color para crear la mesa." };
  }
  if (!isRecord(raw)) {
    return { ok: false, error: "Faltan nombre y color para crear la mesa." };
  }
  if (typeof raw.color !== "string" || !(COLORS as string[]).includes(raw.color)) {
    return { ok: false, error: "Elegí un color válido." };
  }
  if (typeof raw.name === "string" && raw.name.length > 40) {
    return { ok: false, error: "Ese nombre es demasiado largo." };
  }
  const name = typeof raw.name === "string" ? raw.name : "";
  let victoryPoints: number | undefined;
  if (raw.victoryPoints != null) {
    if (typeof raw.victoryPoints !== "number" || !Number.isInteger(raw.victoryPoints)) {
      return { ok: false, error: "Los puntos para ganar tienen que ser un número entero." };
    }
    victoryPoints = raw.victoryPoints;
  }
  let seatLimit: number | undefined;
  if (raw.seatLimit != null) {
    if (typeof raw.seatLimit !== "number" || !Number.isInteger(raw.seatLimit)) {
      return { ok: false, error: "La cantidad de asientos tiene que ser un entero." };
    }
    if (raw.seatLimit < MIN_PLAYERS || raw.seatLimit > MAX_PLAYERS) {
      return { ok: false, error: `La mesa es de ${MIN_PLAYERS} a ${MAX_PLAYERS} asientos.` };
    }
    seatLimit = raw.seatLimit;
  }
  return {
    ok: true,
    value: { name, color: raw.color as ColorId, victoryPoints, seatLimit },
  };
}

export function parseSeatLimitPayload(raw: unknown): ParseResult<{ seatLimit: number }> {
  if (!isRecord(raw) || typeof raw.seatLimit !== "number" || !Number.isInteger(raw.seatLimit)) {
    return { ok: false, error: "Indicá cuántos asientos (3 a 6)." };
  }
  if (raw.seatLimit < MIN_PLAYERS || raw.seatLimit > MAX_PLAYERS) {
    return { ok: false, error: `La mesa es de ${MIN_PLAYERS} a ${MAX_PLAYERS} asientos.` };
  }
  return { ok: true, value: { seatLimit: raw.seatLimit } };
}

export function parseAddBotPayload(raw: unknown): ParseResult<{ name?: string; color?: ColorId }> {
  if (raw == null || typeof raw === "function") return { ok: true, value: {} };
  if (!isRecord(raw)) return { ok: false, error: "Ese bot no cierra." };
  const name = typeof raw.name === "string" ? raw.name : undefined;
  let color: ColorId | undefined;
  if (raw.color != null) {
    if (typeof raw.color !== "string" || !(COLORS as string[]).includes(raw.color)) {
      return { ok: false, error: "Elegí un color válido para el bot." };
    }
    color = raw.color as ColorId;
  }
  return { ok: true, value: { name, color } };
}

export function parseRemoveBotPayload(raw: unknown): ParseResult<{ botId: string }> {
  if (!isRecord(raw) || typeof raw.botId !== "string" || !raw.botId) {
    return { ok: false, error: "Falta el bot a sacar." };
  }
  if (raw.botId.length > 64) {
    return { ok: false, error: "Ese identificador no vale." };
  }
  return { ok: true, value: { botId: raw.botId } };
}

export function parseJoinPayload(raw: unknown): ParseResult<{
  code: string;
  name: string;
  color: ColorId;
  token?: string;
}> {
  if (raw == null || typeof raw === "function" || !isRecord(raw)) {
    return { ok: false, error: "Faltan el código, el nombre y el color." };
  }
  const code = asString(raw.code, 12);
  if (!code) return { ok: false, error: "Falta el código de la sala." };
  if (typeof raw.color !== "string" || !(COLORS as string[]).includes(raw.color)) {
    return { ok: false, error: "Elegí un color válido." };
  }
  if (typeof raw.name === "string" && raw.name.length > 40) {
    return { ok: false, error: "Ese nombre es demasiado largo." };
  }
  const name = typeof raw.name === "string" ? raw.name : "";
  if (typeof raw.token === "string") {
    if (raw.token.length > MAX_ID_LEN) {
      return { ok: false, error: "Ese identificador no vale." };
    }
    if (raw.token.length >= 8) {
      return { ok: true, value: { code, name, color: raw.color as ColorId, token: raw.token } };
    }
  }
  return { ok: true, value: { code, name, color: raw.color as ColorId } };
}

export function parseAction(raw: unknown): ParseResult<Action> {
  if (!isRecord(raw) || typeof raw.type !== "string") {
    return { ok: false, error: "Esa jugada no existe." };
  }
  const type = raw.type;
  switch (type) {
    case "place_settlement":
    case "build_settlement":
    case "build_city": {
      const vertexId = needString(raw.vertexId, "el vértice");
      if (!vertexId.ok) return vertexId;
      return { ok: true, value: { type, vertexId: vertexId.value } };
    }
    case "place_road":
    case "build_road": {
      const edgeId = needString(raw.edgeId, "el camino");
      if (!edgeId.ok) return edgeId;
      return { ok: true, value: { type, edgeId: edgeId.value } };
    }
    case "roll":
    case "buy_dev":
    case "play_road_building":
    case "cancel_trades":
    case "end_turn":
      return { ok: true, value: { type } };
    case "discard": {
      const resources = parseResourceBag(raw.resources);
      if (!resources.ok) return resources;
      return { ok: true, value: { type, resources: resources.value } };
    }
    case "move_robber":
    case "play_knight": {
      const hexId = needString(raw.hexId, "el hexágono");
      if (!hexId.ok) return hexId;
      let stealFromId: string | null = null;
      if (raw.stealFromId != null && raw.stealFromId !== "") {
        const who = needString(raw.stealFromId, "a quién le robás");
        if (!who.ok) return who;
        stealFromId = who.value;
      }
      return { ok: true, value: { type, hexId: hexId.value, stealFromId } };
    }
    case "play_year_plenty": {
      const pair = raw.resources;
      if (!Array.isArray(pair) || pair.length !== 2) {
        return { ok: false, error: "Invento pide dos recursos." };
      }
      const a = parseResource(pair[0]);
      const b = parseResource(pair[1]);
      if (!a.ok) return a;
      if (!b.ok) return b;
      return { ok: true, value: { type, resources: [a.value, b.value] } };
    }
    case "play_monopoly": {
      const resource = parseResource(raw.resource);
      if (!resource.ok) return resource;
      return { ok: true, value: { type, resource: resource.value } };
    }
    case "offer_trade": {
      const give = parseResourceBag(raw.give);
      if (!give.ok) return give;
      const want = parseResourceBag(raw.want);
      if (!want.ok) return want;
      if (raw.toId !== "todos") {
        if (typeof raw.toId !== "string" || raw.toId.length === 0) {
          return { ok: false, error: "Falta a quién le ofrecés." };
        }
        if (raw.toId.length > MAX_ID_LEN) {
          return { ok: false, error: "Ese identificador no vale." };
        }
      }
      return {
        ok: true,
        value: { type, toId: raw.toId as string | "todos", give: give.value, want: want.value },
      };
    }
    case "counter_trade": {
      const tradeId = needString(raw.tradeId, "la oferta");
      if (!tradeId.ok) return tradeId;
      const give = parseResourceBag(raw.give);
      if (!give.ok) return give;
      const want = parseResourceBag(raw.want);
      if (!want.ok) return want;
      return { ok: true, value: { type, tradeId: tradeId.value, give: give.value, want: want.value } };
    }
    case "accept_trade":
    case "reject_trade": {
      const tradeId = needString(raw.tradeId, "la oferta");
      if (!tradeId.ok) return tradeId;
      return { ok: true, value: { type, tradeId: tradeId.value } };
    }
    case "bank_trade": {
      const give = parseResourceBag(raw.give);
      if (!give.ok) return give;
      const want = parseResourceBag(raw.want);
      if (!want.ok) return want;
      return { ok: true, value: { type, give: give.value, want: want.value } };
    }
    default:
      return { ok: false, error: "Esa jugada no existe." };
  }
}

export function splitAck(payload: unknown, cb?: unknown): { data: unknown; ack: (r: unknown) => void } {
  if (typeof payload === "function") {
    return { data: undefined, ack: payload as (r: unknown) => void };
  }
  const ack = typeof cb === "function" ? (cb as (r: unknown) => void) : () => {};
  return { data: payload, ack };
}
