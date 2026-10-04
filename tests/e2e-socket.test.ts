import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import { httpServer } from "../server/index.ts";
import { resetRoomsForTests } from "../server/rooms.ts";
import { resetSecurityForTests, CREATE_BAD_RATE, CREATE_RATE } from "../server/security.ts";
import type { ClientView, ColorId } from "../shared/types.ts";

const colors: ColorId[] = ["rojo", "azul", "naranja", "blanco", "verde", "marron"];

function emitAck<T>(socket: Socket, ev: string, payload?: unknown): Promise<T> {
  return new Promise((resolve) => {
    if (payload === undefined) socket.emit(ev, resolve);
    else socket.emit(ev, payload, resolve);
  });
}

describe("e2e socket 6 clientes", () => {
  let url = "";
  const sockets: Socket[] = [];

  beforeAll(async () => {
    resetRoomsForTests();
    await new Promise<void>((res) => {
      httpServer.listen(0, "127.0.0.1", () => res());
    });
    const addr = httpServer.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    url = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    for (const s of sockets) s.close();
    await new Promise<void>((res) => httpServer.close(() => res()));
    resetRoomsForTests();
  });

  it("crea mesa de 6, chatea, arranca isla grande y no filtra compras", async () => {
    const views: Array<ClientView | null> = Array.from({ length: 6 }, () => null);
    for (let i = 0; i < 6; i++) {
      const s = io(url, { transports: ["websocket"] });
      sockets.push(s);
      await new Promise<void>((res, rej) => {
        s.on("connect", () => res());
        s.on("connect_error", rej);
      });
      s.on("view", (v: ClientView) => {
        views[i] = v;
      });
    }

    const created = await emitAck<{ ok: boolean; code?: string; error?: string }>(sockets[0]!, "create", {
      name: "Luz",
      color: colors[0],
      victoryPoints: 10,
      seatLimit: 6,
    });
    expect(created.ok).toBe(true);
    const code = created.code!;

    for (let i = 1; i < 6; i++) {
      const r = await emitAck<{ ok: boolean; error?: string }>(sockets[i]!, "join", {
        code,
        name: `J${i}`,
        color: colors[i],
      });
      expect(r.ok).toBe(true);
    }

    const chat = await emitAck<{ ok: boolean; error?: string }>(sockets[0]!, "chat", "vamos :D");
    expect(chat.ok).toBe(true);

    const started = await emitAck<{ ok: boolean; error?: string }>(sockets[0]!, "start");
    expect(started.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 200));
    const v0 = views[0];
    expect(v0?.players.length).toBe(6);
    expect(v0?.hexes.length).toBe(30);
    expect(v0?.boardKind).toBe("expansion");
    expect(v0?.chat.some((c) => c.text.includes("😄") || c.text.includes("vamos"))).toBe(true);
    expect(v0?.chat[0]?.color === "rojo" || v0?.players[0]?.color === "rojo").toBe(true);

    const spam = [];
    for (let i = 0; i < 8; i++) {
      spam.push(emitAck<{ ok: boolean }>(sockets[1]!, "chat", `spam ${i}`));
    }
    const results = await Promise.all(spam);
    expect(results.some((r) => !r.ok)).toBe(true);
  });

  it("anfitrión reconecta en lobby con bots y arranca con el token", async () => {
    const host = io(url, { transports: ["websocket"] });
    sockets.push(host);
    await new Promise<void>((res, rej) => {
      host.on("connect", () => res());
      host.on("connect_error", rej);
    });
    const created = await emitAck<{ ok: boolean; code?: string; token?: string }>(host, "create", {
      name: "Luz",
      color: "rojo",
      victoryPoints: 10,
      seatLimit: 3,
    });
    expect(created.ok).toBe(true);
    const code = created.code!;
    const token = created.token!;
    expect((await emitAck<{ ok: boolean }>(host, "add_bot", {})).ok).toBe(true);
    expect((await emitAck<{ ok: boolean }>(host, "add_bot", {})).ok).toBe(true);
    host.disconnect();

    const again = io(url, { transports: ["websocket"] });
    sockets.push(again);
    await new Promise<void>((res, rej) => {
      again.on("connect", () => res());
      again.on("connect_error", rej);
    });
    const started = await emitAck<{ ok: boolean; error?: string }>(again, "start", { token, code });
    expect(started.ok).toBe(true);
  });

  it("Origin cruzado forjado no conecta; sin Origin sí", async () => {
    const evil = io(url, {
      transports: ["websocket"],
      extraHeaders: { Origin: "https://evil.example" },
      reconnection: false,
      timeout: 4000,
    });
    const evilErr = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 3500);
      evil.on("connect", () => {
        clearTimeout(t);
        resolve(false);
      });
      evil.on("connect_error", () => {
        clearTimeout(t);
        resolve(true);
      });
    });
    evil.close();
    expect(evilErr).toBe(true);

    const clean = io(url, { transports: ["websocket"], reconnection: false });
    sockets.push(clean);
    await new Promise<void>((res, rej) => {
      clean.on("connect", () => res());
      clean.on("connect_error", rej);
    });
    expect(clean.connected).toBe(true);
  });

  it("busy no se puede spamear para alargar el turno; dos sockets del asiento", async () => {
    resetSecurityForTests();
    const a = io(url, { transports: ["websocket"] });
    const b = io(url, { transports: ["websocket"] });
    sockets.push(a, b);
    await Promise.all(
      [a, b].map(
        (s) =>
          new Promise<void>((res, rej) => {
            s.on("connect", () => res());
            s.on("connect_error", rej);
          }),
      ),
    );
    const created = await emitAck<{ ok: boolean; code?: string; token?: string; playerId?: string }>(a, "create", {
      name: "Luz",
      color: "rojo",
      seatLimit: 3,
    });
    expect(created.ok).toBe(true);
    const code = created.code!;
    const token = created.token!;
    await emitAck(b, "join", { code, name: "Luz", color: "rojo", token });
    const raced = await Promise.all([
      emitAck<{ ok: boolean }>(a, "busy", { busy: true, token, code }),
      emitAck<{ ok: boolean }>(b, "busy", { busy: true, token, code }),
    ]);
    expect(raced.every((r) => !r.ok)).toBe(true);
    const again = await emitAck<{ ok: boolean }>(a, "busy", { busy: true, token, code });
    expect(again.ok).toBe(false);
  });

  it("create con nombre reservado no consume CREATE_RATE", async () => {
    resetSecurityForTests();
    const s = io(url, { transports: ["websocket"] });
    sockets.push(s);
    await new Promise<void>((res, rej) => {
      s.on("connect", () => res());
      s.on("connect_error", rej);
    });
    for (let i = 0; i < CREATE_RATE.max + 2; i++) {
      const r = await emitAck<{ ok: boolean; error?: string }>(s, "create", {
        name: "Sistema",
        color: "rojo",
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/reservado/);
    }
    const ok = await emitAck<{ ok: boolean; error?: string }>(s, "create", {
      name: "Luz",
      color: "rojo",
      seatLimit: 3,
    });
    expect(ok.ok).toBe(true);
  });

  it("creates inválidos tienen su propio tope y no bloquean el create válido", async () => {
    resetSecurityForTests();
    const s = io(url, { transports: ["websocket"] });
    sockets.push(s);
    await new Promise<void>((res, rej) => {
      s.on("connect", () => res());
      s.on("connect_error", rej);
    });
    for (let i = 0; i < CREATE_BAD_RATE.max; i++) {
      const r = await emitAck<{ ok: boolean; error?: string }>(s, "create", { name: "Sistema", color: "rojo" });
      expect(r.error).toMatch(/reservado/);
    }
    const capped = await emitAck<{ ok: boolean; error?: string }>(s, "create", { color: 42 });
    expect(capped.ok).toBe(false);
    expect(capped.error).toMatch(/Demasiados intentos fallidos/);
    const ok = await emitAck<{ ok: boolean }>(s, "create", { name: "Luz", color: "rojo", seatLimit: 3 });
    expect(ok.ok).toBe(true);
  });

  it("busy rechazado igual reenvía el estado de la sala", async () => {
    resetSecurityForTests();
    const s = io(url, { transports: ["websocket"] });
    sockets.push(s);
    await new Promise<void>((res, rej) => {
      s.on("connect", () => res());
      s.on("connect_error", rej);
    });
    const created = await emitAck<{ ok: boolean; code?: string; token?: string }>(s, "create", {
      name: "Luz",
      color: "rojo",
      seatLimit: 3,
    });
    expect(created.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    let pushes = 0;
    s.on("lobby", () => {
      pushes += 1;
    });
    const r = await emitAck<{ ok: boolean }>(s, "busy", { busy: false, token: created.token, code: created.code });
    expect(r.ok).toBe(false);
    await new Promise((res) => setTimeout(res, 80));
    expect(pushes).toBeGreaterThanOrEqual(1);
  });
});
