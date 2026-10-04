import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { hexToPixel } from "@shared/hex";
import type { ClientView } from "@shared/types";
import { playSfx, reduceMotion } from "../../audio/sfx";
import { useApp } from "../../store";
import { S, robberSpot } from "../geo";
import { hexHeight } from "../HexDecor";

const MAX = 80;

type Spark = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number };

function burstAt(x: number, y: number, z: number, n: number, spread: number, up: number): Spark[] {
  const next: Spark[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    next.push({
      x: x + (Math.random() - 0.5) * spread,
      y,
      z: z + (Math.random() - 0.5) * spread,
      vx: Math.cos(a) * 0.55 + (Math.random() - 0.5) * 0.3,
      vy: up + Math.random() * 1.1,
      vz: Math.sin(a) * 0.55 + (Math.random() - 0.5) * 0.3,
      life: 1,
    });
  }
  return next;
}

export function ProductionSparks({
  view,
  lite,
}: {
  view: ClientView;
  lite: boolean;
}) {
  const lastFx = useApp((s) => s.lastFx);
  const revealed = useApp((s) => s.diceUi.revealed);
  const presenting = useApp((s) => s.diceUi.presenting);
  const freeze = useApp((s) => s.artFreeze);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const live = useRef<Spark[]>([]);

  useEffect(() => {
    if (lite || reduceMotion()) return;
    if (freeze) return;
    const total = view.dice ? view.dice[0] + view.dice[1] : 0;
    if (!total || total === 7) return;
    if (!freeze) {
      if (presenting || !revealed) return;
      if (!lastFx?.animations.includes("dice")) return;
    }
    const next: Spark[] = [];
    for (const h of view.hexes) {
      if (h.number !== total || h.id === view.robberHexId) continue;
      const p = hexToPixel(h.q, h.r, S);
      const y = hexHeight(h.terrain) + 0.2;
      const burst = burstAt(p.x, y, p.y, freeze ? 14 : 8, freeze ? 0.55 : 0.4, freeze ? 0.35 : 1.2);
      if (freeze) {
        for (const s of burst) {
          s.life = 0.85;
          s.y += 0.55;
        }
      }
      next.push(...burst);
    }
    if (next.length) {
      live.current = next;
      if (!freeze) playSfx("produce", 0.7);
    }
  }, [lastFx, presenting, revealed, lite, freeze, view.dice, view.hexes, view.robberHexId]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m || lite) return;
    const list = live.current;
    if (!list.length) {
      m.count = 0;
      return;
    }
    let n = 0;
    for (const p of list) {
      if (!freeze) {
        p.life -= dt * 1.3;
        if (p.life <= 0) continue;
        p.vy -= 4 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar((freeze ? 0.22 : 0.05) * p.life);
      dummy.updateMatrix();
      m.setMatrixAt(n++, dummy.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (!freeze && n === 0) live.current = [];
  });

  if (lite || reduceMotion()) return null;
  void revealed;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false} raycast={() => {}}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#e8c26a" name="mat.vfx.spark" />
    </instancedMesh>
  );
}

export function RobberPuff({
  view,
  lite,
}: {
  view: ClientView;
  lite: boolean;
}) {
  const lastFx = useApp((s) => s.lastFx);
  const freeze = useApp((s) => s.artFreeze);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const live = useRef<Spark[]>([]);

  useEffect(() => {
    if (lite || reduceMotion() || freeze) return;
    if (!lastFx?.animations.includes("robber")) return;
    const h = view.hexes.find((x) => x.id === view.robberHexId);
    if (!h) return;
    const p = robberSpot(h);
    const y = hexHeight(h.terrain);
    const next = burstAt(p.x, y + 0.12, p.y, 12, 0.05, 0.45);
    if (freeze) {
      for (const s of next) {
        s.life = 0.7;
        s.x += s.vx * 0.35;
        s.y += 0.22;
        s.z += s.vz * 0.35;
      }
    }
    live.current = next;
    if (!freeze) playSfx("robber");
  }, [lastFx, lite, freeze, view.hexes, view.robberHexId]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m || lite) return;
    let n = 0;
    for (const p of live.current) {
      if (!freeze) {
        p.life -= dt * 1.6;
        if (p.life <= 0) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar((freeze ? 0.18 : 0.07) * p.life);
      dummy.updateMatrix();
      m.setMatrixAt(n++, dummy.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });

  if (lite || reduceMotion()) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, 16]} frustumCulled={false} raycast={() => {}}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#c4b59a" transparent opacity={0.65} name="mat.vfx.puff" />
    </instancedMesh>
  );
}
