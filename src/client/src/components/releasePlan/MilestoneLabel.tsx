import { useState } from "react";
import type { Band, Feature } from "../../lib/releasePlan/types";
import { useReleasePlan } from "../../releasePlanStore";
import { ConfirmDialog } from "../ConfirmDialog";
import type { BoxRect } from "./boardGeometry";
import { CommitInput } from "./CommitInput";
import { SizeChips } from "./SizeChips";

/**
 * Frozen-column label of a band. A milestone shows its editable name (data-focus
 * `ms:<id>`), color dot + date, feature count, size chips and ▲ ▼ ✕ controls (✕
 * asks for confirmation; its features become unplanned). Unplanned shows a
 * read-only summary.
 *
 * On the flipped board (`flipped`) the label is a column header in the frozen
 * header row and the move buttons are ◀/▶ ("Move milestone left/right", same
 * `moveMilestone` actions and disabled rules).
 */
export function MilestoneLabel({
  band,
  rect,
  index,
  milestoneCount,
  features,
  background,
  flipped = false,
}: {
  band: Band;
  /** Position and size in the frozen column (or flipped header row), in unscaled px. */
  rect: BoxRect;
  /** Band index (= milestone index for milestones). */
  index: number;
  milestoneCount: number;
  features: readonly Feature[];
  background: string;
  /** Rendered in the flipped board's header row. */
  flipped?: boolean;
}) {
  const { dispatch } = useReleasePlan();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const style = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, background };
  const className = `abs mslabel${flipped ? " flip" : ""}`;

  if (band.unplanned) {
    return (
      <div className={className} style={style} role="group" aria-label="Unplanned">
        <b>Unplanned</b>
        <div className="stats">{`${features.length} Features · not assigned`}</div>
        <SizeChips features={features} />
      </div>
    );
  }

  const ms = band.milestone;
  return (
    <div className={className} style={style} role="group" aria-label={`Milestone ${ms.name}`}>
      <CommitInput
        aria-label="Milestone name"
        data-focus={`ms:${ms.id}`}
        value={ms.name}
        onCommit={(name) => dispatch({ type: "renameMilestone", id: ms.id, name })}
      />
      <div>
        <span className="dot" style={{ background: ms.color }} />
        <input
          type="date"
          aria-label="Milestone date"
          value={ms.date}
          onChange={(event) => dispatch({ type: "setMilestoneDate", id: ms.id, date: event.target.value })}
        />
      </div>
      <div className="stats">{`${features.length} Features`}</div>
      <SizeChips features={features} />
      <div className="ctl">
        <button
          type="button"
          title={flipped ? "Move milestone left" : "Move milestone up"}
          aria-label={flipped ? "Move left" : "Move up"}
          disabled={index === 0}
          onClick={() => dispatch({ type: "moveMilestone", from: index, to: index - 1 })}
        >
          {flipped ? "◀" : "▲"}
        </button>
        <button
          type="button"
          title={flipped ? "Move milestone right" : "Move milestone down"}
          aria-label={flipped ? "Move right" : "Move down"}
          disabled={index === milestoneCount - 1}
          onClick={() => dispatch({ type: "moveMilestone", from: index, to: index + 1 })}
        >
          {flipped ? "▶" : "▼"}
        </button>
        <button type="button" className="del" title="Delete milestone (features become unplanned)" aria-label="Delete milestone" onClick={() => setConfirmDelete(true)}>
          ✕
        </button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete milestone"
        message={`Delete milestone "${ms.name}"? Its ${features.length} features become unplanned.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          dispatch({ type: "deleteMilestone", id: ms.id });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
