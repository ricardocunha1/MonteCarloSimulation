import type { AdoSprintHistory, AdoSprintWorkItem, DataSource, SimulateResponse, ValidateResponse } from "../lib/monteCarlo/types";

export const validation: ValidateResponse = {
  summary: [
    { Sprint: "Sprint 1", "Items Resolved": 10, "Story Points": 21, "Last Resolved Date": "2025-01-10", "Recency Rank": 2, "In Sampling Pool": true },
    { Sprint: "Sprint 2", "Items Resolved": 12, "Story Points": 25, "Last Resolved Date": "2025-01-24", "Recency Rank": 1, "In Sampling Pool": false },
  ],
  params: {
    target_type: "Items Resolved",
    target_value: "100",
    num_simulations: "1000",
    exclude_latest_sprints: "1",
    sprint_start_date: "2026-01-05",
    sprint_length: "10",
    team_capacity_factor: "1.0",
    skip_validation: false,
  },
};

const labels = [...Array.from({ length: 50 }, (_, i) => String(i + 1)), ">50"];

export const result: SimulateResponse = {
  target_type: "Items Resolved",
  target_value: 100,
  rows: [
    { confidence: 50, label: "Optimistic", sprints: 9, exceeds_window: false, completion_date: "2026-05-08" },
    { confidence: 70, label: "Likely", sprints: 10, exceeds_window: false, completion_date: "2026-05-22" },
    { confidence: 85, label: "Confident", sprints: 11, exceeds_window: false, completion_date: "2026-06-05" },
    { confidence: 95, label: "Safe Target", sprints: 51, exceeds_window: true, completion_date: null },
  ],
  histogram: {
    labels,
    counts: labels.map((label) => (label === "9" ? 600 : label === "10" ? 200 : label === "11" ? 150 : label === ">50" ? 50 : 0)),
  },
};

/** An Excel data source as chosen in the Import Excel modal. */
export function excelSource(name = "Sprint_History.xlsx"): DataSource {
  return {
    kind: "excel",
    file: new File(["xlsx"], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  };
}

/** A synthetic resolved work item from `/api/ado/sprint-history` (never real ADO data). */
export function makeSprintWorkItem(overrides: Partial<AdoSprintWorkItem> & Pick<AdoSprintWorkItem, "id">): AdoSprintWorkItem {
  return {
    type: "User Story",
    title: `Story ${overrides.id}`,
    state: "Resolved",
    iterationPath: "MES Core\\Release 11\\Sprint 01",
    resolvedDate: "2026-04-09T10:47:08Z",
    storyPoints: 3,
    ...overrides,
  };
}

/** A synthetic `/api/ado/sprint-history` response: three items over two sprints. */
export function makeSprintHistory(overrides: Partial<AdoSprintHistory> = {}): AdoSprintHistory {
  return {
    project: { id: "00000000-0000-0000-0000-000000000002", name: "MES Core" },
    projectUrl: "https://dev.azure.com/org/MES%20Core",
    iterationPath: "MES Core\\Release 11",
    fetchedAt: "2026-10-23T10:00:00Z",
    workItems: [
      makeSprintWorkItem({ id: 101 }),
      makeSprintWorkItem({ id: 102, type: "Bug", state: "Closed", storyPoints: 0 }),
      makeSprintWorkItem({ id: 103, state: "Done", iterationPath: "MES Core\\Release 11\\Sprint 02", resolvedDate: "2026-04-23T09:00:00Z", storyPoints: 5 }),
    ],
    warnings: [],
    ...overrides,
  };
}

/** An Azure DevOps data source as stored after loading `makeSprintHistory()`. */
export const adoSource: Extract<DataSource, { kind: "azureDevOps" }> = {
  kind: "azureDevOps",
  source: "cloud",
  projectUrl: "https://dev.azure.com/org/MES%20Core",
  project: "MES Core",
  iterationPath: "MES Core\\Release 11",
  fetchedAt: "2026-10-23T10:00:00Z",
  workItems: makeSprintHistory().workItems,
};
