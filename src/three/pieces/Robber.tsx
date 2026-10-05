import { useEffect, useMemo, useRef } from "react";
import { useDispose } from "../dispose";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ClientView } from "@shared/types";
import { reduceMotion } from "../../audio/sfx";
import { robberPose } from "../../motion/curves";
import { DURATION } from "../../motion/tokens";
import { introIds, riseY } from "../boardIntro";
import { ROBBER_FOOT_LOCAL, ROBBER_H, ROBBER_SCALE, TILE_TOP, TOKEN_H, robberSpot } from "../geo";
import { getMaterials } from "../materials";

/** Duración completa del arco. En liviano el salto usa `DURATION.robberLite`. */
export const ROBBER_JUMP_MS = DURATION.robber;

/** Peón torneado del ladrón: base, faldón, cuello y cabeza en una sola pieza. */
function robberGeo(): THREE.LatheGeometry {
  const f = ROBBER_FOOT_LOCAL;
  const pts = [
    [0, 0],
    [f, 0],
    [f, 0.022],
    [f * 0.78, 0.048],
    [0.112, 0.07],
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
  useDispose(geo);
  const mat = getMaterials(lite ? "lite" : "normal").robber;
  mat.name = "mat.robber";

  function targetOf(id: string): THREE.Vector3 {
    const hex = hexes.find((h) => h.id === id);
    if (!hex) return new THREE.Vector3();
    const s = robberSpot(hex);
    // Parado sobre la ficha, no adentro: el pie opaco queda encima del número.
    return new THREE.Vector3(s.x, TILE_TOP - 0.004 + TOKEN_H + 0.006, s.y);
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
    jumping.current = !reduceMotion() && from.current.distanceTo(next) > 0.08;
    if (!jumping.current && ref.current) ref.current.position.copy(next);
  }, [robberHexId, hexes, freeze]);

  useFrame(() => {
    if (!ref.current) return;
    const ms = reduceMotion() ? 0 : lite ? DURATION.robberLite : ROBBER_JUMP_MS;
    if (!jumping.current || freeze || ms === 0) {
      const hex = hexes.find((h) => h.id === robberHexId);
      const lift = hex ? riseY(introIds(hexes), hex.q, hex.r, performance.now(), { lite, reduce: reduceMotion() }) : 0;
      ref.current.position.set(to.current.x, to.current.y + lift, to.current.z);
      return;
    }
    const now = performance.now();
    const u = Math.min(1, (now - t0.current) / ms);
    const p = robberPose(
      u,
      { x: from.current.x, y: from.current.y, z: from.current.z },
      { x: to.current.x, y: to.current.y, z: to.current.z },
      { lite },
    );
    const hex = hexes.find((h) => h.id === robberHexId);
    const lift = hex ? riseY(introIds(hexes), hex.q, hex.r, now, { lite, reduce: reduceMotion() }) : 0;
    ref.current.position.set(p.x, p.y + lift, p.z);
    if (u >= 1) jumping.current = false;
  });

  const start = targetOf(robberHexId);
  return (
    <group ref={ref} position={start.toArray()}>
      <mesh geometry={geo} material={mat} castShadow={!lite} scale={ROBBER_SCALE} />
    </group>
  );
}
