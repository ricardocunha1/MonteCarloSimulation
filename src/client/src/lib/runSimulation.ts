import { simulate } from "../api";
import type { Execution } from "../store";
import type { ValidateResponse } from "../types";

/** Shared by the skip-validation path of the Input page and the Confirm
 * page, so both behave identically. Failures (e.g. an `ApiError`) propagate
 * to the caller, which reports them as a toast. */
export async function runSimulation({ summary, params }: ValidateResponse): Promise<Execution> {
  const result = await simulate(summary, params);
  return { result, sprintStartDate: params.sprint_start_date ?? "" };
}
