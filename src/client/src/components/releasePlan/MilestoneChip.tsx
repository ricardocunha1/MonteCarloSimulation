import type { CSSProperties } from "react";
import type { Milestone } from "../../lib/releasePlan/types";

/** Milestone name in its color (text/border, `color + "2e"` background); a gold "Unplanned" chip when `milestone` is null. */
export function MilestoneChip({ milestone, label }: { milestone: Milestone | null; label?: string }) {
  if (!milestone) {
    return <span className="chip none">{label ?? "Unplanned"}</span>;
  }
  const style: CSSProperties = { background: `${milestone.color}2e`, color: milestone.color, borderColor: milestone.color };
  return (
    <span className="chip" style={style}>
      {label ?? milestone.name}
    </span>
  );
}
