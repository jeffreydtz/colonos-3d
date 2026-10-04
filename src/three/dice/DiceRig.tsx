import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as CANNON from "cannon-es";
import * as THREE from "three";
import { playDiceHit, playSfx, reduceMotion } from "../../audio/sfx";
import { diceHeld, skipDiceHold } from "../../play/diceHold";
import { useApp } from "../../store";
import { feltAlbedo } from "../procTextures";
import { DIE_SIZE, dieGeometry, diePipsGeometry, quatForFace } from "./dieGeo";

/** Segundos de presentación: física + hold sin spoiler en HUD/log. El valor vive en diceHold. */
export { DICE_HOLD_MS } from "../../play/diceHold";
export const DICE_LITE_MS = 1600;
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

export function DiceRig({
  values,
  lite,
  freeze,
  tray = TRAY_POS,
}: {
  values: Pair;
  lite: boolean;
  freeze: boolean;
  tray?: [number, number, number];
}) {
  const presenting = useApp((s) => s.diceUi.presenting);
  const felt = useMemo(() => feltAlbedo(), []);
  const geo = useMemo(() => dieGeometry(), []);
  const pips = useMemo(() => diePipsGeometry(), []);
  const aRef = useRef<THREE.Group>(null);
  const bRef = useRef<THREE.Group>(null);
  const worldRef = useRef<CANNON.World | null>(null);
  const bodies = useRef<[CANNON.Body, CANNON.Body] | null>(null);
  const snapping = useRef(false);
  const settledSfx = useRef(false);
  const t0 = useRef(0);
  const twists = useRef<[number, number]>([0, 0]);
  const lastHit = useRef(0);

  useEffect(() => {
    if (lite || freeze || reduceMotion()) return;
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    world.allowSleep = true;
    (world.solver as CANNON.GSSolver).iterations = 8;
    const wood = new CANNON.Material("wood");
    const ivoryM = new CANNON.Material("ivory");
    world.addContactMaterial(
      new CANNON.ContactMaterial(ivoryM, wood, { friction: 0.38, restitution: 0.28 }),
    );
    world.addContactMaterial(
      new CANNON.ContactMaterial(ivoryM, ivoryM, { friction: 0.2, restitution: 0.18 }),
    );
    const floor = new CANNON.Body({
      mass: 0,
      material: wood,
      shape: new CANNON.Box(new CANNON.Vec3(1.15, 0.04, 0.72)),
      position: new CANNON.Vec3(tray[0], tray[1], tray[2]),
    });
    world.addBody(floor);
    const walls: Array<[CANNON.Vec3, CANNON.Vec3]> = [
      [new CANNON.Vec3(1.2, 0.22, 0.06), new CANNON.Vec3(tray[0], tray[1] + 0.22, tray[2] + 0.78)],
      [new CANNON.Vec3(1.2, 0.22, 0.06), new CANNON.Vec3(tray[0], tray[1] + 0.22, tray[2] - 0.78)],
      [new CANNON.Vec3(0.06, 0.22, 0.78), new CANNON.Vec3(tray[0] + 1.2, tray[1] + 0.22, tray[2])],
      [new CANNON.Vec3(0.06, 0.22, 0.78), new CANNON.Vec3(tray[0] - 1.2, tray[1] + 0.22, tray[2])],
    ];
    for (const [half, pos] of walls) {
      world.addBody(new CANNON.Body({ mass: 0, material: wood, shape: new CANNON.Box(half), position: pos }));
    }
    const mk = (x: number) => {
      const b = new CANNON.Body({
        mass: 0.08,
        material: ivoryM,
        shape: new CANNON.Box(new CANNON.Vec3(DIE_SIZE / 2, DIE_SIZE / 2, DIE_SIZE / 2)),
        position: new CANNON.Vec3(tray[0] + x, tray[1] + 0.28, tray[2]),
        angularDamping: 0.18,
        linearDamping: 0.08,
        allowSleep: true,
        sleepSpeedLimit: 0.18,
      });
      b.addEventListener("collide", (ev: { contact: { getImpactVelocityAlongNormal: () => number } }) => {
        const imp = Math.abs(ev.contact.getImpactVelocityAlongNormal());
        const now = performance.now();
        if (imp > 0.55 && now - lastHit.current > 45) {
          lastHit.current = now;
          playDiceHit(imp);
        }
      });
      world.addBody(b);
      return b;
    };
    bodies.current = [mk(-0.32), mk(0.32)];
    worldRef.current = world;
    return () => {
      worldRef.current = null;
      bodies.current = null;
    };
  }, [lite, freeze, tray[0], tray[2]]);

  useEffect(() => {
    if (!presenting || freeze) {
      snapping.current = false;
      return;
    }
    playSfx("dice_throw");
    t0.current = performance.now();
    snapping.current = false;
    settledSfx.current = false;
    twists.current = [Math.random() * Math.PI, Math.random() * Math.PI];
    const pair = bodies.current;
    if (!pair || lite || reduceMotion()) return;
    pair.forEach((b, i) => {
      b.wakeUp();
      b.position.set(tray[0] + (i === 0 ? -0.28 : 0.28), tray[1] + 0.85, tray[2] - 0.15);
      b.velocity.set((Math.random() - 0.5) * 1.4, 0.2, 1.6 + Math.random() * 0.8);
      b.angularVelocity.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 12);
    });
  }, [presenting, freeze, lite, tray[0], tray[1], tray[2]]);

  useFrame((_, dt) => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    const v0 = values?.[0] ?? 1;
    const v1 = values?.[1] ?? 6;
    const qa = quatForFace(v0, freeze ? 0 : twists.current[0]);
    const qb = quatForFace(v1, freeze ? 0 : twists.current[1]);
    const restA = new THREE.Vector3(tray[0] - 0.32, tray[1] + DIE_SIZE / 2 + 0.02, tray[2]);
    const restB = new THREE.Vector3(tray[0] + 0.32, tray[1] + DIE_SIZE / 2 + 0.02, tray[2]);

    if (freeze || reduceMotion() || (!presenting && !lite)) {
      a.position.copy(restA);
      b.position.copy(restB);
      a.quaternion.copy(qa);
      b.quaternion.copy(qb);
      return;
    }

    if (lite || !worldRef.current || !bodies.current) {
      const u = presenting ? Math.min(1, (performance.now() - t0.current) / DICE_LITE_MS) : 1;
      const bounce = 1 - Math.pow(1 - u, 3);
      const hop = Math.sin(u * Math.PI) * 0.55;
      const spin = (1 - u) * 10;
      a.position.lerpVectors(new THREE.Vector3(restA.x, restA.y + 0.9, restA.z - 0.4), restA, bounce);
      b.position.lerpVectors(new THREE.Vector3(restB.x, restB.y + 0.9, restB.z - 0.4), restB, bounce);
      a.position.y += hop;
      b.position.y += hop;
      a.rotation.set(spin, spin * 0.7, spin * 0.4);
      b.rotation.set(spin * 0.8, spin, spin * 0.3);
      if (u > 0.72) {
        a.quaternion.slerp(qa, 0.2);
        b.quaternion.slerp(qb, 0.2);
      }
      if (u >= 1) {
        a.position.copy(restA);
        b.position.copy(restB);
        a.quaternion.copy(qa);
        b.quaternion.copy(qb);
      }
      return;
    }

    const world = worldRef.current;
    world.step(Math.min(dt, 1 / 45), dt, 4);
    const [ba, bb] = bodies.current;
    a.position.set(ba.position.x, ba.position.y, ba.position.z);
    b.position.set(bb.position.x, bb.position.y, bb.position.z);
    a.quaternion.set(ba.quaternion.x, ba.quaternion.y, ba.quaternion.z, ba.quaternion.w);
    b.quaternion.set(bb.quaternion.x, bb.quaternion.y, bb.quaternion.z, bb.quaternion.w);

    const slow =
      ba.velocity.length() < 0.22 &&
      bb.velocity.length() < 0.22 &&
      ba.angularVelocity.length() < 1.2 &&
      bb.angularVelocity.length() < 1.2;
    const elapsed = performance.now() - t0.current;
    if (presenting && ((slow && elapsed > 700) || elapsed > 2400)) {
      if (!snapping.current && !settledSfx.current) {
        settledSfx.current = true;
        playSfx("dice_settle");
      }
      snapping.current = true;
    }
    if (snapping.current || !presenting) {
      a.quaternion.slerp(qa, 0.18);
      b.quaternion.slerp(qb, 0.18);
      const qaC = a.quaternion;
      const qbC = b.quaternion;
      ba.quaternion.set(qaC.x, qaC.y, qaC.z, qaC.w);
      bb.quaternion.set(qbC.x, qbC.y, qbC.z, qbC.w);
      ba.angularVelocity.set(0, 0, 0);
      bb.angularVelocity.set(0, 0, 0);
      if (!presenting) {
        a.position.lerp(restA, 0.2);
        b.position.lerp(restB, 0.2);
      }
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
          {([0.74, -0.74] as const).map((dz) => (
            <mesh key={`z${dz}`} position={[tray[0], tray[1] + 0.12, tray[2] + dz]} castShadow>
              <boxGeometry args={[2.5, 0.2, 0.08]} />
              <meshStandardMaterial color="#4a3020" roughness={0.65} name="mat.dice.tray" />
            </mesh>
          ))}
          {([1.21, -1.21] as const).map((dx) => (
            <mesh key={`x${dx}`} position={[tray[0] + dx, tray[1] + 0.12, tray[2]]} castShadow>
              <boxGeometry args={[0.08, 0.2, 1.4]} />
              <meshStandardMaterial color="#4a3020" roughness={0.65} name="mat.dice.tray" />
            </mesh>
          ))}
        </>
      )}
      <DieMesh
        groupRef={aRef}
        body={geo}
        pips={pips}
        lite={lite}
        position={[tray[0] - 0.32, tray[1] + 0.24, tray[2]]}
      />
      <DieMesh
        groupRef={bRef}
        body={geo}
        pips={pips}
        lite={lite}
        position={[tray[0] + 0.32, tray[1] + 0.24, tray[2]]}
      />
    </group>
  );
}
