import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { hexToPixel } from "@shared/hex";
import type { ClientView, Terrain } from "@shared/types";
import { reduceMotion } from "../../audio/sfx";
import { introIds, introPlaying, riseY } from "../boardIntro";
import { BEVEL, ROBBER_FOOT_R, S, TILE_BOTTOM, TILE_R_TOP, TILE_TOP, makeHexPlate, robberSpot } from "../geo";
import { LiteHexField } from "../HexTile";
import { terrainAlbedo, terrainBump } from "../procTextures";
import { bindInstanceTap } from "../instanceTap";
import { tileSpin, tileTint } from "../tiles";

let plate: THREE.ExtrudeGeometry | null = null;

function plateGeo(): THREE.ExtrudeGeometry {
  if (!plate) plate = makeHexPlate(TILE_R_TOP, TILE_TOP, TILE_BOTTOM, BEVEL);
  return plate;
}

export function HexField({
  hexes,
  highlighted,
  producing,
  onHex,
  lite,
  robberHexId,
  chosenId,
}: {
  hexes: ClientView["hexes"];
  highlighted: Set<string>;
  producing?: Set<string>;
  onHex: (id: string) => void;
  lite: boolean;
  robberHexId?: string;
  chosenId?: string;
}) {
  const glow = producing ?? new Set<string>();
  const introId = introIds(hexes);
  return (
    <>
      <CardboardSeam hexes={hexes} introId={introId} lite={lite} />
      {lite ? (
        <LiteHexField
          hexes={hexes}
          highlighted={highlighted}
          producing={glow}
          onHex={onHex}
          robberHexId={robberHexId}
          chosenId={chosenId}
          introId={introId}
        />
      ) : (
        <HexFieldNormal
          hexes={hexes}
          highlighted={highlighted}
          producing={glow}
          onHex={onHex}
          robberHexId={robberHexId}
          chosenId={chosenId}
          introId={introId}
        />
      )}
      {robberHexId && <RobberBlock hexes={hexes} robberHexId={robberHexId} />}
    </>
  );
}

/** Cartón oscuro un poco más grande que cada loseta: la rendija entre hexes no muestra el mar. */
function CardboardSeam({ hexes, introId, lite }: { hexes: ClientView["hexes"]; introId: string; lite: boolean }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    const r = S * 1.045;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      const x = r * Math.cos(a);
      const y = r * Math.sin(a);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const done = useRef(false);
  const paint = (now: number) => {
    const mesh = ref.current;
    if (!mesh) return;
    const opts = { lite, reduce: reduceMotion() };
    hexes.forEach((h, i) => {
      const p = hexToPixel(h.q, h.r, S);
      dummy.position.set(p.x, 0.045 + riseY(introId, h.q, h.r, now, opts), p.y);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = hexes.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  useLayoutEffect(() => {
    done.current = false;
    paint(performance.now());
  }, [hexes, dummy, introId, lite]);
  useFrame(() => {
    if (done.current) return;
    const now = performance.now();
    const live = introPlaying(introId, hexes, now, { lite, reduce: reduceMotion() });
    paint(now);
    if (!live) done.current = true;
  });
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  if (hexes.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geo, undefined, hexes.length]} frustumCulled={false} raycast={() => {}}>
      <meshBasicMaterial color="#1a120c" name="mat.seam" />
    </instancedMesh>
  );
}

function HexFieldNormal({
  hexes,
  highlighted,
  producing,
  onHex,
  robberHexId,
  chosenId,
  introId,
}: {
  hexes: ClientView["hexes"];
  highlighted: Set<string>;
  producing: Set<string>;
  onHex: (id: string) => void;
  robberHexId?: string;
  chosenId?: string;
  introId: string;
}) {
  const groups = useMemo(() => {
    const m = new Map<Terrain, ClientView["hexes"]>();
    for (const h of hexes) {
      const list = m.get(h.terrain) ?? [];
      list.push(h);
      m.set(h.terrain, list);
    }
    return [...m.entries()];
  }, [hexes]);
  return (
    <group>
      {groups.map(([terrain, items]) => (
        <TerrainPlates
          key={terrain}
          terrain={terrain}
          items={items}
          highlighted={highlighted}
          producing={producing}
          robberHexId={robberHexId}
          chosenId={chosenId}
          onHex={onHex}
          introId={introId}
          board={hexes}
        />
      ))}
    </group>
  );
}

/** Sombra de contacto bajo el ladrón; el hex en sí ya se oscurece por color de instancia. */
export function RobberBlock({
  hexes,
  robberHexId,
}: {
  hexes: ClientView["hexes"];
  robberHexId: string;
}) {
  const hex = hexes.find((h) => h.id === robberHexId);
  if (!hex) return null;
  const s = robberSpot(hex);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[s.x + 0.03, TILE_TOP + 0.003, s.y + 0.03]}
      raycast={() => {}}
      renderOrder={1}
    >
      <circleGeometry args={[ROBBER_FOOT_R * 1.12, 24]} />
      <meshBasicMaterial color="#0b0705" transparent opacity={0.32} depthWrite={false} />
    </mesh>
  );
}

function TerrainPlates({
  terrain,
  items,
  highlighted,
  producing,
  robberHexId,
  chosenId,
  onHex,
  introId,
  board,
}: {
  terrain: Terrain;
  items: ClientView["hexes"];
  highlighted: Set<string>;
  producing: Set<string>;
  robberHexId?: string;
  chosenId?: string;
  onHex: (id: string) => void;
  introId: string;
  board: ClientView["hexes"];
}) {
  const geo = plateGeo();
  const albedo = useMemo(() => terrainAlbedo(terrain), [terrain]);
  const bump = useMemo(() => terrainBump(terrain), [terrain]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const done = useRef(false);
  const paint = (now: number) => {
    const mesh = ref.current;
    if (!mesh) return;
    const opts = { reduce: reduceMotion() };
    items.forEach((hex, i) => {
      const p = hexToPixel(hex.q, hex.r, S);
      dummy.position.set(p.x, riseY(introId, hex.q, hex.r, now, opts), p.y);
      dummy.rotation.set(0, tileSpin(hex.id, hex.terrain), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(tileTint(hex.id, hex.terrain, highlighted, producing, robberHexId, chosenId));
      mesh.setColorAt(i, color);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  useLayoutEffect(() => {
    done.current = false;
    paint(performance.now());
  }, [items, highlighted, producing, robberHexId, chosenId, dummy, color, introId, board]);
  useFrame(() => {
    if (done.current) return;
    const now = performance.now();
    const live = introPlaying(introId, board, now, { reduce: reduceMotion() });
    paint(now);
    if (!live) done.current = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[geo, undefined, Math.max(1, items.length)]}
      castShadow
      receiveShadow
      onPointerDown={bindInstanceTap((idx) => items[idx]?.id, onHex)}
      onPointerOver={(e) => {
        e.stopPropagation();
        const idx = e.instanceId;
        const hex = idx != null ? items[idx] : undefined;
        document.body.style.cursor = hex && highlighted.has(hex.id) ? "pointer" : "grab";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      <meshStandardMaterial
        attach="material-0"
        map={albedo}
        bumpMap={bump}
        bumpScale={terrain === "mineral" ? 0.09 : 0.07}
        color="#ffffff"
        roughness={terrain === "mineral" ? 0.9 : 0.86}
        metalness={0}
        name={`mat.tile.${terrain}`}
      />
      {/* Canto de cartón: el bisel con la textura del terreno se leía como una línea clara contra el agua. */}
      <meshStandardMaterial attach="material-1" color="#1a120c" roughness={1} metalness={0} name="mat.tile.side" />
    </instancedMesh>
  );
}
