import { describe, expect, it } from "vitest";
import { makeEpic, makeFeature, makePlan, samplePlan, sprintsPlan } from "../../test/releasePlanFixtures";
import { modeSwitchRequest } from "./modeSwitch";

describe("modeSwitchRequest", () => {
  it("is a no-op for the current mode", () => {
    expect(modeSwitchRequest(samplePlan(), "releases")).toEqual({ kind: "same" });
  });

  it("aborts Sprints when no feature has a sprint leaf", () => {
    const plan = makePlan({ epics: [makeEpic({ id: 1, features: [makeFeature({ id: 2, iterationPath: "Proj" })] })] });
    expect(modeSwitchRequest(plan, "sprints")).toEqual({ kind: "noSprints", message: "No Iteration Paths below the project root were found" });
  });

  it("builds the verbatim Sprints confirmation, with the no-sprint line", () => {
    expect(modeSwitchRequest(samplePlan(), "sprints")).toEqual({
      kind: "confirm",
      message:
        "Switch milestones to Sprints?\n\nThe current milestones will be replaced by 3 sprints (Sprint 1, Sprint 2, Sprint 10) and ALL Features will be reset to their initial milestone: the sprint of their Iteration Path (e.g. Sprint 1).\n1 Features without a sprint will go to Unplanned.\n\nAny manual planning (and milestone flags) will be lost. Save the plan first if you want to keep it.",
    });
  });

  it("omits the no-sprint line when every feature has a sprint", () => {
    const plan = samplePlan({ epics: samplePlan().epics.slice(0, 1) });
    const request = modeSwitchRequest(plan, "sprints");
    expect(request.kind === "confirm" && request.message).toBe(
      "Switch milestones to Sprints?\n\nThe current milestones will be replaced by 2 sprints (Sprint 1, Sprint 2) and ALL Features will be reset to their initial milestone: the sprint of their Iteration Path (e.g. Sprint 1).\n\nAny manual planning (and milestone flags) will be lost. Save the plan first if you want to keep it.",
    );
  });

  it("builds the verbatim Releases confirmation", () => {
    expect(modeSwitchRequest(sprintsPlan(), "releases")).toEqual({
      kind: "confirm",
      message:
        'Switch milestones to Releases?\n\nThe current milestones will be replaced by a single "MVP" milestone and ALL Features will be reset to their initial milestone: MVP.\n\nAny manual planning (and milestone flags) will be lost. Save the plan first if you want to keep it.',
    });
  });
});
