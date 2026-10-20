import { describe, expect, it } from "vitest";
import { makeEpic, makeFeature, makeFlag, makeMilestone, makePlan, samplePlan, sequentialIds, sprintsPlan } from "../../test/releasePlanFixtures";
import { MS_COLORS } from "./constants";
import { createPlanReducer, type PlanAction, type PlanState } from "./reducer";
import type { ReleasePlan } from "./types";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** Applies an action to a frozen copy (so any mutation throws) with deterministic ids. */
function apply(plan: PlanState, action: PlanAction): ReleasePlan {
  const next = createPlanReducer(sequentialIds())(plan ? deepFreeze(structuredClone(plan)) : plan, action);
  if (!next) {
    throw new Error("expected a plan");
  }
  return next;
}

const featureMs = (plan: ReleasePlan) => Object.fromEntries(plan.epics.flatMap((e) => e.features.map((f) => [f.id, f.milestoneId])));

describe("planReducer basics", () => {
  it("replace sets the plan (or null)", () => {
    const plan = samplePlan();
    expect(createPlanReducer()(null, { type: "replace", plan })).toBe(plan);
    expect(createPlanReducer()(plan, { type: "replace", plan: null })).toBeNull();
  });

  it("ignores other actions without a plan", () => {
    expect(createPlanReducer()(null, { type: "rename", name: "x" })).toBeNull();
  });

  it("rename trims and defaults to 'Feature Release Plan'", () => {
    expect(apply(samplePlan(), { type: "rename", name: "  New name " }).name).toBe("New name");
    expect(apply(samplePlan(), { type: "rename", name: "   " }).name).toBe("Feature Release Plan");
  });
});

describe("setMode", () => {
  it("switches to Sprints: one milestone per leaf (natural sort), dates from iterations, palette colors, features reset", () => {
    const plan = apply(samplePlan(), { type: "setMode", mode: "sprints" });
    expect(plan.mode).toBe("sprints");
    expect(plan.flags).toEqual([]);
    expect(plan.milestones).toEqual([
      { id: "ms_1", name: "Sprint 1", date: "2026-09-18", color: MS_COLORS[0] },
      { id: "ms_2", name: "Sprint 2", date: "2026-10-02", color: MS_COLORS[1] },
      { id: "ms_3", name: "Sprint 10", date: "2026-12-11", color: MS_COLORS[2] },
    ]);
    // #21 has a project-root-only path → no sprint → Unplanned.
    expect(featureMs(plan)).toEqual({ 11: "ms_1", 12: "ms_2", 21: null, 22: "ms_3", 23: "ms_2" });
  });

  it("leaves a sprint without a matching iteration undated", () => {
    const plan = apply(samplePlan({ iterations: [] }), { type: "setMode", mode: "sprints" });
    expect(plan.milestones.map((m) => m.date)).toEqual(["", "", ""]);
  });

  it("is a no-op for Sprints without any sprint leaf, and for the current mode", () => {
    const noLeaves = makePlan({ epics: [makeEpic({ id: 1, features: [makeFeature({ id: 2, iterationPath: "Proj" })] })] });
    const reducer = createPlanReducer(sequentialIds());
    expect(reducer(noLeaves, { type: "setMode", mode: "sprints" })).toBe(noLeaves);
    const plan = samplePlan();
    expect(reducer(plan, { type: "setMode", mode: "releases" })).toBe(plan);
  });

  it("switches to Releases: a single MVP holding every feature, flags cleared", () => {
    const plan = apply(sprintsPlan(), { type: "setMode", mode: "releases" });
    expect(plan.mode).toBe("releases");
    expect(plan.flags).toEqual([]);
    expect(plan.milestones).toEqual([{ id: "ms_1", name: "MVP", date: "", color: MS_COLORS[0] }]);
    expect(featureMs(plan)).toEqual({ 51: "ms_1", 52: "ms_1", 53: "ms_1" });
  });
});

describe("milestones", () => {
  it("insertMilestone names 'Release <n>' (first unused from milestones.length) with the first unused color", () => {
    const plan = apply(samplePlan(), { type: "insertMilestone", idx: 1 });
    expect(plan.milestones.map((m) => m.name)).toEqual(["MVP", "Release 3", "Release 2"]);
    expect(plan.milestones[1]).toEqual({ id: "ms_1", name: "Release 3", date: "", color: "#EBC160" });
  });

  it("insertMilestone uses a provided id, 'New Sprint' in Sprints mode, and MS_COLORS[len % 8] when all colors are used", () => {
    const sprint = apply(sprintsPlan(), { type: "insertMilestone", idx: 2, id: "ms_new" });
    expect(sprint.milestones[2]).toMatchObject({ id: "ms_new", name: "New Sprint" });
    const full = makePlan({ milestones: MS_COLORS.concat(MS_COLORS[0]).map((color, i) => makeMilestone({ id: `m${i}`, name: `Release ${i}`, color })) });
    const next = apply(full, { type: "insertMilestone", idx: 0 });
    expect(next.milestones[0]).toMatchObject({ name: "Release 9", color: MS_COLORS[9 % 8] });
  });

  it("renameMilestone trims and defaults to 'Milestone'; setMilestoneDate sets the date", () => {
    expect(apply(samplePlan(), { type: "renameMilestone", id: "ms_r2", name: " Beta " }).milestones[1].name).toBe("Beta");
    expect(apply(samplePlan(), { type: "renameMilestone", id: "ms_r2", name: "" }).milestones[1].name).toBe("Milestone");
    expect(apply(samplePlan(), { type: "setMilestoneDate", id: "ms_r2", date: "2027-01-15" }).milestones[1].date).toBe("2027-01-15");
  });

  it("moveMilestone swaps neighbors and ignores out-of-range moves", () => {
    expect(apply(samplePlan(), { type: "moveMilestone", from: 0, to: 1 }).milestones.map((m) => m.id)).toEqual(["ms_r2", "ms_mvp"]);
    const plan = samplePlan();
    expect(createPlanReducer()(plan, { type: "moveMilestone", from: 0, to: -1 })).toBe(plan);
    expect(createPlanReducer()(plan, { type: "moveMilestone", from: 1, to: 2 })).toBe(plan);
  });

  it("deleteMilestone unplans its features and re-homes its flags to the previous milestone", () => {
    const base = sprintsPlan({ flags: [makeFlag({ id: "fl_beta", afterMsId: "sp_1" }), makeFlag({ id: "fl_rc", afterMsId: "sp_2" })] });
    const plan = apply(base, { type: "deleteMilestone", id: "sp_2" });
    expect(plan.milestones.map((m) => m.id)).toEqual(["sp_1"]);
    expect(plan.flags.map((f) => [f.id, f.afterMsId])).toEqual([["fl_beta", "sp_1"], ["fl_rc", "sp_1"]]);
    expect(featureMs(plan)).toEqual({ 51: "sp_1", 52: null, 53: null });
  });

  it("deleteMilestone removes the flags of the first milestone (no previous one)", () => {
    const plan = apply(sprintsPlan(), { type: "deleteMilestone", id: "sp_1" });
    expect(plan.flags).toEqual([]);
    expect(featureMs(plan)).toEqual({ 51: null, 52: "sp_2", 53: null });
  });
});

describe("flags", () => {
  it("addFlag adds 'Milestone' with the milestone's date; unknown milestone is a no-op", () => {
    const plan = apply(sprintsPlan(), { type: "addFlag", afterMsId: "sp_2" });
    expect(plan.flags.at(-1)).toEqual({ id: "fl_1", name: "Milestone", date: "2026-10-02", afterMsId: "sp_2" });
    expect(apply(sprintsPlan(), { type: "addFlag", afterMsId: "sp_2", id: "fl_x" }).flags.at(-1)?.id).toBe("fl_x");
    const base = sprintsPlan();
    expect(createPlanReducer()(base, { type: "addFlag", afterMsId: "nope" })).toBe(base);
  });

  it("renameFlag trims/defaults, setFlagDate sets, removeFlag removes", () => {
    expect(apply(sprintsPlan(), { type: "renameFlag", id: "fl_beta", name: " RC " }).flags[0].name).toBe("RC");
    expect(apply(sprintsPlan(), { type: "renameFlag", id: "fl_beta", name: " " }).flags[0].name).toBe("Milestone");
    expect(apply(sprintsPlan(), { type: "setFlagDate", id: "fl_beta", date: "2026-09-30" }).flags[0].date).toBe("2026-09-30");
    expect(apply(sprintsPlan(), { type: "removeFlag", id: "fl_beta" }).flags).toEqual([]);
  });
});

describe("epics and features", () => {
  it("moveEpic moves one position and is a no-op at the ends", () => {
    expect(apply(samplePlan(), { type: "moveEpic", from: 0, to: 1 }).epics.map((e) => e.id)).toEqual([2, 1, 3]);
    const plan = samplePlan();
    expect(createPlanReducer()(plan, { type: "moveEpic", from: 0, to: -1 })).toBe(plan);
    expect(createPlanReducer()(plan, { type: "moveEpic", from: 2, to: 3 })).toBe(plan);
  });

  it("setFeatureMilestone assigns a known milestone, or null", () => {
    expect(featureMs(apply(samplePlan(), { type: "setFeatureMilestone", featureId: 22, milestoneId: "ms_mvp" }))[22]).toBe("ms_mvp");
    expect(featureMs(apply(samplePlan(), { type: "setFeatureMilestone", featureId: 11, milestoneId: null }))[11]).toBeNull();
    expect(featureMs(apply(samplePlan(), { type: "setFeatureMilestone", featureId: 11, milestoneId: "nope" }))[11]).toBeNull();
  });
});
