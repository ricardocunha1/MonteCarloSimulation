import type { ReleasePlan } from "./types";

/** Delay before the object URL of a download is revoked and its anchor removed. */
export const DOWNLOAD_REVOKE_MS = 500;

/**
 * Base file name (no extension) for a saved/exported plan: the plan name (or
 * "feature-plan" when empty) with every run of characters other than word
 * characters and "-" replaced by "_", then "_" and the UTC date of `now`
 * (`YYYY-MM-DD`).
 */
export function fileBase(name: string, now: Date): string {
  return (name || "feature-plan").replace(/[^\w\-]+/g, "_") + "_" + now.toISOString().slice(0, 10);
}

/**
 * Content of a saved plan file: the plan with `schema`, `version` and a fresh
 * `savedAt = now.toISOString()`, pretty-printed with a 2-space indent. `plan`
 * itself is not mutated.
 */
export function planToJson(plan: ReleasePlan, now: Date): string {
  return JSON.stringify({ ...plan, schema: "release-planner-features", version: 1, savedAt: now.toISOString() }, null, 2);
}

/**
 * Downloads `blob` as `name`: a temporary `<a download>` pointing at an object
 * URL is appended to `body` and clicked; after {@link DOWNLOAD_REVOKE_MS} the
 * URL is revoked and the anchor removed.
 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = name;
  anchor.href = url;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, DOWNLOAD_REVOKE_MS);
}
