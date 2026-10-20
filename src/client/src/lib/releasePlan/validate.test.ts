import { describe, expect, it } from "vitest";
import { sequentialIds } from "../../test/releasePlanFixtures";
import { MS_COLORS } from "./constants";
import {
  MSG_MALFORMED,
  MSG_MISSING_ARRAYS,
  MSG_NOT_JSON,
  MSG_SCHEMA_MISSING,
  MSG_USER_STORY_PLAN,
  PlanValidationError,
  normalizePlan,
  parsePlanFile,
} from "./validate";

const SCHEMA = "release-planner-features";

function rawPlan(extra: Record<string, unknown> = {}) {
  return {
    schema: SCHEMA,
    version: 1,
    milestones: [{ id: "ms_a", name: "MVP", date: "2026-11-30", color: "#4E98D1" }],
    epics: [
      {
        id: 1,
        title: "Epic",
        state: "New",
        description: "<p>d</p>",
        features: [{ id: 2, title: "F", state: "New", description: "x", size: "M", iterationPath: "P\\S1", milestoneId: "ms_a" }],
      },
    ],
    ...extra,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function errorOf(fn: () => unknown): PlanValidationError {
  try {
    fn();
  } catch (exc) {
    expect(exc).toBeInstanceOf(PlanValidationError);
    expect(exc).toBeInstanceOf(Error);
    return exc as PlanValidationError;
  }
  throw new Error("expected a PlanValidationError");
}

describe("parsePlanFile", () => {
  it("maps a JSON syntax error to the 'not valid JSON' message", () => {
    expect(errorOf(() => parsePlanFile("{not json")).message).toBe(MSG_NOT_JSON);
    expect(MSG_NOT_JSON).toBe("Could not read the file: it is not valid JSON.");
  });

  it("parses and normalizes a valid file", () => {
    const plan = parsePlanFile(JSON.stringify(rawPlan()));
    expect(plan.schema).toBe(SCHEMA);
    expect(plan.epics[0].features[0].milestoneId).toBe("ms_a");
  });
});

describe("normalizePlan errors", () => {
  it("rejects a User Story plan", () => {
    expect(errorOf(() => normalizePlan({ schema: "release-planner", milestones: [], epics: [] })).message).toBe(
      "This is a User Story plan. Open it in the User Story board.",
    );
    expect(MSG_USER_STORY_PLAN).toBe("This is a User Story plan. Open it in the User Story board.");
  });

  it.each([[null], [42], ["text"], [[]], [{}], [{ schema: "other" }]])("rejects %j as not a Feature plan", (input) => {
    expect(errorOf(() => normalizePlan(input)).message).toBe("Not a Feature release plan file (schema missing).");
  });

  it.each([
    [{ epics: [] }],
    [{ milestones: [] }],
    [{ milestones: {}, epics: [] }],
    [{ milestones: [], epics: "x" }],
  ])("requires milestones and epics arrays (%j)", (extra) => {
    expect(errorOf(() => normalizePlan({ schema: SCHEMA, ...extra })).message).toBe("Missing milestones or epics.");
    expect(MSG_MISSING_ARRAYS).toBe("Missing milestones or epics.");
  });

  it("rejects non-object milestones, epics or features", () => {
    expect(errorOf(() => normalizePlan({ schema: SCHEMA, milestones: [null], epics: [] })).message).toBe(MSG_MALFORMED);
    expect(errorOf(() => normalizePlan({ schema: SCHEMA, milestones: [], epics: [7] })).message).toBe(MSG_MALFORMED);
    expect(errorOf(() => normalizePlan({ schema: SCHEMA, milestones: [], epics: [{ id: 1, features: ["x"] }] })).message).toBe(MSG_MALFORMED);
    expect(MSG_SCHEMA_MISSING).toBe("Not a Feature release plan file (schema missing).");
  });
});

describe("normalizePlan rules", () => {
  it("defaults epic description and features", () => {
    const plan = normalizePlan(rawPlan({ epics: [{ id: 1, title: "E", state: "New" }] }));
    expect(plan.epics[0].description).toBe("");
    expect(plan.epics[0].features).toEqual([]);
  });

  it("nulls unknown milestone ids and fills feature defaults, upper-casing and trimming the size", () => {
    const plan = normalizePlan(
      rawPlan({
        epics: [
          {
            id: 1,
            title: "E",
            state: "New",
            features: [
              { id: 2, title: "a", state: "New", milestoneId: "ms_gone", size: " xl " },
              { id: 3, title: "b", state: "New", milestoneId: "ms_a" },
              { id: 4, title: "c", state: "New", milestoneId: null, size: null, iterationPath: null, description: null },
            ],
          },
        ],
      }),
    );
    const [a, b, c] = plan.epics[0].features;
    expect(a).toMatchObject({ milestoneId: null, size: "XL", iterationPath: "", description: "" });
    expect(b).toMatchObject({ milestoneId: "ms_a", size: "" });
    expect(c).toMatchObject({ milestoneId: null, size: "", iterationPath: "", description: "" });
  });

  it("replaces milestone colors outside the palette by MS_COLORS[i % 8]", () => {
    const milestones = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, name: `M${i}`, date: "", color: i === 1 ? "#60C5B5" : "#123456" }));
    const plan = normalizePlan(rawPlan({ milestones }));
    expect(plan.milestones.map((m) => m.color)).toEqual([
      MS_COLORS[0], "#60C5B5", MS_COLORS[2], MS_COLORS[3], MS_COLORS[4], MS_COLORS[5], MS_COLORS[6], MS_COLORS[7], MS_COLORS[0], MS_COLORS[1],
    ]);
  });

  it.each([[undefined], ["releases"], ["weird"]])("mode %j becomes releases", (mode) => {
    expect(normalizePlan(rawPlan({ mode })).mode).toBe("releases");
  });

  it("keeps only flags after a known milestone and fills their defaults (Sprints mode)", () => {
    const plan = normalizePlan(
      rawPlan({
        mode: "sprints",
        flags: [
          { id: "fl_keep", name: "Beta", date: "2026-10-01", afterMsId: "ms_a" },
          { afterMsId: "ms_a" },
          { id: "fl_orphan", name: "X", afterMsId: "ms_gone" },
          null,
        ],
      }),
      sequentialIds(),
    );
    expect(plan.mode).toBe("sprints");
    expect(plan.flags).toEqual([
      { id: "fl_keep", name: "Beta", date: "2026-10-01", afterMsId: "ms_a" },
      { id: "fl_1", name: "Milestone", date: "", afterMsId: "ms_a" },
    ]);
  });

  it("drops all flags outside Sprints mode", () => {
    expect(normalizePlan(rawPlan({ flags: [{ id: "f", afterMsId: "ms_a" }] })).flags).toEqual([]);
  });

  it("defaults flags, iterations, name and source", () => {
    const plan = normalizePlan(rawPlan({ mode: "sprints" }));
    expect(plan.flags).toEqual([]);
    expect(plan.iterations).toEqual([]);
    expect(plan.name).toBe("Feature Release Plan");
    expect(plan.source).toEqual({});
  });

  it("keeps name, source, iterations and savedAt when present", () => {
    const plan = normalizePlan(
      rawPlan({
        name: "My plan",
        source: { system: "Azure DevOps", scope: "Area Path: X", fetchedAt: "2026-10-16T12:27:00Z" },
        iterations: [{ path: "P\\S1", finishDate: "2026-09-18" }],
        savedAt: "2026-10-20T10:00:00Z",
      }),
    );
    expect(plan.name).toBe("My plan");
    expect(plan.source).toEqual({ system: "Azure DevOps", scope: "Area Path: X", fetchedAt: "2026-10-16T12:27:00Z" });
    expect(plan.iterations).toEqual([{ path: "P\\S1", finishDate: "2026-09-18" }]);
    expect(plan.savedAt).toBe("2026-10-20T10:00:00Z");
  });

  it("never mutates its input", () => {
    const input = deepFreeze(
      rawPlan({
        mode: "sprints",
        flags: [{ afterMsId: "ms_a" }],
        milestones: [{ id: "ms_a", name: "MVP", color: "#bad" }],
        epics: [{ id: 1, title: "E", features: [{ id: 2, title: "F", milestoneId: "nope", size: "s" }] }],
      }),
    );
    const before = JSON.stringify(input);
    const plan = normalizePlan(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(plan.epics[0]).not.toBe(input.epics[0]);
    expect(plan.epics[0].features[0].size).toBe("S");
  });
});
