import { io, type Socket } from "socket.io-client";
import type { Action, ClientView, ColorId } from "../shared/types.ts";

const URL = process.env.URL ?? "http://127.0.0.1:43211";
const colors: ColorId[] = ["rojo", "azul", "naranja", "blanco", "verde", "marron"];
const names = ["Luz", "Tomi", "Mora", "Fede", "Nico", "Sol"];

function connect(): Socket {
  return io(URL, { transports: ["websocket"] });
}

function emitAck<T>(socket: Socket, ev: string, payload?: unknown): Promise<T> {
  return new Promise((resolve) => {
    if (payload === undefined) socket.emit(ev, resolve);
    else socket.emit(ev, payload, resolve);
  });
}

async function main(): Promise<void> {
  const sockets = Array.from({ length: 6 }, () => connect());
  const views: ClientView[] = Array.from({ length: 6 });
  await Promise.all(
    sockets.map(
      (s, i) =>
        new Promise<void>((res) => {
          s.on("connect", () => res());
          s.on("view", (v: ClientView) => {
            views[i] = v;
          });
          s.on("lobby", () => {});
        }),
    ),
  );

  const created = await emitAck<{ ok: boolean; code: string }>(sockets[0]!, "create", {
    name: names[0],
    color: colors[0],
    victoryPoints: 10,
    seatLimit: 6,
  });
  if (!created.ok) throw new Error("no se creó la sala");
  console.log("sala", created.code);

  for (let i = 1; i < 6; i++) {
    const r = await emitAck<{ ok: boolean; error?: string }>(sockets[i]!, "join", {
      code: created.code,
      name: names[i],
      color: colors[i],
    });
    if (!r.ok) throw new Error(`join ${i}: ${r.error}`);
  }

  const started = await emitAck<{ ok: boolean; error?: string }>(sockets[0]!, "start");
  if (!started.ok) throw new Error(started.error ?? "start");
  await sleep(200);

  for (let n = 0; n < 40; n++) {
    await sleep(40);
    let acted = false;
    for (let i = 0; i < 6; i++) {
      const v = views[i];
      if (!v) continue;
      const legal = v.legal;
      if (v.phase === "descarte" && legal.mustDiscard > 0) {
        await emitAck(sockets[i]!, "action", {
          type: "discard",
          resources: { madera: Math.min(v.hand.resources.madera, legal.mustDiscard) },
        } satisfies Action);
        acted = true;
        break;
      }
      if (v.currentPlayerId !== v.youId) continue;
      if (legal.vertices.length && (v.phase === "colocacion_poblado" || legal.vertices.length)) {
        if (v.phase === "colocacion_poblado" || (v.phase === "principal" && legal.vertices.length)) {
          const type = v.phase === "colocacion_poblado" ? "place_settlement" : "build_settlement";
          if (v.phase === "colocacion_poblado") {
            await emitAck(sockets[i]!, "action", { type, vertexId: legal.vertices[0]! } satisfies Action);
            acted = true;
            break;
          }
        }
      }
      if (legal.edges.length && v.phase === "colocacion_camino") {
        await emitAck(sockets[i]!, "action", { type: "place_road", edgeId: legal.edges[0]! } satisfies Action);
        acted = true;
        break;
      }
      if (legal.canRoll) {
        await emitAck(sockets[i]!, "action", { type: "roll" } satisfies Action);
        acted = true;
        break;
      }
      if (v.phase === "ladron" && legal.hexes.length) {
        await emitAck(sockets[i]!, "action", {
          type: "move_robber",
          hexId: legal.hexes[0]!,
          stealFromId: null,
        } satisfies Action);
        acted = true;
        break;
      }
      if (legal.canEndTurn && v.phase !== "colocacion_poblado" && v.phase !== "colocacion_camino") {
        await emitAck(sockets[i]!, "action", { type: "end_turn" } satisfies Action);
        acted = true;
        break;
      }
    }
    const sample = views[0];
    if (sample && sample.buildings.length >= 12 && sample.phase !== "colocacion_poblado" && sample.phase !== "colocacion_camino") {
      console.log("hexes", sample.hexes.length);
      console.log("jugadores", sample.players.length);
      console.log("poblados", sample.buildings.length);
      console.log("phase", sample.phase, "turno", sample.turnNumber);
      console.log("6 clientes simulados: lobby + setup OK");
      sockets.forEach((s) => s.close());
      return;
    }
    if (!acted && n > 5) {
      console.log("phase", sample?.phase, "buildings", sample?.buildings.length);
      break;
    }
  }
  sockets.forEach((s) => s.close());
  throw new Error("no se completó el setup con 6 clientes");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
