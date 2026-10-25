import type { DropSide } from "../../lib/releasePlan/reducer";

/** A positioned box on the board, in unscaled px. */
export interface BoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Background of the band (or flipped column) at index `i`: alternating `--band-a`/`--band-b`, `--unplanned` for Unplanned. */
export function bandBackground(unplanned: boolean, i: number): string {
  return unplanned ? "var(--unplanned)" : i % 2 ? "var(--band-b)" : "var(--band-a)";
}

/** Drop indicator class: `dropL`/`dropR`, or `dropT`/`dropB` on the flipped board (`L` = before, `R` = after). */
export function dropClass(side: DropSide, flipped: boolean): string {
  if (flipped) {
    return side === "L" ? "dropT" : "dropB";
  }
  return `drop${side}`;
}
