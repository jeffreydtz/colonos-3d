import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThemeId } from "../../theme/tokens";
import { FRAME_TOP } from "../geo";
import type { BoardLayout } from "../layout";
import { woodTexture } from "../procTextures";
import { liteWood } from "./liteWood";

const FRAME_BOTTOM = -0.08;
const FRAME_BEVEL = 0.035;

/** Marco recto de nogal alrededor del hexágono de mar (las seis piezas del Catan físico). */
function frameGeometry(layout: BoardLayout): THREE.ExtrudeGeometry {
  const toShape = (p: THREE.Vector2) => new THREE.Vector2(p.x, -p.y);
  const shape = new THREE.Shape(layout.frameOuter.map(toShape));
  shape.holes.push(new THREE.Path(layout.sea.map(toShape)));
  const depth = FRAME_TOP - FRAME_BOTTOM - 2 * FRAME_BEVEL;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: FRAME_BEVEL,
    bevelThickness: FRAME_BEVEL,
    bevelSegments: 2,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, FRAME_BOTTOM + FRAME_BEVEL, 0);
  g.computeVertexNormals();
  return g;
}

export function Frame({ layout, lite, theme }: { layout: BoardLayout; lite: boolean; theme: ThemeId }) {
  const geo = useMemo(() => frameGeometry(layout), [layout]);
  useEffect(() => () => geo.dispose(), [geo]);
  const wood = useMemo(() => woodTexture(0.55, 0.55, lite ? 2 : 8), [lite]);
  const liteLook = useMemo(() => liteWood("frame", theme), [theme]);
  const caps = useMemo(() => layout.frameOuter.map((p) => {
    const a = Math.atan2(p.y - layout.center.y, p.x - layout.center.x);
    const inward = new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(-0.3);
    return { x: p.x + inward.x, z: p.y + inward.y };
  }), [layout]);

  return (
    <group>
      <mesh geometry={geo} castShadow={!lite} receiveShadow raycast={() => {}}>
        {lite ? (
          <meshLambertMaterial map={wood} color={liteLook.color} emissive={liteLook.emissive} name="mat.frame" />
        ) : (
          <meshPhysicalMaterial
            map={wood}
            color="#dcb48a"
            roughness={0.52}
            clearcoat={0.35}
            clearcoatRoughness={0.4}
            envMapIntensity={0.5}
            name="mat.frame"
          />
        )}
      </mesh>
      {!lite &&
        caps.map((c, i) => (
          <mesh key={i} position={[c.x, FRAME_TOP + 0.012, c.z]} raycast={() => {}}>
            <cylinderGeometry args={[0.07, 0.075, 0.03, 16]} />
            <meshStandardMaterial color="#b08d3c" metalness={0.85} roughness={0.32} name="mat.frame.brass" />
          </mesh>
        ))}
    </group>
  );
}
