import { afterEach, describe, expect, it, vi } from "vitest";
import { ADO_CONNECTION_KEY as MONTE_CARLO_KEY } from "../monteCarlo/constants";
import { ADO_CONNECTION_KEY as RELEASE_PLAN_KEY } from "../releasePlan/constants";
import { loadAdoConnection, saveAdoConnection, type SavedAdoConnection } from "./connectionStorage";

const KEY = "test.adoConnection";

describe("connectionStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses the documented per-tool keys", () => {
    expect(RELEASE_PLAN_KEY).toBe("cmPlanningHub.releasePlan.adoConnection.v1");
    expect(MONTE_CARLO_KEY).toBe("cmPlanningHub.monteCarlo.adoConnection.v1");
  });

  it("round-trips the source and project URL under the given key", () => {
    saveAdoConnection(KEY, { source: "cloud", projectUrl: "https://dev.azure.com/o/P" });
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toEqual({ source: "cloud", projectUrl: "https://dev.azure.com/o/P" });
    expect(loadAdoConnection(KEY)).toEqual({ source: "cloud", projectUrl: "https://dev.azure.com/o/P" });
  });

  it("keeps each key's connection separate", () => {
    saveAdoConnection(RELEASE_PLAN_KEY, { source: "cloud", projectUrl: "https://dev.azure.com/o/RP" });
    saveAdoConnection(MONTE_CARLO_KEY, { source: "onprem", projectUrl: "https://tfs/C/MC" });
    expect(loadAdoConnection(RELEASE_PLAN_KEY)).toEqual({ source: "cloud", projectUrl: "https://dev.azure.com/o/RP" });
    expect(loadAdoConnection(MONTE_CARLO_KEY)).toEqual({ source: "onprem", projectUrl: "https://tfs/C/MC" });
  });

  it("returns null when nothing is stored", () => {
    expect(loadAdoConnection(KEY)).toBeNull();
  });

  it.each(["{bad json", "null", "42", '{"source":"azure","projectUrl":"x"}', '{"source":"onprem","projectUrl":5}', '{"source":"onprem"}'])(
    "returns null for corrupted storage %s",
    (raw) => {
      window.localStorage.setItem(KEY, raw);
      expect(loadAdoConnection(KEY)).toBeNull();
    },
  );

  it("never stores a PAT, even when an object carrying one is passed", () => {
    const withPat = { source: "onprem", projectUrl: "https://tfs/C/P", pat: "secret-pat" } as SavedAdoConnection;
    saveAdoConnection(KEY, withPat);
    const raw = window.localStorage.getItem(KEY) ?? "";
    expect(raw).not.toContain("secret-pat");
    expect(JSON.parse(raw)).toEqual({ source: "onprem", projectUrl: "https://tfs/C/P" });
  });

  it("drops extra stored properties on load", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ source: "cloud", projectUrl: "u", pat: "x" }));
    expect(loadAdoConnection(KEY)).toEqual({ source: "cloud", projectUrl: "u" });
  });

  it("ignores unavailable storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveAdoConnection(KEY, { source: "cloud", projectUrl: "u" })).not.toThrow();
    expect(loadAdoConnection(KEY)).toBeNull();
  });
});
