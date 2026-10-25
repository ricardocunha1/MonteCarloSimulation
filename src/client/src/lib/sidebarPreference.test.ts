import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSidebarCollapsed, saveSidebarCollapsed, SIDEBAR_COLLAPSED_KEY } from "./sidebarPreference";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("sidebarPreference", () => {
  it("defaults to expanded when nothing is stored", () => {
    expect(loadSidebarCollapsed()).toBe(false);
  });

  it("round-trips the collapsed preference", () => {
    saveSidebarCollapsed(true);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("1");
    expect(loadSidebarCollapsed()).toBe(true);
    saveSidebarCollapsed(false);
    expect(loadSidebarCollapsed()).toBe(false);
  });

  it("falls back to expanded and swallows errors when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadSidebarCollapsed()).toBe(false);
    expect(() => saveSidebarCollapsed(true)).not.toThrow();
  });
});
