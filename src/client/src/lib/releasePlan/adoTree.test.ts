import { describe, expect, it } from "vitest";
import { areaTree } from "../../test/adoFixtures";
import { expandedForFilter, filterTree, findNodeChain, visibleRows } from "./adoTree";

const paths = (rows: { node: { path: string } }[]) => rows.map((r) => r.node.path);

describe("findNodeChain", () => {
  it("returns root → node, matching the path case-insensitively", () => {
    expect(findNodeChain(areaTree(), "proj\\team a\\SQUAD 1")?.map((n) => n.path)).toEqual(["Proj", "Proj\\Team A", "Proj\\Team A\\Squad 1"]);
    expect(findNodeChain(areaTree(), "Proj")?.map((n) => n.path)).toEqual(["Proj"]);
  });

  it("returns null for an unknown path", () => {
    expect(findNodeChain(areaTree(), "Proj\\Nope")).toBeNull();
  });
});

describe("filterTree / expandedForFilter", () => {
  it("is null for a blank query", () => {
    expect(filterTree(areaTree(), "  ")).toBeNull();
  });

  it("keeps matches (name or path) and their ancestors", () => {
    expect([...(filterTree(areaTree(), "SQUAD") ?? [])].sort()).toEqual(["Proj", "Proj\\Team A", "Proj\\Team A\\Squad 1"]);
    expect([...(filterTree(areaTree(), "proj\\team b") ?? [])].sort()).toEqual(["Proj", "Proj\\Team B"]);
    expect(filterTree(areaTree(), "zzz")?.size).toBe(0);
  });

  it("expands the nodes with visible children", () => {
    const visible = filterTree(areaTree(), "squad") ?? new Set<string>();
    expect([...expandedForFilter(areaTree(), visible)].sort()).toEqual(["Proj", "Proj\\Team A"]);
    expect(expandedForFilter(areaTree(), new Set()).size).toBe(0);
  });
});

describe("visibleRows", () => {
  it("lists expanded nodes depth-first with levels and parents", () => {
    const rows = visibleRows(areaTree(), new Set(["Proj", "Proj\\Team A"]), null);
    expect(paths(rows)).toEqual(["Proj", "Proj\\Team A", "Proj\\Team A\\Squad 1", "Proj\\Team B"]);
    expect(rows.map((r) => r.level)).toEqual([1, 2, 3, 2]);
    expect(rows[2].parentPath).toBe("Proj\\Team A");
    expect(rows.map((r) => r.hasChildren)).toEqual([true, true, false, false]);
  });

  it("hides children of collapsed nodes and filters to the visible set", () => {
    expect(paths(visibleRows(areaTree(), new Set(), null))).toEqual(["Proj"]);
    const visible = new Set(["Proj", "Proj\\Team B"]);
    const rows = visibleRows(areaTree(), new Set(["Proj", "Proj\\Team A"]), visible);
    expect(paths(rows)).toEqual(["Proj", "Proj\\Team B"]);
  });
});
