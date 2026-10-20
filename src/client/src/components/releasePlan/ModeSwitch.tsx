import { useState } from "react";
import { MODE_LABEL, modeSwitchRequest } from "../../lib/releasePlan/modeSwitch";
import type { Mode, ReleasePlan } from "../../lib/releasePlan/types";
import { useReleasePlan } from "../../releasePlanStore";
import { ConfirmDialog } from "../ConfirmDialog";
import { useToast } from "../Toast";

const MODES: ReadonlyArray<{ mode: Mode; title: string; icon: string }> = [
  { mode: "releases", title: "Milestones as Releases: one MVP milestone", icon: "M5 21V4m0 0h11l-2 4 2 4H5" },
  {
    mode: "sprints",
    title: "Milestones as Sprints: one milestone per Iteration Path (last term)",
    icon: "M20 12a8 8 0 0 1-14.3 4.9M4 12A8 8 0 0 1 18.3 7.1M18 3v4.5h-4.5M6 21v-4.5h4.5",
  },
];

/**
 * Releases/Sprints radio group. Selecting the other mode asks for confirmation
 * (template text, `ConfirmDialog`), then dispatches `setMode` and toasts
 * "Milestones switched to …". Switching to Sprints with no iteration leaves only
 * toasts "No Iteration Paths below the project root were found".
 */
export function ModeSwitch({ plan }: { plan: ReleasePlan }) {
  const { dispatch } = useReleasePlan();
  const { showInfo } = useToast();
  const [pending, setPending] = useState<{ mode: Mode; message: string } | null>(null);

  const select = (mode: Mode) => {
    const request = modeSwitchRequest(plan, mode);
    if (request.kind === "noSprints") {
      showInfo(request.message);
    } else if (request.kind === "confirm") {
      setPending({ mode, message: request.message });
    }
  };

  const confirm = () => {
    if (!pending) {
      return;
    }
    dispatch({ type: "setMode", mode: pending.mode });
    showInfo(`Milestones switched to ${MODE_LABEL[pending.mode]}`);
    setPending(null);
  };

  return (
    <>
      <div className="tabs modes" role="radiogroup" aria-label="Milestones as" title="Milestone type">
        {MODES.map(({ mode, title, icon }) => (
          <button key={mode} type="button" role="radio" aria-checked={plan.mode === mode} title={title} onClick={() => select(mode)}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
            <span>{MODE_LABEL[mode]}</span>
          </button>
        ))}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title="Switch milestone type"
        message={pending?.message ?? ""}
        confirmLabel="Switch"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
