import { useEffect, useState } from "react";

export function Deadline({ at, className }: { at: number; className?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [at]);
  const sec = Math.max(0, Math.ceil((at - now) / 1000));
  if (sec <= 0) return null;
  return (
    <p
      className={className ?? "text-[11px] text-amber-200/70"}
      data-testid="turn-clock"
    >
      Tiempo: {sec}s
    </p>
  );
}
