import { memo } from "react";
import { L } from "../../lib/releasePlan/constants";
import type { LayoutBand } from "../../lib/releasePlan/layout";
import type { DropSide } from "../../lib/releasePlan/reducer";
import type { Epic, Feature, WorkItemRef } from "../../lib/releasePlan/types";
import { FeatureCard } from "./FeatureCard";
import type { BoardDragHandlers } from "./useBoardDrag";

/** Highlight of a cell while a Feature is dragged: a drop target of the same Epic, or not. */
export type CellDragState = "valid" | "invalid" | null;

/**
 * One (feature column × band) cell; holds the card when the feature belongs to
 * the band. It is a drop target for Features of the same Epic: dropping moves
 * them to this band (and, for a single Feature dropped on another column,
 * reorders it before/after this column). Memoized: during a drag only the cells
 * whose highlight changes re-render.
 */
export const FeatureCell = memo(function FeatureCell({
  epic,
  feature,
  x,
  layoutBand,
  onOpenItem,
  drag,
  dragState = null,
  over = false,
  dropSide = null,
  selected = false,
  dragging = false,
}: {
  epic: Epic;
  feature: Feature;
  x: number;
  layoutBand: LayoutBand;
  /** Opens the details modal; passed instead of a per-cell closure so `memo` holds. */
  onOpenItem: (item: WorkItemRef) => void;
  /** Board drag handlers from `useBoardDrag` (stable identity). */
  drag: BoardDragHandlers;
  /** `.valid`/`.invalid` while a Feature drag is active (see {@link CellDragState}). */
  dragState?: CellDragState;
  /** A valid drag is over this cell (`.over`). */
  over?: boolean;
  /** Reorder indicator (`.dropL`/`.dropR`). */
  dropSide?: DropSide | null;
  /** The card is in the Ctrl/⌘+click selection. */
  selected?: boolean;
  /** The card is being dragged. */
  dragging?: boolean;
}) {
  const { band, y, h } = layoutBand;
  const open = () => onOpenItem({ type: "feature", id: feature.id });
  const className = `abs cell fcell${dragState ? ` ${dragState}` : ""}${over ? " over" : ""}${dropSide ? ` drop${dropSide}` : ""}`;
  return (
    <div
      className={className}
      data-epic={String(epic.id)}
      data-feature={String(feature.id)}
      style={{ left: x, top: y, width: L.COL_W, height: h, padding: `${L.BAND_PAD}px 0` }}
      onDragOver={(event) => drag.cellDragOver(event, epic.id, feature.id, band.id)}
      onDragLeave={(event) => drag.cellDragLeave(event, epic.id, feature.id, band.id)}
      onDrop={(event) => drag.cellDrop(event, epic.id, feature.id, band.id)}
    >
      {(feature.milestoneId ?? null) === band.id && (
        <FeatureCard
          feature={feature}
          onOpen={open}
          onClick={(event) => drag.cardClick(event, epic.id, feature.id, open)}
          onDragStart={(event) => drag.cardDragStart(event, epic, feature.id)}
          onDragEnd={drag.dragEnd}
          selected={selected}
          dragging={dragging}
        />
      )}
    </div>
  );
});
