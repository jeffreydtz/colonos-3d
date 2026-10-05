/** Un dedo que se corre unos px sigue siendo un toque, no un arrastre de cámara. */
export const TAP_SLOP_PX = 16;

export function isTap(dx: number, dy: number, slop = TAP_SLOP_PX): boolean {
  return dx * dx + dy * dy <= slop * slop;
}
