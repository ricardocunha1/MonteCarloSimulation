// Mirrors src/server/app/schemas.py. Summary record keys keep the server's
// DataFrame column names (Pydantic aliases), so they're quoted here.

export type TargetType = "Items Resolved" | "Story Points";

export interface SprintSummaryRecord {
  Sprint: string;
  "Items Resolved": number;
  "Story Points": number;
  /** ISO date, `YYYY-MM-DD`. */
  "Last Resolved Date": string;
  "Recency Rank": number;
  "In Sampling Pool": boolean;
}

/** The Data Input form fields as raw strings, exactly as submitted. Only
 * fields that were submitted are present. */
export interface SimulationParams {
  target_type?: string | null;
  target_value?: string | null;
  num_simulations?: string | null;
  skip_validation: boolean;
  exclude_latest_sprints?: string | null;
  sprint_start_date?: string | null;
  sprint_length?: string | null;
  team_capacity_factor?: string | null;
}

export interface ValidateResponse {
  summary: SprintSummaryRecord[];
  params: SimulationParams;
}

export interface ResultRow {
  confidence: number;
  label: string;
  /** Sentinel 51 (MAX_SPRINT_WINDOW + 1) when the target isn't reached. */
  sprints: number;
  exceeds_window: boolean;
  /** ISO date, `YYYY-MM-DD`; null when `exceeds_window`. */
  completion_date: string | null;
}

export interface Histogram {
  /** "1".."50" followed by ">50". */
  labels: string[];
  counts: number[];
}

export interface SimulateResponse {
  target_type: string;
  target_value: number;
  rows: ResultRow[];
  histogram: Histogram;
}

export interface ErrorResponse {
  errors: string[];
}
