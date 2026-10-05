import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyAction, createGame } from "../server/engine.ts";
import { toClientView } from "../server/view.ts";
import type { GameState } from "../shared/types.ts";
import { nextCues, type CueView } from "../src/audio/cues.ts";
import { stealNoticeForYou } from "../src/play/stealNotice.ts";
import { setupSnake } from "./helpers.ts";

const RESOURCE_WORD = /madera|ladrillo|lana|trigo|mineral|Madera|Ladrillo|Lana|Trigo|Piedra/;

function mesa(): GameState {
  const state = createGame({
    seed: 81,
    victoryPoints: 10,
    players: [
      { id: "p0", name: "Luz", color: "rojo" },
      { id: "p1", name: "Tomi", color: "azul" },
      { id: "p2", name: "Mora", color: "naranja" },
    ],
  });
  setupSnake(state);
  for (const p of state.players) {
    p.resources = { madera: 0, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
  }
  return state;
}

function victimHex(state: GameState, victimId: string): string {
  for (const b of state.buildings) {
    if (b.playerId !== victimId) continue;
    const hid = state.vertices[b.vertexId]?.hexIds.find((id) => id !== state.robberHexId);
    if (hid) return hid;
  }
  throw new Error("sin hex para robar");
}

function viewOf(state: GameState, id: string) {
  return toClientView(state, id, {
    roomCode: "ROBO",
    hostId: state.players[0]!.id,
    chat: [],
    connected: new Set(state.players.map((p) => p.id)),
  });
}

function ladronBlob(state: GameState, id: string): string {
  return JSON.stringify(viewOf(state, id).events.filter((e) => e.kind === "ladron"));
}

describe("aviso de robo", () => {
  it("la víctima ve el recurso y los demás sólo «le robó 1 carta»", () => {
    const state = mesa();
    const luz = state.players[0]!;
    const tomi = state.players[1]!;
    tomi.resources.madera = 2;
    state.phase = "ladron";
    state.turnIndex = 0;
    const hexId = victimHex(state, tomi.id);
    const moved = applyAction(state, luz.id, { type: "move_robber", hexId, stealFromId: tomi.id });
    expect(moved.ok).toBe(true);
    expect(tomi.resources.madera).toBe(1);
    expect(luz.resources.madera).toBe(1);

    const victim = viewOf(state, tomi.id);
    const thief = viewOf(state, luz.id);
    const other = viewOf(state, state.players[2]!.id);
    const notice = victim.events.find((e) => e.text.includes("te robó"));
    expect(notice?.text).toBe("Luz te robó 1 Madera.");
    expect(notice?.resources).toEqual({ madera: 1 });
    expect(notice?.icons).toEqual([{ kind: "res", id: "madera", n: 1 }]);
    expect(victim.events.some((e) => e.text === "Luz le robó 1 carta a Tomi.")).toBe(true);

    for (const seen of [thief, other]) {
      expect(seen.events.some((e) => e.text === "Luz le robó 1 carta a Tomi.")).toBe(true);
      expect(seen.events.some((e) => /te robó/.test(e.text))).toBe(false);
      expect(JSON.stringify(seen.events.filter((e) => e.kind === "ladron"))).not.toMatch(RESOURCE_WORD);
      expect(seen.events.filter((e) => e.kind === "ladron").every((e) => e.icons.length === 0)).toBe(true);
    }
    expect(JSON.stringify(victim)).not.toContain("conceal");
    expect(JSON.stringify(other)).not.toContain("audience");
    expect(stealNoticeForYou(victim.events, tomi.id, (notice?.id ?? 1) - 1)).toEqual({
      text: "Luz te robó 1 Madera.",
      resource: "madera",
    });
    expect(stealNoticeForYou(other.events, state.players[2]!.id, 0)).toBeNull();
    expect(stealNoticeForYou(thief.events, luz.id, 0)).toBeNull();
  });

  it("elegir después a quién robar no adelanta el recurso", () => {
    const state = mesa();
    const luz = state.players[0]!;
    const tomi = state.players[1]!;
    tomi.resources.ladrillo = 1;
    state.phase = "ladron";
    state.turnIndex = 0;
    const hexId = victimHex(state, tomi.id);
    expect(applyAction(state, luz.id, { type: "move_robber", hexId, stealFromId: null }).ok).toBe(true);
    expect(state.pendingStealHexId).toBe(hexId);
    expect(ladronBlob(state, tomi.id)).not.toMatch(/te robó|Ladrillo|ladrillo/);
    expect(applyAction(state, luz.id, { type: "move_robber", hexId, stealFromId: tomi.id }).ok).toBe(true);
    const victim = viewOf(state, tomi.id);
    expect(victim.events.some((e) => e.text === "Luz te robó 1 Ladrillo.")).toBe(true);
    expect(viewOf(state, luz.id).events.some((e) => e.text === "Luz le robó 1 carta a Tomi.")).toBe(true);
    expect(ladronBlob(state, state.players[2]!.id)).not.toMatch(RESOURCE_WORD);
  });

  it("el caballero avisa igual, sólo a quien pierde la carta", () => {
    const state = mesa();
    const luz = state.players[0]!;
    const tomi = state.players[1]!;
    tomi.resources.lana = 1;
    state.phase = "principal";
    state.turnIndex = 0;
    state.turnNumber = 4;
    luz.devCards.push({ kind: "caballero", purchasedTurn: 0 });
    const hexId = victimHex(state, tomi.id);
    expect(applyAction(state, luz.id, { type: "play_knight", hexId, stealFromId: tomi.id }).ok).toBe(true);
    expect(viewOf(state, tomi.id).events.some((e) => e.text === "Luz te robó 1 Lana.")).toBe(true);
    expect(ladronBlob(state, luz.id)).not.toMatch(RESOURCE_WORD);
    expect(tomi.resources.lana).toBe(0);
    expect(luz.resources.lana).toBe(1);
  });

  it("el sonido del robo lo oye sólo la víctima", () => {
    const line = (
      id: number,
      text: string,
      otherId: string,
      resources: CueView["events"][number]["resources"],
    ): CueView["events"][number] => ({
      id,
      kind: "ladron",
      playerId: "luz",
      otherId,
      text,
      resources,
    });
    const quiet = (youId: string): CueView => ({
      youId,
      currentPlayerId: "luz",
      winnerId: null,
      events: [],
      chat: [],
      trades: [],
    });
    const armed = nextCues(null, quiet("tomi"), null, true, false);
    const heard = nextCues(armed.heard, {
      ...quiet("tomi"),
      events: [
        line(1, "Luz le robó 1 carta a Tomi.", "tomi", null),
        line(2, "Luz te robó 1 Madera.", "tomi", { madera: 1 }),
      ],
    }, null, true, false);
    expect(heard.cues).toEqual([{ name: "stolen" }]);
    const mora = nextCues(nextCues(null, quiet("mora"), null, true, false).heard, {
      ...quiet("mora"),
      events: [line(1, "Luz le robó 1 carta a Tomi.", "tomi", null)],
    }, null, true, false);
    expect(mora.cues.map((c) => c.name)).not.toContain("stolen");
    const thief = nextCues(nextCues(null, quiet("luz"), null, true, false).heard, {
      ...quiet("luz"),
      events: [line(1, "Luz le robó 1 carta a Tomi.", "tomi", null)],
    }, null, true, false);
    expect(thief.cues.map((c) => c.name)).not.toContain("stolen");
  });

  it("el aviso del HUD lleva ícono y no es el toast de error", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain("stealNoticeForYou");
    expect(hud).toContain('data-kind="robo"');
    expect(hud).toContain("toast.resource");
    expect(hud).toContain("<ResourceIcon resource={toast.resource}");
  });
});
