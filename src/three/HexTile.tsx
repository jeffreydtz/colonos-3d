import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { hexToPixel } from "@shared/hex";
import type { ClientView, Terrain } from "@shared/types";
import { BUMP_SCALE, SIDE_COLOR, terrainAlbedo, terrainBump, terrainRough } from "./procTextures";
import { hexHeight } from "./HexDecor";
import { S as SIZE, TILE_BOTTOM, TILE_TOP } from "./geo";
import { prismGeo, tileSpin, tileTint } from "./tiles";

export function HexTile({
  hex,
  highlighted,
  onClick,
  numberMap,
}: {
  hex: ClientView["hexes"][number];
  highlighted: boolean;
  onClick: () => void;
  numberMap: THREE.CanvasTexture | null;
}) {
  const height = hexHeight(hex.terrain);
  const p = hexToPixel(hex.q, hex.r, SIZE);
  const albedo = useMemo(() => terrainAlbedo(hex.terrain), [hex.terrain]);
  const bump = useMemo(() => terrainBump(hex.terrain), [hex.terrain]);
  const rough = useMemo(() => terrainRough(hex.terrain), [hex.terrain]);
  const geo = prismGeo(height);
  const side = SIDE_COLOR[hex.terrain];
  const metal = hex.terrain === "mineral" ? 0.18 : 0.03;
  return (
    <group position={[p.x, 0, p.y]}>
      <mesh
        geometry={geo}
        position={[0, height / 2, 0]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = highlighted ? "pointer" : "grab";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <meshStandardMaterial attach="material-0" color={highlighted ? "#c4a574" : side} roughness={0.88} metalness={metal} />
        <meshStandardMaterial
          attach="material-1"
          map={albedo}
          bumpMap={bump}
          bumpScale={highlighted ? 0.05 : BUMP_SCALE[hex.terrain]}
          roughnessMap={rough}
          color={highlighted ? "#f4e4c1" : "#ffffff"}
          metalness={metal}
          emissive={highlighted ? "#6b4f1a" : "#000000"}
          emissiveIntensity={highlighted ? 0.32 : 0}
        />
        <meshStandardMaterial attach="material-2" color="#1c1917" roughness={1} />
      </mesh>
      {hex.terrain === "ladrillo" && <TerraceStack height={height} />}
      {numberMap && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, height + 0.045, 0]} renderOrder={2}>
          <circleGeometry args={[0.56, 28]} />
          <meshBasicMaterial map={numberMap} depthTest polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      )}
    </group>
  );
}

function TerraceStack({ height }: { height: number }) {
  const map = terrainAlbedo("ladrillo");
  const bump = terrainBump("ladrillo");
  return (
    <>
      <mesh
        position={[0, height * 0.62, 0]}
        rotation={[0, Math.PI / 6, 0]}
        castShadow
        receiveShadow
        raycast={() => {}}
      >
        <cylinderGeometry args={[SIZE * 0.72, SIZE * 0.78, height * 0.28, 6]} />
        <meshStandardMaterial map={map} bumpMap={bump} bumpScale={0.14} color="#ffffff" roughness={0.8} />
      </mesh>
      <mesh
        position={[0, height * 0.86, 0]}
        rotation={[0, Math.PI / 6, 0]}
        castShadow
        receiveShadow
        raycast={() => {}}
      >
        <cylinderGeometry args={[SIZE * 0.5, SIZE * 0.56, height * 0.22, 6]} />
        <meshStandardMaterial map={map} bumpMap={bump} bumpScale={0.12} color="#ffffff" roughness={0.8} />
      </mesh>
    </>
  );
}

/** Un InstancedMesh por tipo de terreno: menos draw calls en modo liviano. */
export function LiteHexField({
  hexes,
  highlighted,
  producing,
  onHex,
  robberHexId,
}: {
  hexes: ClientView["hexes"];
  highlighted: Set<string>;
  producing?: Set<string>;
  onHex: (id: string) => void;
  robberHexId?: string;
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
    <>
      {groups.map(([terrain, items]) => (
        <LiteTerrainGroup
          key={terrain}
          terrain={terrain}
          items={items}
          highlighted={highlighted}
          producing={producing}
          robberHexId={robberHexId}
          onHex={onHex}
        />
      ))}
    </>
  );
}

function LiteTerrainGroup({
  terrain,
  items,
  highlighted,
  producing,
  robberHexId,
  onHex,
}: {
  terrain: Terrain;
  items: ClientView["hexes"];
  highlighted: Set<string>;
  producing?: Set<string>;
  robberHexId?: string;
  onHex: (id: string) => void;
}) {
  const height = TILE_TOP - TILE_BOTTOM;
  const geo = prismGeo(height);
  const albedo = useMemo(() => terrainAlbedo(terrain), [terrain]);
  const bump = useMemo(() => terrainBump(terrain), [terrain]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((h, i) => {
      const p = hexToPixel(h.q, h.r, SIZE);
      dummy.position.set(p.x, TILE_BOTTOM + height / 2, p.y);
      dummy.rotation.set(0, tileSpin(h.id, h.terrain), 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(tileTint(h.id, h.terrain, highlighted, producing, robberHexId));
      mesh.setColorAt(i, color);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, highlighted, producing, robberHexId, dummy, color, height]);
  return (
    <instancedMesh
      ref={ref}
      args={[geo, undefined, Math.max(1, items.length)]}
      onClick={(e) => {
        e.stopPropagation();
        const idx = e.instanceId;
        if (idx == null) return;
        const hex = items[idx];
        if (hex) onHex(hex.id);
      }}
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
      <meshStandardMaterial attach="material-0" color="#1a120c" roughness={1} name="mat.tile.side" />
      <meshStandardMaterial
        attach="material-1"
        map={albedo}
        bumpMap={bump}
        bumpScale={terrain === "mineral" ? 0.16 : 0.14}
        color="#ffffff"
        roughness={0.78}
        metalness={terrain === "mineral" ? 0.08 : 0}
        name={`mat.tile.${terrain}`}
      />
      <meshStandardMaterial attach="material-2" color="#1a120c" roughness={1} name="mat.tile.side" />
    </instancedMesh>
  );
}

export function LiteMarks({
  spots,
  accent,
  onPick,
}: {
  spots: Array<{ id: string; x: number; y: number }>;
  accent: string;
  onPick: (id: string) => void;
}) {
  const ring = useRef<THREE.InstancedMesh>(null);
  const hit = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    for (const mesh of [ring.current, hit.current]) {
      if (!mesh) continue;
      spots.forEach((s, i) => {
        dummy.position.set(s.x * SIZE, 0.36, s.y * SIZE);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.count = spots.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [spots, dummy]);
  if (spots.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={ring} args={[undefined, undefined, Math.max(1, spots.length)]} raycast={() => {}}>
        <ringGeometry args={[0.18, 0.4, 16]} />
        <meshBasicMaterial color={accent} />
      </instancedMesh>
      <instancedMesh
        ref={hit}
        args={[undefined, undefined, Math.max(1, spots.length)]}
        onClick={(e) => {
          e.stopPropagation();
          const idx = e.instanceId;
          const id = idx != null ? spots[idx]?.id : undefined;
          if (id) onPick(id);
        }}
      >
        <circleGeometry args={[0.48, 10]} />
        <meshBasicMaterial transparent opacity={0.14} color={accent} />
      </instancedMesh>
    </group>
  );
}

