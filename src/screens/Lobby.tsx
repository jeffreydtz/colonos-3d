import { useEffect, useState } from "react";
import { COLOR_HEX, COLOR_LABEL } from "@shared/constants";
import { addBotSala, exitMesa, joinSala, loadSession, removeBotSala, setSeatsSala, startSala } from "../socket";
import { useApp } from "../store";

export function Lobby() {
  const lobby = useApp((s) => s.lobby);
  const set = useApp((s) => s.set);
  const error = useApp((s) => s.error);
  const netDown = useApp((s) => s.netDown);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);
  if (!lobby) {
    return (
      <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-4 py-10">
        <h1 className="display text-4xl text-amber-50">Reconectando…</h1>
        <p className="mt-2 text-amber-100/80" role="status">
          {netDown ? "Se cortó la red. Esperá un toque." : "Estamos volviendo a la mesa."}
        </p>
        {error && (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
  const share = `${window.location.origin}/?sala=${lobby.roomCode}`;
  const you = lobby.players.find((p) => p.id === lobby.youId);
  const isHost = lobby.youAreHost || Boolean(you?.isHost);
  const n = lobby.players.length;
  const free = Math.max(0, lobby.seatLimit - n);
  const islandNow =
    n >= 5 ? "isla grande (30 hexágonos, con pausa de construcción)" : "isla clásica (19 hexágonos, sin pausa extra)";
  const islandIfFull =
    lobby.seatLimit >= 5
      ? "Si llenan 5 o 6 asientos, pasa a la isla grande."
      : "Con este cupo se juega siempre en la isla clásica.";

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-4 py-10">
      <h1 className="display text-4xl text-amber-50">Sala {lobby.roomCode}</h1>
      <p className="mt-2 text-amber-100/80">
        {isHost ? "Pasá el link o completá los asientos con bots." : "Pasá el link si falta alguien más."}
      </p>
      {you && (
        <p className="mt-2 text-sm text-amber-200">
          Estás en la mesa como <b>{you.name}</b>
          {isHost ? " · anfitrión" : ""}
        </p>
      )}
      <p className="mt-2 text-sm text-amber-100/75">
        Si arrancan ahora ({n}): {islandNow} {lobby.seatLimit > n ? islandIfFull : ""}
      </p>
      <div className="panel mt-4 rounded-2xl p-4">
        <p className="text-xs tracking-wide text-amber-200/70 uppercase">Link para invitar</p>
        <div className="mt-1 flex gap-2">
          <button
            className="min-h-10 min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-left text-sm"
            data-testid="lobby-link"
            title="Copiar link"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(share)
                .then(() => setCopied(true))
                .catch(() => set({ error: "No se pudo copiar: mantené apretado el link." }));
            }}
          >
            {share}
          </button>
          {typeof navigator !== "undefined" && "share" in navigator ? (
            <button
              className="min-h-10 shrink-0 rounded-lg bg-amber-200 px-3 text-sm font-semibold text-stone-900"
              onClick={() => {
                void navigator.share({ title: "Colonos", text: `Sumate a la sala ${lobby.roomCode}`, url: share }).catch(() => {});
              }}
            >
              Compartir
            </button>
          ) : (
            <button
              className="min-h-10 shrink-0 rounded-lg bg-amber-200 px-3 text-sm font-semibold text-stone-900"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(share)
                  .then(() => setCopied(true))
                  .catch(() => set({ error: "No se pudo copiar: mantené apretado el link." }));
              }}
            >
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          )}
        </div>
        <p className="mt-1 h-4 text-xs text-emerald-300" aria-live="polite" data-testid="lobby-copied">
          {copied ? "Link copiado. Pasalo por el grupo." : ""}
        </p>
      </div>
      {isHost && (
        <div className="panel mt-4 rounded-2xl p-4">
          <p className="text-xs tracking-wide text-amber-200/70 uppercase">Asientos</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([3, 4, 5, 6] as const).map((cap) => (
              <button
                key={cap}
                disabled={cap < n}
                onClick={() => {
                  void setSeatsSala(cap).then((r) => {
                    if (!r.ok) set({ error: r.error ?? "No se pudo cambiar el cupo." });
                  });
                }}
                className={`rounded-full px-3 py-1 text-sm disabled:opacity-40 ${
                  lobby.seatLimit === cap ? "bg-amber-200 text-stone-900" : "bg-black/30"
                }`}
              >
                {cap}
              </button>
            ))}
          </div>
        </div>
      )}
      <ul className="panel mt-4 space-y-2 rounded-2xl p-4">
        {lobby.players.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: COLOR_HEX[p.color] }} />
              {p.name}
              {p.id === lobby.youId && <span className="text-xs text-amber-100">(vos)</span>}
              {p.isHost && <span className="text-xs text-amber-200">anfitrión</span>}
              {p.isBot && (
                <span className="rounded-sm bg-sky-400/20 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-sky-300">
                  bot
                </span>
              )}
            </span>
            <span className="flex items-center gap-2 text-xs text-amber-100/70">
              {COLOR_LABEL[p.color]}
              {p.isBot ? "" : p.connected ? " · en línea" : " · se cortó"}
              {isHost && p.isBot && (
                <button
                  className="rounded-full bg-black/40 px-2 py-0.5 text-amber-100"
                  onClick={() => {
                    void removeBotSala(p.id).then((r) => {
                      if (!r.ok) set({ error: r.error ?? "No se pudo sacar el bot." });
                    });
                  }}
                >
                  Sacar
                </button>
              )}
            </span>
          </li>
        ))}
        {Array.from({ length: free }, (_, i) => (
          <li key={`libre-${i}`} className="flex items-center gap-2 text-sm text-amber-100/40" data-testid="seat-free">
            <span className="h-3 w-3 rounded-full border border-dashed border-amber-100/40" aria-hidden />
            Asiento libre
          </li>
        ))}
      </ul>
      {isHost && free > 0 && (
        <button
          className="mt-3 rounded-xl border border-amber-200/40 py-2 text-sm text-amber-100"
          onClick={() => {
            void addBotSala().then((r) => {
              if (!r.ok) set({ error: r.error ?? "No se pudo agregar el bot." });
            });
          }}
        >
          Agregar bot ({free} asiento{free === 1 ? "" : "s"} libre{free === 1 ? "" : "s"})
        </button>
      )}
      {isHost ? (
        <button
          className="mt-4 rounded-xl bg-amber-200 py-3 font-semibold text-stone-900 disabled:bg-stone-600"
          disabled={n < 3}
          onClick={() => {
            void (async () => {
              let r = await startSala();
              if (!r.ok && r.error === "No estás en una sala.") {
                const session = loadSession(lobby.roomCode);
                if (session) {
                  const joined = await joinSala({
                    code: session.code,
                    name: session.name,
                    color: session.color,
                    token: session.token,
                  });
                  if (joined.ok) r = await startSala();
                }
              }
              if (!r.ok) set({ error: r.error ?? "No se pudo empezar." });
            })();
          }}
        >
          Empezar partida ({n}/{lobby.seatLimit})
        </button>
      ) : (
        <p className="mt-6 text-center text-amber-100/80">Esperando que el anfitrión dé el vamos…</p>
      )}
      {n < 3 && (
        <p className="mt-2 text-center text-sm text-amber-100/60">Mínimo 3. El anfitrión puede meter bots.</p>
      )}
      {error && (
        <p className="mt-3 text-center text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      <button
        className="mt-4 text-sm text-amber-100/70 underline"
        onClick={() => {
          void exitMesa().then(() => {
            set({
              screen: "home",
              lobby: null,
              view: null,
              token: null,
              playerId: null,
              code: "",
              error: null,
            });
          });
        }}
      >
        Dejar la mesa
      </button>
    </div>
  );
}
