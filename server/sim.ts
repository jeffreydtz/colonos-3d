import { runBotGame } from "./bots.ts";

const mass = process.argv.includes("--mass");
const seed = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? Date.now() % 1_000_000);
const vp = Number(process.argv.filter((a) => /^\d+$/.test(a))[1] ?? (mass ? 8 : 10));

if (mass) {
  const counts = [3, 4, 5, 6];
  const seeds = [7, 11, 23, 42, 99, 256, 2024, 2026, 4096, 7777];
  let fail = 0;
  for (const n of counts) {
    for (const s of seeds) {
      const result = runBotGame({ players: n, seed: s, victoryPoints: vp, maxTurns: 500 });
      const ok = result.state.phase === "fin" && result.winnerId;
      console.log(
        JSON.stringify({
          players: n,
          seed: s,
          hexes: result.state.hexes.length,
          turns: result.turns,
          phase: result.state.phase,
          winner: result.state.players.find((p) => p.id === result.winnerId)?.name ?? null,
        }),
      );
      if (!ok) fail += 1;
    }
  }
  if (fail) {
    console.error(`Fallaron ${fail} simulaciones.`);
    process.exitCode = 1;
  }
} else {
  const result = runBotGame({ players: 6, seed, victoryPoints: vp, maxTurns: 500 });
  console.log(
    JSON.stringify(
      {
        seed,
        turns: result.turns,
        phase: result.state.phase,
        winnerId: result.winnerId,
        winner: result.state.players.find((p) => p.id === result.winnerId)?.name ?? null,
        scores: result.state.players.map((p) => ({
          name: p.name,
          color: p.color,
        })),
      },
      null,
      2,
    ),
  );
  if (result.state.phase !== "fin" && !result.winnerId) {
    console.error("La simulación no llegó a un ganador (límite de turnos).");
    process.exitCode = 1;
  }
}
