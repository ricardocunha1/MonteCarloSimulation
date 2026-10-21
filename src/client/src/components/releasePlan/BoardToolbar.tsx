import { sourceInfo } from "../../lib/releasePlan/selectors";
import type { ReleasePlan } from "../../lib/releasePlan/types";
import { zoomLabel } from "../../lib/releasePlan/zoom";
import { useReleasePlan } from "../../releasePlanStore";
import { DownloadIcon } from "../icons/DownloadIcon";
import { UploadIcon } from "../icons/UploadIcon";
import { CommitInput } from "./CommitInput";
import { ModeSwitch } from "./ModeSwitch";

/** Which view the board page shows (UI-only state, not stored). */
export type BoardView = "board" | "table";

/**
 * Board toolbar: editable plan name + source line, Board/Table tabs,
 * Releases/Sprints switch, zoom (− 100% + Fit, hidden in Table view), then a
 * spacer and the "Load Plan" / "Save Plan" buttons (shown in both views, each
 * with a decorative upload/download icon before its label).
 */
export function BoardToolbar({
  plan,
  view,
  onViewChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onLoad,
  onSave,
}: {
  plan: ReleasePlan;
  view: BoardView;
  onViewChange: (view: BoardView) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** "Load Plan": opens the import modal (the page owns it). */
  onLoad: () => void;
  /** "Save Plan": downloads the plan as JSON. */
  onSave: () => void;
}) {
  const { dispatch } = useReleasePlan();
  return (
    <div className="toolbar">
      <div className="title">
        <CommitInput
          aria-label="Plan name"
          value={plan.name}
          style={{ width: `${plan.name.length + 3}ch` }}
          onCommit={(name) => dispatch({ type: "rename", name })}
        />
        <small data-testid="source-info">{sourceInfo(plan.source)}</small>
      </div>
      <div className="tabs" role="tablist" aria-label="View">
        {(["board", "table"] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => onViewChange(v)}>
            {v === "board" ? "Board" : "Table"}
          </button>
        ))}
      </div>
      <ModeSwitch plan={plan} />
      {view === "board" && (
        <div className="zoom" role="group" aria-label="Zoom">
          <button type="button" className="btn" aria-label="Zoom out" onClick={onZoomOut}>
            −
          </button>
          <span data-testid="zoom-value">{zoomLabel(zoom)}</span>
          <button type="button" className="btn" aria-label="Zoom in" onClick={onZoomIn}>
            +
          </button>
          <button type="button" className="btn" onClick={onFit}>
            Fit
          </button>
        </div>
      )}
      <div className="spacer" />
      <button type="button" className="btn withIcon" onClick={onLoad}>
        <UploadIcon className="btnIcon" />
        Load Plan
      </button>
      <button type="button" className="btn withIcon" onClick={onSave}>
        <DownloadIcon className="btnIcon" />
        Save Plan
      </button>
    </div>
  );
}
