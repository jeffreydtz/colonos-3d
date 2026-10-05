import { RESOURCES, type LogEvent, type Resource } from "@shared/types";

export type StealToast = { text: string; resource: Resource };

function stolenResource(e: LogEvent): Resource | null {
  const bag = e.resources;
  if (!bag) return null;
  const hit = RESOURCES.filter((r) => (bag[r] ?? 0) > 0);
  if (hit.length !== 1 || (bag[hit[0]!] ?? 0) !== 1) return null;
  return hit[0]!;
}

/** La línea privada del robo, sólo si acaba de llegar y es para este jugador. */
export function stealNoticeForYou(events: LogEvent[], youId: string, afterId: number): StealToast | null {
  let found: StealToast | null = null;
  for (const e of events) {
    if (e.id <= afterId) continue;
    if (e.kind !== "ladron" || e.otherId !== youId) continue;
    if (!/te robó 1 /.test(e.text)) continue;
    const resource = stolenResource(e);
    if (!resource) continue;
    found = { text: e.text, resource };
  }
  return found;
}
