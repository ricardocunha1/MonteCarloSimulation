import { L } from "../../lib/releasePlan/constants";
import type { Epic } from "../../lib/releasePlan/types";

/**
 * Orange Epic header: ◀/▶ move it one position (no-op at the ends) and the
 * title opens the Epic details. Phase 2 adds drag-and-drop.
 */
export function EpicHeader({
  epic,
  x,
  w,
  label,
  onMoveLeft,
  onMoveRight,
  onOpen,
}: {
  epic: Epic;
  x: number;
  w: number;
  /** `epicMsLabel` text for the meta line. */
  label: string;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="abs epic" data-epic={String(epic.id)} style={{ left: x, top: L.TOP, width: w, height: L.EPIC_H }}>
      <button type="button" className="mv" title="Move left" aria-label="Move Epic left" onClick={onMoveLeft}>
        ◀
      </button>
      <button type="button" className="name" title="Click to see the description" onClick={onOpen}>
        <span>{epic.title}</span>
        <span className="meta">{`Epic #${epic.id} · ${label}`}</span>
      </button>
      <button type="button" className="mv" title="Move right" aria-label="Move Epic right" onClick={onMoveRight}>
        ▶
      </button>
    </div>
  );
}
