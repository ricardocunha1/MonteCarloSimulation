import { ApiError, simulate } from "../api";
import type { Execution } from "../store";
import type { ValidateResponse } from "../types";

/** Shared by the skip-validation path of the Input page and the Confirm
 * page, so both behave identically (like the legacy `_run_and_render`). */
export async function runSimulation({ summary, params }: ValidateResponse): Promise<Execution> {
  try {
    const result = await simulate(summary, params);
    return { status: "ok", result, sprintStartDate: params.sprint_start_date ?? "" };
  } catch (exc) {
    if (exc instanceof ApiError) {
      return { status: "error", errors: exc.errors };
    }
    throw exc;
  }
}
