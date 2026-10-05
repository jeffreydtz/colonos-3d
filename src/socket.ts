import { io, type Socket } from "socket.io-client";
import type { Action, ClientView, ColorId, DevKind, LobbyView } from "@shared/types";

function sessionAck(): { token?: string; code?: string } {
  const session = loadSession();
  if (!session) return {};
  return { token: session.token, code: session.code };
}

/** Mismo origen: en dev el servidor monta Vite y Socket.IO en el mismo puerto. */
export const socket: Socket = io({
  autoConnect: true,
  path: "/socket.io",
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 400,
  timeout: 12_000,
});

export function createSala(
  name: string,
  color: ColorId,
  victoryPoints: number,
  seatLimit = 6,
): Promise<{
  ok: boolean;
  token?: string;
  playerId?: string;
  code?: string;
  lobby?: LobbyView;
  error?: string;
}> {
  return new Promise((resolve) => {
    socket.emit("create", { name, color, victoryPoints, seatLimit }, resolve);
  });
}

export function addBotSala(opts?: { name?: string; color?: ColorId }): Promise<{ ok: boolean; botId?: string; error?: string }> {
  return new Promise((resolve) => socket.emit("add_bot", { ...sessionAck(), ...opts }, resolve));
}

export function removeBotSala(botId: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => socket.emit("remove_bot", { ...sessionAck(), botId }, resolve));
}

export function setSeatsSala(seatLimit: number): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => socket.emit("set_seats", { ...sessionAck(), seatLimit }, resolve));
}

export function joinSala(opts: {
  code: string;
  name: string;
  color: ColorId;
  token?: string;
}): Promise<{
  ok: boolean;
  token?: string;
  playerId?: string;
  code?: string;
  lobby?: LobbyView | null;
  view?: ClientView | null;
  error?: string;
}> {
  return new Promise((resolve) => {
    socket.emit("join", opts, resolve);
  });
}

export function startSala(): Promise<{ ok: boolean; error?: string; view?: ClientView | null }> {
  return new Promise((resolve) => socket.emit("start", sessionAck(), resolve));
}

export function leaveSala(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => socket.emit("leave", sessionAck(), resolve));
}

export function sendAction(
  action: Action,
): Promise<{ ok: boolean; error?: string; animations?: string[]; reveal?: DevKind }> {
  return new Promise((resolve) => socket.emit("action", { ...sessionAck(), ...action }, resolve));
}

export function sendChat(text: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => socket.emit("chat", { ...sessionAck(), text }, resolve));
}

export function setBusy(busy: boolean): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => socket.emit("busy", { ...sessionAck(), busy }, resolve));
}

const LAST_KEY = "colonos.lastRoom";
const sessionKey = (code: string) => `colonos.session.${code.toUpperCase()}`;

export interface Session {
  code: string;
  token: string;
  name: string;
  color: ColorId;
}

export function saveSession(code: string, token: string, name: string, color: ColorId): void {
  const session: Session = { code: code.toUpperCase(), token, name, color };
  localStorage.setItem(sessionKey(session.code), JSON.stringify(session));
  localStorage.setItem(LAST_KEY, session.code);
}

export function loadSession(code?: string): Session | null {
  try {
    const room = (code || localStorage.getItem(LAST_KEY) || "").toUpperCase();
    if (!room) return null;
    const raw = localStorage.getItem(sessionKey(room));
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(code?: string): void {
  try {
    const last = (localStorage.getItem(LAST_KEY) || "").toUpperCase();
    const room = (code || last).toUpperCase();
    if (room) localStorage.removeItem(sessionKey(room));
    if (!code || last === room) localStorage.removeItem(LAST_KEY);
  } catch {
    /* private mode */
  }
}

export async function exitMesa(): Promise<void> {
  try {
    await leaveSala();
  } catch {
    /* igual volvemos al inicio */
  }
  clearSession();
}
