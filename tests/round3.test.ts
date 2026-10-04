import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanPlayerName } from "../shared/names.ts";
import { parseAction, parseJoinPayload } from "../server/validate.ts";
import {
  assertProductionCors,
  clientIp,
  colonosDevEnabled,
  MAX_ROOMS_PER_IP,
  normalizeOrigin,
  productionNeedsCorsOrigin,
  resetSecurityForTests,
  resolveCorsOrigin,
  roomCreateAllowed,
  socketOriginAllowed,
} from "../server/security.ts";
import {
  armRoomTimer,
  bindSocket,
  createRoom,
  joinRoom,
  leaveRoom,
  play,
  prepareDevUnbox,
  resetRoomsForTests,
  REVEAL_PAUSE_MS,
  setUiBusy,
  startGame,
  TURN_TIMEOUT_MS,
} from "../server/rooms.ts";
import { setupSnake } from "./helpers.ts";

afterEach(() => {
  resetRoomsForTests();
  resetSecurityForTests();
});

describe("H1 clientIp no usa el primer XFF", () => {
  it("sin TRUST_PROXY ignora X-Forwarded-For falsificado", () => {
    const env = {};
    const ips = new Set<string>();
    for (let i = 0; i < 18; i++) {
      ips.add(
        clientIp(
          { address: "10.0.0.9", headers: { "x-forwarded-for": `${i}.1.1.1` } },
          env,
        ),
      );
    }
    expect(ips.size).toBe(1);
    expect([...ips][0]).toBe("10.0.0.9");
  });

  it("con TRUST_PROXY toma el último hop", () => {
    const env = { TRUST_PROXY: "1" };
    expect(
      clientIp(
        { address: "10.0.0.1", headers: { "x-forwarded-for": "9.9.9.9, 8.8.8.8" } },
        env,
      ),
    ).toBe("8.8.8.8");
    expect(clientIp({ address: "10.0.0.1", headers: {} }, env)).toBe("10.0.0.1");
  });
});

describe("H2 Origin en el handshake WS", () => {
  it("same-origin y sin Origin pasan; evil.example no", () => {
    const cors = ["https://colonos.example"];
    expect(socketOriginAllowed({ headers: {} }, cors)).toBe(true);
    expect(
      socketOriginAllowed(
        { headers: { origin: "http://127.0.0.1:43210", host: "127.0.0.1:43210" } },
        false,
      ),
    ).toBe(true);
    expect(
      socketOriginAllowed({ headers: { origin: "https://evil.example", host: "127.0.0.1:43210" } }, false),
    ).toBe(false);
    expect(
      socketOriginAllowed(
        { headers: { origin: "https://evil.example", host: "127.0.0.1:43210" } },
        cors,
      ),
    ).toBe(false);
    expect(
      socketOriginAllowed(
        { headers: { origin: "https://colonos.example", host: "127.0.0.1:43210" } },
        cors,
      ),
    ).toBe(true);
    expect(socketOriginAllowed({ headers: { origin: "https://evil.example" } }, true)).toBe(true);
  });
});

describe("H3 busy no alarga el timeout para siempre", () => {
  function primed() {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    if (!created.ok) throw new Error("create");
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 77 }).ok).toBe(true);
    expect(prepareDevUnbox(created.room, created.playerId).ok).toBe(true);
    return created;
  }

  it("busy:true sin unbox se rechaza y no mueve busyUntil", () => {
    const created = primed();
    created.room.unboxPlayerId = null;
    created.room.busyUntil = 0;
    const other = created.room.seats[1]!.id;
    expect(setUiBusy(created.room, other, true).ok).toBe(false);
    expect(created.room.busyUntil).toBe(0);
    expect(setUiBusy(created.room, created.playerId, true).ok).toBe(false);
  });

  it("unbusy del comprador vale una vez por ventana; no se refresca", () => {
    const created = primed();
    created.room.unboxPlayerId = created.playerId;
    created.room.busyUntil = 0;
    const first = setUiBusy(created.room, created.playerId, true);
    expect(first.ok).toBe(true);
    const until = created.room.busyUntil;
    expect(until).toBeGreaterThan(Date.now() + REVEAL_PAUSE_MS - 50);
    expect(setUiBusy(created.room, created.playerId, true).ok).toBe(false);
    expect(created.room.busyUntil).toBe(until);
    expect(setUiBusy(created.room, created.playerId, false).ok).toBe(true);
    expect(created.room.busyUntil).toBe(0);
    expect(created.room.unboxPlayerId).toBeNull();
  });

  it("carrera busy vs action en el mismo asiento: la jugada sigue y busy no se extiende", () => {
    const created = primed();
    const p = created.room.game!.players[0]!;
    const buy = play(created.room, p.id, { type: "buy_dev" });
    expect(buy.ok).toBe(true);
    const until = created.room.busyUntil;
    bindSocket(created.room, created.playerId, "s-b");
    expect(setUiBusy(created.room, created.playerId, true).ok).toBe(false);
    expect(created.room.busyUntil).toBe(until);
    created.room.game!.phase = "principal";
    created.room.game!.turnIndex = 0;
    created.room.game!.pendingRoadBuilding = 0;
    const end = play(created.room, p.id, { type: "end_turn" });
    expect(end.ok).toBe(true);
    expect(created.room.busyUntil).toBe(until);
  });

  it("busy:true después de vencer busyUntil no reinicia el deadline; el timeout de turno corre", () => {
    vi.useFakeTimers();
    try {
      const created = primed();
      const g = created.room.game!;
      expect(g.phase).toBe("principal");
      const turnAtArm = g.turnIndex;
      created.room.unboxPlayerId = created.playerId;
      created.room.busyUntil = Date.now() + REVEAL_PAUSE_MS;
      created.room.unboxExtended = true;
      armRoomTimer(created.room);
      const deadline = created.room.deadlineAt;
      expect(deadline).toBeGreaterThan(Date.now() + TURN_TIMEOUT_MS - 50);

      vi.advanceTimersByTime(REVEAL_PAUSE_MS + 25);
      const again = setUiBusy(created.room, created.playerId, true);
      expect(again.ok).toBe(false);
      expect(created.room.unboxPlayerId).toBeNull();
      expect(created.room.deadlineAt).toBe(deadline);

      vi.advanceTimersByTime(TURN_TIMEOUT_MS);
      const after = created.room.game!;
      expect(
        after.turnIndex !== turnAtArm || after.phase !== "principal",
      ).toBe(true);
      expect(after.phase).not.toBe("descarte");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("H4 CORS fail-fast y Docker", () => {
  it("producción sin CORS_ORIGIN tira", () => {
    expect(productionNeedsCorsOrigin({ NODE_ENV: "production" })).toBe(true);
    expect(() => assertProductionCors({ NODE_ENV: "production" })).toThrow(/CORS_ORIGIN/);
    expect(() =>
      assertProductionCors({ NODE_ENV: "production", CORS_ORIGIN: "https://a.com" }),
    ).not.toThrow();
    expect(() => assertProductionCors({ NODE_ENV: "production", CORS_ORIGIN: "*" })).toThrow(
      /CORS_ORIGIN=\*/,
    );
    expect(() => assertProductionCors({ NODE_ENV: "production", CORS_ORIGIN: "true" })).toThrow(
      /CORS_ORIGIN=\*/,
    );
    expect(() =>
      assertProductionCors({ NODE_ENV: "production", CORS_ORIGIN: " https://evil.example, * " }),
    ).toThrow(/CORS_ORIGIN=\*/);
    expect(resolveCorsOrigin({})).toBe(false);
  });

  it("CORS_ORIGIN se normaliza (minúsculas, sin barra final) y el handshake coincide", () => {
    expect(normalizeOrigin("https://Foo.COM/")).toBe("https://foo.com");
    expect(resolveCorsOrigin({ CORS_ORIGIN: "https://A.com/, http://LocalHost:8080" })).toEqual([
      "https://a.com",
      "http://localhost:8080",
    ]);
    const cors = resolveCorsOrigin({ CORS_ORIGIN: "https://Colonos.Example/" });
    expect(
      socketOriginAllowed(
        { headers: { origin: "https://colonos.example", host: "otros:1" } },
        cors,
      ),
    ).toBe(true);
    expect(
      socketOriginAllowed(
        { headers: { origin: "https://colonos.example/", host: "otros:1" } },
        cors,
      ),
    ).toBe(true);
    expect(colonosDevEnabled({ COLONOS_DEV: "1" })).toBe(true);
    expect(colonosDevEnabled({ COLONOS_DEV: "1", NODE_ENV: "production" })).toBe(false);
    expect(colonosDevEnabled({ NODE_ENV: "production" })).toBe(false);
    const idx = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
    expect(idx).toContain("colonosDevEnabled()");
    expect(idx).toContain("parseCreatePayload");
  });

  it("la imagen no setea CORS_ORIGIN=* y corre como no-root con npm ci y HEALTHCHECK", () => {
    const df = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
    expect(df).not.toMatch(/CORS_ORIGIN=\*/);
    expect(df).toMatch(/USER node/);
    expect(df).toMatch(/npm ci/);
    expect(df).not.toMatch(/npm install/);
    expect(df).toMatch(/HEALTHCHECK/);
    expect(df).toMatch(/node", "--import", "tsx"/);
  });
});

describe("medios nombres, IDs, token, mesas/IP", () => {
  it("homoglifos de Sistema se rechazan", () => {
    for (const name of ["Sistema", "Sıstema", "SİSTEMA", "Siṡtema", "Sìstema"]) {
      const r = cleanPlayerName(name);
      expect(r.ok).toBe(false);
    }
    expect(cleanPlayerName("Luz").ok).toBe(true);
  });

  it("join.token y offer_trade.toId largos se rechazan, no se truncan", () => {
    const token = parseJoinPayload({
      code: "ABC123",
      name: "Luz",
      color: "rojo",
      token: "x".repeat(10_000),
    });
    expect(token.ok).toBe(false);
    const toId = parseAction({
      type: "offer_trade",
      toId: "y".repeat(5000),
      give: { madera: 1 },
      want: { ladrillo: 1 },
    });
    expect(toId.ok).toBe(false);
  });

  it("Salir/forfeit rota el token y el join viejo no saca al bot", () => {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 12 }).ok).toBe(true);
    const old = created.token;
    expect(leaveRoom(created.room, created.playerId, { forfeit: true }).ok).toBe(true);
    const seat = created.room.seats.find((s) => s.id === created.playerId);
    expect(seat?.isBot).toBe(true);
    expect(seat?.token).not.toBe(old);
    const again = joinRoom({
      code: created.room.code,
      name: "Luz",
      color: "rojo",
      token: old,
    });
    expect(again.ok).toBe(false);
    expect(created.room.seats.find((s) => s.id === created.playerId)?.isBot).toBe(true);
  });

  it("tope duro de mesas por IP", () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < MAX_ROOMS_PER_IP; i++) {
      const r = createRoom({ name: `Luz${i}`, color: "rojo" }, { ip });
      expect(r.ok).toBe(true);
    }
    expect(roomCreateAllowed(ip)).toBe(false);
    const extra = createRoom({ name: "Nico", color: "azul" }, { ip });
    expect(extra.ok).toBe(false);
    const other = createRoom({ name: "Sol", color: "verde" }, { ip: "203.0.113.10" });
    expect(other.ok).toBe(true);
  });
});
