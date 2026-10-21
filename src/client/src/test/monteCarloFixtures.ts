import type { SimulateResponse, ValidateResponse } from "../lib/monteCarlo/types";

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
