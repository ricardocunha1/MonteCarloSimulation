import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "./constants";

/** Clamps to [0.3, 1.5] and rounds to 2 decimals. */
export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

/** One `ZOOM_STEP` up, clamped. */
export function zoomIn(z: number): number {
  return clampZoom(z + ZOOM_STEP);
}

/** One `ZOOM_STEP` down, clamped. */
export function zoomOut(z: number): number {
  return clampZoom(z - ZOOM_STEP);
}

/** Fit = `min(1, (clientWidth - 4) / layoutWidth)`, clamped like any zoom. */
export function fitZoom(clientWidth: number, layoutWidth: number): number {
  return clampZoom(Math.min(1, (clientWidth - 4) / layoutWidth));
}

/** Label shown between − and +: `"100%"`. */
export function zoomLabel(z: number): string {
  return `${Math.round(z * 100)}%`;
}
