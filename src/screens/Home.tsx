import { useState } from "react";
import { COLOR_HEX, COLOR_LABEL, DEFAULT_SEAT_LIMIT, DEFAULT_VICTORY } from "@shared/constants";
import { COLORS } from "@shared/types";
import type { ColorId } from "@shared/types";
import { createSala, joinSala, saveSession } from "../socket";
import { useApp } from "../store";

export function Home() {
  const set = useApp((s) => s.set);
  const name = useApp((s) => s.name);
  const color = useApp((s) => s.color);
  const code = useApp((s) => s.code);
  const error = useApp((s) => s.error);
  const [vp, setVp] = useState(DEFAULT_VICTORY);
  const [seats, setSeats] = useState(DEFAULT_SEAT_LIMIT);

  async function crear() {
    const r = await createSala(name || "Anfitrión", color, vp, seats);
    if (!r.ok || !r.token || !r.code || !r.playerId) {
      set({ error: r.error ?? "No se pudo crear la sala." });
      return;
    }
    saveSession(r.code, r.token, name || "Anfitrión", color);
    set({ screen: "lobby", code: r.code, token: r.token, playerId: r.playerId, lobby: r.lobby ?? null, error: null });
  }

  async function unirse() {
    const r = await joinSala({ code: code.trim().toUpperCase(), name: name || "Jugador", color });
    if (!r.ok || !r.token || !r.playerId || !r.code) {
      set({ error: r.error ?? "No se pudo entrar." });
      return;
    }
    saveSession(r.code, r.token, name || "Jugador", color);
    if (r.view) {
      set({ screen: "game", code: r.code, token: r.token, playerId: r.playerId, view: r.view, error: null });
    } else {
      set({ screen: "lobby", code: r.code, token: r.token, playerId: r.playerId, lobby: r.lobby ?? null, error: null });
    }
  }

  const island = seats >= 5 ? "Isla grande (30 hexágonos, pausa de construcción)" : "Isla clásica (19 hexágonos)";

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4 py-10">
      <p className="text-sm tracking-[0.3em] text-amber-200/80 uppercase">Multijugador 3D</p>
      <h1 className="display mt-2 text-5xl text-amber-50">Colonos</h1>
      <p className="mt-3 text-amber-100/85">
        La mesa de <b>6</b> es el modo principal: isla grande, pausa de construcción y el tablero 3D completo. También
        podés armar de 3 o 4 en la isla clásica, con o sin bots.
      </p>
      <div className="panel mt-8 space-y-4 rounded-3xl p-6">
        <label className="block text-sm">
          Tu nombre
          <input
            className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2"
            value={name}
            maxLength={18}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Cómo te dicen en la mesa"
          />
        </label>
        <div>
          <p className="text-sm">Color</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={color === c}
                onClick={() => set({ color: c as ColorId })}
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ${color === c ? "ring-2 ring-amber-200" : "bg-black/30"}`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: COLOR_HEX[c] }} />
                {COLOR_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm">Asientos</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([3, 4, 5, 6] as const).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={seats === n}
                onClick={() => setSeats(n)}
                aria-label={`${n} asientos`}
                className={`rounded-full px-3 py-1 text-sm ${seats === n ? "bg-amber-200 text-stone-900" : "bg-black/30"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-amber-100/70">{island}. El tablero se arma al empezar, según quiénes estén.</p>
        </div>
        <label className="block text-sm">
          Puntos para ganar
          <input
            type="number"
            min={5}
            max={15}
            className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2"
            value={vp}
            onChange={(e) => setVp(Number(e.target.value))}
          />
        </label>
        <button onClick={() => void crear()} className="w-full rounded-xl bg-amber-200 py-3 font-semibold text-stone-900">
          Crear partida
        </button>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl bg-black/40 px-3 py-2 uppercase"
            placeholder="Código"
            aria-label="Código de la sala"
            value={code}
            onChange={(e) => set({ code: e.target.value.toUpperCase() })}
          />
          <button onClick={() => void unirse()} className="rounded-xl bg-emerald-700 px-4 font-semibold">
            Unirse
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
