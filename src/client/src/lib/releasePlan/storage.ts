import { STORAGE_KEY } from "./constants";
import type { ReleasePlan } from "./types";
import { normalizePlan } from "./validate";

/** Where the store persists the current plan; `null` in the store means in-memory only. */
export interface PlanStorage {
  load: () => ReleasePlan | null;
  save: (plan: ReleasePlan) => void;
}

/** The autosaved plan from localStorage, normalized; `null` when absent, corrupt or storage is unavailable. */
export function loadSavedPlan(): ReleasePlan | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return normalizePlan(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Writes the plan to localStorage; silently ignores unavailable storage or a full quota. */
export function savePlan(plan: ReleasePlan): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // Storage unavailable: the app keeps working in memory.
  }
}

/** Removes the autosaved plan; ignores unavailable storage. */
export function clearSavedPlan(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

/** localStorage-backed {@link PlanStorage} (the store's default). */
export const localPlanStorage: PlanStorage = { load: loadSavedPlan, save: savePlan };
