import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import { httpServer } from "../server/index.ts";
import { resetRoomsForTests } from "../server/rooms.ts";
import { resetSecurityForTests } from "../server/security.ts";
import type { ClientView, ColorId, KickoffInfo } from "../shared/types.ts";
import { acceptLobby, gameViewPatch, kickoffKey } from "../src/play/kickoff.ts";

const colors: ColorId[] = ["rojo", "azul", "naranja", "blanco", "verde", "marron"];

function emitAck<T>(socket: Socket, ev: string, payload?: unknown): Promise<T> {
  return new Promise((resolve) => {
    if (payload === undefined) socket.emit(ev, resolve);
    else socket.emit(ev, payload, resolve);
  });
}

describe("transición de arranque", () => {
  it("un lobby tardío de la misma sala no pisa la partida", () => {
    const view = { roomCode: "ABC", status: "playing" as const };
    expect(acceptLobby(view, { roomCode: "ABC" })).toBe(false);
    expect(acceptLobby(view, { roomCode: "OTRA" })).toBe(true);
    expect(acceptLobby(null, { roomCode: "ABC" })).toBe(true);
    expect(acceptLobby({ roomCode: "ABC", status: "ended" }, { roomCode: "ABC" })).toBe(false);
  });

  it("el cartel se arma una sola vez por mesa", () => {
    const kickoff: KickoffInfo = {
      starterId: "a",
      boardKind: "standard",
      order: [
        { id: "a", name: "Luz", color: "rojo", isBot: false },
        { id: "b", name: "Tomi", color: "azul", isBot: true },
      ],
    };
    const view = {
      roomCode: "ABC",
      youId: "a",
      kickoff,
    } as ClientView;
    const first = gameViewPatch(view, { kickoffKey: null });
    expect(first.kickoff?.starterId).toBe("a");
    expect(first.screen).toBe("game");
    const again = gameViewPatch(view, { kickoffKey: kickoffKey("ABC", kickoff) });
    expect(again.kickoff).toBeUndefined();
  });
});

describe("arranque con 2 a 6 clientes y bots", () => {
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

  async function connect(): Promise<Socket> {
    const s = io(url, { transports: ["websocket"], reconnection: false });
    sockets.push(s);
    await new Promise<void>((res, rej) => {
      s.on("connect", () => res());
      s.on("connect_error", rej);
    });
    return s;
  }

  async function table(humans: number, bots: number): Promise<void> {
    resetSecurityForTests();
    const n = humans + bots;
    const clients: Socket[] = [];
    for (let i = 0; i < humans; i++) clients.push(await connect());
    const created = await emitAck<{ ok: boolean; code?: string; error?: string }>(clients[0]!, "create", {
      name: "Luz",
      color: colors[0],
      victoryPoints: 8,
      seatLimit: n,
    });
    expect(created.ok, created.error).toBe(true);
    const code = created.code!;
    for (let i = 1; i < humans; i++) {
      const joined = await emitAck<{ ok: boolean; error?: string }>(clients[i]!, "join", {
        code,
        name: `J${i}`,
        color: colors[i],
      });
      expect(joined.ok, joined.error).toBe(true);
    }
    for (let i = 0; i < bots; i++) {
      const added = await emitAck<{ ok: boolean; error?: string }>(clients[0]!, "add_bot", {});
      expect(added.ok, added.error).toBe(true);
    }

    const firstView: Array<ClientView | null> = clients.map(() => null);
    const trail: string[][] = clients.map(() => []);
    await new Promise((r) => setTimeout(r, 40));
    clients.forEach((s, i) => {
      s.on("view", (v: ClientView) => {
        trail[i]!.push("view");
        if (!firstView[i]) firstView[i] = v;
      });
      s.on("lobby", () => {
        trail[i]!.push("lobby");
      });
    });
    const started = await emitAck<{ ok: boolean; error?: string; view?: ClientView }>(clients[0]!, "start");
    expect(started.ok, started.error).toBe(true);
    expect(started.view?.kickoff?.order).toHaveLength(n);
    await new Promise((r) => setTimeout(r, 120));

    const starter = started.view!.kickoff!.starterId;
    expect(started.view!.phase).toBe("colocacion_poblado");
    expect(started.view!.currentPlayerId).toBe(starter);
    expect(started.view!.players[0]?.id).toBe(starter);
    expect(started.view!.kickoff!.order[0]?.id).toBe(starter);
    expect(started.view!.buildings).toHaveLength(0);

    for (let i = 0; i < humans; i++) {
      const v = firstView[i];
      expect(v, `cliente ${i} de ${humans}+${bots} no salió del lobby`).toBeTruthy();
      const viewAt = trail[i]!.indexOf("view");
      expect(viewAt, `cliente ${i} sin vista: ${trail[i]!.join(",")}`).toBeGreaterThanOrEqual(0);
      expect(trail[i]!.slice(viewAt).includes("lobby"), `lobby después de la vista: ${trail[i]!.join(",")}`).toBe(false);
      expect(v!.phase).toBe("colocacion_poblado");
      expect(v!.currentPlayerId).toBe(starter);
      expect(v!.kickoff?.starterId).toBe(starter);
      expect(v!.kickoff?.order.map((p) => p.id)).toEqual(started.view!.kickoff!.order.map((p) => p.id));
      expect(v!.kickoff?.order.map((p) => p.color)).toEqual(started.view!.kickoff!.order.map((p) => p.color));
      expect(v!.players.map((p) => p.color)).toEqual(started.view!.players.map((p) => p.color));
      expect(v!.kickoff?.order.filter((p) => p.isBot)).toHaveLength(bots);
      expect(new Set(v!.kickoff?.order.map((p) => p.color)).size).toBe(n);
    }
    for (const s of clients) s.close();
    await new Promise((r) => setTimeout(r, 30));
  }

  it("2 humanos sin tercer asiento no arrancan y siguen en el lobby", async () => {
    const a = await connect();
    const b = await connect();
    const created = await emitAck<{ ok: boolean; code?: string }>(a, "create", {
      name: "Luz",
      color: "rojo",
      seatLimit: 3,
    });
    expect(created.ok).toBe(true);
    expect((await emitAck<{ ok: boolean }>(b, "join", { code: created.code, name: "Sol", color: "azul" })).ok).toBe(true);
    let views = 0;
    a.on("view", () => {
      views += 1;
    });
    b.on("view", () => {
      views += 1;
    });
    const started = await emitAck<{ ok: boolean; error?: string; view?: ClientView }>(a, "start");
    expect(started.ok).toBe(false);
    expect(started.view).toBeUndefined();
    await new Promise((r) => setTimeout(r, 80));
    expect(views).toBe(0);
    a.close();
    b.close();
  });

  it("2 humanos + 1 bot", async () => {
    await table(2, 1);
  });

  it("3 humanos", async () => {
    await table(3, 0);
  });

  it("2 humanos + 2 bots", async () => {
    await table(2, 2);
  });

  it("3 humanos + 2 bots", async () => {
    await table(3, 2);
  });

  it("4 humanos + 2 bots", async () => {
    await table(4, 2);
  });

  it("6 humanos", async () => {
    await table(6, 0);
  });
});
