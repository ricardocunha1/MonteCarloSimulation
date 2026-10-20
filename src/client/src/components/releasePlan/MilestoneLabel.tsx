import { useState } from "react";
import { L } from "../../lib/releasePlan/constants";
import type { LayoutBand } from "../../lib/releasePlan/layout";
import type { Feature } from "../../lib/releasePlan/types";
import { useReleasePlan } from "../../releasePlanStore";
import { ConfirmDialog } from "../ConfirmDialog";
import { CommitInput } from "./CommitInput";
import { SizeChips } from "./SizeChips";

/**
 * Frozen-column label of a band. A milestone shows its editable name (data-focus
 * `ms:<id>`), color dot + date, feature count, size chips and ▲ ▼ ✕ controls (✕
 * asks for confirmation; its features become unplanned). Unplanned shows a
 * read-only summary.
 */
export function MilestoneLabel({
  layoutBand,
  index,
  milestoneCount,
  features,
  background,
}: {
  layoutBand: LayoutBand;
  /** Band index (= milestone index for milestones). */
  index: number;
  milestoneCount: number;
  features: readonly Feature[];
  background: string;
}) {
  const { dispatch } = useReleasePlan();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { band, y, h } = layoutBand;
  const style = { left: 0, top: y, width: L.LBL_W, height: h, background };

  if (band.unplanned) {
    return (
      <div className="abs mslabel" style={style} role="group" aria-label="Unplanned">
        <b>Unplanned</b>
        <div className="stats">{`${features.length} Features · not assigned`}</div>
        <SizeChips features={features} />
      </div>
    );
  }

  const ms = band.milestone;
  return (
    <div className="abs mslabel" style={style} role="group" aria-label={`Milestone ${ms.name}`}>
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
          title="Move milestone up"
          aria-label="Move up"
          disabled={index === 0}
          onClick={() => dispatch({ type: "moveMilestone", from: index, to: index - 1 })}
        >
          ▲
        </button>
        <button
          type="button"
          title="Move milestone down"
          aria-label="Move down"
          disabled={index === milestoneCount - 1}
          onClick={() => dispatch({ type: "moveMilestone", from: index, to: index + 1 })}
        >
          ▼
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
