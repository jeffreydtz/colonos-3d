import { describe, expect, it } from "vitest";
import { applyAction, produceResources } from "../server/engine.ts";
import { bestBankRate } from "../server/legal.ts";
import { toClientView } from "../server/view.ts";
import type { GameState, LogEvent } from "../shared/types.ts";
import { setupSnake, testGame } from "./helpers.ts";

const WORDS = /madera|ladrillo|lana|trigo|mineral/i;

function extras(state: GameState) {
  return { roomCode: "T", hostId: state.players[0]!.id, chat: [], connected: new Set(state.players.map((p) => p.id)) };
}

function mainPhase() {
  const state = testGame(3, 13);
  setupSnake(state);
  state.phase = "principal";
  state.turnIndex = 0;
  state.turnNumber = 2;
  const [a, b, c] = state.players as [GameState["players"][0], GameState["players"][0], GameState["players"][0]];
  return { state, a, b, c };
}

const last = (state: GameState, kind: LogEvent["kind"]) => [...state.events].reverse().find((e) => e.kind === kind)!;

describe("log: una frase con íconos, sin repetir el recurso en palabras", () => {
  it("lo del segundo poblado va con las obras: nadie tiró los dados", () => {
    const { state } = mainPhase();
    const bonus = state.events.filter((e) => e.text.includes("segundo poblado"));
    expect(bonus.length).toBeGreaterThan(0);
    for (const e of bonus) expect(e.kind).toBe("build");
  });

  it("la producción dice quién cobró y los recursos van como íconos", () => {
    const { state } = mainPhase();
    for (const total of [5, 6, 8, 9, 10, 4]) produceResources(state, total);
    const got = state.events.filter((e) => e.kind === "dados" && e.text.endsWith("cobró"));
    expect(got.length).toBeGreaterThan(0);
    for (const e of got) {
      expect(e.text).not.toMatch(WORDS);
      expect(e.icons.every((i) => i.kind === "res" && (i.n ?? 0) > 0)).toBe(true);
    }
  });

  it("las cartas jugadas van como token de ícono dentro de la frase", () => {
    const { state, a, b } = mainPhase();
    a.devCards = [{ kind: "progreso_invento", purchasedTurn: 0 }];
    expect(applyAction(state, a.id, { type: "play_year_plenty", resources: ["trigo", "mineral"] }).ok).toBe(true);
    const invento = last(state, "dev");
    expect(invento.text).toContain(":invento:");
    expect(invento.text).not.toMatch(WORDS);
    expect(invento.icons.map((i) => i.id)).toEqual(["trigo", "mineral"]);

    state.playedDevThisTurn = false;
    a.devCards = [{ kind: "progreso_monopolio", purchasedTurn: 0 }];
    b.resources.lana = 3;
    expect(applyAction(state, a.id, { type: "play_monopoly", resource: "lana" }).ok).toBe(true);
    const mono = last(state, "dev");
    expect(mono.text).toContain(":monopolio:");
    expect(mono.text).not.toMatch(WORDS);
    expect(mono.icons).toEqual([{ kind: "res", id: "lana", n: 3 }]);
  });

  it("el comercio se lee «da → pide» y la oferta dirigida no se filtra por el texto", () => {
    const { state, a, b, c } = mainPhase();
    a.resources = { madera: 6, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
    expect(applyAction(state, a.id, { type: "offer_trade", toId: b.id, give: { madera: 1 }, want: { trigo: 1 } }).ok).toBe(true);
    const sent = last(state, "comercio");
    expect(sent.icons.map((i) => i.kind)).toEqual(["res", "sep", "res"]);
    const seenByC = toClientView(state, c.id, extras(state)).events.find((e) => e.id === sent.id)!;
    expect(seenByC.icons).toEqual([]);
    expect(seenByC.text).not.toMatch(WORDS);
    expect(seenByC.text).not.toMatch(/:\w+:/);

    const rate = bestBankRate(state, a.id, "madera");
    expect(applyAction(state, a.id, { type: "bank_trade", give: { madera: rate }, want: { lana: 1 } }).ok).toBe(true);
    const bank = last(state, "comercio");
    expect(bank.text).not.toMatch(/\d:1/);
    expect(bank.icons).toEqual([
      { kind: "res", id: "madera", n: rate },
      { kind: "sep" },
      { kind: "res", id: "lana", n: 1 },
    ]);
  });
});
