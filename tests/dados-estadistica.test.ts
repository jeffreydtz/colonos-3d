import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyAction, createGame, rollFairDice } from "../server/engine.ts";
import { parseAction } from "../server/validate.ts";
import { setupSnake } from "./helpers.ts";

const ROLLS = 100_000;

function chiSquare(counts: number[], expected: number[]): number {
  return counts.reduce((sum, obs, i) => sum + (obs - expected[i]!) ** 2 / expected[i]!, 0);
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  return cov / Math.sqrt(vx * vy);
}

describe("dados: crypto.randomInt, 100.000 tiradas", () => {
  it("cada dado es uniforme, la suma es triangular y no hay correlación", () => {
    const c1 = [0, 0, 0, 0, 0, 0];
    const c2 = [0, 0, 0, 0, 0, 0];
    const sums = Array.from({ length: 13 }, () => 0);
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < ROLLS; i++) {
      const [d1, d2] = rollFairDice();
      expect(d1).toBeGreaterThanOrEqual(1);
      expect(d1).toBeLessThanOrEqual(6);
      expect(d2).toBeGreaterThanOrEqual(1);
      expect(d2).toBeLessThanOrEqual(6);
      c1[d1 - 1] += 1;
      c2[d2 - 1] += 1;
      sums[d1 + d2] += 1;
      a.push(d1);
      b.push(d2);
    }

    const faceExpected = Array.from({ length: 6 }, () => ROLLS / 6);
    const chi1 = chiSquare(c1, faceExpected);
    const chi2 = chiSquare(c2, faceExpected);
    // df = 5. El umbral 36 está muy por encima de χ²(0.001) = 20.5, para no flaquear el CI.
    expect(chi1, `chi dado 1 = ${chi1.toFixed(3)} cuentas ${c1.join(",")}`).toBeLessThan(36);
    expect(chi2, `chi dado 2 = ${chi2.toFixed(3)} cuentas ${c2.join(",")}`).toBeLessThan(36);

    const sumCounts: number[] = [];
    const sumExpected: number[] = [];
    for (let s = 2; s <= 12; s++) {
      const ways = 6 - Math.abs(s - 7);
      sumCounts.push(sums[s]!);
      sumExpected.push((ROLLS * ways) / 36);
    }
    const chiSum = chiSquare(sumCounts, sumExpected);
    // df = 10. χ²(0.001) ≈ 29.6. Umbral 50.
    expect(chiSum, `chi suma = ${chiSum.toFixed(3)} ${sumCounts.join(",")}`).toBeLessThan(50);

    const rDice = pearson(a, b);
    const rNext = pearson(a.slice(0, -1), a.slice(1));
    const rSums = pearson(
      a.slice(0, -1).map((x, i) => x + b[i]!),
      a.slice(1).map((x, i) => x + b[i + 1]!),
    );
    expect(Math.abs(rDice), `r entre dados = ${rDice.toFixed(5)}`).toBeLessThan(0.02);
    expect(Math.abs(rNext), `r entre tiradas = ${rNext.toFixed(5)}`).toBeLessThan(0.02);
    expect(Math.abs(rSums), `r entre sumas = ${rSums.toFixed(5)}`).toBeLessThan(0.02);

    // Queda en el log de vitest para copiarlo a la auditoría.
    console.info(
      JSON.stringify({
        rolls: ROLLS,
        chi1: Number(chi1.toFixed(3)),
        chi2: Number(chi2.toFixed(3)),
        chiSum: Number(chiSum.toFixed(3)),
        rDice: Number(rDice.toFixed(5)),
        rNext: Number(rNext.toFixed(5)),
        rSums: Number(rSums.toFixed(5)),
        c1,
        c2,
        sums: sumCounts,
      }),
    );
  });
});

describe("la tirada de producción no acepta semilla ni dados del cliente", () => {
  const prev = process.env.NODE_ENV;

  afterEach(() => {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  });

  it("NODE_ENV=production ignora seed y entropy test", () => {
    process.env.NODE_ENV = "production";
    const state = createGame({
      seed: 123456,
      entropy: "test",
      victoryPoints: 10,
      players: [
        { id: "p0", name: "A", color: "rojo" },
        { id: "p1", name: "B", color: "azul" },
        { id: "p2", name: "C", color: "naranja" },
      ],
    });
    expect(state.entropy).toBe("crypto");
    expect(state.seed).not.toBe(123456);
    setupSnake(state);
    state.phase = "dados";
    const rolled = applyAction(state, "p0", { type: "roll" });
    expect(rolled.ok).toBe(true);
    expect(state.dice?.[0]).toBeGreaterThanOrEqual(1);
    expect(state.dice?.[0]).toBeLessThanOrEqual(6);
    expect(state.dice?.[1]).toBeGreaterThanOrEqual(1);
    expect(state.dice?.[1]).toBeLessThanOrEqual(6);
    expect(state.diceThrow).toBeGreaterThan(0);
  });

  it("el cliente no puede mandar el número: roll se queda en { type: roll }", () => {
    const parsed = parseAction({ type: "roll", dice: [6, 6], throwSeed: 1, seed: 1 });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual({ type: "roll" });
    const engine = readFileSync("server/engine.ts", "utf8");
    expect(engine).toContain("return rollFairDice()");
    expect(engine).toContain("cryptoInt(1, 6)");
    expect(engine).not.toContain("action.dice");
    const index = readFileSync("server/index.ts", "utf8");
    expect(index).toContain("startGame(bound.room, bound.seat.id)");
    expect(index).not.toMatch(/startGame\([^)]*seed/);
    const fair = readFileSync("server/fairDice.ts", "utf8");
    expect(fair).toContain("randomInt(min, max + 1)");
    expect(fair).toContain('from "node:crypto"');
  });
});
