import type { SfxName } from "./voices";

export type Cue = { name: SfxName; gain?: number };

export type CueEvent = {
  id: number;
  kind: string;
  playerId: string | null;
  otherId: string | null;
  text: string;
  resources?: Partial<Record<string, number>> | null;
};

export type CueView = {
  youId: string;
  currentPlayerId: string | null;
  winnerId: string | null;
  events: CueEvent[];
  chat: Array<{ id: string; playerId: string | null }>;
  trades: Array<{ id: string; fromId: string; toId: string }>;
};

export type Heard = {
  currentPlayerId: string | null;
  winnerId: string | null;
  eventId: number;
  chatIds: string[];
  tradeIds: string[];
  fxAt: number;
  pendingProduce: boolean;
};

function sumBag(resources: CueEvent["resources"]): number {
  if (!resources) return 0;
  let n = 0;
  for (const v of Object.values(resources)) n += v ?? 0;
  return n;
}

/** Oferta y contraoferta suenan por la bandeja. Aceptar y el banco son «comerciar». */
export function comercioSound(text: string): "trade" | null {
  if (/ofrece|contraoferta/i.test(text)) return null;
  if (/aceptó|cambió/i.test(text)) return "trade";
  return null;
}

export function armHeard(view: CueView, fxAt: number): Heard {
  return {
    currentPlayerId: view.currentPlayerId,
    winnerId: view.winnerId,
    eventId: view.events.reduce((m, e) => Math.max(m, e.id), 0),
    chatIds: view.chat.map((c) => c.id),
    tradeIds: view.trades.map((t) => t.id),
    fxAt,
    pendingProduce: false,
  };
}

/**
 * Diferencia de una vista a la siguiente. La primera llamada no repite chat, dados ni ofertas
 * viejas. Si al entrar ya es tu turno, sí avisa: es el caso de la apertura y de una reconexión.
 */
export function nextCues(
  prev: Heard | null,
  view: CueView,
  fx: { at: number; animations: string[] } | null,
  revealed: boolean,
  hidden: boolean,
): { cues: Cue[]; heard: Heard } {
  if (!prev) {
    const heard = armHeard(view, fx?.at ?? 0);
    if (!view.winnerId && view.currentPlayerId === view.youId) {
      return { cues: [{ name: "turn", gain: hidden ? 1.15 : 1 }], heard };
    }
    return { cues: [], heard };
  }

  const cues: Cue[] = [];
  const heard: Heard = {
    currentPlayerId: view.currentPlayerId,
    winnerId: view.winnerId,
    eventId: prev.eventId,
    chatIds: prev.chatIds,
    tradeIds: prev.tradeIds,
    fxAt: prev.fxAt,
    pendingProduce: prev.pendingProduce,
  };

  let diceFx = false;
  if (fx && fx.at !== prev.fxAt) {
    heard.fxAt = fx.at;
    if (fx.animations.includes("dice")) {
      diceFx = true;
      cues.push({ name: "dice_throw" });
    }
    if (fx.animations.includes("build")) cues.push({ name: "build" });
    if (fx.animations.includes("robber")) cues.push({ name: "robber" });
  }

  const fresh = view.events.filter((e) => e.id > prev.eventId);
  if (fresh.length) heard.eventId = Math.max(...fresh.map((e) => e.id), prev.eventId);

  let card = false;
  let trade = false;
  let stolen = false;
  let armedProduce = false;
  for (const e of fresh) {
    if (e.kind === "dados" && e.playerId === view.youId && sumBag(e.resources) > 0) {
      heard.pendingProduce = true;
      armedProduce = true;
    }
    if (e.kind === "dev") card = true;
    if (e.kind === "comercio" && comercioSound(e.text) === "trade") trade = true;
    if (e.kind === "ladron" && e.otherId === view.youId && /te robó 1 /.test(e.text) && sumBag(e.resources) === 1) {
      stolen = true;
    }
  }
  if (card) cues.push({ name: "card" });
  if (trade) cues.push({ name: "trade" });
  if (stolen) cues.push({ name: "stolen" });

  // El cobro espera a que el HUD muestre los dados. El mismo instante de la tirada no lo adelanta.
  if (revealed && heard.pendingProduce && !armedProduce && !diceFx) {
    cues.push({ name: "produce" });
    heard.pendingProduce = false;
  }

  const seenChat = new Set(prev.chatIds);
  let chat = false;
  for (const m of view.chat) {
    if (seenChat.has(m.id)) continue;
    if (m.playerId && m.playerId !== view.youId) chat = true;
  }
  heard.chatIds = view.chat.map((m) => m.id);
  if (chat) cues.push({ name: "chat" });

  const seenTrade = new Set(prev.tradeIds);
  let offers = 0;
  for (const t of view.trades) {
    if (seenTrade.has(t.id)) continue;
    const forYou = t.toId === "todos" || t.toId === view.youId;
    if (forYou && t.fromId !== view.youId) offers += 1;
  }
  heard.tradeIds = view.trades.map((t) => t.id);
  if (offers > 0) cues.push({ name: "offer" });

  if (prev.winnerId == null && view.winnerId) {
    cues.push({ name: view.winnerId === view.youId ? "win" : "lose" });
  } else if (!view.winnerId && prev.currentPlayerId !== view.currentPlayerId) {
    const yours = view.currentPlayerId === view.youId;
    cues.push({ name: yours ? "turn" : "turn_soft", gain: yours && hidden ? 1.15 : yours ? 1 : 0.42 });
  }

  return { cues, heard };
}
