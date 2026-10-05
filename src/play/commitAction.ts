import type { Action, DevKind } from "@shared/types";
import { sendAction } from "../socket";
import { useApp, type AppState } from "../store";
import { pendingStillLegal, same, stage, type Pending } from "./confirm";

let inflight = false;

/** Corre la acción que ya está marcada, o la deja marcada si la confirmación está prendida. */
export async function previewOrRun(
  next: Pending,
): Promise<{ ok: boolean; error?: string; reveal?: DevKind } | null> {
  if (!stageAction(next)) return null;
  return commitPending(next);
}

export function stageAction(next: Pending): boolean {
  if (inflight) return false;
  const { pending, confirmActions, set } = useApp.getState();
  const staged = stage(pending, next, confirmActions);
  set({ pending: staged.pending });
  return staged.run;
}

export async function commitPending(
  p: Pending,
): Promise<{ ok: boolean; error?: string; reveal?: DevKind }> {
  if (inflight) return { ok: false };
  inflight = true;
  try {
    const state = useApp.getState();
    const cur = state.pending;
    const view = state.view;
    if (!view || !pendingStillLegal(p, view)) {
      state.set({
        toast: "Eso ya no se puede.",
        pending: cur && !same(cur, p) ? cur : null,
      });
      return { ok: false, error: "Eso ya no se puede." };
    }
    if (cur && same(cur, p)) state.set({ pending: null });
    const r = await sendAction(toAction(p));
    const now = useApp.getState();
    const patch: Partial<AppState> = {};
    if (p.kind === "robber" && p.knight) patch.knightArmed = false;
    if (!r.ok) patch.toast = r.error ?? "No se pudo.";
    else {
      patch.toast = null;
      if (p.kind === "buy_dev" && r.reveal) patch.revealCard = r.reveal;
      if (p.kind === "play_roads") patch.hint = "Tocá dónde van los caminos gratis.";
      if (p.kind === "offer") patch.offerEpoch = now.offerEpoch + 1;
    }
    now.set(patch);
    return r;
  } finally {
    inflight = false;
  }
}

function toAction(p: Pending): Action {
  switch (p.kind) {
    case "vertex":
      if (p.build === "setup") return { type: "place_settlement", vertexId: p.id };
      if (p.build === "ciudad") return { type: "build_city", vertexId: p.id };
      return { type: "build_settlement", vertexId: p.id };
    case "edge":
      if (p.build === "setup") return { type: "place_road", edgeId: p.id };
      return { type: "build_road", edgeId: p.id };
    case "robber":
      return p.knight
        ? { type: "play_knight", hexId: p.id, stealFromId: null }
        : { type: "move_robber", hexId: p.id, stealFromId: null };
    case "buy_dev":
      return { type: "buy_dev" };
    case "play_roads":
      return { type: "play_road_building" };
    case "year":
      return { type: "play_year_plenty", resources: p.resources };
    case "mono":
      return { type: "play_monopoly", resource: p.resource };
    case "bank":
      return { type: "bank_trade", give: p.give, want: p.want };
    case "offer":
      return { type: "offer_trade", toId: p.toId, give: p.give, want: p.want };
    case "accept":
      return { type: "accept_trade", tradeId: p.tradeId };
    case "end_turn":
      return { type: "end_turn" };
  }
}
