import { useEffect, useLayoutEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { reduceMotion } from "../../audio/sfx";
import type { ClientView } from "@shared/types";
import { useApp } from "../../store";
import { TILE_TOP } from "../geo";
import type { BoardLayout, Framing } from "../layout";
import { fitBoard, freeAspect, measureHudInsets, type SafeInsets } from "./fit";
import { cuePose, lensFor, type Pose } from "./poses";

type Cue = "tactica" | "dados" | "ladron" | "intro" | "volver";

export type CinemaControls = {
  reset: () => void;
  target: THREE.Vector3;
  update?: () => void;
  target0?: THREE.Vector3;
  position0?: THREE.Vector3;
  addEventListener?: (type: string, fn: () => void) => void;
  removeEventListener?: (type: string, fn: () => void) => void;
};

export function CinematicRig({
  view,
  lite,
  freeze,
  layout,
  frame,
  controlsRef,
}: {
  view: ClientView;
  lite: boolean;
  freeze: boolean;
  layout: BoardLayout;
  frame: Framing;
  controlsRef: MutableRefObject<CinemaControls | null>;
}) {
  const presenting = useApp((s) => s.diceUi.presenting);
  const lastFx = useApp((s) => s.lastFx);
  const artCam = useApp((s) => s.artCam);
  const recenterNonce = useApp((s) => s.recenterNonce);
  const actionsOpen = useApp((s) => s.actionsOpen);
  const mesaOpen = useApp((s) => s.mesaOpen);
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const home = useRef<Pose | null>(null);
  const dicePose = useRef<Pose | null>(null);
  const cue = useRef<Cue>("intro");
  const until = useRef(0);
  const userMoved = useRef(false);
  const freezeApplied = useRef(false);
  const lastTurn = useRef(view.currentPlayerId);
  const refit = useRef<(insets: SafeInsets) => void>(() => {});
  const robber = view.hexes.find((h) => h.id === view.robberHexId);
  const calm = lite || reduceMotion();

  useLayoutEffect(() => {
    const { camera, gl } = get();
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const center = new THREE.Vector3(layout.center.x, TILE_TOP, layout.center.y);
    // El canvas va de borde a borde: el lente se elige por la zona que el HUD deja libre.
    const fitFor = (insets: SafeInsets) => {
      const lens = lensFor(freeAspect(aspect, insets));
      cam.fov = lens.fovY;
      cam.updateProjectionMatrix();
      const opts = { elevation: lens.elevation, fovY: lens.fovY, aspect, safe: insets };
      const dice = fitBoard(frame.dice, center, opts);
      dicePose.current = { pos: dice.position, target: dice.target };
      return fitBoard(frame.points, center, opts);
    };
    const compute = (insets: SafeInsets) => {
      const fit = fitFor(insets);
      const first = home.current === null;
      home.current = { pos: fit.position, target: fit.target };
      const controls = controlsRef.current;
      if (controls) {
        controls.target0?.copy(fit.target);
        controls.position0?.copy(fit.position);
      }
      if (freeze) return;
      if (first && !calm) {
        const t = fit.target;
        const back = fit.position.clone().sub(t).multiplyScalar(1.22);
        back.y += fit.distance * 0.12;
        camera.position.copy(t.clone().add(back));
        controls?.target.copy(t);
        controls?.update?.();
        cue.current = "intro";
        until.current = performance.now() + 1700;
        return;
      }
      if (first) {
        camera.position.copy(fit.position);
        controls?.target.copy(fit.target);
        controls?.update?.();
        cue.current = "tactica";
        return;
      }
      // Durante el acercamiento inicial o una toma (dados, ladrón) la cámara ya va hacia `home`:
      // saltar acá cortaba el intro de golpe con la segunda medición, a los 350 ms.
      if (!userMoved.current && cue.current === "tactica") {
        camera.position.copy(fit.position);
        controls?.target.copy(fit.target);
        controls?.update?.();
      }
    };
    const zero: SafeInsets = { top: 0.02, bottom: 0.02, left: 0.02, right: 0.02 };
    compute(freeze ? zero : measureHudInsets(gl.domElement));
    // Cambios del HUD sin resize (panel de acciones): nueva pose de casa y la cámara se desliza hasta ahí.
    refit.current = (insets) => {
      const fit = fitFor(insets);
      home.current = { pos: fit.position, target: fit.target };
      controlsRef.current?.target0?.copy(fit.target);
      controlsRef.current?.position0?.copy(fit.position);
      if (!userMoved.current && cue.current === "tactica") cue.current = "volver";
    };
    if (freeze) return;
    const id = window.setTimeout(() => compute(measureHudInsets(gl.domElement)), 350);
    return () => window.clearTimeout(id);
  }, [get, size.width, size.height, layout, frame, freeze, calm, controlsRef]);

  useEffect(() => {
    if (freeze) return;
    const id = window.setTimeout(() => refit.current(measureHudInsets(get().gl.domElement)), 80);
    return () => window.clearTimeout(id);
  }, [actionsOpen, mesaOpen, freeze, get]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls?.addEventListener) return;
    const onStart = () => {
      userMoved.current = true;
      if (cue.current !== "dados") cue.current = "tactica";
    };
    controls.addEventListener("start", onStart);
    return () => controls.removeEventListener?.("start", onStart);
  }, [controlsRef]);

  useEffect(() => {
    if (!recenterNonce || freeze) return;
    userMoved.current = false;
    cue.current = "volver";
  }, [recenterNonce, freeze]);

  useEffect(() => {
    if (freeze || view.currentPlayerId === lastTurn.current) return;
    lastTurn.current = view.currentPlayerId;
    if (cue.current === "tactica" && !userMoved.current) cue.current = "volver";
  }, [view.currentPlayerId, freeze]);

  useEffect(() => {
    if (freeze || calm) return;
    if (presenting) {
      cue.current = "dados";
      until.current = performance.now() + 2600;
      return;
    }
    if (lastFx?.animations.includes("robber")) {
      cue.current = "ladron";
      until.current = performance.now() + 1500;
    }
  }, [presenting, lastFx, freeze, calm]);

  useFrame((state, dt) => {
    const controls = controlsRef.current;
    const h = home.current;
    const camera = state.camera;
    if (!controls || !h) return;
    if (freeze) {
      if (!freezeApplied.current) {
        freezeApplied.current = true;
        const pose = artCam === "tactica" ? h : cuePose(artCam, h, frame.tray, robber, dicePose.current);
        camera.position.copy(pose.pos);
        controls.target.copy(pose.target);
        controls.update?.();
      }
      return;
    }
    const now = performance.now();
    if ((cue.current === "dados" || cue.current === "ladron" || cue.current === "intro") && now > until.current) {
      cue.current = cue.current === "intro" ? "volver" : userMoved.current ? "tactica" : "volver";
    }
    if (cue.current === "tactica") return;
    if (calm) {
      if (cue.current === "volver") {
        camera.position.copy(h.pos);
        controls.target.copy(h.target);
        controls.update?.();
        cue.current = "tactica";
      }
      return;
    }
    const want =
      cue.current === "dados" || cue.current === "ladron" ? cuePose(cue.current, h, frame.tray, robber, dicePose.current) : h;
    const k = 1 - Math.exp(-dt * (cue.current === "intro" ? 2.2 : 4.2));
    camera.position.lerp(want.pos, k);
    controls.target.lerp(want.target, k);
    controls.update?.();
    if (cue.current === "volver" && camera.position.distanceTo(h.pos) < 0.02 && controls.target.distanceTo(h.target) < 0.02) {
      cue.current = "tactica";
    }
  });
  return null;
}
