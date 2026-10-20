/** Data model of a Feature release plan (`schema: "release-planner-features"`, `version: 1`). */

/** How milestones are interpreted: free-form releases, or one milestone per sprint (Iteration Path leaf). */
export type Mode = "releases" | "sprints";

/** Azure DevOps work item id (numeric in ADO exports; kept as-is when a file uses strings). */
export type WorkItemId = number | string;

/** A board row (release or sprint); `id` is a `ms_` uid. */
export interface Milestone {
  id: string;
  name: string;
  /** `YYYY-MM-DD` or `""`. */
  date: string;
  /** One of `MS_COLORS`. */
  color: string;
}

/** A milestone flag sits after a sprint (`afterMsId`); Sprints mode only. */
export interface Flag {
  id: string;
  name: string;
  /** `YYYY-MM-DD` or `""`. */
  date: string;
  afterMsId: string;
}

/** An Azure DevOps Feature: one board column inside its Epic, placed in the band of `milestoneId`. */
export interface Feature {
  id: WorkItemId;
  title: string;
  state: string;
  /** Sanitized on display (see `safeHtml`). */
  description: string;
  /** Upper-cased T-shirt size (`SIZES` or any other text), `""` when not estimated. */
  size: string;
  iterationPath: string;
  /** `null` = Unplanned. */
  milestoneId: string | null;
}

/** An Azure DevOps Epic: an orange header over its Features' columns. */
export interface Epic {
  id: WorkItemId;
  title: string;
  state: string;
  description: string;
  /** Ordered left → right (board columns). */
  features: Feature[];
}

/** An ADO iteration; Sprints mode takes a sprint milestone's date from the `finishDate` whose path leaf matches. */
export interface Iteration {
  path: string;
  /** `YYYY-MM-DD` or `""`. */
  finishDate: string;
}

/** Where the plan came from, shown in the toolbar source line (see `sourceInfo`). */
export interface PlanSource {
  system?: string;
  project?: string;
  scope?: string;
  fetchedAt?: string;
}

/** A normalized plan (output of `normalizePlan`): the only state stored and autosaved. */
export interface ReleasePlan {
  schema: "release-planner-features";
  version: number;
  mode: Mode;
  name: string;
  source: PlanSource;
  iterations: Iteration[];
  /** Ordered top → bottom. */
  milestones: Milestone[];
  flags: Flag[];
  /** Ordered left → right. */
  epics: Epic[];
  savedAt?: string;
}

/** A board row: each milestone in order, then the synthetic Unplanned band. */
export type Band =
  | { unplanned: false; id: string; name: string; milestone: Milestone }
  | { unplanned: true; id: null; name: "Unplanned"; milestone: null };

/** Kind of work item shown in the details modal. */
export type WorkItemType = "epic" | "feature";

/** Reference to the work item open in the details modal. */
export interface WorkItemRef {
  type: WorkItemType;
  id: WorkItemId;
}
