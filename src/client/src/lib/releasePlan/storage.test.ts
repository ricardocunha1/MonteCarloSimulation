import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { samplePlan } from "../../test/releasePlanFixtures";
import { STORAGE_KEY } from "./constants";
import { clearSavedPlan, loadSavedPlan, savePlan } from "./storage";

describe("plan storage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("round-trips a plan under the v1 key", () => {
    const plan = samplePlan();
    savePlan(plan);
    expect(STORAGE_KEY).toBe("cmPlanningHub.releasePlan.v1");
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(loadSavedPlan()).toEqual(plan);
  });

  it("returns null when nothing is saved, or the saved data is corrupt or invalid", () => {
    expect(loadSavedPlan()).toBeNull();
    localStorage.setItem(STORAGE_KEY, "{corrupt");
    expect(loadSavedPlan()).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: "other" }));
    expect(loadSavedPlan()).toBeNull();
  });

  it("clears the saved plan", () => {
    savePlan(samplePlan());
    clearSavedPlan();
    expect(loadSavedPlan()).toBeNull();
  });

  it("survives a throwing localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadSavedPlan()).toBeNull();
    expect(() => savePlan(samplePlan())).not.toThrow();
    expect(() => clearSavedPlan()).not.toThrow();
  });
});
