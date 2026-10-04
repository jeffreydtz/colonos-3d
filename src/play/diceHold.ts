import { RESOURCES, type LogEvent, type Resources } from "@shared/types";
import type { DiceUi } from "../store";

/** La tirada se muestra este tiempo; el servidor ya resolvió y no espera. */
export const DICE_HOLD_MS = 3200;
export const DICE_HOLD_REDUCED_MS = 200;

export function diceHeld(ui: Pick<DiceUi, "presenting" | "revealed">): boolean {
  return ui.presenting && !ui.revealed;
}

/**
 * Arranca el hold sólo cuando llega el `fx` de una tirada en vivo. Una reconexión
 * manda la vista sin ese `fx`: el resultado se ve al toque, sin animación.
 */
export function beginDiceHold(view: { events: LogEvent[]; rollNo: number }): DiceUi {
  const roll = [...view.events].reverse().find((e) => e.dice);
  return {
    revealed: false,
    presenting: true,
    rollNo: view.rollNo,
    holdFromEventId: roll ? roll.id - 1 : 0,
  };
}

export function skipDiceHold(ui: DiceUi): DiceUi {
  if (!diceHeld(ui)) return ui;
  return { ...ui, revealed: true, presenting: false };
}

/** Lo cobrado en eventos de dados que todavía no se pueden mostrar. */
export function gainsWhileHeld(events: LogEvent[], holdFromEventId: number): Map<string, Partial<Resources>> {
  const map = new Map<string, Partial<Resources>>();
  for (const e of events) {
    if (e.id <= holdFromEventId || e.kind !== "dados" || !e.playerId || !e.resources) continue;
    const bag: Partial<Resources> = { ...(map.get(e.playerId) ?? {}) };
    for (const r of RESOURCES) {
      const n = e.resources[r] ?? 0;
      if (n > 0) bag[r] = (bag[r] ?? 0) + n;
    }
    map.set(e.playerId, bag);
  }
  return map;
}

/**
 * Lo que la tirada en vivo le pagó a `playerId`, o null si no le pagó nada. Sin hold (reconexión,
 * capturas congeladas) no hay tirada que festejar: lo cobrado antes no vuelve a volar.
 */
export function rollGainsFor(
  events: LogEvent[],
  ui: Pick<DiceUi, "holdFromEventId">,
  playerId: string,
): Partial<Resources> | null {
  if (ui.holdFromEventId <= 0) return null;
  const bag = gainsWhileHeld(events, ui.holdFromEventId).get(playerId);
  return bag && RESOURCES.some((r) => (bag[r] ?? 0) > 0) ? bag : null;
}

export function resourcesAfterHold(have: Resources, gain: Partial<Resources> | undefined): Resources {
  const out = { ...have };
  if (!gain) return out;
  for (const r of RESOURCES) out[r] = Math.max(0, out[r] - (gain[r] ?? 0));
  return out;
}

export function countAfterHold(count: number, gain: Partial<Resources> | undefined): number {
  if (!gain) return count;
  let n = 0;
  for (const r of RESOURCES) n += gain[r] ?? 0;
  return Math.max(0, count - n);
}

export function eventsWhileHeld<T extends { id: number }>(
  events: T[],
  ui: Pick<DiceUi, "presenting" | "revealed" | "holdFromEventId">,
): T[] {
  if (!diceHeld(ui)) return events;
  return events.filter((e) => e.id <= ui.holdFromEventId);
}
