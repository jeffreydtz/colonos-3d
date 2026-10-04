import type { ClientView } from "@shared/types";
import type { ActionTab } from "../store";

/** Ofertas que esperan tu respuesta: el número de «Jugadores» y de «Comerciar». */
export function offersForYou(view: ClientView): number {
  return view.trades.filter((t) => t.fromId !== view.youId && (t.toId === "todos" || t.toId === view.youId)).length;
}

/** Adónde lleva «Comerciar» (o la T): al banco si está abierto; si no, a las ofertas de la mesa. */
export function tradeTabFor(view: ClientView): ActionTab {
  if (view.legal.canBankTrade) return "banco";
  return view.legal.canTrade || view.trades.length > 0 ? "jugadores" : "banco";
}
