import { useEffect, useRef, useState } from "react";
import { clockLabel, clockTone, crossedWarning, timeoutCopy } from "../play/turnClock";

/** El sonido de los 10 s y los 5 s lo agenda el AudioContext (SfxDirector), no este intervalo. */
export function TurnClock({ at, phase }: { at: number; phase: string }) {
  const [now, setNow] = useState(() => Date.now());
  const origin = useRef<{ at: number; started: number }>({ at, started: Date.now() });
  const prevSec = useRef<number | null>(null);
  const [ping, setPing] = useState<10 | 5 | null>(null);

  if (origin.current.at !== at) {
    origin.current = { at, started: Date.now() };
    prevSec.current = null;
  }

  useEffect(() => {
    prevSec.current = null;
    setPing(null);
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [at]);

  const sec = Math.max(0, Math.ceil((at - now) / 1000));
  const total = Math.max(1, at - origin.current.started);
  const frac = Math.max(0, Math.min(1, (at - now) / total));
  const tone = clockTone(sec);

  useEffect(() => {
    const hit = crossedWarning(prevSec.current, sec);
    prevSec.current = sec;
    if (!hit) return;
    setPing(hit);
  }, [sec]);

  const bar =
    tone === "expired" || tone === "danger"
      ? "bg-red-500"
      : tone === "warn"
        ? "bg-orange-400"
        : "bg-amber-200";
  const ink =
    tone === "expired" || tone === "danger" ? "text-red-200" : tone === "warn" ? "text-orange-200" : "text-amber-50";
  const pingText =
    ping === 10 && sec > 5 ? "Quedan 10 segundos" : ping === 5 && sec > 0 ? "Quedan 5 segundos" : "Tiempo del turno";

  return (
    <div
      className="flex shrink-0 items-center gap-2"
      data-testid="hud-clock"
      role="timer"
      aria-label={`${clockLabel(sec)}. ${timeoutCopy(phase, sec <= 0)}`}
    >
      <p
        className={`display text-2xl font-semibold leading-none tabular-nums md:text-3xl ${ink} ${tone === "danger" ? "motion-safe:animate-pulse" : ""}`}
      >
        {clockLabel(sec)}
      </p>
      <span className="h-2 w-12 overflow-hidden rounded-full bg-black/55 md:w-24" aria-hidden>
        <span className={`block h-full rounded-full ${bar}`} style={{ width: `${Math.round(frac * 100)}%` }} />
      </span>
      <span className="sr-only" data-testid="clock-ping">
        {pingText}
      </span>
      <span className="sr-only" data-testid="clock-fate">
        {timeoutCopy(phase, sec <= 0)}
      </span>
    </div>
  );
}
