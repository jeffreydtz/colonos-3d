import { describe, expect, it } from "vitest";
import { toClientView } from "../server/view.ts";
import type { GameState, Resources } from "../shared/types.ts";
import { buildOptions, devOption } from "../src/play/buildOptions.ts";
import { setupSnake, testGame } from "./helpers.ts";

const EMPTY: Resources = { madera: 0, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };

function viewFor(state: GameState, playerId = state.players[0]!.id) {
  return toClientView(state, playerId, {
    roomCode: "TEST01",
    hostId: state.players[0]!.id,
    chat: [],
    connected: new Set(state.players.map((p) => p.id)),
  });
}

function afterSetup(resources: Partial<Resources>, phase: GameState["phase"] = "principal") {
  const state = testGame(3, 31);
  setupSnake(state);
  state.turnIndex = 0;
  state.phase = phase;
  state.players[0]!.resources = { ...EMPTY, ...resources };
  return state;
}

const byKind = (state: GameState, playerId?: string) =>
  Object.fromEntries(buildOptions(viewFor(state, playerId)).map((o) => [o.kind, o.state]));

describe("construir: costos y qué alcanza", () => {
  it("con madera + ladrillo el camino está listo y al resto le falta material", () => {
    const s = byKind(afterSetup({ madera: 1, ladrillo: 1 }));
    expect(s.camino).toEqual({ kind: "ready" });
    expect(s.poblado).toEqual({ kind: "short", missing: { lana: 1, trigo: 1 } });
    expect(s.ciudad).toEqual({ kind: "short", missing: { trigo: 2, mineral: 3 } });
  });

  it("material de poblado pero sin lugar a dos vértices: dice 'Sin lugar', no 'te falta'", () => {
    const s = byKind(afterSetup({ madera: 1, ladrillo: 1, lana: 1, trigo: 1 }));
    expect(s.poblado).toEqual({ kind: "noSpot", note: "Sin lugar" });
  });

  it("la ciudad mejora un poblado propio cuando alcanza", () => {
    const s = byKind(afterSetup({ trigo: 2, mineral: 3 }));
    expect(s.ciudad).toEqual({ kind: "ready" });
  });

  it("en la colocación inicial no se cobra: se marca el tablero", () => {
    const state = testGame(3, 31);
    expect(state.phase).toBe("colocacion_poblado");
    const s = byKind(state);
    expect(s.poblado).toEqual({ kind: "wait", note: "Gratis, en el tablero" });
    expect(s.camino).toEqual({ kind: "wait", note: "Gratis, en el tablero" });
    expect(devOption(viewFor(state)).state).toEqual({ kind: "wait", note: "Después de colocar" });
  });

  it("antes de tirar no promete nada aunque sobre material", () => {
    const s = byKind(afterSetup({ madera: 5, ladrillo: 5, lana: 5, trigo: 5, mineral: 5 }, "dados"));
    for (const kind of ["camino", "poblado", "ciudad"]) {
      expect(s[kind]).toEqual({ kind: "wait", note: "Primero tirá" });
    }
  });

  it("en el turno de otro: 'En tu turno'", () => {
    const state = afterSetup({ madera: 1, ladrillo: 1 });
    const other = state.players[1]!;
    other.resources = { ...EMPTY, madera: 3, ladrillo: 3 };
    const s = byKind(state, other.id);
    expect(s.camino).toEqual({ kind: "wait", note: "En tu turno" });
  });

  it("la carta se lee como una obra más: lista, te falta, o mazo vacío", () => {
    expect(devOption(viewFor(afterSetup({ lana: 1, trigo: 1, mineral: 1 }))).state).toEqual({ kind: "ready" });
    expect(devOption(viewFor(afterSetup({ lana: 1 }))).state).toEqual({ kind: "short", missing: { trigo: 1, mineral: 1 } });
    const empty = afterSetup({ lana: 1, trigo: 1, mineral: 1 });
    empty.devDeck = [];
    expect(devOption(viewFor(empty)).state).toEqual({ kind: "noSpot", note: "Mazo vacío" });
    expect(devOption(viewFor(afterSetup({ lana: 1, trigo: 1, mineral: 1 }, "dados"))).state).toEqual({
      kind: "wait",
      note: "Primero tirá",
    });
  });
});
