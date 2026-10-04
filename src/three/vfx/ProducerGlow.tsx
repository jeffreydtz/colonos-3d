import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { hexToPixel } from "@shared/hex";
import type { ClientView } from "@shared/types";
import { useApp } from "../../store";
import { S, TILE_TOP, TOKEN_R } from "../geo";
import { HEX_SCREENS, producingHexes, terrainResource } from "../../play/producing";
import { reduceMotion } from "../../audio/sfx";

const MAX = 12;
/** Aro dorado separado del filo crema, con un borde oscuro para que se lea sobre la ficha. */
const GLOW_RING: [number, number] = [TOKEN_R + 0.05, TOKEN_R + 0.1];
const GLOW_RIM: [number, number] = [TOKEN_R + 0.1, TOKEN_R + 0.125];

export function ProducerGlow({ view, lite }: { view: ClientView; lite: boolean }) {
  const freeze = useApp((s) => s.artFreeze);
  const revealed = useApp((s) => s.diceUi.revealed);
  const presenting = useApp((s) => s.diceUi.presenting);
  const hexes = useMemo(() => producingHexes(view), [view]);
  const ring = useRef<THREE.InstancedMesh>(null);
  const rim = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { camera, gl } = useThree();
  const show = freeze || (revealed && !presenting);

  useLayoutEffect(() => {
    HEX_SCREENS.length = 0;
  }, [view.dice, view.robberHexId]);

  useFrame(({ clock }) => {
    const pulse = freeze || reduceMotion() ? 1 : 1 + Math.sin(clock.elapsedTime * 3.2) * 0.04;
    const list = show ? hexes : [];
    HEX_SCREENS.length = 0;
    const rect = gl.domElement.getBoundingClientRect();
    const mesh = ring.current;
    const edge = rim.current;
    if (!mesh || !edge) return;
    const y = TILE_TOP + 0.004;
    list.forEach((h, i) => {
      const p = hexToPixel(h.q, h.r, S);
      dummy.position.set(p.x, y, p.y);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(pulse);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      edge.setMatrixAt(i, dummy.matrix);
      const res = terrainResource(h.terrain);
      if (res) {
        const v = new THREE.Vector3(p.x, y + 0.2, p.y).project(camera);
        HEX_SCREENS.push({
          id: h.id,
          resource: res,
          x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
        });
      }
    });
    mesh.count = list.length;
    edge.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    edge.instanceMatrix.needsUpdate = true;
  });

  if (!show || hexes.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={rim} args={[undefined, undefined, MAX]} frustumCulled={false} raycast={() => {}} renderOrder={2}>
        <ringGeometry args={[GLOW_RIM[0], GLOW_RIM[1], 40]} />
        <meshBasicMaterial color="#4a250c" transparent opacity={0.95} depthWrite={false} name="mat.vfx.ring" />
      </instancedMesh>
      <instancedMesh ref={ring} args={[undefined, undefined, MAX]} frustumCulled={false} raycast={() => {}} renderOrder={3}>
        <ringGeometry args={[GLOW_RING[0], GLOW_RING[1], 40]} />
        <meshBasicMaterial
          color="#e39b12"
          transparent
          opacity={lite ? 0.95 : 1}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          name="mat.vfx.ring"
        />
      </instancedMesh>
    </group>
  );
}
