// QA edge cases for the sync diff (plans/release-plan-ado.md, Phase 4). Synthetic data only.
import { describe, expect, it } from "vitest";
import { makeBacklog, makeConnection, makeEpicItem, makeFeatureItem } from "../../test/adoFixtures";
import { makeEpic, makeFeature, makeFlag, makeMilestone, makePlan, sequentialIds } from "../../test/releasePlanFixtures";
import type { AdoBacklog, AdoWorkItem } from "./adoTypes";
import { planFromBacklog } from "./fromBacklog";
import { planReducer } from "./reducer";
import { applySync, diffBacklog, isDiffEmpty } from "./syncDiff";
import { NO_EPIC_ID, type ReleasePlan } from "./types";
import { normalizePlan } from "./validate";

const basePlan = (): ReleasePlan => planFromBacklog(makeBacklog(), makeConnection(), sequentialIds());
const backlogWith = (edit: (items: AdoWorkItem[]) => AdoWorkItem[], overrides: Partial<AdoBacklog> = {}): AdoBacklog => {
  const base = makeBacklog();
  return { ...base, workItems: edit(base.workItems), ...overrides };
};
const patch = (items: AdoWorkItem[], id: number, p: Partial<AdoWorkItem>) => items.map((i) => (i.id === id ? { ...i, ...p } : i));
const sync = (plan: ReleasePlan, backlog: AdoBacklog, removeGone = false) => applySync(plan, backlog, makeConnection(), { removeGone });
const layout = (plan: ReleasePlan) => plan.epics.map((e) => [e.id, e.features.map((f) => f.id)]);
const ms = (plan: ReleasePlan) => Object.fromEntries(plan.epics.flatMap((e) => e.features).map((f) => [String(f.id), f.milestoneId]));

/** After applying with removeGone, a second diff against the same backlog is empty and a second apply is a no-op. */
function expectConverged(after: ReleasePlan, backlog: AdoBacklog) {
  const diff = diffBacklog(after, backlog);
  expect(isDiffEmpty(diff)).toBe(true);
  expect(diff.iterationsChanged).toBe(false);
  expect(sync(after, backlog, true)).toBe(after);
  expect(normalizePlan(JSON.parse(JSON.stringify(after)))).toEqual(after);
}

describe("sync edge cases (QA)", () => {
  it("an Epic whose type changed to Feature: gone Epic + new Feature; its Features become orphans; converges", () => {
    // Epic 103 became a Feature (parent none) → Feature 105 (parent 103) now has a Feature parent → orphan.
    const backlog = backlogWith((items) => patch(items, 103, { type: "Feature", title: "Wave 2 as Feature" }));
    const plan = basePlan();
    const diff = diffBacklog(plan, backlog);
    expect(diff.goneEpics.map((e) => e.id)).toEqual([103]);
    expect(diff.newFeatures.map((f) => [f.id, f.epicId])).toEqual([[103, NO_EPIC_ID]]);
    expect(diff.updatedFeatures.map((f) => [f.id, f.changes])).toEqual([[105, ["epic"]]]);
    expect(diff.goneFeatures).toEqual([]);

    const kept = sync(plan, backlog);
    expect(layout(kept)).toEqual([
      [101, [102, 104]],
      [103, []],
      [NO_EPIC_ID, [106, 107, 103, 105]],
    ]);
    expect(ms(kept)["105"]).toBe(ms(plan)["105"]);
    expect(ms(kept)["103"]).toBeNull();
    expect(normalizePlan(JSON.parse(JSON.stringify(kept)))).toEqual(kept);

    const removed = sync(plan, backlog, true);
    expect(layout(removed)).toEqual([
      [101, [102, 104]],
      [NO_EPIC_ID, [106, 107, 103, 105]],
    ]);
    expectConverged(removed, backlog);
  });

  it("a Feature whose type changed to Epic: gone Feature + new Epic appended before the synthetic Epic", () => {
    const backlog = backlogWith((items) => patch(items, 104, { type: "Epic", parentId: null, title: "Promoted" }));
    const plan = basePlan();
    const diff = diffBacklog(plan, backlog);
    expect(diff.goneFeatures.map((f) => f.id)).toEqual([104]);
    expect(diff.newEpics.map((e) => e.id)).toEqual([104]);
    const removed = sync(plan, backlog, true);
    expect(layout(removed)).toEqual([
      [101, [102]],
      [103, [105]],
      [104, []],
      [NO_EPIC_ID, [106, 107]],
    ]);
    expectConverged(removed, backlog);
  });

  it("a gone Epic whose Features moved under another Epic: removing it keeps the Features and their milestones", () => {
    const plan = basePlan();
    const r2 = "ms_r2";
    const planned: ReleasePlan = {
      ...plan,
      milestones: [...plan.milestones, makeMilestone({ id: r2, name: "R2" })],
      epics: plan.epics.map((e) => (e.id === 103 ? { ...e, features: e.features.map((f) => ({ ...f, milestoneId: r2 })) } : e)),
    };
    // Epic 103 no longer in scope; its Feature 105 now belongs to Epic 101.
    const backlog = backlogWith((items) => patch(items, 105, { parentId: 101 }).filter((i) => i.id !== 103));
    const diff = diffBacklog(planned, backlog);
    expect(diff.goneEpics.map((e) => e.id)).toEqual([103]);
    expect(diff.goneFeatures).toEqual([]);
    const removed = sync(planned, backlog, true);
    expect(layout(removed)).toEqual([
      [101, [102, 104, 105]],
      [NO_EPIC_ID, [106, 107]],
    ]);
    expect(ms(removed)["105"]).toBe(r2);
    expect(removed.milestones).toBe(planned.milestones);
    expectConverged(removed, backlog);
  });

  it("a synthetic Epic dragged to the middle: its last orphan moving to a new Epic removes it; new Epic goes last", () => {
    const plan = basePlan();
    const [e101, e103, synth] = plan.epics;
    const dragged: ReleasePlan = { ...plan, epics: [e101, synth, e103] };
    const backlog = backlogWith((items) => [
      ...patch(patch(items, 106, { parentId: 200 }), 107, { parentId: 200 }),
      makeEpicItem({ id: 200, title: "New home" }),
    ]);
    const after = sync(dragged, backlog);
    expect(layout(after)).toEqual([
      [101, [102, 104]],
      [103, [105]],
      [200, [106, 107]],
    ]);
    expect(ms(after)["106"]).toBe(ms(plan)["106"]);
    expectConverged(after, backlog);
  });

  it("new and moved Features land at the end of their Epic in ascending id order", () => {
    const plan = basePlan();
    const backlog = backlogWith((items) => [
      ...patch(items, 106, { parentId: 103 }),
      makeFeatureItem({ id: 90, parentId: 103 }),
      makeFeatureItem({ id: 300, parentId: 103 }),
    ]);
    const after = sync(plan, backlog);
    expect(layout(after)[1]).toEqual([103, [105, 90, 106, 300]]);
    expect(ms(after)["90"]).toBeNull();
    expect(ms(after)["106"]).toBe(ms(plan)["106"]);
    expectConverged(after, backlog);
  });

  it("Sprints mode: milestones (sprints), flags and every milestoneId survive; iterations are replaced", () => {
    const plan = basePlan();
    const sprints = planReducer(plan, { type: "setMode", mode: "sprints" })!;
    expect(sprints.mode).toBe("sprints");
    const withFlag: ReleasePlan = { ...sprints, flags: [makeFlag({ id: "fl_1", afterMsId: sprints.milestones[0].id })] };
    const backlog = backlogWith((items) => [...patch(items, 102, { iterationPath: "Proj\\Phase 2\\Sprint 05" }), makeFeatureItem({ id: 400, parentId: 101, iterationPath: "Proj\\Phase 1\\Sprint 01" })], {
      iterations: [{ path: "Proj\\Phase 2\\Sprint 05", finishDate: "2027-01-08" }],
    });
    const after = sync(withFlag, backlog);
    expect(after.mode).toBe("sprints");
    expect(after.milestones).toBe(withFlag.milestones);
    expect(after.flags).toBe(withFlag.flags);
    expect(after.iterations).toEqual(backlog.iterations);
    // Existing planning is kept even though 102's iteration moved; the new Feature is Unplanned (plan: never auto-placed).
    expect(ms(after)["102"]).toBe(ms(withFlag)["102"]);
    expect(ms(after)["400"]).toBeNull();
    expect(normalizePlan(JSON.parse(JSON.stringify(after)))).toEqual(after);
  });

  it("an old plan with string ids for Epics and Features matches numeric ADO ids and keeps string ids", () => {
    const plan = makePlan({
      milestones: [makeMilestone({ id: "m1" })],
      epics: [
        makeEpic({ id: "101", title: "Wave 1", state: "Active", description: "<p>Wave</p>", features: [makeFeature({ id: "102", title: "Old", milestoneId: "m1" })] }),
      ],
    });
    const backlog = makeBacklog({ workItems: [makeEpicItem({ id: 101, title: "Wave 1", state: "Active", description: "<p>Wave</p>" }), makeFeatureItem({ id: 102, title: "New", parentId: 101 })] });
    const diff = diffBacklog(plan, backlog);
    expect(diff.newEpics).toEqual([]);
    expect(diff.newFeatures).toEqual([]);
    expect(diff.updatedFeatures.map((f) => [f.id, f.changes])).toEqual([["102", ["title", "iterationPath"]]]);
    const after = sync(plan, backlog, true);
    expect(layout(after)).toEqual([["101", ["102"]]]);
    expect(ms(after)["102"]).toBe("m1");
    expectConverged(after, backlog);
  });

  it("the reducer returns the same reference when a re-sync changes nothing at all", () => {
    const plan = basePlan();
    expect(planReducer(plan, { type: "applySync", backlog: makeBacklog(), connection: makeConnection(), removeGone: true })).toBe(plan);
  });
});
