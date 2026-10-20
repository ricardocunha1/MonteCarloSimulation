import { DEFAULT_MILESTONE_NAME, DEFAULT_PLAN_NAME, MS_COLORS, uid, type IdFactory } from "./constants";
import { iterationLeaf, msById, sprintLeaves } from "./selectors";
import type { Epic, Feature, Milestone, Mode, ReleasePlan, WorkItemId } from "./types";

/** Every plan mutation. Confirmations and toasts stay in the UI; the reducer is pure. */
export type PlanAction =
  /** Swaps the whole plan (import); the only action applied when the state is `null`. */
  | { type: "replace"; plan: ReleasePlan | null }
  | { type: "rename"; name: string }
  /** Resets milestones and every Feature (see the Releases/Sprints switch rules); no-op when already in `mode` or, for Sprints, when no feature has a sprint leaf. */
  | { type: "setMode"; mode: Mode }
  /** `id` is optional so the caller can know (and focus) the new milestone. */
  | { type: "insertMilestone"; idx: number; id?: string }
  | { type: "renameMilestone"; id: string; name: string }
  | { type: "setMilestoneDate"; id: string; date: string }
  | { type: "moveMilestone"; from: number; to: number }
  | { type: "deleteMilestone"; id: string }
  | { type: "addFlag"; afterMsId: string; id?: string }
  | { type: "renameFlag"; id: string; name: string }
  | { type: "setFlagDate"; id: string; date: string }
  | { type: "removeFlag"; id: string }
  | { type: "moveEpic"; from: number; to: number }
  | { type: "setFeatureMilestone"; featureId: WorkItemId; milestoneId: string | null };

/** Store state: `null` until a plan is imported or restored. */
export type PlanState = ReleasePlan | null;

/** Moves `arr[from]` to `to`; returns `arr` itself when either index is out of range. */
function moveItem<T>(arr: readonly T[], from: number, to: number): readonly T[] {
  if (from === to || from < 0 || from >= arr.length || to < 0 || to >= arr.length) {
    return arr;
  }
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** New epics with `fn` applied to every feature. */
function mapFeatures(plan: ReleasePlan, fn: (f: Feature) => Feature): Epic[] {
  return plan.epics.map((e) => ({ ...e, features: e.features.map(fn) }));
}

/** First milestone color not in use, else `MS_COLORS[len % 8]`. */
export function nextMilestoneColor(milestones: readonly Milestone[]): string {
  const used = new Set(milestones.map((m) => m.color));
  return MS_COLORS.find((c) => !used.has(c)) ?? MS_COLORS[milestones.length % MS_COLORS.length];
}

/** "New Sprint" in Sprints mode; otherwise "Release <n>", n from `milestones.length` up to the first unused name. */
export function nextMilestoneName(plan: ReleasePlan): string {
  if (plan.mode === "sprints") {
    return "New Sprint";
  }
  const names = new Set(plan.milestones.map((m) => m.name));
  let n = plan.milestones.length;
  while (names.has(`Release ${n}`)) {
    n++;
  }
  return `Release ${n}`;
}

function applyMode(plan: ReleasePlan, mode: Mode, makeId: IdFactory): ReleasePlan {
  if (mode === plan.mode) {
    return plan;
  }
  if (mode === "sprints") {
    const names = sprintLeaves(plan);
    if (!names.length) {
      return plan;
    }
    const dates = new Map<string, string>();
    for (const it of plan.iterations) {
      const leaf = (it.path || "").split("\\").pop();
      if (leaf && it.finishDate) {
        dates.set(leaf, it.finishDate);
      }
    }
    const milestones = names.map((name, i) => ({ id: makeId("ms_"), name, date: dates.get(name) ?? "", color: MS_COLORS[i % MS_COLORS.length] }));
    const byName = new Map(milestones.map((m) => [m.name, m.id]));
    return {
      ...plan,
      mode,
      flags: [],
      milestones,
      epics: mapFeatures(plan, (f) => {
        const leaf = iterationLeaf(f);
        return { ...f, milestoneId: leaf ? (byName.get(leaf) ?? null) : null };
      }),
    };
  }
  const mvp: Milestone = { id: makeId("ms_"), name: "MVP", date: "", color: MS_COLORS[0] };
  return { ...plan, mode, flags: [], milestones: [mvp], epics: mapFeatures(plan, (f) => ({ ...f, milestoneId: mvp.id })) };
}

function reduce(plan: ReleasePlan, action: Exclude<PlanAction, { type: "replace" }>, makeId: IdFactory): ReleasePlan {
  switch (action.type) {
    case "rename":
      return { ...plan, name: action.name.trim() || DEFAULT_PLAN_NAME };
    case "setMode":
      return applyMode(plan, action.mode, makeId);
    case "insertMilestone": {
      const idx = Math.max(0, Math.min(action.idx, plan.milestones.length));
      const milestone: Milestone = {
        id: action.id ?? makeId("ms_"),
        name: nextMilestoneName(plan),
        date: "",
        color: nextMilestoneColor(plan.milestones),
      };
      const milestones = [...plan.milestones];
      milestones.splice(idx, 0, milestone);
      return { ...plan, milestones };
    }
    case "renameMilestone":
      return {
        ...plan,
        milestones: plan.milestones.map((m) => (m.id === action.id ? { ...m, name: action.name.trim() || DEFAULT_MILESTONE_NAME } : m)),
      };
    case "setMilestoneDate":
      return { ...plan, milestones: plan.milestones.map((m) => (m.id === action.id ? { ...m, date: action.date } : m)) };
    case "moveMilestone": {
      const milestones = moveItem(plan.milestones, action.from, action.to);
      return milestones === plan.milestones ? plan : { ...plan, milestones: [...milestones] };
    }
    case "deleteMilestone": {
      const i = plan.milestones.findIndex((m) => m.id === action.id);
      if (i < 0) {
        return plan;
      }
      // Flags after the deleted milestone move to the previous one, or are removed if there is none.
      const prev = i > 0 ? plan.milestones[i - 1] : null;
      return {
        ...plan,
        milestones: plan.milestones.filter((m) => m.id !== action.id),
        flags: plan.flags.flatMap((f) => (f.afterMsId !== action.id ? [f] : prev ? [{ ...f, afterMsId: prev.id }] : [])),
        epics: mapFeatures(plan, (f) => (f.milestoneId === action.id ? { ...f, milestoneId: null } : f)),
      };
    }
    case "addFlag": {
      const ms = msById(plan, action.afterMsId);
      if (!ms) {
        return plan;
      }
      return {
        ...plan,
        flags: [...plan.flags, { id: action.id ?? makeId("fl_"), name: DEFAULT_MILESTONE_NAME, date: ms.date || "", afterMsId: ms.id }],
      };
    }
    case "renameFlag":
      return {
        ...plan,
        flags: plan.flags.map((f) => (f.id === action.id ? { ...f, name: action.name.trim() || DEFAULT_MILESTONE_NAME } : f)),
      };
    case "setFlagDate":
      return { ...plan, flags: plan.flags.map((f) => (f.id === action.id ? { ...f, date: action.date } : f)) };
    case "removeFlag":
      return { ...plan, flags: plan.flags.filter((f) => f.id !== action.id) };
    case "moveEpic": {
      const epics = moveItem(plan.epics, action.from, action.to);
      return epics === plan.epics ? plan : { ...plan, epics: [...epics] };
    }
    case "setFeatureMilestone": {
      const milestoneId = action.milestoneId !== null && msById(plan, action.milestoneId) ? action.milestoneId : null;
      return { ...plan, epics: mapFeatures(plan, (f) => (f.id === action.featureId ? { ...f, milestoneId } : f)) };
    }
  }
}

/** Builds the plan reducer with an injectable id factory (deterministic ids in tests). */
export function createPlanReducer(makeId: IdFactory = uid): (state: PlanState, action: PlanAction) => PlanState {
  return (state, action) => {
    if (action.type === "replace") {
      return action.plan;
    }
    return state ? reduce(state, action, makeId) : state;
  };
}

/** The plan reducer with random ids (`uid`). */
export const planReducer = createPlanReducer();
