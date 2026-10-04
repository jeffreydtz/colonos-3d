import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ClientView } from "@shared/types";
import { ROBBER_SCALE, TILE_TOP, robberSpot } from "../geo";
import { getMaterials } from "../materials";

export const ROBBER_JUMP_MS = 550;
const ROBBER_H = 0.5;

/** Peón torneado del ladrón: base, faldón, cuello y cabeza en una sola pieza. */
function robberGeo(): THREE.LatheGeometry {
  const pts = [
    [0, 0],
    [0.145, 0],
    [0.152, 0.018],
    [0.14, 0.036],
    [0.112, 0.05],
    [0.1, 0.09],
    [0.086, 0.17],
    [0.074, 0.25],
    [0.07, 0.29],
    [0.094, 0.305],
    [0.06, 0.322],
    [0.078, 0.35],
    [0.088, 0.385],
    [0.084, 0.42],
    [0.066, 0.456],
    [0.036, 0.484],
    [0, ROBBER_H],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 28);
  g.computeVertexNormals();
  return g;
}

export function Robber({
  hexes,
  robberHexId,
  lite,
  freeze = false,
}: {
  hexes: ClientView["hexes"];
  robberHexId: string;
  lite: boolean;
  freeze?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const from = useRef(new THREE.Vector3());
  const to = useRef(new THREE.Vector3());
  const t0 = useRef(0);
  const jumping = useRef(false);
  const primed = useRef(false);
  const geo = useMemo(() => robberGeo(), []);
  const mat = getMaterials(lite ? "lite" : "normal").robber;
  mat.name = "mat.robber";

  function targetOf(id: string): THREE.Vector3 {
    const hex = hexes.find((h) => h.id === id);
    if (!hex) return new THREE.Vector3();
    const s = robberSpot(hex);
    return new THREE.Vector3(s.x, TILE_TOP - 0.004, s.y);
  }

  useEffect(() => {
    const next = targetOf(robberHexId);
    if (!primed.current || freeze) {
      to.current.copy(next);
      from.current.copy(next);
      jumping.current = false;
      primed.current = true;
      if (ref.current) ref.current.position.copy(next);
      return;
    }
    from.current.copy(ref.current?.position ?? next);
    to.current.copy(next);
    t0.current = performance.now();
    jumping.current = from.current.distanceTo(next) > 0.08;
  }, [robberHexId, hexes, freeze]);

  useFrame(() => {
    if (!ref.current) return;
    if (!jumping.current || freeze) {
      ref.current.position.lerp(to.current, freeze ? 1 : 0.2);
      return;
    }
    const u = Math.min(1, (performance.now() - t0.current) / ROBBER_JUMP_MS);
    const yArc = Math.sin(u * Math.PI) * 0.85;
    ref.current.position.lerpVectors(from.current, to.current, u);
    ref.current.position.y = THREE.MathUtils.lerp(from.current.y, to.current.y, u) + yArc;
    if (u >= 1) jumping.current = false;
  });

  const start = targetOf(robberHexId);
  return (
    <group ref={ref} position={start.toArray()}>
      <mesh geometry={geo} material={mat} castShadow={!lite} scale={ROBBER_SCALE} />
    </group>
  );
}
