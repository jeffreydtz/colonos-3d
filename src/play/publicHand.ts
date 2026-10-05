import type { LogEvent } from "@shared/types";
import type { DiceUi } from "../store";
import { countAfterHold, diceHeld, gainsWhileHeld } from "./diceHold";

/** Cartas de recurso que se pueden mostrar: durante los dados no se adelanta lo recién cobrado. */
export function resourceCountShown(count: number, playerId: string, events: LogEvent[], ui: Pick<DiceUi, "presenting" | "revealed" | "holdFromEventId">): number {
  if (!diceHeld(ui)) return count;
  return countAfterHold(count, gainsWhileHeld(events, ui.holdFromEventId).get(playerId));
}

function cartas(n: number, que: string): string {
  return n === 1 ? `1 carta de ${que} boca abajo` : `${n} cartas de ${que} boca abajo`;
}

function caballeros(n: number): string {
  return n === 1 ? "1 caballero jugado" : `${n} caballeros jugados`;
}

/** Lo que se puede decir en voz alta: cantidades, nunca el tipo de una carta que sigue en la mano. */
export function handCaption(resources: number, devs: number, knights: number, largestArmy: boolean): string {
  const army = largestArmy ? ", Ejército más grande" : "";
  return `${cartas(resources, "recurso")}, ${cartas(devs, "desarrollo")}, ${caballeros(knights)}${army}`;
}
