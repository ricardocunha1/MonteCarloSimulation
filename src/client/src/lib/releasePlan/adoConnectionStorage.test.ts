import { afterEach, describe, expect, it, vi } from "vitest";
import { ADO_CONNECTION_KEY, loadAdoConnection, saveAdoConnection, type SavedAdoConnection } from "./adoConnectionStorage";

describe("adoConnectionStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses the documented key", () => {
    expect(ADO_CONNECTION_KEY).toBe("cmPlanningHub.releasePlan.adoConnection.v1");
  });

  it("round-trips the source and project URL", () => {
    saveAdoConnection({ source: "cloud", projectUrl: "https://dev.azure.com/o/P" });
    expect(loadAdoConnection()).toEqual({ source: "cloud", projectUrl: "https://dev.azure.com/o/P" });
  });

  it("returns null when nothing is stored", () => {
    expect(loadAdoConnection()).toBeNull();
  });

  it.each(["{bad json", "null", "42", '{"source":"azure","projectUrl":"x"}', '{"source":"onprem","projectUrl":5}', '{"source":"onprem"}'])(
    "returns null for corrupted storage %s",
    (raw) => {
      window.localStorage.setItem(ADO_CONNECTION_KEY, raw);
      expect(loadAdoConnection()).toBeNull();
    },
  );

  it("never stores a PAT, even when an object carrying one is passed", () => {
    const withPat = { source: "onprem", projectUrl: "https://tfs/C/P", pat: "secret-pat" } as SavedAdoConnection;
    saveAdoConnection(withPat);
    const raw = window.localStorage.getItem(ADO_CONNECTION_KEY) ?? "";
    expect(raw).not.toContain("secret-pat");
    expect(JSON.parse(raw)).toEqual({ source: "onprem", projectUrl: "https://tfs/C/P" });
  });

  it("drops extra stored properties on load", () => {
    window.localStorage.setItem(ADO_CONNECTION_KEY, JSON.stringify({ source: "cloud", projectUrl: "u", pat: "x" }));
    expect(loadAdoConnection()).toEqual({ source: "cloud", projectUrl: "u" });
  });

  it("ignores unavailable storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveAdoConnection({ source: "cloud", projectUrl: "u" })).not.toThrow();
    expect(loadAdoConnection()).toBeNull();
  });
});
