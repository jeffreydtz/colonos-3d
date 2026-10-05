import type { ThreeEvent } from "@react-three/fiber";
import { isTap } from "../play/tap";

let dropActive: (() => void) | null = null;

/**
 * El id se lee en pointerdown y se confirma en pointerup de window.
 * No actualiza React en el down: un render entre down y up recrea la malla
 * y R3F pierde el click porque el pointerup ya no da con el mismo objeto.
 */
function arm(e: ThreeEvent<PointerEvent>, fire: () => void): void {
  const sx = e.nativeEvent.clientX;
  const sy = e.nativeEvent.clientY;
  const pointerId = e.nativeEvent.pointerId;
  const drop = () => {
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    if (dropActive === drop) dropActive = null;
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    drop();
    if (!isTap(ev.clientX - sx, ev.clientY - sy)) return;
    fire();
  };
  const cancel = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    drop();
  };
  dropActive?.();
  dropActive = drop;
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
}

export function bindInstanceTap(
  resolveId: (instanceId: number) => string | undefined,
  onPick: (id: string) => void,
): (e: ThreeEvent<PointerEvent>) => void {
  return (e) => {
    e.stopPropagation();
    const idx = e.instanceId;
    if (idx == null) return;
    const id = resolveId(idx);
    if (!id) return;
    arm(e, () => onPick(id));
  };
}

export function bindMeshTap(onPick: () => void): (e: ThreeEvent<PointerEvent>) => void {
  return (e) => {
    e.stopPropagation();
    arm(e, onPick);
  };
}
