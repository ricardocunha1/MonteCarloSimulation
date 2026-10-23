import { describe, expect, it } from "vitest";
import { makeBacklog, makeConnection, makeEpicItem, makeFeatureItem } from "../../test/adoFixtures";
import { makeEpic, makeFeature, makeFlag, makeMilestone, makePlan, sequentialIds } from "../../test/releasePlanFixtures";
import type { AdoBacklog, AdoWorkItem } from "./adoTypes";
import { planFromBacklog } from "./fromBacklog";
import { applySync, diffBacklog, isDiffEmpty, type SyncDiff } from "./syncDiff";
import { NO_EPIC_ID, NO_EPIC_TITLE, type ReleasePlan } from "./types";
import { normalizePlan } from "./validate";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * The board created from the default backlog: Epic 101 (102, 104), Epic 103 (105),
 * synthetic Epic (106, 107); every Feature in milestone `ms_1`.
 */
const basePlan = (): ReleasePlan => planFromBacklog(makeBacklog(), makeConnection(), sequentialIds());

/** The default backlog with `edit` applied to its work items. */
function backlogWith(edit: (items: AdoWorkItem[]) => AdoWorkItem[], overrides: Partial<AdoBacklog> = {}): AdoBacklog {
  const base = makeBacklog();
  return { ...base, workItems: edit(base.workItems), ...overrides };
}

const replaceItem = (items: AdoWorkItem[], id: number, patch: Partial<AdoWorkItem>) => items.map((i) => (i.id === id ? { ...i, ...patch } : i));
const without = (items: AdoWorkItem[], ...ids: number[]) => items.filter((i) => !ids.includes(i.id));

/** Applies with frozen inputs (any mutation throws). */
function sync(plan: ReleasePlan, backlog: AdoBacklog, removeGone = false): ReleasePlan {
  return applySync(deepFreeze(plan), deepFreeze(backlog), makeConnection(), { removeGone });
}

const layout = (plan: ReleasePlan) => plan.epics.map((e) => [e.id, e.features.map((f) => f.id)]);
const feature = (plan: ReleasePlan, id: number | string) => plan.epics.flatMap((e) => e.features).find((f) => f.id === id);

const EMPTY: SyncDiff = {
  newEpics: [],
  newFeatures: [],
  updatedEpics: [],
  updatedFeatures: [],
  goneEpics: [],
  goneFeatures: [],
  iterationsChanged: false,
};

describe("diffBacklog / applySync", () => {
  it("reports nothing and returns the same plan when the board matches Azure DevOps", () => {
    const plan = basePlan();
    const diff = diffBacklog(plan, makeBacklog());
    expect(diff).toEqual(EMPTY);
    expect(isDiffEmpty(diff)).toBe(true);
    expect(sync(plan, makeBacklog())).toBe(plan);
  });

  it("with no item changes only refreshes source and iterations", () => {
    const plan = basePlan();
    const iterations = [{ path: "Proj\\Phase 2", finishDate: "2026-12-01" }];
    const backlog = backlogWith((items) => items, { fetchedAt: "2026-10-24T08:00:00Z", iterations });
    const diff = diffBacklog(plan, backlog);
    expect(diff).toEqual({ ...EMPTY, iterationsChanged: true });
    expect(isDiffEmpty(diff)).toBe(true);
    const next = sync(plan, backlog);
    expect(next).not.toBe(plan);
    expect(next.epics).toBe(plan.epics);
    expect(next.milestones).toBe(plan.milestones);
    expect(next.source.fetchedAt).toBe("2026-10-24T08:00:00Z");
    expect(next.iterations).toEqual(iterations);
  });

  it("adds a new Feature Unplanned at the end of its Epic", () => {
    const plan = basePlan();
    const backlog = backlogWith((items) => [...items, makeFeatureItem({ id: 108, title: "Search", size: " s ", parentId: 101 })]);
    expect(diffBacklog(plan, backlog)).toEqual({ ...EMPTY, newFeatures: [{ id: 108, title: "Search", epicId: 101, epicTitle: "Wave 1" }] });
    const next = sync(plan, backlog);
    expect(layout(next)).toEqual([
      [101, [102, 104, 108]],
      [103, [105]],
      [NO_EPIC_ID, [106, 107]],
    ]);
    expect(feature(next, 108)).toEqual({ id: 108, title: "Search", state: "New", description: "", size: "S", iterationPath: "Proj", milestoneId: null });
    expect(next.epics[1]).toBe(plan.epics[1]);
    expect(next.epics[2]).toBe(plan.epics[2]);
  });

  it("appends a new Epic (with its Features Unplanned) before the synthetic Epic, which stays last", () => {
    const plan = basePlan();
    const backlog = backlogWith((items) => [
      ...items,
      makeEpicItem({ id: 120, title: "Wave 3" }),
      makeFeatureItem({ id: 122, parentId: 120 }),
      makeFeatureItem({ id: 121, parentId: 120 }),
      makeEpicItem({ id: 110, title: "Wave 0" }),
    ]);
    const diff = diffBacklog(plan, backlog);
    expect(diff.newEpics).toEqual([
      { id: 110, title: "Wave 0" },
      { id: 120, title: "Wave 3" },
    ]);
    expect(diff.newFeatures.map((f) => [f.id, f.epicId, f.epicTitle])).toEqual([
      [121, 120, "Wave 3"],
      [122, 120, "Wave 3"],
    ]);
    const next = sync(plan, backlog);
    expect(layout(next)).toEqual([
      [101, [102, 104]],
      [103, [105]],
      [110, []],
      [120, [121, 122]],
      [NO_EPIC_ID, [106, 107]],
    ]);
    expect(next.epics[3]).toMatchObject({ title: "Wave 3", state: "New", description: "" });
    expect(feature(next, 121)?.milestoneId).toBeNull();
  });

  it("keeps a synthetic Epic the user moved away from the end where it is", () => {
    const base = basePlan();
    const plan = { ...base, epics: [base.epics[2], base.epics[0], base.epics[1]] };
    const next = sync(plan, backlogWith((items) => [...items, makeEpicItem({ id: 130 })]));
    expect(next.epics.map((e) => e.id)).toEqual([NO_EPIC_ID, 101, 103, 130]);
  });

  it("updates Epic title, state and description", () => {
    const plan = basePlan();
    const backlog = backlogWith((items) => replaceItem(items, 103, { title: "Wave 2b", state: "Closed", description: "<p>new</p>" }));
    expect(diffBacklog(plan, backlog)).toEqual({ ...EMPTY, updatedEpics: [{ id: 103, title: "Wave 2b", changes: ["title", "state", "description"] }] });
    const next = sync(plan, backlog);
    expect(next.epics[1]).toMatchObject({ id: 103, title: "Wave 2b", state: "Closed", description: "<p>new</p>" });
    expect(next.epics[1].features).toBe(plan.epics[1].features);
    expect(next.epics[0]).toBe(plan.epics[0]);
  });

  it("updates Feature title, state, description, size and iteration path, keeping its place and milestone", () => {
    const plan = basePlan();
    const backlog = backlogWith((items) =>
      replaceItem(items, 102, { title: "Sign in", state: "Done", description: "<p>d</p>", size: "xl", iterationPath: "Proj\\Phase 1\\Sprint 02" }),
    );
    expect(diffBacklog(plan, backlog).updatedFeatures).toEqual([
      { id: 102, title: "Sign in", changes: ["title", "state", "description", "size", "iterationPath"] },
    ]);
    const next = sync(plan, backlog);
    expect(layout(next)).toEqual(layout(plan));
    expect(feature(next, 102)).toEqual({
      id: 102,
      title: "Sign in",
      state: "Done",
      description: "<p>d</p>",
      size: "XL",
      iterationPath: "Proj\\Phase 1\\Sprint 02",
      milestoneId: "ms_1",
    });
  });

  it("does not report a size that only differs in case or spaces", () => {
    const plan = basePlan();
    expect(diffBacklog(plan, backlogWith((items) => replaceItem(items, 102, { size: " M " })))).toEqual(EMPTY);
  });

  it("moves a Feature whose parent changed to the end of the new Epic, keeping its milestone", () => {
    const base = basePlan();
    const plan: ReleasePlan = {
      ...base,
      milestones: [...base.milestones, makeMilestone({ id: "ms_2", name: "R2" })],
      epics: base.epics.map((e) => ({ ...e, features: e.features.map((f) => (f.id === 104 ? { ...f, milestoneId: "ms_2" } : f)) })),
    };
    const backlog = backlogWith((items) => replaceItem(items, 104, { parentId: 103, title: "Dash" }));
    expect(diffBacklog(plan, backlog).updatedFeatures).toEqual([{ id: 104, title: "Dash", changes: ["title", "epic"] }]);
    const next = sync(plan, backlog);
    expect(layout(next)).toEqual([
      [101, [102]],
      [103, [105, 104]],
      [NO_EPIC_ID, [106, 107]],
    ]);
    expect(feature(next, 104)).toMatchObject({ title: "Dash", milestoneId: "ms_2" });
  });

  it("moves an orphan into a real Epic and removes the synthetic Epic once empty (never reporting it)", () => {
    const plan = basePlan();
    const one = backlogWith((items) => replaceItem(items, 106, { parentId: 101 }));
    expect(diffBacklog(plan, one).updatedFeatures).toEqual([{ id: 106, title: "Loose", changes: ["epic"] }]);
    expect(layout(sync(plan, one))).toEqual([
      [101, [102, 104, 106]],
      [103, [105]],
      [NO_EPIC_ID, [107]],
    ]);
    const both = backlogWith((items) => replaceItem(replaceItem(items, 106, { parentId: 101 }), 107, { parentId: 103 }));
    const diff = diffBacklog(plan, both);
    expect(diff.goneEpics).toEqual([]);
    expect(diff.newEpics).toEqual([]);
    expect(layout(sync(plan, both))).toEqual([
      [101, [102, 104, 106]],
      [103, [105, 107]],
    ]);
  });

  it("creates the synthetic Epic (last) when orphan Features appear", () => {
    const plan = planFromBacklog(backlogWith((items) => without(items, 106, 107)), makeConnection(), sequentialIds());
    expect(plan.epics.map((e) => e.id)).toEqual([101, 103]);
    const backlog = backlogWith((items) => [...without(items, 107), makeEpicItem({ id: 140 })]);
    const diff = diffBacklog(plan, backlog);
    expect(diff.newFeatures).toEqual([{ id: 106, title: "Loose", epicId: NO_EPIC_ID, epicTitle: NO_EPIC_TITLE }]);
    expect(diff.newEpics).toEqual([{ id: 140, title: "Epic 140" }]);
    const next = sync(plan, backlog);
    expect(layout(next)).toEqual([
      [101, [102, 104]],
      [103, [105]],
      [140, []],
      [NO_EPIC_ID, [106]],
    ]);
    expect(next.epics[3]).toEqual({ id: NO_EPIC_ID, title: NO_EPIC_TITLE, state: "", description: "", features: [expect.objectContaining({ id: 106, milestoneId: null })] });
  });

  it("moves a Feature whose parent was removed in ADO into the synthetic Epic", () => {
    const plan = basePlan();
    const backlog = backlogWith((items) => replaceItem(items, 105, { parentId: null }));
    expect(diffBacklog(plan, backlog).updatedFeatures).toEqual([{ id: 105, title: "Reports", changes: ["epic"] }]);
    expect(layout(sync(plan, backlog))).toEqual([
      [101, [102, 104]],
      [103, []],
      [NO_EPIC_ID, [106, 107, 105]],
    ]);
  });

  describe("items no longer in scope", () => {
    const goneBacklog = () => backlogWith((items) => without(items, 103, 105, 104));

    it("are listed (never the synthetic Epic)", () => {
      const diff = diffBacklog(basePlan(), goneBacklog());
      expect(diff.goneEpics).toEqual([{ id: 103, title: "Wave 2" }]);
      expect(diff.goneFeatures).toEqual([
        { id: 104, title: "Dashboard" },
        { id: 105, title: "Reports" },
      ]);
    });

    it("stay on the board without removeGone", () => {
      const plan = basePlan();
      const next = sync(plan, goneBacklog(), false);
      expect(next.epics).toBe(plan.epics);
    });

    it("are removed with removeGone", () => {
      const next = sync(basePlan(), goneBacklog(), true);
      expect(layout(next)).toEqual([
        [101, [102]],
        [NO_EPIC_ID, [106, 107]],
      ]);
    });

    it("a gone Epic's Features still in scope move to the synthetic Epic; the empty Epic stays unless removeGone", () => {
      const plan = basePlan();
      const backlog = backlogWith((items) => without(items, 103));
      const diff = diffBacklog(plan, backlog);
      expect(diff.goneEpics).toEqual([{ id: 103, title: "Wave 2" }]);
      expect(diff.updatedFeatures).toEqual([{ id: 105, title: "Reports", changes: ["epic"] }]);
      expect(layout(sync(plan, backlog, false))).toEqual([
        [101, [102, 104]],
        [103, []],
        [NO_EPIC_ID, [106, 107, 105]],
      ]);
      expect(layout(sync(plan, backlog, true))).toEqual([
        [101, [102, 104]],
        [NO_EPIC_ID, [106, 107, 105]],
      ]);
    });

    it("removing every orphan with removeGone removes the synthetic Epic", () => {
      const plan = basePlan();
      const backlog = backlogWith((items) => without(items, 106, 107));
      expect(diffBacklog(plan, backlog).goneFeatures.map((f) => f.id)).toEqual([106, 107]);
      expect(sync(plan, backlog, false).epics).toBe(plan.epics);
      expect(layout(sync(plan, backlog, true))).toEqual([
        [101, [102, 104]],
        [103, [105]],
      ]);
    });
  });

  it("matches string ids from old JSON files against numeric ADO ids and keeps the board's ids", () => {
    const plan = makePlan({
      epics: [
        makeEpic({ id: "101", title: "Wave 1", state: "Active", description: "<p>Wave</p>", features: [makeFeature({ id: "102", title: "Login", size: "M", iterationPath: "Proj\\Phase 1\\Sprint 01" })] }),
      ],
    });
    const backlog = backlogWith((items) => [...without(items, 103, 104, 105, 106, 107), makeFeatureItem({ id: 109, parentId: 101 })]);
    const diff = diffBacklog(plan, backlog);
    expect(diff.newEpics).toEqual([]);
    expect(diff.updatedEpics).toEqual([]);
    expect(diff.updatedFeatures).toEqual([]);
    expect(diff.goneFeatures).toEqual([]);
    expect(diff.newFeatures).toEqual([{ id: 109, title: "Feature 109", epicId: "101", epicTitle: "Wave 1" }]);
    const next = sync(plan, backlog);
    expect(layout(next)).toEqual([["101", ["102", 109]]]);
  });

  it("preserves milestones, flags, mode, name and the board's order of Epics and Features", () => {
    const base = basePlan();
    const plan: ReleasePlan = {
      ...base,
      mode: "sprints",
      name: "My plan",
      milestones: [makeMilestone({ id: "ms_1", name: "Sprint 01" }), makeMilestone({ id: "ms_2", name: "Sprint 02" })],
      flags: [makeFlag({ id: "fl_1", afterMsId: "ms_1", name: "Go-live" })],
      // User reordering: Epic 103 first, Features of 101 reversed.
      epics: [base.epics[1], { ...base.epics[0], features: [...base.epics[0].features].reverse() }, base.epics[2]],
    };
    const backlog = backlogWith((items) => [...replaceItem(items, 102, { state: "Done" }), makeFeatureItem({ id: 150, parentId: 101 })]);
    const next = sync(plan, backlog);
    expect(next.milestones).toBe(plan.milestones);
    expect(next.flags).toBe(plan.flags);
    expect(next.mode).toBe("sprints");
    expect(next.name).toBe("My plan");
    expect(layout(next)).toEqual([
      [103, [105]],
      [101, [104, 102, 150]],
      [NO_EPIC_ID, [106, 107]],
    ]);
    expect(next.epics[0]).toBe(plan.epics[0]);
  });

  it("replaces the iterations and writes the connection to an old plan's source", () => {
    const plan = makePlan({
      source: { system: "Azure DevOps", project: "Old", scope: "Area Path: Old" },
      iterations: [{ path: "Old\\S1", finishDate: "2026-01-01" }],
    });
    const backlog = makeBacklog({ workItems: [] });
    expect(diffBacklog(plan, backlog).iterationsChanged).toBe(true);
    const next = sync(plan, backlog);
    expect(next.source).toEqual({
      system: "Azure DevOps",
      project: "Proj",
      scope: "Area Path: Proj\\Team A",
      fetchedAt: "2026-10-23T10:00:00Z",
      kind: "cloud",
      projectUrl: "https://dev.azure.com/org/Proj",
      scopeType: "area",
      scopePath: "Proj\\Team A",
    });
    expect(next.iterations).toEqual(makeBacklog().iterations);
  });

  it.each([false, true])("produces a plan that normalizePlan leaves unchanged (removeGone=%s)", (removeGone) => {
    const plan = basePlan();
    const backlog = backlogWith((items) => [
      ...replaceItem(without(items, 105), 104, { parentId: 103, size: "l" }),
      makeEpicItem({ id: 160 }),
      makeFeatureItem({ id: 161, parentId: 160 }),
      makeFeatureItem({ id: 162 }),
    ]);
    const next = sync(plan, backlog, removeGone);
    expect(normalizePlan(next)).toEqual(next);
  });
});
