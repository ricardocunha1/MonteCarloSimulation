import { L, LF } from "./constants";
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

/**
 * How the board is drawn (UI-only, never stored in the plan): `standard` =
 * Epics/Features as columns and milestones as rows; `flipped` = the transpose.
 */
export type BoardOrientation = "standard" | "flipped";

/** Result of `computeLayout`; `bandY0` is the top of the first band. */
export interface BoardLayout {
  orientation: "standard";
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
  return { orientation: "standard", epics, bands: layoutBands, flags, gaps, width, height: y + 12, bandY0 };
}

/** A Feature row of the flipped board: top `y` of its cells (height `L.CARD_H`). */
export interface FlippedRow {
  feature: Feature;
  y: number;
}

/** An Epic group of the flipped board: top `y`, height `h` and its Feature rows. */
export interface FlippedEpic {
  epic: Epic;
  y: number;
  h: number;
  rows: FlippedRow[];
}

/** A milestone (or Unplanned) column of the flipped board: left `x`, width `w`. */
export interface FlippedColumn {
  band: Band;
  x: number;
  w: number;
}

/** A flag column right after its milestone column. */
export interface FlippedFlag {
  flag: Flag;
  x: number;
  w: number;
}

/** A "+" insertion point right of milestone `afterMsId` (at `x`); inserting goes to index `idx`. */
export interface FlippedGap {
  idx: number;
  x: number;
  afterMsId: string;
}

/**
 * Result of `computeFlippedLayout`: the frozen header row is `0..headH`, the
 * columns start at `colX0`.
 */
export interface FlippedLayout {
  orientation: "flipped";
  epics: FlippedEpic[];
  columns: FlippedColumn[];
  flags: FlippedFlag[];
  gaps: FlippedGap[];
  width: number;
  height: number;
  colX0: number;
  headH: number;
}

/** Either board geometry; narrow on `orientation`. */
export type AnyBoardLayout = BoardLayout | FlippedLayout;

/**
 * Flipped board geometry (milestones as columns, Epic groups of Feature rows),
 * the transpose of {@link computeLayout}: each column is `max(COL_MIN, 2*BAND_PAD
 * + COL_W)` wide, flags add a `FLAG_H` column after their milestone, then the
 * gap (none before the first milestone); each Epic is `2*EPIC_PAD + n*CARD_H +
 * (n-1)*COL_GAP` tall (`n = max(1, features)`). Pure.
 */
export function computeFlippedLayout(plan: ReleasePlan): FlippedLayout {
  const colX0 = LF.LEFT + LF.EPIC_W + LF.GAP_W;
  const columns: FlippedColumn[] = [];
  const flags: FlippedFlag[] = [];
  const gaps: FlippedGap[] = [];
  let x: number = colX0;
  for (const band of bands(plan)) {
    const w = Math.max(LF.COL_MIN, 2 * L.BAND_PAD + L.COL_W);
    columns.push({ band, x, w });
    x += w;
    if (!band.unplanned) {
      for (const flag of flagsAfter(plan, band.id)) {
        flags.push({ flag, x, w: L.FLAG_H });
        x += L.FLAG_H;
      }
      gaps.push({ idx: msIndex(plan, band.id) + 1, x, afterMsId: band.id });
    }
  }
  const width = Math.max(x + 12, LF.MIN_W);

  const epics: FlippedEpic[] = [];
  let y: number = LF.TOP;
  for (const epic of plan.epics) {
    const n = Math.max(1, epic.features.length);
    const h = 2 * L.EPIC_PAD + n * L.CARD_H + (n - 1) * L.COL_GAP;
    const top = y;
    epics.push({
      epic,
      y: top,
      h,
      rows: epic.features.map((feature, i) => ({ feature, y: top + L.EPIC_PAD + i * (L.CARD_H + L.COL_GAP) })),
    });
    y += h + L.EPIC_GAP;
  }
  const height = Math.max(y - L.EPIC_GAP + LF.BOTTOM, LF.MIN_H);
  return { orientation: "flipped", epics, columns, flags, gaps, width, height, colX0, headH: LF.HEAD_H };
}

/** The layout of `plan` for `orientation` ({@link computeLayout} or {@link computeFlippedLayout}). */
export function computeBoardLayout(plan: ReleasePlan, orientation: BoardOrientation): AnyBoardLayout {
  return orientation === "flipped" ? computeFlippedLayout(plan) : computeLayout(plan);
}
