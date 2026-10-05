import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Building, ClientView, LogEvent, Resource } from "../shared/types.ts";
import { HARVEST_LIMIT_MS, harvestFlights, harvestMotion, type HarvestMotion } from "../src/play/harvest.ts";
import { VOICES } from "../src/audio/voices.ts";

function ev(partial: Partial<LogEvent> & Pick<LogEvent, "id" | "kind">): LogEvent {
  return { t: 0, text: "", playerId: null, otherId: null, icons: [], ...partial };
}

function board(over: {
  youId?: string;
  dice?: [number, number] | null;
  robberHexId?: string;
  buildings?: Building[];
  events?: LogEvent[];
  holdFrom?: number;
}) {
  const hexes: ClientView["hexes"] = [
    { id: "bosque", q: 0, r: 0, terrain: "madera", number: 6 },
    { id: "bosque-b", q: 1, r: -1, terrain: "madera", number: 6 },
    { id: "colinas", q: 1, r: 0, terrain: "ladrillo", number: 6 },
    { id: "pasto", q: 0, r: 1, terrain: "lana", number: 5 },
    { id: "dunas", q: -1, r: 1, terrain: "desierto", number: 6 },
    { id: "trigo-ladron", q: -1, r: 0, terrain: "trigo", number: 6 },
  ];
  const vertices: ClientView["vertices"] = [
    { id: "v-ciudad", x: 0, y: 0, port: null, hexIds: ["bosque", "pasto"] },
    { id: "v-extra", x: 1, y: 0, port: null, hexIds: ["bosque"] },
    { id: "v-otro", x: 2, y: 0, port: null, hexIds: ["colinas"] },
    { id: "v-lejos", x: 3, y: 0, port: null, hexIds: ["bosque-b"] },
    { id: "v-bloque", x: 4, y: 0, port: null, hexIds: ["dunas", "trigo-ladron"] },
  ];
  const buildings: Building[] = over.buildings ?? [
    { vertexId: "v-ciudad", playerId: "p0", kind: "ciudad" },
    { vertexId: "v-extra", playerId: "p0", kind: "poblado" },
    { vertexId: "v-otro", playerId: "p1", kind: "poblado" },
    { vertexId: "v-lejos", playerId: "p1", kind: "ciudad" },
    { vertexId: "v-bloque", playerId: "p0", kind: "ciudad" },
  ];
  return {
    view: {
      youId: over.youId ?? "p0",
      dice: over.dice === undefined ? ([3, 3] as [number, number]) : over.dice,
      robberHexId: over.robberHexId ?? "trigo-ladron",
      hexes,
      vertices,
      buildings,
      events: over.events ?? [],
    },
    ui: { holdFromEventId: over.holdFrom ?? 4 },
  };
}

function paid(id: number, playerId: string, resources: Partial<Record<Resource, number>>): LogEvent {
  return ev({ id, kind: "dados", text: "cobró", playerId, resources });
}

const roll = [
  ev({ id: 5, kind: "dados", text: "sacó 3 y 3", dice: [3, 3], playerId: "p0" }),
  paid(6, "p0", { madera: 3 }),
  paid(7, "p1", { madera: 2, ladrillo: 1 }),
];

function arrive(flights: { delayMs: number; flightMs: number }[]): number {
  return flights.reduce((max, f) => Math.max(max, f.delayMs + f.flightMs), 0);
}

describe("cosecha: de la casilla a quien cobra", () => {
  it("atribuye la casilla que produce, suma la ciudad y deja afuera ladrón y desierto", () => {
    const { view, ui } = board({ events: roll });
    const flights = harvestFlights(view, ui, "full");
    const mine = flights.filter((f) => f.mine);
    expect(mine).toEqual([
      expect.objectContaining({ playerId: "p0", resource: "madera", hexId: "bosque", n: 3, mine: true }),
    ]);
    const theirs = flights.filter((f) => !f.mine);
    expect(theirs.map((f) => [f.hexId, f.resource, f.n])).toEqual([
      ["bosque-b", "madera", 2],
      ["colinas", "ladrillo", 1],
    ]);
    expect(flights.some((f) => f.hexId === "trigo-ladron" || f.hexId === "dunas" || f.hexId === "pasto")).toBe(false);
  });

  it("el log manda: el banco que no alcanza y un cobro viejo no vuelan", () => {
    const short = [
      ev({ id: 2, kind: "build", text: "cobró del segundo poblado", playerId: "p0", resources: { lana: 2 } }),
      ev({ id: 5, kind: "dados", text: "sacó 3 y 3", dice: [3, 3], playerId: "p0" }),
      paid(6, "p0", { madera: 2 }),
      ev({ id: 7, kind: "dados", text: "El banco no da abasto: nadie cobra", playerId: null }),
    ];
    const { view, ui } = board({ events: short });
    const flights = harvestFlights(view, ui, "full");
    expect(flights).toEqual([
      expect.objectContaining({ playerId: "p0", hexId: "bosque", resource: "madera", n: 2, mine: true }),
    ]);
    expect(harvestFlights(view, { holdFromEventId: 0 }, "full")).toEqual([]);
    expect(harvestFlights({ ...view, dice: null }, ui, "full")).toEqual([]);
    expect(harvestFlights({ ...view, dice: [3, 4] }, ui, "full")).toEqual([]);
  });

  it("cada quien ve lo suyo hacia la mano y lo ajeno discreto, en menos de 1,5 s", () => {
    const { view, ui } = board({ events: roll });
    for (const motion of ["full", "lite", "reduce"] as HarvestMotion[]) {
      const yours = harvestFlights(view, ui, motion);
      const other = harvestFlights({ ...view, youId: "p1" }, ui, motion);
      expect(yours.filter((f) => f.mine).map((f) => f.playerId)).toEqual(["p0"]);
      expect(other.filter((f) => f.mine).map((f) => f.playerId)).toEqual(["p1", "p1"]);
      expect(other.filter((f) => !f.mine).every((f) => f.playerId === "p0" && f.bounce === 0)).toBe(true);
      expect(arrive(yours)).toBeLessThanOrEqual(HARVEST_LIMIT_MS);
      expect(arrive(yours)).toBeLessThan(1500);
      expect(arrive(other)).toBeLessThan(1500);
    }
    const full = harvestFlights(view, ui, "full");
    expect(full.find((f) => f.mine)).toMatchObject({ delayMs: 0, flightMs: 780, lift: -72, bounce: -10 });
    expect(full.filter((f) => !f.mine).every((f) => f.lift === -18 && f.bounce === 0 && f.flightMs === 460)).toBe(true);
    expect(full[1]?.delayMs).toBe(80);
  });

  it("liviano va recto y más corto; reducir movimiento no viaja ni rebota", () => {
    const many = board({
      events: [
        ev({ id: 5, kind: "dados", dice: [3, 3], playerId: "p0" }),
        paid(6, "p0", { madera: 3, ladrillo: 1 }),
        paid(7, "p1", { madera: 2 }),
      ],
      buildings: [
        { vertexId: "v-ciudad", playerId: "p0", kind: "ciudad" },
        { vertexId: "v-extra", playerId: "p0", kind: "poblado" },
        { vertexId: "v-otro", playerId: "p0", kind: "poblado" },
        { vertexId: "v-lejos", playerId: "p1", kind: "ciudad" },
      ],
    });
    const lite = harvestFlights(many.view, many.ui, "lite");
    const reduced = harvestFlights(many.view, many.ui, "reduce");
    expect(lite.every((f) => f.lift === 0)).toBe(true);
    expect(lite.find((f) => f.mine)?.flightMs).toBe(420);
    expect(arrive(lite)).toBeLessThan(arrive(harvestFlights(many.view, many.ui, "full")));
    expect(reduced.every((f) => f.lift === 0 && f.bounce === 0 && f.delayMs === 0 && f.flightMs === 160)).toBe(true);
    expect(harvestMotion({ reduce: true, lite: true })).toBe("reduce");
    expect(harvestMotion({ reduce: false, lite: true })).toBe("lite");
    expect(harvestMotion({ reduce: false, lite: false })).toBe("full");
  });

  it("muchas cartas se comprimen y la última igual llega antes del tope", () => {
    const buildings: Building[] = [];
    const events: LogEvent[] = [ev({ id: 5, kind: "dados", dice: [3, 3], playerId: "p0" })];
    const vertices: ClientView["vertices"] = [];
    const hexes: ClientView["hexes"] = [];
    for (let i = 0; i < 12; i += 1) {
      const id = `h${i}`;
      hexes.push({ id, q: i, r: 0, terrain: "madera", number: 6 });
      vertices.push({ id: `v${i}`, x: i, y: 0, port: null, hexIds: [id] });
      buildings.push({ vertexId: `v${i}`, playerId: "p0", kind: "poblado" });
    }
    events.push(paid(6, "p0", { madera: 12 }));
    const flights = harvestFlights(
      { youId: "p0", dice: [3, 3], robberHexId: "otro", hexes, vertices, buildings, events },
      { holdFromEventId: 4 },
      "full",
    );
    expect(flights).toHaveLength(12);
    expect(flights[11]?.delayMs).toBeLessThan(80 * 11);
    expect(arrive(flights)).toBeLessThanOrEqual(HARVEST_LIMIT_MS);
    expect(arrive(flights)).toBeGreaterThan(780);
  });

  it("el vuelo no bloquea, no mueve la cámara y el sonido es uno solo y suave", () => {
    const fly = readFileSync("src/ui/ProductionFly.tsx", "utf8");
    const css = readFileSync("src/index.css", "utf8");
    const cues = readFileSync("src/audio/cues.ts", "utf8");
    expect(fly).toContain("pointer-events-none");
    expect(fly).toContain("colonos-fly-hud");
    expect(fly).toContain("data-hand-res");
    expect(fly).toContain("HEX_SCREENS");
    expect(fly).toContain("querySelectorAll");
    expect(fly).not.toContain("lastFx");
    expect(fly).not.toContain("recenterNonce");
    expect(fly).not.toContain("setBusy");
    expect(fly).not.toContain("playSfx");
    expect(css).toContain("--lift");
    expect(css).toContain("--bounce");
    expect(css).toContain("colonos-harvest-pop");
    expect(css).toContain("colonos-hand-catch");
    expect(readFileSync("src/ui/Hud.tsx", "utf8")).toContain("data-seat={p.id}");
    const produce = cues.slice(cues.indexOf("pendingProduce"));
    expect(produce).toContain('e.playerId === view.youId');
    expect(produce).toContain('{ name: "produce" }');
    expect(VOICES.produce.every((step) => step.gain <= 0.05)).toBe(true);
    expect(Math.max(...VOICES.produce.map((step) => step.from))).toBeLessThan(800);
  });
});
