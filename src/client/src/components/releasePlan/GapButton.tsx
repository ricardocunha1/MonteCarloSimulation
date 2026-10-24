import type { Mode } from "../../lib/releasePlan/types";

/**
 * "+" insertion button between milestones (`.addgap`, positioned at `left`/`top`).
 * Its click doesn't bubble to the board (which would clear the selection).
 */
export function GapButton({
  milestoneName,
  mode,
  left,
  top,
  onClick,
}: {
  /** Name of the milestone the gap follows (for the `aria-label`). */
  milestoneName: string;
  mode: Mode;
  left: number;
  top: number;
  onClick: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      className="abs addgap"
      aria-label={`Insert after ${milestoneName}`}
      title={mode === "sprints" ? "Add a sprint or a milestone flag here" : "Add a milestone here"}
      style={{ left, top }}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event.currentTarget);
      }}
    >
      +
    </button>
  );
}
