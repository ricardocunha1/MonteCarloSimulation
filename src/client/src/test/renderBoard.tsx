import type { PlanStorage } from "../lib/releasePlan/storage";
import type { ReleasePlan } from "../lib/releasePlan/types";
import { ReleasePlanBoardPage } from "../pages/ReleasePlanBoardPage";
import { renderAt } from "./render";

/** Renders the real board page at `/release-plan/board` with `plan` in an in-memory store (or `planStorage`). */
export function renderBoard(plan: ReleasePlan | null, planStorage: PlanStorage | null = null) {
  return renderAt("/release-plan/board", <ReleasePlanBoardPage />, planStorage ? { planStorage } : { initialPlan: plan });
}

/** Slow-ish full-page component tests: generous per-test timeout under parallel load. */
export const BOARD_TEST_TIMEOUT_MS = 20_000;
