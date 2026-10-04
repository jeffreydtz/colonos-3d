import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  invalidCorsEntries,
  normalizeOrigin,
  resetSecurityForTests,
  resolveCorsOrigin,
  socketOriginAllowed,
} from "../server/security.ts";
import {
  armRoomTimer,
  bindSocket,
  createRoom,
  joinRoom,
  prepareDevUnbox,
  resetRoomsForTests,
  REVEAL_PAUSE_MS,
  setUiBusy,
  startGame,
  TURN_TIMEOUT_MS,
  UNBUSY_GRACE_MS,
} from "../server/rooms.ts";
import { applyAction } from "../server/engine.ts";
import { toClientView } from "../server/view.ts";
import { MAX_OPEN_OFFERS } from "../shared/constants.ts";
import type { GameState } from "../shared/types.ts";
import { setupSnake, testGame } from "./helpers.ts";

afterEach(() => {
  vi.useRealTimers();
  resetRoomsForTests();
  resetSecurityForTests();
});

describe("CORS: origen canónico como el header del browser", () => {
  it("saca ruta, barra y puerto por defecto; respeta puertos explícitos", () => {
    expect(normalizeOrigin("https://Foo.COM:443/app/")).toBe("https://foo.com");
    expect(normalizeOrigin(" http://LocalHost:80 ")).toBe("http://localhost");
    expect(normalizeOrigin("http://localhost:8080/")).toBe("http://localhost:8080");
    expect(normalizeOrigin("foo.com/")).toBe("foo.com");
  });

  it("deduplica y avisa entradas que nunca van a matchear", () => {
    expect(resolveCorsOrigin({ CORS_ORIGIN: "https://a.com, https://A.com/, https://a.com:443" })).toEqual([
      "https://a.com",
    ]);
    expect(invalidCorsEntries({ CORS_ORIGIN: "foo.com, https://ok.com, ftp://x.com" })).toEqual([
      "foo.com",
      "ftp://x.com",
    ]);
    expect(invalidCorsEntries({ CORS_ORIGIN: "https://ok.com" })).toEqual([]);
  });

  it("el handshake matchea aunque la config traiga :443 o ruta", () => {
    const cors = resolveCorsOrigin({ CORS_ORIGIN: "https://Colonos.Example:443/juego" });
    expect(socketOriginAllowed({ headers: { origin: "https://colonos.example", host: "otro:1" } }, cors)).toBe(true);
    expect(socketOriginAllowed({ headers: { origin: "https://evil.example", host: "otro:1" } }, cors)).toBe(false);
  });
});

describe("busy:false no regala un turno nuevo", () => {
  function primed() {
    const created = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
    if (!created.ok) throw new Error("create");
    joinRoom({ code: created.room.code, name: "Tomi", color: "azul" });
    joinRoom({ code: created.room.code, name: "Mora", color: "naranja" });
    bindSocket(created.room, created.playerId, "s-a");
    expect(startGame(created.room, created.playerId, { seed: 77 }).ok).toBe(true);
    expect(prepareDevUnbox(created.room, created.playerId).ok).toBe(true);
    const room = created.room;
    room.unboxPlayerId = created.playerId;
    room.busyUntil = 0;
    room.unboxExtended = false;
    return { room, id: created.playerId };
  }

  it("si la pausa estiró el reloj, al cerrar vuelve el deadline de antes", () => {
    vi.useFakeTimers();
    const { room, id } = primed();
    armRoomTimer(room);
    const before = room.deadlineAt!;
    vi.advanceTimersByTime(TURN_TIMEOUT_MS - 10_000);
    expect(setUiBusy(room, id, true).ok).toBe(true);
    expect(room.deadlineAt!).toBeGreaterThan(before);
    vi.advanceTimersByTime(2_000);
    expect(setUiBusy(room, id, false).ok).toBe(true);
    expect(room.deadlineAt!).toBeLessThanOrEqual(before + 5);
    expect(room.deadlineAt!).toBeGreaterThan(Date.now());
    expect(room.unboxPlayerId).toBeNull();
  });

  it("si la pausa no tocó el reloj, cerrar tampoco lo reinicia a 45 s", () => {
    vi.useFakeTimers();
    const { room, id } = primed();
    armRoomTimer(room);
    const before = room.deadlineAt!;
    vi.advanceTimersByTime(5_000);
    expect(setUiBusy(room, id, true).ok).toBe(true);
    expect(room.deadlineAt).toBe(before);
    vi.advanceTimersByTime(REVEAL_PAUSE_MS / 2);
    expect(setUiBusy(room, id, false).ok).toBe(true);
    expect(room.deadlineAt).toBe(before);
  });

  it("con el deadline ya vencido y el timeout en cola, cerrar deja sólo el margen corto", () => {
    vi.useFakeTimers();
    const { room, id } = primed();
    armRoomTimer(room);
    expect(setUiBusy(room, id, true).ok).toBe(true);
    room.deadlineAt = Date.now() - 1;
    expect(setUiBusy(room, id, false).ok).toBe(true);
    expect(room.deadlineAt! - Date.now()).toBe(UNBUSY_GRACE_MS);
  });
});

function extras(state: GameState) {
  return {
    roomCode: "TEST",
    hostId: state.players[0]!.id,
    chat: [],
    connected: new Set(state.players.map((p) => p.id)),
  };
}

function tradingGame() {
  const state = testGame(3, 13);
  setupSnake(state);
  state.phase = "principal";
  state.turnIndex = 0;
  const [a, b, c] = state.players as [GameState["players"][0], GameState["players"][0], GameState["players"][0]];
  a.resources = { madera: 12, ladrillo: 3, lana: 0, trigo: 0, mineral: 0 };
  return { state, a, b, c };
}

describe("ofertas: cada uno ve las que le tocan", () => {
  it("una oferta dirigida no le llega a un tercero, ni en la lista ni en el log", () => {
    const { state, a, b, c } = tradingGame();
    expect(applyAction(state, a.id, { type: "offer_trade", toId: b.id, give: { madera: 1 }, want: { trigo: 1 } }).ok).toBe(true);
    expect(applyAction(state, a.id, { type: "offer_trade", toId: "todos", give: { ladrillo: 1 }, want: { lana: 1 } }).ok).toBe(true);
    const view = (id: string) => toClientView(state, id, extras(state));
    expect(view(a.id).trades).toHaveLength(2);
    expect(view(b.id).trades).toHaveLength(2);
    expect(view(c.id).trades.map((t) => t.toId)).toEqual(["todos"]);

    const offerTo = (id: string) => view(id).events.filter((e) => e.kind === "comercio" && e.otherId === b.id);
    expect(offerTo(c.id)).toHaveLength(1);
    expect(offerTo(c.id)[0]!.icons).toEqual([]);
    expect(offerTo(c.id)[0]!.resources).toBeUndefined();
    expect(offerTo(b.id)[0]!.icons.length).toBeGreaterThan(0);
    expect(offerTo(a.id)[0]!.resources).toEqual({ madera: 1 });
    // La oferta a todes sigue siendo pública.
    expect(view(c.id).events.some((e) => e.kind === "comercio" && e.otherId == null && e.icons.length > 0)).toBe(true);
    expect(JSON.stringify(view(b.id))).not.toContain("audience");
  });

  it("la contraoferta también queda entre los dos", () => {
    const { state, a, b, c } = tradingGame();
    b.resources.trigo = 2;
    expect(applyAction(state, a.id, { type: "offer_trade", toId: b.id, give: { madera: 1 }, want: { trigo: 1 } }).ok).toBe(true);
    const tradeId = state.trades[0]!.id;
    expect(applyAction(state, b.id, { type: "counter_trade", tradeId, give: { trigo: 1 }, want: { madera: 2 } }).ok).toBe(true);
    const view = (id: string) => toClientView(state, id, extras(state));
    expect(view(c.id).trades).toEqual([]);
    expect(view(a.id).trades).toHaveLength(1);
    const counter = view(c.id).events.find((e) => e.text.includes("contraoferta"))!;
    expect(counter.icons).toEqual([]);
    expect(view(a.id).events.find((e) => e.text.includes("contraoferta"))!.icons.length).toBeGreaterThan(0);
  });
});

describe("ofertas: destinatario real y tope", () => {
  it("no se le ofrece a uno mismo ni a un asiento que no existe", () => {
    const { state, a } = tradingGame();
    const self = applyAction(state, a.id, { type: "offer_trade", toId: a.id, give: { madera: 1 }, want: { trigo: 1 } });
    expect(self.ok).toBe(false);
    const ghost = applyAction(state, a.id, { type: "offer_trade", toId: "p-fantasma", give: { madera: 1 }, want: { trigo: 1 } });
    expect(ghost.ok).toBe(false);
    expect(state.trades).toEqual([]);
  });

  it(`a lo sumo ${MAX_OPEN_OFFERS} ofertas abiertas por jugador; cancelar libera lugar`, () => {
    const { state, a, b } = tradingGame();
    for (let i = 0; i < MAX_OPEN_OFFERS; i++) {
      const to = i % 2 ? b.id : "todos";
      expect(applyAction(state, a.id, { type: "offer_trade", toId: to, give: { madera: 1 }, want: { trigo: 1 } }).ok).toBe(true);
    }
    const extra = applyAction(state, a.id, { type: "offer_trade", toId: "todos", give: { madera: 1 }, want: { lana: 1 } });
    expect(extra.ok).toBe(false);
    expect(state.trades).toHaveLength(MAX_OPEN_OFFERS);
    expect(applyAction(state, a.id, { type: "reject_trade", tradeId: state.trades[0]!.id }).ok).toBe(true);
    expect(applyAction(state, a.id, { type: "offer_trade", toId: "todos", give: { madera: 1 }, want: { lana: 1 } }).ok).toBe(true);
  });

  it("el tope también corre para las contraofertas", () => {
    const { state, a, b } = tradingGame();
    b.resources.trigo = 20;
    state.trades = Array.from({ length: MAX_OPEN_OFFERS }, (_, i) => ({
      id: `t-b${i}`,
      fromId: b.id,
      toId: "todos",
      give: { trigo: 1 },
      want: { madera: 1 },
    }));
    expect(applyAction(state, a.id, { type: "offer_trade", toId: b.id, give: { madera: 1 }, want: { trigo: 1 } }).ok).toBe(true);
    const tradeId = state.trades.find((t) => t.fromId === a.id)!.id;
    const r = applyAction(state, b.id, { type: "counter_trade", tradeId, give: { trigo: 1 }, want: { madera: 2 } });
    expect(r.ok).toBe(false);
    expect(state.trades.some((t) => t.id === tradeId)).toBe(true);
  });
});

describe("Docker", () => {
  it("TRUST_PROXY viene explícito en la imagen (HF Spaces: detrás del proxy de HF, =1)", () => {
    const df = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
    expect(df).toMatch(/ENV TRUST_PROXY=1/);
    expect(df).not.toMatch(/ENV TRUST_PROXY=0/);
  });

  it("HF Spaces: puerto 7860 y CORS_ORIGIN con placeholder (nunca *)", () => {
    const df = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
    expect(df).toMatch(/ENV PORT=7860/);
    expect(df).toMatch(/EXPOSE 7860/);
    expect(df).toMatch(/ENV CORS_ORIGIN=https:\/\/OWNER-SPACE\.hf\.space/);
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).toMatch(/^---\n[\s\S]*sdk: docker\n[\s\S]*app_port: 7860\n[\s\S]*---\n/);
  });
});
