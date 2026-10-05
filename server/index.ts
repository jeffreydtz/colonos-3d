import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type { Action } from "../shared/types.ts";
import {
  addBot,
  bindSocket,
  createRoom,
  findRoomBySocket,
  gameView,
  getRoom,
  joinRoom,
  leaveRoom,
  lobbyView,
  play,
  prepareDevUnbox,
  pruneRooms,
  pushChat,
  rememberSocket,
  removeBot,
  scheduleDisconnect,
  setBroadcast,
  setSeatLimit,
  setUiBusy,
  startGame,
  type Room,
  type Seat,
} from "./rooms.ts";
import { buildArtView, isArtSceneId } from "./devFixtures.ts";
import { extractChatBody } from "../shared/chat.ts";
import { cleanPlayerName } from "../shared/names.ts";
import { parseAction, parseAddBotPayload, parseCreatePayload, parseRemoveBotPayload, parseSeatLimitPayload, splitAck } from "./validate.ts";
import {
  ACTION_RATE,
  BUSY_RATE,
  CREATE_BAD_RATE,
  CREATE_RATE,
  JOIN_RATE,
  MAX_CONNECTIONS_PER_IP,
  MAX_HTTP_BUFFER_SIZE,
  MAX_JSON_BYTES,
  allowRate,
  assertProductionCors,
  clearJoinFails,
  clientIp,
  colonosDevEnabled,
  invalidCorsEntries,
  joinBackoffMs,
  noteJoinFail,
  pruneSecurity,
  resolveCorsOrigin,
  roomCreateAllowed,
  socketOriginAllowed,
  trackSocket,
} from "./security.ts";

const PORT = Number(process.env.PORT ?? 43211);
const CORS_ORIGIN = resolveCorsOrigin();
if (!process.env.VITEST) {
  assertProductionCors(process.env);
  const bad = invalidCorsEntries(process.env);
  if (bad.length) {
    console.warn(`CORS_ORIGIN tiene entradas que no son un origen http(s) y no van a matchear: ${bad.join(", ")}`);
  }
}

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: MAX_JSON_BYTES }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, game: "colonos" });
});

if (colonosDevEnabled()) {
  app.get("/api/dev/scene", (req, res) => {
    const id = typeof req.query.id === "string" ? req.query.id : "";
    const seed = Number(req.query.seed ?? 42);
    if (!isArtSceneId(id)) {
      res.status(400).json({ ok: false, error: "escena inválida" });
      return;
    }
    const nPlayers = Number(req.query.players);
    const view = buildArtView(
      id,
      Number.isFinite(seed) ? seed : 42,
      Number.isFinite(nPlayers) ? nPlayers : undefined,
    );
    res.json({ ok: true, view });
  });
  app.post("/api/dev/prepare-unbox", (req, res) => {
    const code = typeof req.body?.code === "string" ? req.body.code.toUpperCase() : "";
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const room = code ? getRoom(code) : undefined;
    if (!room || !token) {
      res.status(400).json({ ok: false, error: "Falta sala o token." });
      return;
    }
    const seat = room.seats.find((s) => s.token === token && !s.isBot);
    if (!seat) {
      res.status(404).json({ ok: false, error: "No estás en esa mesa." });
      return;
    }
    const result = prepareDevUnbox(room, seat.id);
    if (result.ok) emitRoom(room.code);
    res.json(result);
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] },
  maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE,
  allowRequest: (req, fn) => {
    fn(null, socketOriginAllowed(req));
  },
});

function emitRoom(code: string): void {
  const room = getRoom(code);
  if (!room) return;
  for (const seat of room.seats) {
    if (!seat.socketId) continue;
    if (room.game) {
      io.to(seat.socketId).emit("view", gameView(room, seat.id));
    } else {
      io.to(seat.socketId).emit("lobby", lobbyView(room, seat.id));
    }
  }
}

setBroadcast(emitRoom);

function chatText(data: unknown): string {
  return extractChatBody(data);
}

function seatForSocket(
  socket: { id: string; join: (room: string) => void },
  payload: unknown,
): { room: Room; seat: Seat } | null {
  const bySock = findRoomBySocket(socket.id);
  if (bySock) {
    const seat = bySock.seats.find((s) => s.socketId === socket.id);
    if (seat) return { room: bySock, seat };
  }
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  const token = typeof rec.token === "string" ? rec.token : "";
  const code = typeof rec.code === "string" ? rec.code : "";
  if (!token || !code) return null;
  const room = getRoom(code);
  if (!room) return null;
  const seat = room.seats.find((s) => s.token === token && !s.isBot);
  if (!seat) return null;
  bindSocket(room, seat.id, socket.id);
  rememberSocket(room.code, seat.id, socket.id);
  socket.join(room.code);
  return { room, seat };
}

function clientAddr(socket: { handshake: { address: string; headers: Record<string, unknown> } }): string {
  return clientIp(socket.handshake);
}

function safe(handler: (data: unknown, ack: (r: unknown) => void) => void) {
  return (payload: unknown, cb?: unknown) => {
    const { data, ack } = splitAck(payload, cb);
    try {
      handler(data, ack);
    } catch (err) {
      console.error(err);
      ack({ ok: false, error: "Esa jugada no se pudo procesar." });
    }
  };
}

io.on("connection", (socket) => {
  const ip = clientAddr(socket);
  if (trackSocket(ip, 1) > MAX_CONNECTIONS_PER_IP) {
    trackSocket(ip, -1);
    socket.disconnect(true);
    return;
  }

  socket.on(
    "create",
    safe((payload, ack) => {
      const preview = parseCreatePayload(payload);
      const named = preview.ok ? cleanPlayerName(preview.value.name, "Anfitrión") : null;
      if (!preview.ok || !named?.ok) {
        if (!allowRate(`create-bad:${ip}`, CREATE_BAD_RATE.windowMs, CREATE_BAD_RATE.max)) {
          return ack({ ok: false, error: "Demasiados intentos fallidos de crear mesa. Esperá un minuto." });
        }
        return ack(!preview.ok ? preview : named!);
      }
      if (!allowRate(`create:${ip}`, CREATE_RATE.windowMs, CREATE_RATE.max) || !roomCreateAllowed(ip)) {
        return ack({ ok: false, error: "Demasiadas mesas seguidas. Esperá un toque." });
      }
      const created = createRoom(payload, { ip });
      if (!created.ok) {
        ack(created);
        return;
      }
      const { room, token, playerId } = created;
      bindSocket(room, playerId, socket.id);
      rememberSocket(room.code, playerId, socket.id);
      socket.join(room.code);
      ack({ ok: true, token, playerId, code: room.code, lobby: lobbyView(room, playerId) });
      emitRoom(room.code);
    }),
  );

  socket.on(
    "join",
    safe((payload, ack) => {
      const wait = joinBackoffMs(ip);
      if (wait > 0) {
        return ack({ ok: false, error: "Esperá un toque y volvé a entrar." });
      }
      if (!allowRate(`join:${ip}`, JOIN_RATE.windowMs, JOIN_RATE.max)) {
        noteJoinFail(ip);
        return ack({ ok: false, error: "Demasiados intentos de entrar." });
      }
      const result = joinRoom(payload);
      if (!result.ok) {
        noteJoinFail(ip);
        ack(result);
        return;
      }
      clearJoinFails(ip);
      bindSocket(result.room, result.playerId, socket.id);
      rememberSocket(result.room.code, result.playerId, socket.id);
      socket.join(result.room.code);
      ack({
        ok: true,
        token: result.token,
        playerId: result.playerId,
        code: result.room.code,
        lobby: result.room.game ? null : lobbyView(result.room, result.playerId),
        view: result.room.game ? gameView(result.room, result.playerId) : null,
      });
      emitRoom(result.room.code);
    }),
  );

  socket.on(
    "start",
    safe((payload, ack) => {
      const bound = seatForSocket(socket, payload);
      if (!bound) return ack({ ok: false, error: "No estás en una sala." });
      const result = startGame(bound.room, bound.seat.id);
      if (!result.ok) return ack(result);
      const view = gameView(bound.room, bound.seat.id);
      ack({ ...result, view });
      emitRoom(bound.room.code);
    }),
  );

  socket.on(
    "add_bot",
    safe((payload, ack) => {
      const bound = seatForSocket(socket, payload);
      if (!bound) return ack({ ok: false, error: "No estás en una sala." });
      const parsed = parseAddBotPayload(payload);
      if (!parsed.ok) return ack(parsed);
      const result = addBot(bound.room, bound.seat.id, parsed.value);
      ack(result);
      emitRoom(bound.room.code);
    }),
  );

  socket.on(
    "remove_bot",
    safe((payload, ack) => {
      const bound = seatForSocket(socket, payload);
      if (!bound) return ack({ ok: false, error: "No estás en una sala." });
      const parsed = parseRemoveBotPayload(payload);
      if (!parsed.ok) return ack(parsed);
      const result = removeBot(bound.room, bound.seat.id, parsed.value.botId);
      ack(result);
      emitRoom(bound.room.code);
    }),
  );

  socket.on(
    "set_seats",
    safe((payload, ack) => {
      const bound = seatForSocket(socket, payload);
      if (!bound) return ack({ ok: false, error: "No estás en una sala." });
      const parsed = parseSeatLimitPayload(payload);
      if (!parsed.ok) return ack(parsed);
      const result = setSeatLimit(bound.room, bound.seat.id, parsed.value.seatLimit);
      ack(result);
      emitRoom(bound.room.code);
    }),
  );

  socket.on(
    "leave",
    safe((payload, ack) => {
      const bound = seatForSocket(socket, payload);
      if (!bound) return ack({ ok: false, error: "No estás en una sala." });
      const code = bound.room.code;
      const result = leaveRoom(bound.room, bound.seat.id, { forfeit: true });
      socket.leave(code);
      ack(result);
      emitRoom(code);
    }),
  );

  socket.on(
    "action",
    safe((payload, ack) => {
      if (!allowRate(`act:${ip}`, ACTION_RATE.windowMs, ACTION_RATE.max)) {
        return ack({ ok: false, error: "Más despacio con las jugadas." });
      }
      const parsed = parseAction(payload);
      if (!parsed.ok) return ack(parsed);
      const action: Action = parsed.value;
      const bound = seatForSocket(socket, payload);
      if (!bound) return ack({ ok: false, error: "No estás en una sala." });
      const result = play(bound.room, bound.seat.id, action);
      ack(result);
      emitRoom(bound.room.code);
      if (result.ok && "animations" in result && result.animations) {
        io.to(bound.room.code).emit("fx", { animations: result.animations, action: action.type });
      }
    }),
  );

  socket.on("chat", (text: unknown, cb?: unknown) => {
    try {
      const { data, ack } = splitAck(text, cb);
      const bound = seatForSocket(socket, data);
      if (!bound) return ack({ ok: false, error: "No estás en una sala." });
      if (!allowRate(`chat:${ip}`, 8_000, 8)) {
        return ack({ ok: false, error: "Más despacio con el chat." });
      }
      const result = pushChat(bound.room, bound.seat.id, bound.seat.name, chatText(data), bound.seat.color);
      ack(result);
      if (result.ok) emitRoom(bound.room.code);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on("busy", (payload: unknown, cb?: unknown) => {
    const { data, ack } = splitAck(payload, cb);
    const bound = seatForSocket(socket, data);
    if (!bound) return ack({ ok: false, error: "No estás en una sala." });
    if (!allowRate(`busy:${ip}`, BUSY_RATE.windowMs, BUSY_RATE.max)) {
      return ack({ ok: false, error: "Más despacio con la pausa." });
    }
    const busy = Boolean(data && typeof data === "object" && (data as { busy?: unknown }).busy);
    const result = setUiBusy(bound.room, bound.seat.id, busy);
    // También si se rechaza: la pausa pudo vencer en este mismo llamado y los demás
    // siguen viendo el sobre cerrado o un reloj viejo.
    emitRoom(bound.room.code);
    ack(result);
  });

  socket.on("disconnect", () => {
    trackSocket(ip, -1);
    scheduleDisconnect(socket.id);
  });
});

setInterval(() => {
  pruneRooms();
  pruneSecurity();
}, 2 * 60 * 1000);

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");

async function attachClient(): Promise<void> {
  const lifecycle = process.env.npm_lifecycle_event ?? "";
  const useVite =
    colonosDevEnabled() ||
    (process.env.NODE_ENV !== "production" &&
      (lifecycle === "dev" || lifecycle === "dev:server" || !fs.existsSync(dist)));

  if (useVite) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.resolve(here, "../vite.config.ts"),
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer, path: "/__vite_hmr" },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    return;
  }

  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
    return;
  }

  app.get("/", (_req, res) => {
    res.type("html").send(
      `<p>Colonos API en el puerto ${PORT}. Levantá el cliente con <code>npm run dev</code> o hacé <code>npm run build</code>.</p>`,
    );
  });
}

if (process.env.VITEST) {
  // Los tests levantan el httpServer a mano.
} else {
  void attachClient().then(() => {
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`Colonos listo en http://0.0.0.0:${PORT}`);
    });
  });
}

export { app, httpServer, io, PORT };
