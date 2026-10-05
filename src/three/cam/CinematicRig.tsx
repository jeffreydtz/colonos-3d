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
import { CAMERA_SHARP, DURATION } from "../../motion/tokens";
import {
  RESTORE_SHARPNESS,
  cameraCueForActor,
  cameraEventStamp,
  cueAfterEvent,
  shouldKeepHeld,
} from "../../play/spotlight";
import { cuePose, lensFor, type Pose } from "./poses";

type Cue = "tactica" | "dados" | "ladron" | "intro" | "volver" | "restaurar";

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
  /** Vista del jugador justo antes de una toma automática. */
  const held = useRef<Pose | null>(null);
  /** Toma que el jugador cortó con el arrastre: no se vuelve a disparar. */
  const skipped = useRef<string | null>(null);
  const freezeApplied = useRef(false);
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
        until.current = performance.now() + DURATION.cameraIntro;
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
      held.current = null;
      const live = useApp.getState();
      skipped.current = cameraEventStamp(live.diceUi.presenting, live.lastFx?.at ?? null);
      cue.current = "tactica";
    };
    controls.addEventListener("start", onStart);
    return () => controls.removeEventListener?.("start", onStart);
  }, [controlsRef]);

  useEffect(() => {
    if (!recenterNonce || freeze) return;
    userMoved.current = false;
    held.current = null;
    cue.current = "volver";
  }, [recenterNonce, freeze]);

  useEffect(() => {
    if (freeze || calm) return;
    const live = useApp.getState().view;
    if (!live) return;
    // Construir, comerciar, cartas y el turno ajeno no entran: no hay toma para eso.
    const kind = presenting ? "dice" : lastFx?.animations.includes("robber") ? "robber" : null;
    if (!kind) return;
    const stamp = cameraEventStamp(presenting, lastFx?.at ?? null);
    if (skipped.current === stamp) return;
    const next = cameraCueForActor(live.youId, live.currentPlayerId, kind);
    // Acción ajena: no hay toma y no se toca la vista guardada.
    if (next !== "dados" && next !== "ladron") return;
    const controls = controlsRef.current;
    if (controls && !shouldKeepHeld(cue.current)) {
      const cam = get().camera;
      held.current = { pos: cam.position.clone(), target: controls.target.clone() };
    }
    if (cue.current !== next && next === "dados") {
      cue.current = "dados";
      until.current = performance.now() + DURATION.cameraDice;
    } else if (cue.current !== next && next === "ladron") {
      cue.current = "ladron";
      until.current = performance.now() + DURATION.cameraRobber;
    }
  }, [presenting, lastFx, freeze, calm, get, controlsRef]);

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
      cue.current = cue.current === "intro" ? "volver" : cueAfterEvent(held.current != null, userMoved.current);
    }
    if (cue.current === "tactica") return;
    const back = cue.current === "restaurar" ? held.current : null;
    if (calm) {
      const snap = back ?? (cue.current === "volver" ? h : null);
      if (snap) {
        camera.position.copy(snap.pos);
        controls.target.copy(snap.target);
        controls.update?.();
        if (back) held.current = null;
        cue.current = "tactica";
      }
      return;
    }
    const want =
      cue.current === "dados" || cue.current === "ladron"
        ? cuePose(cue.current, h, frame.tray, robber, dicePose.current)
        : (back ?? h);
    const sharp = cue.current === "intro" ? CAMERA_SHARP.intro : cue.current === "restaurar" ? RESTORE_SHARPNESS : CAMERA_SHARP.event;
    const k = 1 - Math.exp(-dt * sharp);
    camera.position.lerp(want.pos, k);
    controls.target.lerp(want.target, k);
    controls.update?.();
    const settled =
      (cue.current === "volver" && camera.position.distanceTo(h.pos) < 0.02 && controls.target.distanceTo(h.target) < 0.02) ||
      (cue.current === "restaurar" &&
        back != null &&
        camera.position.distanceTo(back.pos) < 0.02 &&
        controls.target.distanceTo(back.target) < 0.02);
    if (settled) {
      if (cue.current === "restaurar") held.current = null;
      cue.current = "tactica";
    }
    if (import.meta.env.DEV) {
      const w = window as Window & {
        __colonosCam?: { x: number; y: number; z: number; tx: number; ty: number; tz: number };
      };
      w.__colonosCam = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        tx: controls.target.x,
        ty: controls.target.y,
        tz: controls.target.z,
      };
    }
  });
  return null;
}
