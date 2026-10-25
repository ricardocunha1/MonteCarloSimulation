import { DEFAULT_MILESTONE_NAME, DEFAULT_PLAN_NAME, MS_COLORS, SCHEMA, VERSION, uid, type IdFactory } from "./constants";
import type { Epic, Feature, Flag, Iteration, Milestone, Mode, PlanSource, ReleasePlan, WorkItemId } from "./types";

/** A plan file/object that cannot be loaded; `message` is user-facing. */
export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanValidationError";
  }
}

/** User-facing import errors (template wording; `MSG_MALFORMED` is an addition for non-object entries). */
export const MSG_NOT_JSON = "Could not read the file: it is not valid JSON.";
export const MSG_USER_STORY_PLAN = "This is a User Story plan. Open it in the User Story board.";
export const MSG_SCHEMA_MISSING = "Not a Feature release plan file (schema missing).";
export const MSG_MISSING_ARRAYS = "Missing milestones or epics.";
export const MSG_MALFORMED = "Invalid plan file: every milestone, epic and feature must be an object.";

type Obj = Record<string, unknown>;

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): Obj {
  if (!isObject(value)) {
    throw new PlanValidationError(MSG_MALFORMED);
  }
  return value;
}

/** `value` as text: strings as-is, `null`/`undefined` → `fallback`, anything else stringified. */
function text(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  return value === null || value === undefined ? fallback : String(value);
}

function workItemId(value: unknown): WorkItemId {
  return typeof value === "number" || typeof value === "string" ? value : text(value);
}

/** Milestone id reference as a string, or `null` when it is not a string/number. */
function msRef(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function normalizeFeature(raw: unknown, milestoneIds: ReadonlySet<string>): Feature {
  const f = asObject(raw);
  const ref = msRef(f.milestoneId);
  return {
    id: workItemId(f.id),
    title: text(f.title),
    state: text(f.state),
    description: text(f.description),
    size: text(f.size).trim().toUpperCase(),
    iterationPath: text(f.iterationPath),
    milestoneId: ref !== null && milestoneIds.has(ref) ? ref : null,
  };
}

function normalizeEpic(raw: unknown, milestoneIds: ReadonlySet<string>): Epic {
  const e = asObject(raw);
  const features = Array.isArray(e.features) ? e.features : [];
  return {
    id: workItemId(e.id),
    title: text(e.title),
    state: text(e.state),
    description: text(e.description),
    features: features.map((f) => normalizeFeature(f, milestoneIds)),
  };
}

/** Keeps the known `source` fields that are strings (and `kind`/`scopeType` only when in their enums); drops the rest. */
function normalizeSource(raw: unknown): PlanSource {
  if (!isObject(raw)) {
    return {};
  }
  const source: PlanSource = {};
  for (const key of ["system", "project", "scope", "fetchedAt", "projectUrl", "scopePath"] as const) {
    const value = raw[key];
    if (typeof value === "string") {
      source[key] = value;
    }
  }
  if (raw.kind === "onprem" || raw.kind === "cloud") {
    source.kind = raw.kind;
  }
  if (raw.scopeType === "area" || raw.scopeType === "iteration") {
    source.scopeType = raw.scopeType;
  }
  return source;
}

function normalizeIterations(raw: unknown): Iteration[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isObject).map((it) => ({ path: text(it.path), finishDate: text(it.finishDate) }));
}

/**
 * Validates and normalizes a parsed plan object (template `validate()` rules; see the
 * plan's Template reference → Import validation). Non-string text fields are coerced
 * to strings and a milestone without an id gets `makeId("ms_")`.
 * Never mutates `input`: the result is built from fresh objects.
 * @throws PlanValidationError with a user-facing message.
 */
export function normalizePlan(input: unknown, makeId: IdFactory = uid): ReleasePlan {
  if (!isObject(input) || input.schema !== SCHEMA) {
    const schema = isObject(input) ? input.schema : undefined;
    throw new PlanValidationError(schema === "release-planner" ? MSG_USER_STORY_PLAN : MSG_SCHEMA_MISSING);
  }
  if (!Array.isArray(input.milestones) || !Array.isArray(input.epics)) {
    throw new PlanValidationError(MSG_MISSING_ARRAYS);
  }

  const milestones: Milestone[] = input.milestones.map((raw, i) => {
    const m = asObject(raw);
    const color = text(m.color);
    return {
      id: msRef(m.id) ?? makeId("ms_"),
      name: text(m.name),
      date: text(m.date),
      color: MS_COLORS.includes(color) ? color : MS_COLORS[i % MS_COLORS.length],
    };
  });
  const milestoneIds = new Set(milestones.map((m) => m.id));
  const epics = input.epics.map((e) => normalizeEpic(e, milestoneIds));
  const mode: Mode = input.mode === "sprints" ? "sprints" : "releases";

  const rawFlags = Array.isArray(input.flags) ? input.flags : [];
  const flags: Flag[] =
    mode === "sprints"
      ? rawFlags
          .filter(isObject)
          .filter((f) => {
            const ref = msRef(f.afterMsId);
            return ref !== null && milestoneIds.has(ref);
          })
          .map((f) => ({
            id: text(f.id) || makeId("fl_"),
            name: text(f.name) || DEFAULT_MILESTONE_NAME,
            date: text(f.date),
            afterMsId: String(msRef(f.afterMsId)),
          }))
      : [];

  const plan: ReleasePlan = {
    schema: SCHEMA,
    version: typeof input.version === "number" ? input.version : VERSION,
    mode,
    name: text(input.name) || DEFAULT_PLAN_NAME,
    source: normalizeSource(input.source),
    iterations: normalizeIterations(input.iterations),
    milestones,
    flags,
    epics,
  };
  if (typeof input.savedAt === "string") {
    plan.savedAt = input.savedAt;
  }
  return plan;
}

/**
 * Parses the text of a plan file and normalizes it.
 * @throws PlanValidationError ("Could not read the file: it is not valid JSON." for a syntax error).
 */
export function parsePlanFile(fileText: string, makeId: IdFactory = uid): ReleasePlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    throw new PlanValidationError(MSG_NOT_JSON);
  }
  return normalizePlan(parsed, makeId);
}
