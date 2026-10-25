// Synthetic Release Plan fixtures (builders). Never derived from the template JSON.
import type { Epic, Feature, Flag, Iteration, Milestone, ReleasePlan } from "../lib/releasePlan/types";

export function makeFeature(overrides: Partial<Feature> & Pick<Feature, "id">): Feature {
  return {
    title: `Feature ${overrides.id}`,
    state: "New",
    description: "",
    size: "",
    iterationPath: "",
    milestoneId: null,
    ...overrides,
  };
}

export function makeEpic(overrides: Partial<Epic> & Pick<Epic, "id">): Epic {
  return { title: `Epic ${overrides.id}`, state: "New", description: "", features: [], ...overrides };
}

export function makeMilestone(overrides: Partial<Milestone> & Pick<Milestone, "id">): Milestone {
  return { name: overrides.id, date: "", color: "#4E98D1", ...overrides };
}

export function makeFlag(overrides: Partial<Flag> & Pick<Flag, "id" | "afterMsId">): Flag {
  return { name: "Milestone", date: "", ...overrides };
}

export function makePlan(overrides: Partial<ReleasePlan> = {}): ReleasePlan {
  return {
    schema: "release-planner-features",
    version: 1,
    mode: "releases",
    name: "Test Plan",
    source: {},
    iterations: [],
    milestones: [],
    flags: [],
    epics: [],
    ...overrides,
  };
}

/** Description with things `safeHtml` must neutralize. */
export const XSS_DESCRIPTION =
  '<p>Intro <b>bold</b><script>alert(1)</script><img src="x" onerror="alert(2)"> ' +
  '<a href="javascript:alert(3)">bad link</a> <a href="https://example.com/doc" onclick="x()">good link</a></p><!-- note -->';

export const ITERATIONS: Iteration[] = [
  { path: "Proj\\Sprint 1", finishDate: "2026-09-18" },
  { path: "Proj\\Sprint 2", finishDate: "2026-10-02" },
  { path: "Proj\\Sprint 10", finishDate: "2026-12-11" },
];

/**
 * Releases-mode plan: MVP (dated) and "Release 2"; 3 epics.
 * - Epic 1 "Wave 1 - MVP" (XSS description): #11 Login page (Done, M, Sprint 1, MVP), #12 Dashboard (Active, XL, Sprint 2, MVP) → "Done in MVP".
 * - Epic 2 "Wave 2 - Reporting": #21 Reports (New, unestimated, root-only path, Release 2), #22 Exports (Closed, unknown size JUMBO,
 *   Sprint 10, Unplanned), #23 Charts (New, S, Sprint 2, Release 2) → "Release 2 · 1 unplanned".
 * - Epic 3 "Wave 3 - Empty": no features.
 */
export function samplePlan(overrides: Partial<ReleasePlan> = {}): ReleasePlan {
  return makePlan({
    name: "Sample Release Plan",
    source: { system: "Azure DevOps", project: "Proj", scope: "Area Path: Proj\\Team" },
    iterations: ITERATIONS,
    milestones: [
      makeMilestone({ id: "ms_mvp", name: "MVP", date: "2026-11-30", color: "#4E98D1" }),
      makeMilestone({ id: "ms_r2", name: "Release 2", date: "", color: "#60C5B5" }),
    ],
    epics: [
      makeEpic({
        id: 1,
        title: "Wave 1 - MVP",
        state: "Active",
        description: XSS_DESCRIPTION,
        features: [
          makeFeature({ id: 11, title: "Login page", state: "Done", size: "M", iterationPath: "Proj\\Sprint 1", milestoneId: "ms_mvp", description: "<p>Login <em>flow</em></p>" }),
          makeFeature({ id: 12, title: "Dashboard", state: "Active", size: "XL", iterationPath: "Proj\\Sprint 2", milestoneId: "ms_mvp" }),
        ],
      }),
      makeEpic({
        id: 2,
        title: "Wave 2 - Reporting",
        features: [
          makeFeature({ id: 21, title: "Reports", size: "", iterationPath: "Proj", milestoneId: "ms_r2" }),
          makeFeature({ id: 22, title: "Exports", state: "Closed", size: "JUMBO", iterationPath: "Proj\\Sprint 10", milestoneId: null }),
          makeFeature({ id: 23, title: "Charts", size: "S", iterationPath: "Proj\\Sprint 2", milestoneId: "ms_r2" }),
        ],
      }),
      makeEpic({ id: 3, title: "Wave 3 - Empty" }),
    ],
    ...overrides,
  });
}

/**
 * Sprints-mode plan: "Sprint 1" (with a "Beta" flag after it) and "Sprint 2".
 * Epic 5: #51 (S, Sprint 1), #52 (M, Sprint 2), #53 (L, Unplanned).
 */
export function sprintsPlan(overrides: Partial<ReleasePlan> = {}): ReleasePlan {
  return makePlan({
    name: "Sprint Plan",
    mode: "sprints",
    iterations: ITERATIONS,
    milestones: [
      makeMilestone({ id: "sp_1", name: "Sprint 1", date: "2026-09-18", color: "#4E98D1" }),
      makeMilestone({ id: "sp_2", name: "Sprint 2", date: "2026-10-02", color: "#60C5B5" }),
    ],
    flags: [makeFlag({ id: "fl_beta", name: "Beta", date: "2026-09-25", afterMsId: "sp_1" })],
    epics: [
      makeEpic({
        id: 5,
        title: "Sprint Epic",
        features: [
          makeFeature({ id: 51, title: "First", size: "S", iterationPath: "Proj\\Sprint 1", milestoneId: "sp_1" }),
          makeFeature({ id: 52, title: "Second", size: "M", iterationPath: "Proj\\Sprint 2", milestoneId: "sp_2" }),
          makeFeature({ id: 53, title: "Third", size: "L", iterationPath: "Proj\\Sprint 2", milestoneId: null }),
        ],
      }),
    ],
    ...overrides,
  });
}

/** A deterministic id factory: `prefix + "1"`, `prefix + "2"`, … */
export function sequentialIds(): (prefix: string) => string {
  let n = 0;
  return (prefix) => `${prefix}${++n}`;
}
