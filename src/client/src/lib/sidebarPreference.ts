/** localStorage key holding the sidebar's collapsed preference (`"1"` collapsed, `"0"` expanded). */
export const SIDEBAR_COLLAPSED_KEY = "cmPlanningHub.sidebarCollapsed.v1";

/** Whether the user last collapsed the sidebar; `false` (expanded) when unset or storage is unavailable. */
export function loadSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persists the sidebar's collapsed preference; silently ignores unavailable storage. */
export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Storage unavailable: the preference only lasts until the next page mount.
  }
}
