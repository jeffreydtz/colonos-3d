import { tileOffset } from "../motion/curves";
import { DURATION, motionMs, type MotionOpts } from "../motion/tokens";

type Axial = { q: number; r: number };
type Hex = Axial & { id: string };

let key = "";
let t0 = 0;

export function resetBoardIntro(): void {
  key = "";
  t0 = 0;
}

export function introIds(hexes: Array<{ id: string }>): string {
  return hexes.map((h) => h.id).join("|");
}

/** Reloj compartido por losetas, fichas y piezas. Un tablero nuevo (otros ids) vuelve a armarse. */
export function boardIntroT0(ids: string, now: number): number {
  if (!ids) return now;
  if (key !== ids) {
    key = ids;
    t0 = now;
  }
  return t0;
}

export function riseY(ids: string, q: number, r: number, now: number, opts: MotionOpts = {}): number {
  if (!ids) return 0;
  return tileOffset(now, boardIntroT0(ids, now), Math.hypot(q, r), opts);
}

/** La pieza se queda con la loseta vecina que todavía está más abajo. */
export function anchorRise(ids: string, hexes: Hex[], hexIds: string[], now: number, opts: MotionOpts = {}): number {
  let y = 0;
  let any = false;
  for (const id of hexIds) {
    const hex = hexes.find((h) => h.id === id);
    if (!hex) continue;
    const lift = riseY(ids, hex.q, hex.r, now, opts);
    if (!any || lift < y) y = lift;
    any = true;
  }
  return y;
}

export function introPlaying(ids: string, hexes: Axial[], now: number, opts: MotionOpts = {}): boolean {
  if (!ids) return false;
  if (key !== ids) return true;
  const dur = motionMs(DURATION.boardRise, opts);
  if (dur <= 0) return false;
  let max = 0;
  for (const h of hexes) max = Math.max(max, Math.hypot(h.q, h.r));
  const step = opts.lite ? DURATION.boardStaggerLite : DURATION.boardStagger;
  return now < t0 + max * step + dur + 40;
}
