import { describe, expect, it } from "vitest";
import { shownPoints, winnerShownPoints } from "../src/play/shownPoints.ts";
import type { ClientView } from "../shared/types.ts";

function view(partial: {
  youId: string;
  totalVp: number;
  victoryPoints: number;
  winnerId: string | null;
  players: Array<{ id: string; visibleVp: number }>;
}): Pick<ClientView, "youId" | "hand" | "victoryPoints" | "winnerId" | "players"> {
  return {
    youId: partial.youId,
    victoryPoints: partial.victoryPoints,
    winnerId: partial.winnerId,
    hand: { totalVp: partial.totalVp } as ClientView["hand"],
    players: partial.players as ClientView["players"],
  };
}

describe("puntos que se muestran al terminar", () => {
  it("el ganador ve su total, aunque pase la meta", () => {
    const v = view({
      youId: "vos",
      totalVp: 12,
      victoryPoints: 10,
      winnerId: "vos",
      players: [
        { id: "vos", visibleVp: 10 },
        { id: "otro", visibleVp: 8 },
      ],
    });
    expect(winnerShownPoints(v)).toBe(12);
    expect(shownPoints(v, "vos", 10)).toBe(12);
    expect(shownPoints(v, "otro", 8)).toBe(8);
  });

  it("un rival con puntos ocultos no revela el total exacto", () => {
    const v = view({
      youId: "vos",
      totalVp: 6,
      victoryPoints: 10,
      winnerId: "otro",
      players: [
        { id: "vos", visibleVp: 6 },
        { id: "otro", visibleVp: 8 },
      ],
    });
    expect(winnerShownPoints(v)).toBe(10);
  });

  it("si el rival supera la meta en la mesa, se muestra ese número", () => {
    const v = view({
      youId: "vos",
      totalVp: 7,
      victoryPoints: 10,
      winnerId: "otro",
      players: [
        { id: "vos", visibleVp: 7 },
        { id: "otro", visibleVp: 11 },
      ],
    });
    expect(winnerShownPoints(v)).toBe(11);
  });
});
