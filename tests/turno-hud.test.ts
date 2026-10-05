import { afterEach, describe, expect, it } from "vitest";
import { applyAction } from "../server/engine.ts";
import { legalMoves, legalSettlementVertices } from "../server/legal.ts";
import {
  applyIdleTimeout,
  bindSocket,
  createRoom,
  joinRoom,
  resetRoomsForTests,
  startGame,
} from "../server/rooms.ts";
import { clockLabel, clockTone, crossedWarning, timeoutCopy } from "../src/play/turnClock.ts";
import { setupCue, turnHeadline } from "../src/play/setupCue.ts";
import { phaseOf } from "./helpers.ts";

afterEach(() => {
  resetRoomsForTests();
});

function openTable() {
  const a = createRoom({ name: "Luz", color: "rojo", seatLimit: 3 });
  if (!a.ok) throw new Error("create");
  const b = joinRoom({ code: a.room.code, name: "Tomi", color: "azul" });
  const c = joinRoom({ code: a.room.code, name: "Mora", color: "naranja" });
  if (!b.ok || !c.ok) throw new Error("join");
  bindSocket(a.room, a.playerId, "s-a");
  bindSocket(a.room, b.playerId, "s-b");
  bindSocket(a.room, c.playerId, "s-c");
  const started = startGame(a.room, a.playerId, { seed: 7 });
  if (!started.ok) throw new Error("start");
  return a.room;
}

describe("reloj del turno", () => {
  it("cambia de tono a los 10 y a los 5, y no se esconde en cero", () => {
    expect(clockTone(45)).toBe("ok");
    expect(clockTone(10)).toBe("warn");
    expect(clockTone(5)).toBe("danger");
    expect(clockTone(0)).toBe("expired");
    expect(clockLabel(65)).toBe("1:05");
    expect(clockLabel(0)).toBe("0:00");
  });

  it("el aviso suena al cruzar 10 y 5, no al entrar mirando el reloj", () => {
    expect(crossedWarning(null, 8)).toBeNull();
    expect(crossedWarning(12, 9)).toBe(10);
    expect(crossedWarning(9, 8)).toBeNull();
    expect(crossedWarning(6, 5)).toBe(5);
    expect(crossedWarning(5, 4)).toBeNull();
    expect(crossedWarning(2, 0)).toBeNull();
  });

  it("explica qué hace el servidor cuando se acaba, en la colocación y en el turno", () => {
    expect(timeoutCopy("colocacion_poblado", true)).toMatch(/poblado/);
    expect(timeoutCopy("colocacion_poblado", true)).toMatch(/camino/);
    expect(timeoutCopy("colocacion_camino", true)).toMatch(/siguiente/);
    expect(timeoutCopy("dados", false)).toMatch(/dados/);
    expect(timeoutCopy("principal", true)).toMatch(/mesa sigue/);
  });
});

describe("colocación y aviso de turno", () => {
  it("separa casita y camino, y nombra de quién es el turno", () => {
    expect(setupCue({ phase: "principal", yourTurn: true, currentName: "Luz", yourBuildings: 0, actorBuildings: 0 })).toBeNull();
    const first = setupCue({
      phase: "colocacion_poblado",
      yourTurn: true,
      currentName: "Luz",
      yourBuildings: 0,
      actorBuildings: 0,
    });
    expect(first?.title).toBe("Poné tu poblado");
    expect(first?.detail).toMatch(/camino/);
    const road = setupCue({
      phase: "colocacion_camino",
      yourTurn: true,
      currentName: "Luz",
      yourBuildings: 1,
      actorBuildings: 1,
    });
    expect(road?.title).toBe("Ahora el camino");
    const second = setupCue({
      phase: "colocacion_poblado",
      yourTurn: true,
      currentName: "Luz",
      yourBuildings: 1,
      actorBuildings: 1,
    });
    expect(second?.title).toBe("Segundo poblado");
    expect(turnHeadline(true, "Luz")).toBe("Es tu turno");
    expect(turnHeadline(false, "Tomi")).toBe("Turno de Tomi");
    expect(
      setupCue({ phase: "colocacion_camino", yourTurn: false, currentName: "Tomi", yourBuildings: 0, actorBuildings: 1 })
        ?.title,
    ).toBe("Turno de Tomi");
  });
});

describe("timeout de la colocación", () => {
  it("un timeout pone el poblado y deja el camino para otro paso", () => {
    const room = openTable();
    const g = room.game!;
    expect(phaseOf(g)).toBe("colocacion_poblado");
    applyIdleTimeout(room);
    expect(g.buildings).toHaveLength(1);
    expect(g.roads).toHaveLength(0);
    expect(phaseOf(g)).toBe("colocacion_camino");
    expect(g.turnIndex).toBe(0);
    const text = [...g.events.map((e) => e.text), ...room.chat.map((c) => c.text)].join(" ");
    expect(text).toMatch(/Falta el camino/);
  });

  it("el timeout del camino no coloca el segundo poblado", () => {
    const room = openTable();
    const g = room.game!;
    const p = g.players[0]!;
    const v = legalSettlementVertices(g, p.id, true)[0];
    expect(v).toBeTruthy();
    expect(applyAction(g, p.id, { type: "place_settlement", vertexId: v! }).ok).toBe(true);
    applyIdleTimeout(room);
    expect(g.buildings).toHaveLength(1);
    expect(g.roads).toHaveLength(1);
    expect(g.turnIndex).toBe(1);
    expect(phaseOf(g)).toBe("colocacion_poblado");
    const text = g.events.map((e) => e.text).join(" ");
    expect(text).toMatch(/Turno de Tomi/);
  });

  it("al último de la primera vuelta el timeout del camino no le planta la segunda casita", () => {
    const room = openTable();
    const g = room.game!;
    const n = g.players.length;
    while (!(g.turnIndex === n - 1 && phaseOf(g) === "colocacion_camino" && g.setupRound === 1)) {
      const p = g.players[g.turnIndex]!;
      if (phaseOf(g) === "colocacion_poblado") {
        const v = legalSettlementVertices(g, p.id, true)[0];
        expect(applyAction(g, p.id, { type: "place_settlement", vertexId: v! }).ok).toBe(true);
      } else {
        const e = legalMoves(g, p.id).edges[0];
        expect(applyAction(g, p.id, { type: "place_road", edgeId: e! }).ok).toBe(true);
      }
      if (g.setupRound !== 1) break;
    }
    expect(g.turnIndex).toBe(n - 1);
    expect(phaseOf(g)).toBe("colocacion_camino");
    const houses = g.buildings.filter((b) => b.playerId === g.players[n - 1]!.id).length;
    applyIdleTimeout(room);
    expect(g.buildings.filter((b) => b.playerId === g.players[n - 1]!.id)).toHaveLength(houses);
    expect(g.setupRound).toBe(2);
    expect(g.turnIndex).toBe(n - 1);
    expect(phaseOf(g)).toBe("colocacion_poblado");
    expect(g.events.map((e) => e.text).join(" ")).toMatch(/segundo poblado/);
  });
});
