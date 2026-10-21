import { L } from "../../lib/releasePlan/constants";
import type { DropSide } from "../../lib/releasePlan/reducer";
import type { Epic } from "../../lib/releasePlan/types";
import type { BoardDragHandlers } from "./useBoardDrag";

/**
 * Orange Epic header: ◀/▶ move it one position (no-op at the ends) and the
 * title opens the Epic details. The header is draggable (not the ◀/▶ buttons);
 * dropping an Epic on another header reorders it before/after that Epic.
 */
export function EpicHeader({
  epic,
  x,
  w,
  label,
  onMoveLeft,
  onMoveRight,
  onOpen,
  drag,
  dragging = false,
  dropSide = null,
}: {
  epic: Epic;
  x: number;
  w: number;
  /** `epicMsLabel` text for the meta line. */
  label: string;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onOpen: () => void;
  /** Board drag handlers from `useBoardDrag` (stable identity). */
  drag: BoardDragHandlers;
  /** This Epic is being dragged (`.dragging`). */
  dragging?: boolean;
  /** Drop indicator side while another Epic is dragged over (`.dropL`/`.dropR`). */
  dropSide?: DropSide | null;
}) {
  const className = `abs epic${dragging ? " dragging" : ""}${dropSide ? ` drop${dropSide}` : ""}`;
  return (
    <div
      className={className}
      data-epic={String(epic.id)}
      style={{ left: x, top: L.TOP, width: w, height: L.EPIC_H }}
      draggable
      onDragStart={(event) => drag.epicDragStart(event, epic.id)}
      onDragOver={(event) => drag.epicDragOver(event, epic.id)}
      onDragLeave={(event) => drag.epicDragLeave(event, epic.id)}
      onDrop={(event) => drag.epicDrop(event, epic.id)}
      onDragEnd={drag.dragEnd}
    >
      <button type="button" className="mv" title="Move left" aria-label="Move Epic left" draggable={false} onClick={onMoveLeft}>
        ◀
      </button>
      <button type="button" className="name" title="Click to see the description" onClick={onOpen}>
        <span>{epic.title}</span>
        <span className="meta">{`Epic #${epic.id} · ${label}`}</span>
      </button>
      <button type="button" className="mv" title="Move right" aria-label="Move Epic right" draggable={false} onClick={onMoveRight}>
        ▶
      </button>
    </div>
  );
}
