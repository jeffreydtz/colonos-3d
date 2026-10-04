import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { THEME, type ThemeId } from "../../theme/tokens";

function isSwiftShader(gl: THREE.WebGLRenderer): boolean {
  const ctx = gl.getContext();
  const renderer = ctx.getParameter(ctx.RENDERER);
  return /swiftshader|llvmpipe|software/i.test(String(renderer));
}

/** Dev: `?env=1` arma el PMREM aunque sea SwiftShader, para previsualizar el look de GPU. */
function forceEnvPreview(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("env") === "1";
}

function RoomEnv({ intensity }: { intensity: number }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    scene.environmentIntensity = intensity;
    if (isSwiftShader(gl) && !forceEnvPreview()) return;
    let cancelled = false;
    let pmrem: THREE.PMREMGenerator | null = null;
    let env: THREE.Texture | null = null;
    let envScene: RoomEnvironment | null = null;
    const id = window.setTimeout(() => {
      try {
        pmrem = new THREE.PMREMGenerator(gl);
        envScene = new RoomEnvironment();
        env = pmrem.fromScene(envScene as unknown as THREE.Scene, 0.04).texture;
        if (cancelled) {
          env.dispose();
          return;
        }
        scene.environment = env;
      } catch {
        /* software GL */
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      scene.environment = null;
      env?.dispose();
      pmrem?.dispose();
      envScene?.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

const TABLE_Y = -0.1;

/** Vela de pilar en platito de bronce; la llama no pasa por el tone mapping para que brille. */
function Candle({ x, z, height }: { x: number; z: number; height: number }) {
  const top = TABLE_Y + 0.024 + height;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, TABLE_Y + 0.012, 0]} castShadow raycast={() => {}}>
        <cylinderGeometry args={[0.17, 0.19, 0.024, 20]} />
        <meshStandardMaterial color="#a8823a" metalness={0.8} roughness={0.35} name="mat.candle.dish" />
      </mesh>
      <mesh position={[0, TABLE_Y + 0.024 + height / 2, 0]} castShadow raycast={() => {}}>
        <cylinderGeometry args={[0.085, 0.09, height, 16]} />
        <meshStandardMaterial color="#efe2c4" roughness={0.6} name="mat.candle" />
      </mesh>
      <mesh position={[0, top + 0.055, 0]} scale={[1, 1.9, 1]} raycast={() => {}}>
        <sphereGeometry args={[0.034, 10, 8]} />
        <meshBasicMaterial color="#ffd38a" toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Lighting({
  theme,
  lite,
  extent,
  center = [0, 0],
  candles = [
    [5.2, 3.4],
    [-4.6, -2.8],
  ],
}: {
  theme: ThemeId;
  lite: boolean;
  extent: number;
  center?: [number, number];
  /** Velas de la noche: sobre la mesa, afuera del marco. */
  candles?: Array<[number, number]>;
}) {
  const t = THEME[theme];
  const night = theme === "noche";
  const [c1, c2] = [candles[0] ?? [5.2, 3.4], candles[1] ?? [-4.6, -2.8]];
  return (
    <>
      <color attach="background" args={[t.bg]} />
      <fog attach="fog" args={[t.bg, t.fogNear, t.fogFar]} />
      {/* Liviano no tiene mapa de entorno ni lámpara: compensa con luz plana, más en la noche. */}
      <hemisphereLight
        args={[t.hemiSky, t.hemiGround, lite ? Math.min(1.15, t.hemiInt + (night ? 0.22 : 0.28)) : t.hemiInt]}
      />
      <ambientLight intensity={lite ? t.ambient + (night ? 0.16 : 0.2) : t.ambient} />
      <directionalLight
        position={t.keyPos}
        color={t.key}
        intensity={lite ? t.keyInt * (night ? 1.12 : 1.08) : t.keyInt}
        castShadow={!lite}
        shadow-mapSize={lite ? [512, 512] : [1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
      />
      <directionalLight position={[-8, 6, -6]} color={t.fill} intensity={lite ? t.fillInt * 0.72 : t.fillInt} />
      {t.lamp && (!lite || night) && (
        <pointLight
          position={[center[0] - 1.5, 10.5, center[1] - 2.5]}
          color="#ffb35c"
          intensity={night ? (lite ? 20 : 16) : 10}
          distance={34}
          decay={2}
        />
      )}
      {night && !lite && (
        <>
          <pointLight position={[c1[0], 1.15, c1[1]]} color="#ff9a3c" intensity={6.2} distance={10} decay={2} />
          <pointLight position={[c2[0], 1.05, c2[1]]} color="#ffb35c" intensity={5} distance={9} decay={2} />
          <Candle x={c1[0]} z={c1[1]} height={0.38} />
          <Candle x={c2[0]} z={c2[1]} height={0.24} />
        </>
      )}
      {!lite && theme !== "isla" && <RoomEnv intensity={t.env} />}
    </>
  );
}
