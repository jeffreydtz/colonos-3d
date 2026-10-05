import { useEffect, useMemo } from "react";
import type { ThemeId } from "../../theme/tokens";
import { releaseWood, woodTexture } from "../procTextures";
import { liteWood } from "./liteWood";

/** Mesa de nogal sola: el tablero es lo único que tiene color fuerte en la escena. */
export function Table({ lite, isla, theme }: { lite: boolean; isla: boolean; theme: ThemeId }) {
  const wood = useMemo(() => (isla ? null : woodTexture(7, 4.4, lite ? 2 : 8)), [lite, isla]);
  useEffect(() => () => releaseWood(wood), [wood]);
  const liteLook = useMemo(() => liteWood("table", theme), [theme]);
  if (isla) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow raycast={() => {}}>
        <planeGeometry args={[140, 140]} />
        <meshLambertMaterial color="#0f5076" name="mat.table" />
      </mesh>
    );
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow raycast={() => {}}>
      <planeGeometry args={[72, 46]} />
      {lite ? (
        <meshLambertMaterial map={wood} color={liteLook.color} emissive={liteLook.emissive} name="mat.table" />
      ) : (
        <meshPhysicalMaterial
          map={wood}
          color="#8c6e5a"
          roughness={0.58}
          clearcoat={0.25}
          clearcoatRoughness={0.5}
          envMapIntensity={0.5}
          name="mat.table"
        />
      )}
    </mesh>
  );
}
