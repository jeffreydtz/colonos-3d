import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { alarmPlan } from "../src/audio/alarms.ts";
import { comercioSound, nextCues, type CueView } from "../src/audio/cues.ts";
import {
  clampVolume,
  defaultSoundPrefs,
  sanitizeSoundPrefs,
  shouldPlay,
  wantsKeepAlive,
  SFX_CATEGORIES,
} from "../src/audio/prefs.ts";
import { SFX_CATEGORY, VOICES, voiceSignature, type SfxName } from "../src/audio/voices.ts";

function base(over: Partial<CueView> = {}): CueView {
  return {
    youId: "me",
    currentPlayerId: "other",
    winnerId: null,
    events: [],
    chat: [],
    trades: [],
    ...over,
  };
}

const names = Object.keys(VOICES) as SfxName[];

describe("preferencias de sonido", () => {
  it("recorta el volumen y descarta basura", () => {
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(Number.NaN)).toBe(0.7);
    const clean = sanitizeSoundPrefs({ enabled: false, volume: 3, mute: { dados: true, no: true } });
    expect(clean.enabled).toBe(false);
    expect(clean.volume).toBe(1);
    expect(clean.mute.dados).toBe(true);
    expect(clean.mute.turno).toBe(false);
    expect(sanitizeSoundPrefs(null)).toEqual(defaultSoundPrefs());
  });

  it("el master, el cero y la categoría callan; el keepalive sólo atrás y si queda turno o reloj", () => {
    const on = defaultSoundPrefs();
    expect(shouldPlay(on, "dados")).toBe(true);
    expect(shouldPlay({ ...on, enabled: false }, "turno")).toBe(false);
    expect(shouldPlay({ ...on, volume: 0 }, "reloj")).toBe(false);
    expect(shouldPlay({ ...on, mute: { ...on.mute, mesa: true } }, "mesa")).toBe(false);
    expect(shouldPlay({ ...on, mute: { ...on.mute, mesa: true } }, "avisos")).toBe(true);
    expect(wantsKeepAlive(false, on)).toBe(false);
    expect(wantsKeepAlive(true, on)).toBe(true);
    expect(wantsKeepAlive(true, { ...on, enabled: false })).toBe(false);
    expect(wantsKeepAlive(true, { ...on, volume: 0 })).toBe(false);
    expect(wantsKeepAlive(true, { ...on, mute: { ...on.mute, turno: true, reloj: true } })).toBe(false);
    expect(wantsKeepAlive(true, { ...on, mute: { ...on.mute, turno: true } })).toBe(true);
  });
});

describe("voces", () => {
  it("cada evento tiene una firma distinta y una categoría", () => {
    const sigs = names.map((n) => voiceSignature(n));
    expect(new Set(sigs).size).toBe(names.length);
    for (const name of names) {
      expect(VOICES[name].length).toBeGreaterThan(0);
      expect(SFX_CATEGORIES).toContain(SFX_CATEGORY[name]);
    }
    expect(SFX_CATEGORY.turn).toBe("turno");
    expect(SFX_CATEGORY.turn_soft).toBe("turno");
    expect(SFX_CATEGORY.warn10).toBe("reloj");
    expect(SFX_CATEGORY.warn5).toBe("reloj");
    expect(SFX_CATEGORY.dice_throw).toBe("dados");
    expect(SFX_CATEGORY.produce).toBe("mesa");
    expect(SFX_CATEGORY.build).toBe("mesa");
    expect(SFX_CATEGORY.trade).toBe("mesa");
    expect(SFX_CATEGORY.robber).toBe("mesa");
    expect(SFX_CATEGORY.card).toBe("mesa");
    expect(SFX_CATEGORY.chat).toBe("avisos");
    expect(SFX_CATEGORY.offer).toBe("avisos");
    expect(SFX_CATEGORY.stolen).toBe("avisos");
    expect(SFX_CATEGORY.win).toBe("avisos");
    expect(SFX_CATEGORY.lose).toBe("avisos");
    expect(voiceSignature("turn")).not.toBe(voiceSignature("turn_soft"));
    expect(voiceSignature("warn10")).not.toBe(voiceSignature("warn5"));
  });
});

describe("alarmas de reloj", () => {
  it("agenda 10 y 5, y no recupera un cruce ya pasado", () => {
    expect(alarmPlan(0, 20_000)).toEqual([
      { name: "warn10", delayMs: 10_000 },
      { name: "warn5", delayMs: 15_000 },
    ]);
    expect(alarmPlan(12_000, 20_000).map((h) => h.name)).toEqual(["warn5"]);
    expect(alarmPlan(15_100, 20_000)).toEqual([{ name: "warn5", delayMs: 0 }]);
    expect(alarmPlan(16_000, 20_000)).toEqual([]);
  });
});

describe("pistas de la mesa", () => {
  it("la primera vista no repite la historia, y avisa si ya es tu turno", () => {
    const busy = base({
      currentPlayerId: "me",
      events: [{ id: 4, kind: "dev", playerId: "me", otherId: null, text: "carta", resources: null }],
      chat: [{ id: "c1", playerId: "other" }],
      trades: [{ id: "t1", fromId: "other", toId: "me" }],
    });
    const fx = { at: 9, animations: ["dice", "build", "robber"] };
    const first = nextCues(null, busy, fx, true, false);
    expect(first.cues).toEqual([{ name: "turn", gain: 1 }]);
    expect(nextCues(first.heard, busy, fx, true, false).cues).toEqual([]);
    const hidden = nextCues(null, busy, null, true, true);
    expect(hidden.cues).toEqual([{ name: "turn", gain: 1.15 }]);
    const other = nextCues(null, base({ winnerId: "me" }), fx, true, false);
    expect(other.cues).toEqual([]);
  });

  it("tu turno es claro y el del resto es suave; con la pestaña atrás sube el tuyo", () => {
    const armed = nextCues(null, base({ currentPlayerId: "me" }), null, true, false);
    const soft = nextCues(armed.heard, base({ currentPlayerId: "other" }), null, true, false);
    expect(soft.cues).toEqual([{ name: "turn_soft", gain: 0.42 }]);
    const yours = nextCues(soft.heard, base({ currentPlayerId: "me" }), null, true, true);
    expect(yours.cues).toEqual([{ name: "turn", gain: 1.15 }]);
    const same = nextCues(yours.heard, base({ currentPlayerId: "me" }), null, true, false);
    expect(same.cues).toEqual([]);
  });

  it("el cobro espera a que se vean los dados y no sale de un log de obra", () => {
    const armed = nextCues(null, base(), null, true, false);
    const ev = {
      id: 3,
      kind: "dados",
      playerId: "me",
      otherId: null,
      text: "Luz cobró",
      resources: { madera: 1 },
    };
    const withFx = nextCues(armed.heard, base({ events: [ev] }), { at: 5, animations: ["dice"] }, true, false);
    expect(withFx.cues.map((c) => c.name)).toEqual(["dice_throw"]);
    expect(withFx.heard.pendingProduce).toBe(true);
    const hidden = nextCues(withFx.heard, base({ events: [ev] }), { at: 5, animations: ["dice"] }, false, false);
    expect(hidden.cues).toEqual([]);
    const shown = nextCues(hidden.heard, base({ events: [ev] }), { at: 5, animations: ["dice"] }, true, false);
    expect(shown.cues).toEqual([{ name: "produce" }]);
    expect(shown.heard.pendingProduce).toBe(false);
    const theirs = nextCues(shown.heard, base({
      events: [ev, { id: 4, kind: "dados", playerId: "other", otherId: null, text: "cobró", resources: { lana: 1 } }],
    }), null, true, false);
    expect(theirs.cues).toEqual([]);
  });

  it("construir, dados y ladrón salen del fx, no de un log repetido", () => {
    const armed = nextCues(null, base(), { at: 1, animations: [] }, true, false);
    const logged = nextCues(armed.heard, base({
      events: [{ id: 1, kind: "build", playerId: "me", otherId: null, text: "poblado", resources: null }],
    }), { at: 1, animations: [] }, true, false);
    expect(logged.cues).toEqual([]);
    const built = nextCues(logged.heard, base({
      events: [{ id: 1, kind: "build", playerId: "me", otherId: null, text: "poblado", resources: null }],
    }), { at: 2, animations: ["build", "robber"] }, true, false);
    expect(built.cues.map((c) => c.name)).toEqual(["build", "robber"]);
  });

  it("ofrece no es comercio; aceptar y el banco sí, una sola vez", () => {
    expect(comercioSound("Luz le ofrece a Tomi.")).toBeNull();
    expect(comercioSound("Luz ofrece a la mesa.")).toBeNull();
    expect(comercioSound("Tomi le manda una contraoferta a Luz.")).toBeNull();
    expect(comercioSound("Tomi aceptó la oferta de Luz.")).toBe("trade");
    expect(comercioSound("Luz cambió con el banco.")).toBe("trade");
    const armed = nextCues(null, base(), null, true, false);
    const offer = nextCues(armed.heard, base({
      events: [
        { id: 1, kind: "comercio", playerId: "other", otherId: null, text: "Mora ofrece a la mesa.", resources: null },
        { id: 2, kind: "comercio", playerId: "me", otherId: "other", text: "Luz aceptó la oferta de Mora.", resources: null },
      ],
    }), null, true, false);
    expect(offer.cues).toEqual([{ name: "trade" }]);
  });

  it("el chat propio no suena; el ajeno sí, una vez por tanda", () => {
    const armed = nextCues(null, base({ chat: [{ id: "old", playerId: "other" }] }), null, true, false);
    const mine = nextCues(armed.heard, base({
      chat: [
        { id: "old", playerId: "other" },
        { id: "a", playerId: "me" },
        { id: "b", playerId: null },
      ],
    }), null, true, false);
    expect(mine.cues).toEqual([]);
    const theirs = nextCues(mine.heard, base({
      chat: [
        { id: "old", playerId: "other" },
        { id: "a", playerId: "me" },
        { id: "c", playerId: "other" },
        { id: "d", playerId: "third" },
      ],
    }), null, true, false);
    expect(theirs.cues).toEqual([{ name: "chat" }]);
    expect(nextCues(theirs.heard, base({
      chat: [
        { id: "c", playerId: "other" },
        { id: "d", playerId: "third" },
      ],
    }), null, true, false).cues).toEqual([]);
  });

  it("una oferta que te llega suena; la tuya no", () => {
    const armed = nextCues(null, base(), null, true, false);
    const incoming = nextCues(armed.heard, base({
      trades: [
        { id: "t1", fromId: "other", toId: "todos" },
        { id: "t2", fromId: "me", toId: "todos" },
        { id: "t3", fromId: "third", toId: "other" },
        { id: "t4", fromId: "other", toId: "me" },
      ],
    }), null, true, false);
    expect(incoming.cues).toEqual([{ name: "offer" }]);
    expect(nextCues(incoming.heard, base({
      trades: [{ id: "t4", fromId: "other", toId: "me" }],
    }), null, true, false).cues).toEqual([]);
  });

  it("victoria y derrota salen de quién ganó, no de un cambio de turno", () => {
    const armed = nextCues(null, base({ currentPlayerId: "other" }), null, true, false);
    const win = nextCues(armed.heard, base({ currentPlayerId: "me", winnerId: "me" }), null, true, false);
    expect(win.cues).toEqual([{ name: "win" }]);
    const loseArmed = nextCues(null, base({ currentPlayerId: "other" }), null, true, false);
    const lose = nextCues(loseArmed.heard, base({ currentPlayerId: "other", winnerId: "other" }), null, true, false);
    expect(lose.cues).toEqual([{ name: "lose" }]);
    expect(nextCues(win.heard, base({ currentPlayerId: "me", winnerId: "me" }), null, true, false).cues).toEqual([]);
  });

  it("la carta de desarrollo suena una vez por tanda", () => {
    const armed = nextCues(null, base(), null, true, false);
    const cards = nextCues(armed.heard, base({
      events: [
        { id: 1, kind: "dev", playerId: "me", otherId: null, text: "compró una carta", resources: null },
        { id: 2, kind: "dev", playerId: "other", otherId: null, text: "jugó caballero", resources: null },
      ],
    }), null, true, false);
    expect(cards.cues).toEqual([{ name: "card" }]);
    expect(cards.cues.some((c) => c.name === "warn10" || c.name === "warn5")).toBe(false);
  });
});

describe("panel de opciones", () => {
  it("tiene volumen, categorías y el aviso de gesto, y el master sigue en castellano", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('sfxOn ? "activado" : "apagado"');
    expect(hud).toContain('aria-label="Volumen general"');
    expect(hud).toContain('data-testid="sfx-volume"');
    expect(hud).toContain("sfx-cat-");
    expect(hud).toContain('data-testid="sfx-unlock"');
    expect(hud).toContain("también en el celular");
    expect(hud).toContain("lg:left-3");
    expect(hud).not.toContain("lg:right-3");
    const clock = readFileSync("src/ui/TurnClock.tsx", "utf8");
    expect(clock).not.toContain("playSfx");
    const rig = readFileSync("src/three/dice/DiceRig.tsx", "utf8");
    expect(rig).toContain("playDiceHit");
    expect(rig).toContain("dice_settle");
    expect(rig).not.toContain('playSfx("dice_throw")');
    const sparks = readFileSync("src/three/vfx/Sparks.tsx", "utf8");
    expect(sparks).not.toContain("playSfx");
    const card = readFileSync("src/three/CardReveal.tsx", "utf8");
    expect(card).not.toContain("playWhoosh");
    expect(card).not.toContain("new AudioContext");
  });
});
