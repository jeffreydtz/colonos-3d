import { RESOURCES } from "../shared/types.ts";
import type { Resource, Resources } from "../shared/types.ts";

export function isNonNegInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && Number.isFinite(n);
}

export function asCount(n: unknown): number {
  return isNonNegInt(n) ? n : 0;
}

export function sumResources(r: Partial<Resources>): number {
  let n = 0;
  for (const k of RESOURCES) n += asCount(r[k]);
  return n;
}

export function hasResources(hand: Resources, cost: Partial<Resources>): boolean {
  for (const k of RESOURCES) {
    const need = cost[k] ?? 0;
    if (!isNonNegInt(need)) return false;
    if ((hand[k] ?? 0) < need) return false;
  }
  return true;
}

export function pay(hand: Resources, cost: Partial<Resources>): void {
  for (const k of RESOURCES) {
    const n = asCount(cost[k]);
    if (n) hand[k] -= n;
  }
}

export function grant(hand: Resources, gain: Partial<Resources>): void {
  for (const k of RESOURCES) {
    const n = asCount(gain[k]);
    if (n) hand[k] += n;
  }
}

export function cloneResources(r: Resources): Resources {
  return { ...r };
}

export function canMoveBank(
  bank: Resources,
  fromBank: Partial<Resources>,
  toBank: Partial<Resources>,
): boolean {
  for (const k of RESOURCES) {
    const take = asCount(fromBank[k]);
    if (take > 0 && bank[k] < take) return false;
  }
  void toBank;
  return true;
}

export function transfer(
  from: Resources,
  to: Resources,
  amount: Partial<Resources>,
): boolean {
  if (!hasResources(from, amount)) return false;
  pay(from, amount);
  grant(to, amount);
  return true;
}

export function randomResourceInHand(
  hand: Resources,
  rng: () => number,
): Resource | null {
  const bag: Resource[] = [];
  for (const k of RESOURCES) {
    for (let i = 0; i < asCount(hand[k]); i++) bag.push(k);
  }
  if (!bag.length) return null;
  return bag[Math.floor(rng() * bag.length)]!;
}

/** Elige n cartas de la mano, priorizando las que más tiene. */
export function pickDiscard(hand: Resources, n: number): Partial<Resources> {
  const out: Partial<Resources> = {};
  const order = RESOURCES.slice().sort((a, b) => hand[b] - hand[a]);
  let left = Math.max(0, n);
  for (const r of order) {
    if (left <= 0) break;
    const take = Math.min(asCount(hand[r]), left);
    if (take) {
      out[r] = take;
      left -= take;
    }
  }
  return out;
}
