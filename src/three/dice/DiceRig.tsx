import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { playDiceHit, playSfx, reduceMotion } from "../../audio/sfx";
import { diceHeld, DICE_SETTLE_PAD_S, revealSettled, settleRevealDelayMs, skipDiceHold } from "../../play/diceHold";
import { useApp } from "../../store";
import { useDispose } from "../dispose";
import { feltAlbedo } from "../procTextures";
import { DIE_SIZE, dieGeometry, diePipsGeometry, quatForFace } from "./dieGeo";
import { FELT_LIFT, planThrow, sampleDie, visualSeed, type ThrowClip } from "./throw";

/** Segundos de presentación: física + hold sin spoiler en HUD/log. El valor vive en diceHold. */
export { DICE_HOLD_MS } from "../../play/diceHold";

export const TRAY_POS: [number, number, number] = [0, 0.04, 5.85];

type Pair = [number, number] | null;

function ivory(lite: boolean) {
  if (lite) return <meshLambertMaterial color="#f3ead8" name="mat.dice" />;
  return (
    <meshPhysicalMaterial
      color="#f4ead6"
      roughness={0.32}
      metalness={0.04}
      clearcoat={0.55}
      clearcoatRoughness={0.25}
      sheen={0.2}
      sheenColor="#fff6e8"
      name="mat.dice"
    />
  );
}

function DieMesh({
  groupRef,
  body,
  pips,
  lite,
  position,
}: {
  groupRef: RefObject<THREE.Group | null>;
  body: THREE.BufferGeometry;
  pips: THREE.BufferGeometry;
  lite: boolean;
  position: [number, number, number];
}) {
  return (
    <group ref={groupRef} position={position}>
      <mesh geometry={body} castShadow={!lite}>
        {ivory(lite)}
      </mesh>
      <mesh geometry={pips} castShadow={!lite}>
        <meshLambertMaterial color="#1a120e" name="mat.dice.pips" />
      </mesh>
    </group>
  );
}

function placeShade(mesh: THREE.Mesh | null, x: number, y: number, z: number, tray: [number, number, number]) {
  if (!mesh) return;
  const ground = tray[1] + FELT_LIFT + DIE_SIZE / 2;
  const air = Math.max(0, y - ground);
  mesh.position.set(x, tray[1] + FELT_LIFT + 0.012, z);
  mesh.scale.setScalar(Math.max(0.42, 1 - air * 0.55));
  const mat = mesh.material;
  if (mat instanceof THREE.MeshBasicMaterial) mat.opacity = Math.max(0.07, 0.36 - air * 0.24);
}

function poseRest(group: THREE.Group, tray: [number, number, number], x: number, value: number) {
  group.position.set(tray[0] + x, tray[1] + FELT_LIFT + DIE_SIZE / 2 + 0.002, tray[2]);
  group.quaternion.copy(quatForFace(value, 0));
}

export function DiceRig({
  values,
  throwSeed,
  rollNo,
  lite,
  freeze,
  tray = TRAY_POS,
}: {
  values: Pair;
  throwSeed?: number | null;
  rollNo: number;
  lite: boolean;
  freeze: boolean;
  tray?: [number, number, number];
}) {
  const presenting = useApp((s) => s.diceUi.presenting);
  const felt = useMemo(() => feltAlbedo(), []);
  const geo = useMemo(() => dieGeometry(), []);
  const pips = useMemo(() => diePipsGeometry(), []);
  useDispose(geo);
  useDispose(pips);
  const aRef = useRef<THREE.Group>(null);
  const bRef = useRef<THREE.Group>(null);
  const shadeA = useRef<THREE.Mesh>(null);
  const shadeB = useRef<THREE.Mesh>(null);
  const prevAy = useRef(0);
  const prevBy = useRef(0);
  const clipRef = useRef<ThrowClip | null>(null);
  const clipKey = useRef("");
  const t0 = useRef(0);
  const hitCursor = useRef(0);
  const settledSfx = useRef(false);

  const v0 = values?.[0] ?? 1;
  const v1 = values?.[1] ?? 6;

  useLayoutEffect(() => {
    if (!presenting || !values || freeze || reduceMotion()) return;
    const seed = visualSeed(throwSeed, rollNo);
    const key = `${seed}:${values[0]}:${values[1]}:${tray[0]}:${tray[1]}:${tray[2]}`;
    if (key !== clipKey.current || !clipRef.current) {
      clipRef.current = planThrow({ seed, values: [values[0], values[1]], tray });
      clipKey.current = key;
      t0.current = performance.now();
      hitCursor.current = 0;
      settledSfx.current = false;
    }
    const clip = clipRef.current;
    const delay = settleRevealDelayMs(clip.settleAt, performance.now() - t0.current);
    const timer = window.setTimeout(() => {
      const ui = useApp.getState().diceUi;
      const next = revealSettled(ui, clip.settleAt + DICE_SETTLE_PAD_S, clip.settleAt);
      if (next !== ui) useApp.getState().set({ diceUi: next });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [presenting, values, throwSeed, rollNo, freeze, tray]);

  useFrame(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    const clip = clipRef.current;
    const same = clip && clip.faces[0] === v0 && clip.faces[1] === v1;
    if (freeze || reduceMotion() || !same) {
      poseRest(a, tray, -0.32, v0);
      poseRest(b, tray, 0.32, v1);
      if (!lite) {
        placeShade(shadeA.current, a.position.x, a.position.y, a.position.z, tray);
        placeShade(shadeB.current, b.position.x, b.position.y, b.position.z, tray);
      }
      return;
    }
    const elapsed = presenting ? (performance.now() - t0.current) / 1000 : clip.duration;
    const t = Math.min(Math.max(0, elapsed), clip.duration);
    const sa = sampleDie(clip.a, t);
    const sb = sampleDie(clip.b, t);
    a.position.set(sa.px, sa.py, sa.pz);
    b.position.set(sb.px, sb.py, sb.pz);
    a.quaternion.set(sa.qx, sa.qy, sa.qz, sa.qw);
    b.quaternion.set(sb.qx, sb.qy, sb.qz, sb.qw);
    if (!lite) {
      placeShade(shadeA.current, sa.px, sa.py, sa.pz, tray);
      placeShade(shadeB.current, sb.px, sb.py, sb.pz, tray);
    }
    if (!presenting) return;
    while (hitCursor.current < clip.hits.length && clip.hits[hitCursor.current]! <= t) {
      const drop = Math.max(0, prevAy.current - sa.py, prevBy.current - sb.py);
      playDiceHit(1.15 + Math.min(5, drop * 12));
      hitCursor.current += 1;
    }
    prevAy.current = sa.py;
    prevBy.current = sb.py;
    if (t >= clip.settleAt) {
      if (!settledSfx.current) {
        settledSfx.current = true;
        playSfx("dice_settle");
      }
      const ui = useApp.getState().diceUi;
      const next = revealSettled(ui, t, clip.settleAt);
      if (next !== ui) useApp.getState().set({ diceUi: next });
    }
  });

  return (
    <group
      data-dice-tray=""
      onClick={(e) => {
        const ui = useApp.getState().diceUi;
        if (!diceHeld(ui)) return;
        e.stopPropagation();
        useApp.getState().set({ diceUi: skipDiceHold(ui) });
      }}
    >
      <mesh position={tray} receiveShadow>
        <boxGeometry args={[2.5, 0.08, 1.55]} />
        {lite ? (
          <meshLambertMaterial color="#5a3b22" name="mat.dice.tray" />
        ) : (
          <meshStandardMaterial color="#6a4428" roughness={0.7} name="mat.dice.tray" />
        )}
      </mesh>
      <mesh position={[tray[0], tray[1] + 0.045, tray[2]]} receiveShadow>
        <boxGeometry args={[2.28, 0.02, 1.32]} />
        <meshLambertMaterial map={felt} name="mat.dice.felt" />
      </mesh>
      {!lite && (
        <>
          <pointLight position={[tray[0], tray[1] + 1.15, tray[2]]} intensity={0.7} distance={3.6} color="#ffe2c0" />
          {([0.7, -0.7] as const).map((dz) => (
            <mesh key={`z${dz}`} position={[tray[0], tray[1] + 0.195, tray[2] + dz]} castShadow>
              <boxGeometry args={[2.44, 0.28, 0.08]} />
              <meshStandardMaterial color="#4a3020" roughness={0.65} name="mat.dice.tray" />
            </mesh>
          ))}
          {([1.18, -1.18] as const).map((dx) => (
            <mesh key={`x${dx}`} position={[tray[0] + dx, tray[1] + 0.195, tray[2]]} castShadow>
              <boxGeometry args={[0.08, 0.28, 1.32]} />
              <meshStandardMaterial color="#4a3020" roughness={0.65} name="mat.dice.tray" />
            </mesh>
          ))}
        </>
      )}
      {!lite && (
        <>
          <mesh ref={shadeA} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
            <circleGeometry args={[DIE_SIZE * 0.46, 18]} />
            <meshBasicMaterial color="#140e0a" transparent opacity={0.32} depthWrite={false} name="mat.dice.shade" />
          </mesh>
          <mesh ref={shadeB} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
            <circleGeometry args={[DIE_SIZE * 0.46, 18]} />
            <meshBasicMaterial color="#140e0a" transparent opacity={0.32} depthWrite={false} name="mat.dice.shade" />
          </mesh>
        </>
      )}
      <DieMesh
        groupRef={aRef}
        body={geo}
        pips={pips}
        lite={lite}
        position={[tray[0] - 0.32, tray[1] + FELT_LIFT + DIE_SIZE / 2, tray[2]]}
      />
      <DieMesh
        groupRef={bRef}
        body={geo}
        pips={pips}
        lite={lite}
        position={[tray[0] + 0.32, tray[1] + FELT_LIFT + DIE_SIZE / 2, tray[2]]}
      />
    </group>
  );
}
