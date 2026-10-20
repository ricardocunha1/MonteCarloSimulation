import { allFeatures, iterationLeaf, sprintLeaves } from "./selectors";
import type { Mode, ReleasePlan } from "./types";

/** Display name of each mode (radio labels and the "Milestones switched to …" toast). */
export const MODE_LABEL: Readonly<Record<Mode, string>> = { releases: "Releases", sprints: "Sprints" };

/** Toast shown when switching to Sprints finds no Iteration Path leaf. */
export const NO_SPRINTS_MESSAGE = "No Iteration Paths below the project root were found";

/** What the Releases/Sprints switch should do before dispatching `setMode`. */
export type ModeSwitchRequest =
  | { kind: "same" }
  | { kind: "noSprints"; message: string }
  | { kind: "confirm"; message: string };

/**
 * Decides the Releases/Sprints switch (template `setMilestoneMode` pre-checks): a no-op
 * when already in `mode`; switching to Sprints with no iteration leaves aborts with a
 * toast message; otherwise returns the verbatim template confirmation text.
 */
export function modeSwitchRequest(plan: ReleasePlan, mode: Mode): ModeSwitchRequest {
  if (mode === plan.mode) {
    return { kind: "same" };
  }
  const tail = "\n\nAny manual planning (and milestone flags) will be lost. Save the plan first if you want to keep it.";
  if (mode === "releases") {
    return {
      kind: "confirm",
      message:
        'Switch milestones to Releases?\n\nThe current milestones will be replaced by a single "MVP" milestone and ALL Features will be reset to their initial milestone: MVP.' +
        tail,
    };
  }
  const names = sprintLeaves(plan);
  if (!names.length) {
    return { kind: "noSprints", message: NO_SPRINTS_MESSAGE };
  }
  const noSprint = allFeatures(plan).filter((x) => !iterationLeaf(x.feature)).length;
  return {
    kind: "confirm",
    message:
      `Switch milestones to Sprints?\n\nThe current milestones will be replaced by ${names.length} sprints (${names.join(", ")}) and ALL Features will be reset to their initial milestone: the sprint of their Iteration Path (e.g. ${names[0]}).` +
      (noSprint ? `\n${noSprint} Features without a sprint will go to Unplanned.` : "") +
      tail,
  };
}
