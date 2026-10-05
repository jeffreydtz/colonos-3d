import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RESOURCES, type LogEvent, type Resources } from "../shared/types.ts";
import { DEFAULT_BOT_DELAY_MS } from "../server/rooms.ts";
import {
  DICE_HOLD_MS,
  beginDiceHold,
  countAfterHold,
  diceHeld,
  eventsWhileHeld,
  gainsWhileHeld,
  resourcesAfterHold,
  rollGainsFor,
  revealSettled,
  settleRevealDelayMs,
  skipDiceHold,
} from "../src/play/diceHold.ts";
function ev(partial: Partial<LogEvent> & Pick<LogEvent, "id" | "kind">): LogEvent {
  return {
    t: 0,
    text: "",
    playerId: null,
    otherId: null,
    icons: [],
    ...partial,
  };
}

const full = (n: Partial<Resources>): Resources => {
  const bag = { madera: 0, ladrillo: 0, lana: 0, trigo: 0, mineral: 0 };
  return { ...bag, ...n };
};

describe("dados: la mano, el log y las cartas no adelantan el resultado", () => {
  const events = [
    ev({ id: 4, kind: "turno", text: "le toca" }),
    ev({ id: 5, kind: "dados", text: "sacó 6 y 5", dice: [6, 5], playerId: "p0" }),
    ev({ id: 6, kind: "dados", text: "cobró", playerId: "p0", resources: { ladrillo: 3, mineral: 2 } }),
    ev({ id: 7, kind: "dados", text: "cobró", playerId: "p1", resources: { madera: 1 } }),
  ];

  it("mientras no se reveló, la tira resta lo cobrado y el log corta antes de la tirada", () => {
    const ui = beginDiceHold({ events, rollNo: 3 });
    expect(diceHeld(ui)).toBe(true);
    expect(ui.holdFromEventId).toBe(4);
    const gains = gainsWhileHeld(events, ui.holdFromEventId);
    expect(resourcesAfterHold(full({ ladrillo: 3, mineral: 2, madera: 1 }), gains.get("p0"))).toEqual(full({ madera: 1 }));
    expect(countAfterHold(4, gains.get("p1"))).toBe(3);
    expect(eventsWhileHeld(events, ui).map((e) => e.id)).toEqual([4]);
  });

  it("el HUD suelta «en el aire» cuando los dados apoyan, sin esperar los 3,2 s", () => {
    const ui = beginDiceHold({ events, rollNo: 3 });
    const early = revealSettled(ui, 0.4, 1.1);
    expect(early).toBe(ui);
    expect(diceHeld(early)).toBe(true);
    const shown = revealSettled(ui, 1.25, 1.1);
    expect(shown.revealed).toBe(true);
    expect(shown.presenting).toBe(true);
    expect(diceHeld(shown)).toBe(false);
    expect(revealSettled(shown, 2, 1.1)).toBe(shown);
    const rig = readFileSync("src/three/dice/DiceRig.tsx", "utf8");
    expect(rig).toContain("revealSettled");
    expect(rig).toContain("clip.settleAt");
  });

  it("si el frame del asiento no llega, el HUD igual revela al tope settleAt + 0,1 s", () => {
    expect(settleRevealDelayMs(0.62)).toBe(720);
    expect(settleRevealDelayMs(0.62, 200)).toBe(520);
    expect(settleRevealDelayMs(0.62, 900)).toBe(0);
    const ui = beginDiceHold({ events, rollNo: 3 });
    const shown = revealSettled(ui, 0.62 + 0.1, 0.62);
    expect(shown.revealed).toBe(true);
    expect(shown.presenting).toBe(true);
    const rig = readFileSync("src/three/dice/DiceRig.tsx", "utf8");
    const effect = rig.slice(rig.indexOf("useLayoutEffect(() => {"), rig.indexOf("useFrame(() => {"));
    expect(effect.indexOf("reduceMotion()")).toBeGreaterThan(-1);
    expect(effect.indexOf("reduceMotion()")).toBeLessThan(effect.indexOf("setTimeout"));
    expect(effect).toContain("settleRevealDelayMs");
    const game = readFileSync("src/screens/Game.tsx", "utf8");
    expect(game).toContain("reduceMotion() ? DICE_HOLD_REDUCED_MS : DICE_HOLD_MS");
  });

  it("al revelar (o saltear) se ve todo, incluido quien reconecta sin fx", () => {
    const ui = beginDiceHold({ events, rollNo: 3 });
    const shown = skipDiceHold(ui);
    expect(diceHeld(shown)).toBe(false);
    expect(eventsWhileHeld(events, shown)).toHaveLength(4);
    expect(skipDiceHold(shown)).toBe(shown);
    // Sin evento de dados no hay nada que esconder.
    expect(gainsWhileHeld(events, 99).size).toBe(0);
    for (const r of RESOURCES) expect(full({})[r]).toBe(0);
  });

  it("el vuelo de producción sale sólo con lo que pagó esta tirada, y una vez", () => {
    const setup = [
      ev({ id: 1, kind: "dados", text: "cobró del segundo poblado", playerId: "p0", resources: { lana: 2 } }),
      ...events,
    ];
    const ui = beginDiceHold({ events: setup, rollNo: 3 });
    expect(rollGainsFor(setup, ui, "p0")).toEqual({ ladrillo: 3, mineral: 2 });
    expect(rollGainsFor(setup, ui, "p2")).toBeNull();
    // Reconexión o captura congelada: sin hold no se festeja lo cobrado antes.
    expect(rollGainsFor(setup, { holdFromEventId: 0 }, "p0")).toBeNull();
    const fly = readFileSync("src/ui/ProductionFly.tsx", "utf8");
    const plan = readFileSync("src/play/harvest.ts", "utf8");
    expect(plan).toContain("rollGainsFor");
    expect(fly).toContain("harvestFlights");
    expect(fly).toContain("flownHold.current === holdFrom");
    // La tira de escritorio sigue en el DOM oculta en el celu: el destino es la que se ve.
    expect(fly).toContain("querySelectorAll");
    expect(fly).not.toContain("lastFx");
  });

  it("el servidor no espera la animación: el bot arranca mucho antes del hold", () => {
    const rooms = readFileSync("server/rooms.ts", "utf8");
    expect(rooms).not.toContain("DICE_HOLD");
    expect(rooms).not.toContain("diceHold");
    // 900 ms de base + jitter; el hold visual es 3,2 s y vive sólo en el cliente.
    expect(DEFAULT_BOT_DELAY_MS + 400 + 260).toBeLessThan(DICE_HOLD_MS);
    const app = readFileSync("src/App.tsx", "utf8");
    const reconnect = app.slice(app.indexOf("function applyJoin"));
    expect(reconnect).not.toContain("lastFx");
    expect(app).toContain('socket.on("fx", onFx)');
  });

  it("atajos: T abre el trueque, Esc saltea, y un select no dispara", () => {
    const keys = readFileSync("src/ui/Hotkeys.tsx", "utf8");
    expect(keys).toContain('el.tagName === "SELECT"');
    expect(keys).toContain("actionTab: tradeTabFor(view)");
    expect(keys).toContain("skipDiceHold");
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain("Esperá tu turno para cambiar.");
    expect(hud).toContain('data-testid={`hand-rate-${r}`}');
    expect(hud).toContain('label="Opciones"');
    expect(hud).toContain('data-testid="trade-accept"');
    expect(hud).toContain('data-testid={mine ? "trade-cancel" : "trade-reject"}');
    // En táctil el nombre sale con toque largo (IconTips), no como texto fijo en la tira.
    expect(hud).not.toContain("iconLabels");
    const tips = readFileSync("src/ui/icons/IconTips.tsx", "utf8");
    expect(tips).toContain("HOLD_MS");
    expect(tips).toContain("eatClick");
  });
});
