/** Límite de DPR en canvas para reducir memoria/GPU en pantallas 3x sin perder demasiada nitidez. */
export const MAX_CANVAS_DPR = 2;

export function getCanvasBackingDpr(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
}
