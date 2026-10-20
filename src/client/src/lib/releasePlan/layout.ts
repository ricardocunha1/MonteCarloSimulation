import { L } from "./constants";
import { bands, flagsAfter, msIndex } from "./selectors";
import type { Band, Epic, Feature, Flag, ReleasePlan } from "./types";

/** A Feature column: left edge `x` of its cells. */
export interface LayoutColumn {
  feature: Feature;
  x: number;
}

/** An Epic: left edge `x`, width `w` and its columns. */
export interface LayoutEpic {
  epic: Epic;
  x: number;
  w: number;
  cols: LayoutColumn[];
}

/** A milestone (or Unplanned) band: top `y`, height `h`. */
export interface LayoutBand {
  band: Band;
  y: number;
  h: number;
}

/** A flag row below its milestone band. */
export interface LayoutFlag {
  flag: Flag;
  y: number;
  h: number;
}

/** A "+" insertion point below milestone `afterMsId`; inserting goes to index `idx`. */
export interface LayoutGap {
  idx: number;
  y: number;
  afterMsId: string;
}

/** Result of `computeLayout`; `bandY0` is the top of the first band. */
export interface BoardLayout {
  epics: LayoutEpic[];
  bands: LayoutBand[];
  flags: LayoutFlag[];
  gaps: LayoutGap[];
  width: number;
  height: number;
  bandY0: number;
}

/** Board geometry (unscaled px), shared by the DOM board and the Phase 3 PNG export. Pure. */
export function computeLayout(plan: ReleasePlan): BoardLayout {
  const epics: LayoutEpic[] = [];
  let x: number = L.LEFT;
  for (const epic of plan.epics) {
    const n = Math.max(1, epic.features.length);
    const w = 2 * L.EPIC_PAD + n * L.COL_W + (n - 1) * L.COL_GAP;
    const left = x;
    epics.push({
      epic,
      x: left,
      w,
      cols: epic.features.map((feature, i) => ({ feature, x: left + L.EPIC_PAD + i * (L.COL_W + L.COL_GAP) })),
    });
    x += w + L.EPIC_GAP;
  }
  const width = Math.max(x - L.EPIC_GAP + L.RIGHT, 700);
  const bandY0 = L.TOP + L.EPIC_H + L.GAP_H;

  const layoutBands: LayoutBand[] = [];
  const flags: LayoutFlag[] = [];
  const gaps: LayoutGap[] = [];
  let y = bandY0;
  // No "+" before the first milestone: gaps only come after a milestone band.
  for (const band of bands(plan)) {
    const h = Math.max(L.BAND_MIN, 2 * L.BAND_PAD + L.CARD_H + 18);
    layoutBands.push({ band, y, h });
    y += h;
    if (!band.unplanned) {
      for (const flag of flagsAfter(plan, band.id)) {
        flags.push({ flag, y, h: L.FLAG_H });
        y += L.FLAG_H;
      }
      gaps.push({ idx: msIndex(plan, band.id) + 1, y, afterMsId: band.id });
    }
  }
  return { epics, bands: layoutBands, flags, gaps, width, height: y + 12, bandY0 };
}
