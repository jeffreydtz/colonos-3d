export const MAX_HTTP_BUFFER_SIZE = 100_000;
export const MAX_JSON_BYTES = 32 * 1024;
export const MAX_CONNECTIONS_PER_IP = 12;
export const MAX_ROOMS_PER_IP = 8;
export const MAX_ID_LEN = 64;
export const BOT_ONLY_PRUNE_MS = 8 * 60 * 1000;

export const ACTION_RATE = { windowMs: 5_000, max: 40 };
export const CREATE_RATE = { windowMs: 20_000, max: 5 };
/** Creates rechazados (payload o nombre inválido): cupo aparte, no gastan CREATE_RATE. */
export const CREATE_BAD_RATE = { windowMs: 60_000, max: 20 };
export const JOIN_RATE = { windowMs: 10_000, max: 8 };
export const BUSY_RATE = { windowMs: 10_000, max: 4 };

/**
 * Origen canónico como lo manda el browser: esquema y host en minúsculas, sin ruta,
 * sin barra final y sin puerto por defecto. `https://Foo.COM:443/x/` → `https://foo.com`.
 * Lo que no es un origen http(s) queda en minúsculas sin barra (y no matchea nada real).
 */
export function normalizeOrigin(value: string): string {
  const raw = value.trim();
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:") return u.origin.toLowerCase();
  } catch {
    /* no es URL */
  }
  return raw.toLowerCase().replace(/\/+$/, "");
}

/** Entradas de CORS_ORIGIN que no son un origen http(s): typo seguro, nunca van a matchear. */
export function invalidCorsEntries(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CORS_ORIGIN?.trim();
  if (!raw) return [];
  return corsParts(raw).filter((part) => {
    if (isForbiddenCorsToken(part)) return false;
    try {
      const u = new URL(part);
      return !(u.protocol === "http:" || u.protocol === "https:") || u.origin === "null";
    } catch {
      return true;
    }
  });
}

function corsParts(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isForbiddenCorsToken(value: string): boolean {
  const n = normalizeOrigin(value);
  return n === "*" || n === "true";
}

export function resolveCorsOrigin(
  env: NodeJS.ProcessEnv = process.env,
): boolean | string | string[] {
  const raw = env.CORS_ORIGIN?.trim();
  if (!raw) return false;
  const parts = corsParts(raw);
  if (parts.length === 0) return false;
  if (parts.some(isForbiddenCorsToken)) {
    if (env.NODE_ENV === "production") return false;
    return true;
  }
  return [...new Set(parts.map(normalizeOrigin))];
}

export function productionNeedsCorsOrigin(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" && !env.CORS_ORIGIN?.trim();
}

export function productionCorsForbidden(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return false;
  const raw = env.CORS_ORIGIN?.trim();
  if (!raw) return false;
  return corsParts(raw).some(isForbiddenCorsToken);
}

/** En producción sin CORS_ORIGIN, o con `*` / `true`, el proceso no arranca. */
export function assertProductionCors(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  if (productionNeedsCorsOrigin(env)) {
    throw new Error(
      "Falta CORS_ORIGIN en producción. Setealo al origen público (https://tu-dominio.com).",
    );
  }
  if (productionCorsForbidden(env)) {
    throw new Error(
      "CORS_ORIGIN=* no está permitido en producción. Setealo al origen público (https://tu-dominio.com).",
    );
  }
}

/** Vite / prepare-unbox: COLONOS_DEV se ignora si NODE_ENV=production. */
export function colonosDevEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COLONOS_DEV === "1" && env.NODE_ENV !== "production";
}

export function trustProxyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.TRUST_PROXY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function headerValue(headers: Record<string, unknown> | undefined, name: string): string {
  if (!headers) return "";
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] ?? "");
  return typeof raw === "string" ? raw : "";
}

/**
 * IP del socket. X-Forwarded-For sólo si TRUST_PROXY está activo: se usa el último hop
 * (el que agrega el proxy confiable). Sin eso, handshake.address — el primero de XFF se falsifica.
 */
export function clientIp(
  handshake: { address?: string; headers?: Record<string, unknown> },
  env: NodeJS.ProcessEnv = process.env,
): string {
  const remote = handshake.address?.trim() || "0.0.0.0";
  if (!trustProxyEnabled(env)) return remote;
  const fwd = headerValue(handshake.headers, "x-forwarded-for");
  const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
  return hops.at(-1) || remote;
}

function sameOrigin(origin: string, host: string): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.trim().toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Handshake Socket.IO / WS. Same-origin (Origin vs Host) siempre ok.
 * Sin header Origin se permite (clientes de test, smoke, native) — no es un browser.
 * Origin cruzado sólo si está en CORS_ORIGIN (normalizado). El wildcard `*`
 * no se usa en producción: assertProductionCors falla antes de escuchar.
 */
export function socketOriginAllowed(
  req: { headers?: Record<string, unknown> },
  cors: boolean | string | string[] = resolveCorsOrigin(),
): boolean {
  const origin = headerValue(req.headers, "origin").trim();
  const host = headerValue(req.headers, "host").trim();
  if (!origin) return true;
  if (sameOrigin(origin, host)) return true;
  if (cors === true) return true;
  if (cors === false) return false;
  const list = Array.isArray(cors) ? cors : [cors];
  const needle = normalizeOrigin(origin);
  return list.some((item) => normalizeOrigin(item) === needle);
}

type HitBucket = { times: number[]; blockedUntil: number };

const hits = new Map<string, HitBucket>();
const socketsByIp = new Map<string, number>();
const joinFails = new Map<string, { n: number; until: number }>();
const roomOwnerIp = new Map<string, string>();
const roomsByIp = new Map<string, number>();

function bucket(key: string): HitBucket {
  const b = hits.get(key) ?? { times: [], blockedUntil: 0 };
  hits.set(key, b);
  return b;
}

export function allowRate(
  key: string,
  windowMs: number,
  max: number,
  now = Date.now(),
): boolean {
  const b = bucket(key);
  if (now < b.blockedUntil) return false;
  b.times = b.times.filter((t) => now - t < windowMs);
  if (b.times.length >= max) return false;
  b.times.push(now);
  return true;
}

export function noteJoinFail(ip: string, now = Date.now()): number {
  const prev = joinFails.get(ip) ?? { n: 0, until: 0 };
  const n = prev.n + 1;
  const wait = Math.min(8_000, 400 * 2 ** Math.min(n, 5));
  joinFails.set(ip, { n, until: now + wait });
  return wait;
}

export function joinBackoffMs(ip: string, now = Date.now()): number {
  const prev = joinFails.get(ip);
  if (!prev || now >= prev.until) return 0;
  return prev.until - now;
}

export function clearJoinFails(ip: string): void {
  joinFails.delete(ip);
}

export function trackSocket(ip: string, delta: number): number {
  const n = Math.max(0, (socketsByIp.get(ip) ?? 0) + delta);
  if (n === 0) socketsByIp.delete(ip);
  else socketsByIp.set(ip, n);
  return n;
}

export function roomCreateAllowed(ip: string): boolean {
  if (!ip) return true;
  return (roomsByIp.get(ip) ?? 0) < MAX_ROOMS_PER_IP;
}

export function noteRoomCreate(ip: string, code: string): void {
  if (!ip || !code) return;
  const key = code.toUpperCase();
  if (roomOwnerIp.has(key)) return;
  roomOwnerIp.set(key, ip);
  roomsByIp.set(ip, (roomsByIp.get(ip) ?? 0) + 1);
}

export function noteRoomGone(code: string): void {
  const key = code.toUpperCase();
  const ip = roomOwnerIp.get(key);
  if (!ip) return;
  roomOwnerIp.delete(key);
  const n = (roomsByIp.get(ip) ?? 1) - 1;
  if (n <= 0) roomsByIp.delete(ip);
  else roomsByIp.set(ip, n);
}

export function pruneSecurity(now = Date.now()): void {
  for (const [k, b] of hits) {
    b.times = b.times.filter((t) => now - t < 60_000);
    if (b.times.length === 0 && now >= b.blockedUntil) hits.delete(k);
  }
  for (const [ip, f] of joinFails) {
    if (now >= f.until && f.n > 8) joinFails.delete(ip);
    else if (now - f.until > 10 * 60_000) joinFails.delete(ip);
  }
}

export function resetSecurityForTests(): void {
  hits.clear();
  socketsByIp.clear();
  joinFails.clear();
  roomOwnerIp.clear();
  roomsByIp.clear();
}

export { hits as _hitsForTests };
