import { RESOURCES, type ClientView, type LogEvent, type Resource } from "@shared/types";
import { DURATION, HARVEST_ARC } from "../motion/tokens";
import { rollGainsFor } from "./diceHold";
import { terrainResource } from "./producing";

/** El último ícono tiene que haber llegado antes de este tope. */
export const HARVEST_LIMIT_MS = DURATION.harvestLimit;

export type HarvestMotion = "full" | "lite" | "reduce";

export type HarvestFlight = {
  id: string;
  playerId: string;
  resource: Resource;
  hexId: string;
  n: number;
  /** El que mira es quien cobra: arco hasta su mano. Si no, el aviso queda en la casilla. */
  mine: boolean;
  delayMs: number;
  flightMs: number;
  /** Alto del arco en px de CSS. Negativo sube. 0 es recto o sin viaje. */
  lift: number;
  /** Rebote al llegar, en px. Negativo sube. 0 no rebota. */
  bounce: number;
};

type Board = Pick<ClientView, "hexes" | "vertices" | "buildings" | "robberHexId" | "dice" | "events" | "youId">;

type Share = { playerId: string; hexId: string; resource: Resource; n: number };

const PROFILE: Record<HarvestMotion, { mineMs: number; otherMs: number; staggerMs: number; lift: number; bounce: number }> = {
  full: {
    mineMs: DURATION.harvestMine,
    otherMs: DURATION.harvestOther,
    staggerMs: DURATION.harvestStagger,
    lift: HARVEST_ARC.fullLift,
    bounce: HARVEST_ARC.fullBounce,
  },
  lite: {
    mineMs: DURATION.harvestLiteMine,
    otherMs: DURATION.harvestLiteOther,
    staggerMs: DURATION.harvestStaggerLite,
    lift: 0,
    bounce: HARVEST_ARC.liteBounce,
  },
  reduce: { mineMs: DURATION.harvestReduce, otherMs: DURATION.harvestReduce, staggerMs: 0, lift: 0, bounce: 0 },
};

export function harvestMotion(opts: { reduce: boolean; lite: boolean }): HarvestMotion {
  if (opts.reduce) return "reduce";
  if (opts.lite) return "lite";
  return "full";
}

/**
 * Reparte la tirada como el servidor: poblado 1, ciudad 2, sin desierto ni ladrón.
 * Después recorta con lo que el log realmente pagó (el banco puede no alcanzar y
 * un evento viejo no vuelve a volar).
 */
export function harvestFlights(view: Board, ui: { holdFromEventId: number }, motion: HarvestMotion): HarvestFlight[] {
  const shares = clampToRoll(attribute(view), view.events, ui);
  return schedule(shares, view.youId, ui.holdFromEventId, motion);
}

function attribute(view: Board): Share[] {
  const total = view.dice ? view.dice[0] + view.dice[1] : 0;
  if (!total || total === 7) return [];
  const byKey = new Map<string, Share>();
  for (const hex of view.hexes) {
    if (hex.number !== total || hex.id === view.robberHexId || hex.terrain === "desierto") continue;
    const resource = terrainResource(hex.terrain);
    if (!resource) continue;
    for (const b of view.buildings) {
      const vertex = view.vertices.find((v) => v.id === b.vertexId);
      if (!vertex?.hexIds.includes(hex.id)) continue;
      const n = b.kind === "ciudad" ? 2 : 1;
      const key = `${b.playerId}|${hex.id}|${resource}`;
      const prev = byKey.get(key);
      if (prev) prev.n += n;
      else byKey.set(key, { playerId: b.playerId, hexId: hex.id, resource, n });
    }
  }
  return [...byKey.values()];
}

function clampToRoll(shares: Share[], events: LogEvent[], ui: { holdFromEventId: number }): Share[] {
  const byPlayer = new Map<string, Share[]>();
  for (const share of shares) {
    const list = byPlayer.get(share.playerId) ?? [];
    list.push(share);
    byPlayer.set(share.playerId, list);
  }
  const out: Share[] = [];
  for (const [playerId, list] of byPlayer) {
    const bag = rollGainsFor(events, ui, playerId);
    if (!bag) continue;
    const left: Partial<Record<Resource, number>> = { ...bag };
    const ordered = [...list].sort((a, b) => a.hexId.localeCompare(b.hexId) || a.resource.localeCompare(b.resource));
    for (const share of ordered) {
      const allow = left[share.resource] ?? 0;
      const n = Math.min(share.n, allow);
      if (n <= 0) continue;
      left[share.resource] = allow - n;
      out.push({ ...share, n });
    }
  }
  return out;
}

function schedule(shares: Share[], youId: string, holdFrom: number, motion: HarvestMotion): HarvestFlight[] {
  const profile = PROFILE[motion];
  const ordered = [...shares].sort((a, b) => {
    const mine = Number(a.playerId !== youId) - Number(b.playerId !== youId);
    if (mine !== 0) return mine;
    const resource = RESOURCES.indexOf(a.resource) - RESOURCES.indexOf(b.resource);
    if (resource !== 0) return resource;
    return a.hexId.localeCompare(b.hexId) || a.playerId.localeCompare(b.playerId);
  });
  const longest = ordered.some((s) => s.playerId === youId) ? profile.mineMs : profile.otherMs;
  let stagger = profile.staggerMs;
  if (ordered.length > 1) {
    const room = Math.max(0, HARVEST_LIMIT_MS - longest);
    stagger = Math.min(stagger, Math.floor(room / (ordered.length - 1)));
  }
  return ordered.map((share, i) => {
    const mine = share.playerId === youId;
    return {
      id: `${holdFrom}-${share.playerId}-${share.hexId}-${share.resource}`,
      playerId: share.playerId,
      resource: share.resource,
      hexId: share.hexId,
      n: share.n,
      mine,
      delayMs: i * stagger,
      flightMs: mine ? profile.mineMs : profile.otherMs,
      lift: mine ? profile.lift : motion === "full" ? HARVEST_ARC.otherLift : 0,
      bounce: mine ? profile.bounce : 0,
    };
  });
}
