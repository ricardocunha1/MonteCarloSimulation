/** Maximum auto-scroll speed, in pixels per animation frame. */
export const AUTO_SCROLL_MAX = 24;
/** Width of the auto-scroll zone at each edge, in pixels (shrinks to a quarter of small boxes). */
export const AUTO_SCROLL_EDGE = 70;

/**
 * Auto-scroll speed (px per frame) for a pointer at `y` inside the vertical range
 * `[top, bottom]` during a drag: negative within `EDGE = min(70, (bottom-top)/4)`
 * of the top, positive within `EDGE` of the bottom, scaled linearly up to
 * `±24` at the edge itself (clamped beyond it), else 0.
 */
export function edgeSpeed(y: number, top: number, bottom: number): number {
  const edge = Math.min(AUTO_SCROLL_EDGE, (bottom - top) / 4);
  if (!(edge > 0)) {
    return 0;
  }
  if (y < top + edge) {
    return -AUTO_SCROLL_MAX * Math.min(1, (top + edge - y) / edge);
  }
  if (y > bottom - edge) {
    return AUTO_SCROLL_MAX * Math.min(1, (y - (bottom - edge)) / edge);
  }
  return 0;
}
