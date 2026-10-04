import { useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ACESFilmicToneMapping } from "three";
import { parseHexId } from "@shared/hex";
import type { ClientView } from "@shared/types";
import { diceHeld } from "../play/diceHold";
import { sendAction } from "../socket";
import { useApp } from "../store";
import { producingHexes } from "../play/producing";
import type { ThemeId } from "../theme/tokens";
import { HexDecor } from "./HexDecor";
import type { CinemaControls } from "./cam/CinematicRig";
import { CinematicRig } from "./cam/CinematicRig";
import { DiceRig } from "./dice/DiceRig";
import { Frame } from "./env/Frame";
import { Lighting } from "./env/Lighting";
import { Sea } from "./env/Sea";
import { SkyDome } from "./env/SkyDome";
import { Table } from "./env/Table";
import { PerfProbe } from "./perf/PerfProbe";
import { HexField } from "./pieces/HexField";
import { Ports } from "./pieces/Ports";
import { Robber } from "./pieces/Robber";
import { Roads } from "./pieces/Roads";
import { GhostSpots, Settlements } from "./pieces/Settlements";
import { Tokens } from "./pieces/Tokens";
import { ProductionSparks, RobberPuff } from "./vfx/Sparks";
import { ProducerGlow } from "./vfx/ProducerGlow";
import { CAM_CLASSIC, CAM_EXPANSION, CAM_FOV } from "./geo";
import { boardLayout, framing } from "./layout";

type Spot = { id: string; x: number; y: number };

export function BoardScene({ view }: { view: ClientView }) {
  const set = useApp((s) => s.set);
  const artFreeze = useApp((s) => s.artFreeze);
  const legal = view.legal;
  const controlsRef = useRef<CinemaControls | null>(null);

  async function onHex(id: string) {
    const knightArmed = useApp.getState().knightArmed;
    if (knightArmed && legal.canPlayKnight) {
      if (!legal.robberHexes.includes(id) && id === view.robberHexId) {
        set({ toast: "El ladrón tiene que cambiar de hexágono.", knightArmed: false });
        return;
      }
      const r = await sendAction({ type: "play_knight", hexId: id, stealFromId: null });
      set({ toast: r.error ?? null, knightArmed: false });
      return;
    }
    if (legal.stealFrom.length) {
      set({ hint: "Elegí a quién le afanás." });
      return;
    }
    if (!legal.robberHexes.includes(id) && !legal.hexes.includes(id)) {
      if (view.phase === "ladron" || knightArmed) {
        set({ toast: "Ahí no podés poner el ladrón." });
      }
      return;
    }
    const r = await sendAction({ type: "move_robber", hexId: id, stealFromId: null });
    set({ toast: r.error ?? null });
  }

  async function onVertex(id: string) {
    if (view.phase === "colocacion_poblado" && legal.vertices.includes(id)) {
      const r = await sendAction({ type: "place_settlement", vertexId: id });
      if (!r.ok) set({ toast: r.error ?? "Ahí no se puede colocar." });
      return;
    }
    if (legal.cityVertices.includes(id)) {
      const r = await sendAction({ type: "build_city", vertexId: id });
      if (!r.ok) set({ toast: r.error ?? "No se pudo mejorar a ciudad." });
      return;
    }
    if (legal.vertices.includes(id)) {
      const r = await sendAction({ type: "build_settlement", vertexId: id });
      if (!r.ok) set({ toast: r.error ?? "Ahí no se puede construir." });
      return;
    }
    set({ toast: "Ahí no se puede construir." });
  }

  async function onEdge(id: string) {
    const kind = view.phase === "colocacion_camino" ? "place_road" : "build_road";
    if (!legal.edges.includes(id)) {
      set({ toast: "Ahí no podés tender un camino." });
      return;
    }
    const r = await sendAction({ type: kind, edgeId: id });
    if (!r.ok) set({ toast: r.error ?? "Ahí no podés tender un camino." });
  }

  const knightArmed = useApp((s) => s.knightArmed);
  const graphics = useApp((s) => s.graphics);
  const theme = useApp((s) => s.theme);
  const lite = graphics === "liviano";
  const robberSelectable = new Set(
    view.phase === "ladron" || knightArmed ? [...legal.robberHexes, ...legal.hexes] : [],
  );
  const diceUi = useApp((s) => s.diceUi);
  const producing = useMemo(() => {
    if (!artFreeze && diceHeld(diceUi)) return new Set<string>();
    return new Set(producingHexes(view).map((h) => h.id));
  }, [view, artFreeze, diceUi]);
  const big = view.boardKind === "expansion";
  const settleSpots = useMemo(
    () =>
      view.vertices
        .filter((v) => !view.buildings.some((b) => b.vertexId === v.id) && legal.vertices.includes(v.id))
        .map((v) => ({ id: v.id, x: v.x, y: v.y })),
    [view.vertices, view.buildings, legal.vertices],
  );
  const upgradeSpots = useMemo(
    () =>
      view.vertices
        .filter((v) => view.buildings.some((b) => b.vertexId === v.id) && legal.cityVertices.includes(v.id))
        .map((v) => ({ id: v.id, x: v.x, y: v.y })),
    [view.vertices, view.buildings, legal.cityVertices],
  );
  return (
    <Canvas
      shadows={lite ? false : "soft"}
      camera={{ position: big ? [...CAM_EXPANSION] : [...CAM_CLASSIC], fov: CAM_FOV }}
      style={{ width: "100%", height: "100%" }}
      dpr={lite ? [1, 1] : [1, 1.5]}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
      }}
      gl={{
        antialias: !lite,
        powerPreference: "high-performance",
        toneMapping: ACESFilmicToneMapping,
        preserveDrawingBuffer: true,
      }}
    >
      <SceneContent
        view={view}
        lite={lite}
        theme={theme}
        artFreeze={artFreeze}
        controlsRef={controlsRef}
        highlighted={robberSelectable}
        producing={producing}
        settleSpots={settleSpots}
        upgradeSpots={upgradeSpots}
        onHex={(id) => void onHex(id)}
        onVertex={(id) => void onVertex(id)}
        onEdge={(id) => void onEdge(id)}
      />
    </Canvas>
  );
}

function SceneContent({
  view,
  lite,
  theme,
  artFreeze,
  controlsRef,
  highlighted,
  producing,
  settleSpots,
  upgradeSpots,
  onHex,
  onVertex,
  onEdge,
}: {
  view: ClientView;
  lite: boolean;
  theme: ThemeId;
  artFreeze: boolean;
  controlsRef: MutableRefObject<CinemaControls | null>;
  highlighted: Set<string>;
  producing: Set<string>;
  settleSpots: Spot[];
  upgradeSpots: Spot[];
  onHex: (id: string) => void;
  onVertex: (id: string) => void;
  onEdge: (id: string) => void;
}) {
  const size = useThree((s) => s.size);
  // La forma de la isla no cambia en toda la partida: el mar y el marco se pintan una vez.
  const shapeKey = view.hexes.map((h) => h.id).join("|");
  const layout = useMemo(() => boardLayout(shapeKey.split("|").map(parseHexId)), [shapeKey]);
  const wide = size.width / Math.max(1, size.height) >= 1.12;
  const frame = useMemo(() => framing(layout, wide ? 1.6 : 0.6), [layout, wide]);
  const big = view.boardKind === "expansion";
  const isla = theme === "isla";
  return (
    <>
      <PerfProbe lite={lite} />
      <Lighting
        theme={theme}
        lite={lite}
        extent={big ? 18 : 13}
        center={[layout.center.x, layout.center.y]}
        candles={frame.candles}
      />
      {!lite && !isla && <SkyDome theme={theme} />}
      <Table lite={lite} isla={isla} theme={theme} />
      <Sea layout={layout} lite={lite} theme={theme} />
      <Frame layout={layout} lite={lite} theme={theme} />
      <HexField
        hexes={view.hexes}
        highlighted={highlighted}
        producing={producing}
        robberHexId={view.robberHexId}
        onHex={onHex}
        lite={lite}
      />
      <HexDecor hexes={view.hexes} lite={lite} robberHexId={view.robberHexId} />
      <Tokens hexes={view.hexes} lite={lite} />
      <Robber hexes={view.hexes} robberHexId={view.robberHexId} lite={lite} freeze={artFreeze} />
      <Ports vertices={view.vertices} lite={lite} />
      <Roads view={view} lite={lite} onEdge={onEdge} />
      <Settlements view={view} lite={lite} freeze={artFreeze} />
      <GhostSpots spots={settleSpots} accent="#facc15" onPick={onVertex} />
      <GhostSpots spots={upgradeSpots} accent="#67e8f9" onPick={onVertex} />
      <DiceRig values={view.dice} lite={lite} freeze={artFreeze} tray={frame.tray} />
      <ProductionSparks view={view} lite={lite} />
      <RobberPuff view={view} lite={lite} />
      <ProducerGlow view={view} lite={lite} />
      <CinematicRig view={view} lite={lite} freeze={artFreeze} layout={layout} frame={frame} controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef as never}
        makeDefault
        enablePan={!artFreeze}
        enableRotate={!artFreeze}
        enableZoom={!artFreeze}
        minDistance={3.5}
        maxDistance={big ? 60 : 44}
        maxPolarAngle={Math.PI / 2.15}
      />
    </>
  );
}

export default BoardScene;
