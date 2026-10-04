import { describe, expect, it } from "vitest";
import { ART_SCENES, buildArtView, isArtSceneId } from "../server/devFixtures.ts";

describe("art harness fixtures", () => {
  it("S0 clásica vacía, S6 grande, S1 llena; el banco no viaja", () => {
    const s0 = buildArtView("S0-vacio", 42);
    expect(s0.hexes).toHaveLength(19);
    expect(s0.buildings).toHaveLength(0);
    expect(s0.bank).toBeNull();
    expect(s0).not.toHaveProperty("devDeck");
    expect(JSON.stringify(s0)).not.toMatch(/devRemaining/);

    const s6 = buildArtView("S6-grande", 42);
    expect(s6.hexes).toHaveLength(30);
    expect(s6.players).toHaveLength(6);

    const s1 = buildArtView("S1-lleno", 42);
    expect(s1.buildings.length).toBeGreaterThan(10);
    expect(s1.roads.length).toBeGreaterThan(20);
    expect(s1.dice).toEqual([6, 2]);
    expect(s1.hexes.find((h) => h.id === s1.robberHexId)?.terrain).toBe("madera");
    expect(s1.bank).toBeNull();
  });

  it("lista de escenas y victoria", () => {
    expect(ART_SCENES).toHaveLength(8);
    expect(isArtSceneId("S5-victoria")).toBe(true);
    expect(isArtSceneId("S7-iconos")).toBe(true);
    const v = buildArtView("S5-victoria", 42);
    expect(v.winnerId).toBe(v.youId);
    expect(v.phase).toBe("fin");
  });
});
