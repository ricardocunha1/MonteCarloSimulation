import { describe, expect, it } from "vitest";
import { makeEpic, makeFeature, makePlan, samplePlan, sprintsPlan } from "../../test/releasePlanFixtures";
import { computeLayout } from "./layout";

describe("computeLayout", () => {
  it("places epics, columns and bands at exact coordinates", () => {
    const lay = computeLayout(samplePlan());
    expect(lay.epics.map((e) => [e.epic.id, e.x, e.w, e.cols.map((c) => [c.feature.id, c.x])])).toEqual([
      [1, 196, 348, [[11, 206], [12, 374]]],
      [2, 562, 516, [[21, 572], [22, 740], [23, 908]]],
      [3, 1096, 180, []],
    ]);
    expect(lay.width).toBe(1300);
    expect(lay.bandY0).toBe(74);
    expect(lay.bands.map((b) => [b.band.name, b.y, b.h])).toEqual([
      ["MVP", 74, 158],
      ["Release 2", 232, 158],
      ["Unplanned", 390, 158],
    ]);
    expect(lay.gaps).toEqual([
      { idx: 1, y: 232, afterMsId: "ms_mvp" },
      { idx: 2, y: 390, afterMsId: "ms_r2" },
    ]);
    expect(lay.flags).toEqual([]);
    expect(lay.height).toBe(560);
  });

  it("has a minimum width of 700", () => {
    const plan = makePlan({ epics: [makeEpic({ id: 1, features: [makeFeature({ id: 2 })] })] });
    expect(computeLayout(plan).width).toBe(700);
    expect(computeLayout(makePlan()).width).toBe(700);
  });

  it("adds flag rows after their milestone and the gap after the flags; no gap before the first milestone", () => {
    const plan = sprintsPlan();
    const lay = computeLayout(plan);
    expect(lay.bands.map((b) => b.y)).toEqual([74, 266, 424]);
    expect(lay.flags).toEqual([{ flag: plan.flags[0], y: 232, h: 34 }]);
    expect(lay.gaps).toEqual([
      { idx: 1, y: 266, afterMsId: "sp_1" },
      { idx: 2, y: 424, afterMsId: "sp_2" },
    ]);
    expect(Math.min(...lay.gaps.map((g) => g.y))).toBeGreaterThan(lay.bandY0);
    expect(lay.height).toBe(594);
    expect(lay.width).toBe(736);
  });
});
