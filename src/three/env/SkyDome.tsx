import * as THREE from "three";
import type { ThemeId } from "../../theme/tokens";

const TOP: Record<ThemeId, string> = {
  atardecer: "#3a2214",
  dia: "#8eb8d8",
  noche: "#070b16",
  isla: "#0a3a55",
};

export function SkyDome({ theme }: { theme: ThemeId }) {
  return (
    <mesh raycast={() => {}} renderOrder={-1}>
      <sphereGeometry args={[180, 24, 16]} />
      <meshBasicMaterial
        color={TOP[theme]}
        side={THREE.BackSide}
        fog={false}
        depthWrite={false}
        name="mat.sky"
      />
    </mesh>
  );
}
