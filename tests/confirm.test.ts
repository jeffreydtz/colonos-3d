import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LegalMoves, Resources } from "@shared/types";
import {
  describePending,
  parseConfirmFlag,
  pendingStillLegal,
  same,
  stage,
  type ConfirmView,
  type Pending,
} from "../src/play/confirm.ts";
import { isTap, TAP_SLOP_PX } from "../src/play/tap.ts";
import { EDGE_HIT_H, EDGE_HIT_W, VERTEX_HIT_LIFT, VERTEX_HIT_R } from "../src/three/hits.ts";
import { S } from "../src/three/geo.ts";
import { TILE_TINT, tileTint } from "../src/three/tiles.ts";

const HAND: Resources = { madera: 4, ladrillo: 2, lana: 2, trigo: 2, mineral: 3 };

function legal(over: Partial<LegalMoves> = {}): LegalMoves {
  return {
    vertices: ["v1"],
    cityVertices: ["c1"],
    edges: ["e1"],
    hexes: ["h1"],
    stealFrom: [],
    canRoll: false,
    canEndTurn: true,
    canBuyDev: true,
    canPlayKnight: true,
    canPlayYearPlenty: true,
    canPlayMonopoly: true,
    canPlayRoadBuilding: true,
    canTrade: true,
    canBankTrade: true,
    mustDiscard: 0,
    robberHexes: ["h1"],
    ...over,
  };
}

function view(over: Partial<ConfirmView> = {}): ConfirmView {
  return {
    phase: "principal",
    youId: "me",
    robberHexId: "0,0",
    pendingRoadBuilding: 0,
    legal: legal(),
    trades: [{ id: "t1", fromId: "other", toId: "me" }],
    hand: { resources: HAND },
    ...over,
  };
}

describe("confirmación en dos toques", () => {
  it("el primero marca, el segundo igual corre, otro objetivo sólo reencuadra", () => {
    const first: Pending = { kind: "vertex", id: "v1", build: "poblado" };
    expect(stage(null, first, true)).toEqual({ pending: first, run: false });
    expect(stage(first, first, true)).toEqual({ pending: null, run: true });
    const other: Pending = { kind: "vertex", id: "v2", build: "poblado" };
    expect(stage(first, other, true)).toEqual({ pending: other, run: false });
    const city: Pending = { kind: "vertex", id: "v1", build: "ciudad" };
    expect(stage(first, city, true)).toEqual({ pending: city, run: false });
  });

  it("apagada corre al toque y no deja una marca colgada", () => {
    expect(stage({ kind: "end_turn" }, { kind: "buy_dev" }, false)).toEqual({ pending: null, run: true });
    expect(stage(null, { kind: "end_turn" }, false).run).toBe(true);
  });

  it("mismo objetivo: año sin importar el orden, oferta si cambian las cantidades no", () => {
    expect(
      same(
        { kind: "year", resources: ["trigo", "madera"] },
        { kind: "year", resources: ["madera", "trigo"] },
      ),
    ).toBe(true);
    expect(
      same(
        { kind: "year", resources: ["trigo", "trigo"] },
        { kind: "year", resources: ["madera", "trigo"] },
      ),
    ).toBe(false);
    expect(same({ kind: "edge", id: "e1", build: "setup" }, { kind: "edge", id: "e1", build: "camino" })).toBe(true);
    expect(same({ kind: "edge", id: "e1", build: "camino" }, { kind: "edge", id: "e2", build: "camino" })).toBe(false);
    expect(same({ kind: "buy_dev" }, { kind: "buy_dev" })).toBe(true);
    expect(same({ kind: "end_turn" }, { kind: "end_turn" })).toBe(true);
    expect(same({ kind: "play_roads" }, { kind: "play_roads" })).toBe(true);
    expect(
      same(
        { kind: "robber", id: "h1", knight: true },
        { kind: "robber", id: "h1", knight: false },
      ),
    ).toBe(false);
    expect(
      same(
        { kind: "offer", toId: "todos", give: { madera: 1 }, want: { ladrillo: 1 } },
        { kind: "offer", toId: "todos", give: { madera: 2 }, want: { ladrillo: 1 } },
      ),
    ).toBe(false);
    expect(
      same(
        { kind: "offer", toId: "luz", give: { madera: 1, ladrillo: 0 }, want: { lana: 1 } },
        { kind: "offer", toId: "luz", give: { madera: 1 }, want: { lana: 1 } },
      ),
    ).toBe(true);
    expect(
      same(
        { kind: "bank", give: { madera: 4 }, want: { trigo: 1 }, rate: 4 },
        { kind: "bank", give: { madera: 4 }, want: { trigo: 1 }, rate: 3 },
      ),
    ).toBe(false);
    expect(same({ kind: "accept", tradeId: "t1" }, { kind: "accept", tradeId: "t1" })).toBe(true);
    expect(same({ kind: "mono", resource: "lana" }, { kind: "mono", resource: "lana" })).toBe(true);
  });

  it("el texto dice costo y consecuencia", () => {
    expect(describePending({ kind: "vertex", id: "v", build: "setup" })).toMatchObject({
      title: "Poblado inicial",
      detail: "Gratis. Después vas a poner el camino.",
      cost: null,
    });
    expect(describePending({ kind: "edge", id: "e", build: "setup" }).detail).toBe("Gratis, pegado al poblado.");
    const city = describePending({ kind: "vertex", id: "c", build: "ciudad" });
    expect(city.detail).toBe("Mejora este poblado.");
    expect(city.cost).toMatchObject({ trigo: 2, mineral: 3 });
    expect(describePending({ kind: "vertex", id: "v", build: "poblado" }).cost).toMatchObject({
      ladrillo: 1,
      madera: 1,
      lana: 1,
      trigo: 1,
    });
    expect(describePending({ kind: "edge", id: "e", build: "camino" }).cost).toMatchObject({ ladrillo: 1, madera: 1 });
    expect(describePending({ kind: "robber", id: "h", knight: false }).detail).toBe("Nadie cobra en esa casilla.");
    expect(describePending({ kind: "robber", id: "h", knight: true }).detail).toBe(
      "El ladrón pasa a esa casilla y sumás un caballero.",
    );
    const dev = describePending({ kind: "buy_dev" });
    expect(dev.detail).toBe("Se abre sólo en tu pantalla.");
    expect(dev.cost).toMatchObject({ lana: 1, trigo: 1, mineral: 1 });
    expect(describePending({ kind: "play_roads" }).detail).toBe("Jugás la carta y después marcás dos caminos.");
    expect(describePending({ kind: "year", resources: ["madera", "ladrillo"] }).detail).toBe(
      "Tomás Madera y Ladrillo del banco.",
    );
    expect(describePending({ kind: "mono", resource: "lana" }).detail).toBe("Cada rival te entrega su Lana.");
    expect(
      describePending({ kind: "bank", give: { madera: 4 }, want: { trigo: 1 }, rate: 4 }).detail,
    ).toBe("Das 4 Madera y recibís 1 Trigo.");
    expect(
      describePending(
        { kind: "offer", toId: "luz", give: { madera: 1 }, want: { ladrillo: 1 } },
        () => "Luz",
      ).detail,
    ).toBe("Das 1 Madera y pedís 1 Ladrillo a Luz.");
    expect(
      describePending({ kind: "offer", toId: "todos", give: { lana: 1 }, want: { mineral: 2 } }).detail,
    ).toContain("a la mesa");
    expect(describePending({ kind: "accept", tradeId: "t" }).detail).toBe(
      "Entregás lo que piden y recibís lo que dan.",
    );
    expect(describePending({ kind: "end_turn" }).detail).toBe("Le pasa la mesa al siguiente. No se puede deshacer.");
  });

  it("una marca vieja deja de ser legal si cambia la fase o la mano", () => {
    const base = view();
    expect(pendingStillLegal({ kind: "vertex", id: "v1", build: "poblado" }, base)).toBe(true);
    expect(pendingStillLegal({ kind: "vertex", id: "v1", build: "setup" }, base)).toBe(false);
    expect(
      pendingStillLegal(
        { kind: "vertex", id: "v1", build: "setup" },
        view({ phase: "colocacion_poblado" }),
      ),
    ).toBe(true);
    expect(pendingStillLegal({ kind: "vertex", id: "c1", build: "ciudad" }, base)).toBe(true);
    expect(pendingStillLegal({ kind: "vertex", id: "no", build: "ciudad" }, base)).toBe(false);
    expect(pendingStillLegal({ kind: "edge", id: "e1", build: "camino" }, base)).toBe(true);
    expect(pendingStillLegal({ kind: "edge", id: "e1", build: "setup" }, base)).toBe(false);
    expect(pendingStillLegal({ kind: "edge", id: "e1", build: "carta" }, view({ pendingRoadBuilding: 2 }))).toBe(true);
    expect(pendingStillLegal({ kind: "edge", id: "e1", build: "camino" }, view({ pendingRoadBuilding: 2 }))).toBe(false);
    expect(pendingStillLegal({ kind: "robber", id: "h1", knight: false }, view({ phase: "ladron" }))).toBe(true);
    expect(pendingStillLegal({ kind: "robber", id: "h1", knight: false }, base)).toBe(false);
    expect(pendingStillLegal({ kind: "robber", id: "h1", knight: true }, base)).toBe(true);
    expect(pendingStillLegal({ kind: "robber", id: "0,0", knight: true }, view({ robberHexId: "0,0" }))).toBe(false);
    expect(pendingStillLegal({ kind: "buy_dev" }, view({ legal: legal({ canBuyDev: false }) }))).toBe(false);
    expect(pendingStillLegal({ kind: "end_turn" }, view({ legal: legal({ canEndTurn: false }) }))).toBe(false);
    expect(pendingStillLegal({ kind: "accept", tradeId: "t1" }, base)).toBe(true);
    expect(pendingStillLegal({ kind: "accept", tradeId: "no" }, base)).toBe(false);
    expect(pendingStillLegal({ kind: "accept", tradeId: "t1" }, view({ youId: "other" }))).toBe(false);
    expect(
      pendingStillLegal(
        { kind: "bank", give: { madera: 4 }, want: { trigo: 1 }, rate: 4 },
        view({ hand: { resources: { ...HAND, madera: 3 } } }),
      ),
    ).toBe(false);
    expect(
      pendingStillLegal({ kind: "offer", toId: "todos", give: { lana: 1 }, want: { mineral: 1 } }, base),
    ).toBe(true);
  });

  it("la confirmación arranca prendida y se puede apagar", () => {
    expect(parseConfirmFlag(null)).toBe(true);
    expect(parseConfirmFlag("1")).toBe(true);
    expect(parseConfirmFlag("true")).toBe(true);
    expect(parseConfirmFlag("0")).toBe(false);
    expect(parseConfirmFlag("false")).toBe(false);
    expect(readFileSync("src/play/confirm.ts", "utf8")).toContain("colonos-confirmar");
  });
});

describe("el toque llega aunque el dedo se corra o la malla se redibuje", () => {
  it("slop y volúmenes: la esfera no pisa al vértice de al lado", () => {
    expect(isTap(0, 0)).toBe(true);
    expect(isTap(TAP_SLOP_PX, 0)).toBe(true);
    expect(isTap(TAP_SLOP_PX + 1, 0)).toBe(false);
    expect(isTap(12, 12)).toBe(false);
    expect(TAP_SLOP_PX).toBeGreaterThanOrEqual(14);
    expect(TAP_SLOP_PX).toBeLessThanOrEqual(18);
    expect(VERTEX_HIT_R).toBeGreaterThanOrEqual(0.45);
    expect(VERTEX_HIT_R * 2).toBeLessThan(S);
    expect(VERTEX_HIT_LIFT).toBeGreaterThan(0);
    expect(EDGE_HIT_W).toBeGreaterThanOrEqual(0.4);
    expect(EDGE_HIT_H).toBeGreaterThanOrEqual(0.3);
  });

  it("pointerdown captura el id y no toca el store; el up vive en window", () => {
    const tap = readFileSync("src/three/instanceTap.ts", "utf8");
    expect(tap).toContain("pointerup");
    expect(tap).toContain("pointercancel");
    expect(tap).toContain("isTap");
    expect(tap).toContain("resolveId");
    expect(tap).not.toContain("useApp");
    expect(tap).toContain("No actualiza React en el down");
    const ghost = readFileSync("src/three/pieces/Settlements.tsx", "utf8");
    const spots = ghost.slice(ghost.indexOf("export function GhostSpots"));
    expect(spots).toContain("onPointerDown");
    expect(spots).toContain("sphereGeometry");
    expect(spots).toContain("VERTEX_HIT_R");
    expect(spots).not.toContain("onClick");
    expect(spots).not.toContain("set({");
    expect(spots).not.toContain("useApp.getState().set");
    const roads = readFileSync("src/three/pieces/Roads.tsx", "utf8");
    expect(roads).toContain("EDGE_HIT_W");
    expect(roads).toContain("EDGE_HIT_H");
    expect(roads).toContain("onPointerDown");
    expect(roads).not.toContain("onClick");
    const field = readFileSync("src/three/pieces/HexField.tsx", "utf8");
    expect(field).toContain("onPointerDown={bindInstanceTap");
    expect(field).not.toContain("onClick=");
    const board = readFileSync("src/three/BoardScene.tsx", "utf8");
    expect(board).toContain('touchAction: "none"');
    expect(board).toContain("touchAction = \"none\"");
  });

  it("la loseta elegida se aclara sin perder el orden highlighted > robbed > producing", () => {
    const none = new Set<string>();
    expect(tileTint("h", "madera", new Set(["h"]), new Set(["h"]), "h", "h")).toBe(TILE_TINT.chosen);
    expect(tileTint("h", "madera", new Set(["h"]), undefined, "h")).toBe(TILE_TINT.highlighted);
    expect(tileTint("m", "mineral", none, undefined, "m")).toBe(TILE_TINT.robbed);
    expect(tileTint("p", "trigo", none, new Set(["p"]))).toBe(TILE_TINT.producing);
  });
});

describe("la puerta está en cada gasto y no en tirar, rechazar ni descartar", () => {
  it("panel, dock, atajos y opciones", () => {
    const panel = readFileSync("src/ui/ActionPanel.tsx", "utf8");
    expect(panel).toContain('previewOrRun({ kind: "buy_dev" })');
    expect(panel).toContain('previewOrRun({ kind: "play_roads" })');
    expect(panel).toContain('kind: "year"');
    expect(panel).toContain('kind: "mono"');
    expect(panel).toContain('kind: "bank"');
    expect(panel).toContain('kind: "offer"');
    expect(panel).toContain('kind: "accept"');
    expect(panel).toContain('previewOrRun({ kind: "end_turn" })');
    expect(panel).toContain('sendAction({ type: "roll" })');
    expect(panel).toContain('type: "reject_trade"');
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('kind: "end_turn"');
    expect(hud).toContain('kind: "accept"');
    expect(hud).toContain('kind: "bank"');
    expect(hud).toContain('data-testid="confirm-toggle"');
    expect(hud).toContain("aria-pressed={confirmActions}");
    expect(hud).toContain('type: "discard"');
    expect(hud).toContain('type: "reject_trade"');
    const bar = readFileSync("src/ui/ConfirmBar.tsx", "utf8");
    expect(bar).toContain('data-testid="confirm-bar"');
    expect(bar).toContain('data-testid="confirm-go"');
    expect(bar).toContain('data-testid="confirm-cancel"');
    expect(bar).toContain("min-h-12");
    const keys = readFileSync("src/ui/Hotkeys.tsx", "utf8");
    expect(keys).toContain("pending: null");
    expect(keys).toContain('previewOrRun({ kind: "end_turn" })');
    expect(keys).toContain('sendAction({ type: "roll" })');
    expect(keys).toContain("skipDiceHold");
  });
});
