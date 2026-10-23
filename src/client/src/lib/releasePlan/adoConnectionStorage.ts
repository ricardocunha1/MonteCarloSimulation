import type { AdoSource } from "./adoTypes";

/** localStorage key of the last successful Azure DevOps connection. */
export const ADO_CONNECTION_KEY = "cmPlanningHub.releasePlan.adoConnection.v1";

/**
 * The remembered connection: source and canonical project URL only. There is
 * deliberately no token field: the personal access token is never persisted.
 */
export interface SavedAdoConnection {
  source: AdoSource;
  projectUrl: string;
}

/** The remembered connection, or `null` when absent, malformed or storage is unavailable. */
export function loadAdoConnection(): SavedAdoConnection | null {
  try {
    const raw = window.localStorage.getItem(ADO_CONNECTION_KEY);
    if (!raw) {
      return null;
    }
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) {
      return null;
    }
    const { source, projectUrl } = value as Record<string, unknown>;
    if ((source !== "onprem" && source !== "cloud") || typeof projectUrl !== "string") {
      return null;
    }
    return { source, projectUrl };
  } catch {
    return null;
  }
}

/** Remembers `{source, projectUrl}` (any other property is dropped); ignores unavailable storage. */
export function saveAdoConnection({ source, projectUrl }: SavedAdoConnection): void {
  try {
    window.localStorage.setItem(ADO_CONNECTION_KEY, JSON.stringify({ source, projectUrl }));
  } catch {
    // Storage unavailable: the form just won't be pre-filled next time.
  }
}
