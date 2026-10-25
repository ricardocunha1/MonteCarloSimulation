import { describe, expect, it } from "vitest";
import { makeBacklog, makeConnection, makeEpicItem, makeFeatureItem } from "../../test/adoFixtures";
import { sequentialIds } from "../../test/releasePlanFixtures";
import { MS_COLORS } from "./constants";
import { groupBacklog, planFromBacklog } from "./fromBacklog";
import { NO_EPIC_ID, NO_EPIC_TITLE } from "./types";
import { normalizePlan } from "./validate";

const ids = (items: { id: number | string }[]) => items.map((i) => i.id);

describe("groupBacklog", () => {
  it("groups Features under their Epic, both in id order", () => {
    const { epics, orphans } = groupBacklog(makeBacklog().workItems);
    expect(epics.map((g) => g.epic.id)).toEqual([101, 103]);
    expect(ids(epics[0].features)).toEqual([102, 104]);
    expect(ids(epics[1].features)).toEqual([105]);
    expect(ids(orphans)).toEqual([106, 107]);
  });

  it("sorts unsorted input by id", () => {
    const items = [
      makeFeatureItem({ id: 9, parentId: 5 }),
      makeEpicItem({ id: 5 }),
      makeFeatureItem({ id: 7, parentId: 5 }),
      makeEpicItem({ id: 2 }),
    ];
    const { epics } = groupBacklog(items);
    expect(epics.map((g) => g.epic.id)).toEqual([2, 5]);
    expect(ids(epics[1].features)).toEqual([7, 9]);
  });

  it("treats a Feature whose parent is another Feature as an orphan", () => {
    const { epics, orphans } = groupBacklog([makeFeatureItem({ id: 1 }), makeFeatureItem({ id: 2, parentId: 1 })]);
    expect(epics).toEqual([]);
    expect(ids(orphans)).toEqual([1, 2]);
  });

  it("keeps Epics without Features", () => {
    const { epics, orphans } = groupBacklog([makeEpicItem({ id: 1 })]);
    expect(epics).toEqual([{ epic: makeEpicItem({ id: 1 }), features: [] }]);
    expect(orphans).toEqual([]);
  });
});

describe("planFromBacklog", () => {
  it("builds the template default board", () => {
    const plan = planFromBacklog(makeBacklog(), makeConnection(), sequentialIds());
    expect(plan.schema).toBe("release-planner-features");
    expect(plan.version).toBe(1);
    expect(plan.mode).toBe("releases");
    expect(plan.name).toBe("Proj – Feature Release Plan");
    expect(plan.milestones).toEqual([{ id: "ms_1", name: "MVP", date: "", color: MS_COLORS[0] }]);
    expect(plan.flags).toEqual([]);
    expect(plan.savedAt).toBeUndefined();
  });

  it("puts every Feature in MVP with its ADO fields (size upper-cased)", () => {
    const plan = planFromBacklog(makeBacklog(), makeConnection(), sequentialIds());
    const features = plan.epics.flatMap((e) => e.features);
    expect(features).toHaveLength(5);
    expect(features.every((f) => f.milestoneId === "ms_1")).toBe(true);
    expect(plan.epics[0]).toEqual({
      id: 101,
      title: "Wave 1",
      state: "Active",
      description: "<p>Wave</p>",
      features: [
        { id: 102, title: "Login", state: "New", description: "", size: "M", iterationPath: "Proj\\Phase 1\\Sprint 01", milestoneId: "ms_1" },
        { id: 104, title: "Dashboard", state: "Active", description: "", size: "XL", iterationPath: "Proj", milestoneId: "ms_1" },
      ],
    });
  });

  it("places orphan Features under the synthetic Epic, last", () => {
    const plan = planFromBacklog(makeBacklog(), makeConnection(), sequentialIds());
    expect(ids(plan.epics)).toEqual([101, 103, NO_EPIC_ID]);
    const synthetic = plan.epics[2];
    expect(synthetic).toMatchObject({ id: "no-epic", title: "Features without an Epic", state: "", description: "" });
    expect(NO_EPIC_TITLE).toBe("Features without an Epic");
    expect(ids(synthetic.features)).toEqual([106, 107]);
  });

  it("creates no synthetic Epic without orphans", () => {
    const backlog = makeBacklog({ workItems: [makeEpicItem({ id: 1 }), makeFeatureItem({ id: 2, parentId: 1 })] });
    const plan = planFromBacklog(backlog, makeConnection(), sequentialIds());
    expect(ids(plan.epics)).toEqual([1]);
  });

  it("records the source with the connection and copies the iterations", () => {
    const backlog = makeBacklog();
    const plan = planFromBacklog(backlog, makeConnection({ source: "onprem", scopeType: "iteration", scopePath: "Proj\\Phase 1" }), sequentialIds());
    expect(plan.source).toEqual({
      system: "Azure DevOps",
      project: "Proj",
      scope: "Area Path: Proj\\Team A",
      fetchedAt: "2026-10-23T10:00:00Z",
      kind: "onprem",
      projectUrl: "https://dev.azure.com/org/Proj",
      scopeType: "iteration",
      scopePath: "Proj\\Phase 1",
    });
    expect(plan.iterations).toEqual(backlog.iterations);
    expect(plan.iterations).not.toBe(backlog.iterations);
  });

  it("is already normalized", () => {
    const plan = planFromBacklog(makeBacklog(), makeConnection(), sequentialIds());
    expect(normalizePlan(plan)).toEqual(plan);
  });

  it("handles an empty backlog", () => {
    const plan = planFromBacklog(makeBacklog({ workItems: [] }), makeConnection(), sequentialIds());
    expect(plan.epics).toEqual([]);
    expect(normalizePlan(plan)).toEqual(plan);
  });
});
