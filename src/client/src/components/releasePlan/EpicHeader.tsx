import type { DropSide } from "../../lib/releasePlan/reducer";
import { epicMetaText } from "../../lib/releasePlan/selectors";
import type { Epic } from "../../lib/releasePlan/types";
import { dropClass, type BoxRect } from "./boardGeometry";
import type { BoardDragHandlers } from "./useBoardDrag";

/**
 * Orange Epic header: ◀/▶ move it one position (no-op at the ends) and the
 * title opens the Epic details. The header is draggable (not the ◀/▶ buttons);
 * dropping an Epic on another header reorders it before/after that Epic.
 *
 * On the flipped board (`flipped`) the header is a block on the left of its
 * Epic group: ▲/▼ ("Move Epic up/down") replace ◀/▶ and the drop indicator is
 * above/below (`.dropT`/`.dropB`) instead of left/right.
 */
export function EpicHeader({
  epic,
  rect,
  label,
  onMovePrev,
  onMoveNext,
  onOpen,
  drag,
  dragging = false,
  dropSide = null,
  flipped = false,
}: {
  epic: Epic;
  /** Position and size on the board, in unscaled px. */
  rect: BoxRect;
  /** `epicMsLabel` text for the meta line. */
  label: string;
  /** Moves the Epic one position back (◀, or ▲ when flipped). */
  onMovePrev: () => void;
  /** Moves the Epic one position forward (▶, or ▼ when flipped). */
  onMoveNext: () => void;
  onOpen: () => void;
  /** Board drag handlers from `useBoardDrag` (stable identity). */
  drag: BoardDragHandlers;
  /** This Epic is being dragged (`.dragging`). */
  dragging?: boolean;
  /** Drop indicator side while another Epic is dragged over (`.dropL`/`.dropR`, or `.dropT`/`.dropB` when flipped). */
  dropSide?: DropSide | null;
  /** Rendered on the flipped board. */
  flipped?: boolean;
}) {
  const drop = dropSide ? ` ${dropClass(dropSide, flipped)}` : "";
  const className = `abs epic${flipped ? " flip" : ""}${dragging ? " dragging" : ""}${drop}`;
  return (
    <div
      className={className}
      data-epic={String(epic.id)}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      draggable
      onDragStart={(event) => drag.epicDragStart(event, epic.id)}
      onDragOver={(event) => drag.epicDragOver(event, epic.id)}
      onDragLeave={(event) => drag.epicDragLeave(event, epic.id)}
      onDrop={(event) => drag.epicDrop(event, epic.id)}
      onDragEnd={drag.dragEnd}
    >
      <button
        type="button"
        className="mv"
        title={flipped ? "Move up" : "Move left"}
        aria-label={flipped ? "Move Epic up" : "Move Epic left"}
        draggable={false}
        onClick={onMovePrev}
      >
        {flipped ? "▲" : "◀"}
      </button>
      <button type="button" className="name" title="Click to see the description" onClick={onOpen}>
        <span>{epic.title}</span>
        <span className="meta">{epicMetaText(epic, label)}</span>
      </button>
      <button
        type="button"
        className="mv"
        title={flipped ? "Move down" : "Move right"}
        aria-label={flipped ? "Move Epic down" : "Move Epic right"}
        draggable={false}
        onClick={onMoveNext}
      >
        {flipped ? "▼" : "▶"}
      </button>
    </div>
  );
}
