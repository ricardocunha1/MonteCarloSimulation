import { describe, expect, it } from "vitest";
import { makeEpic, makeFeature, makePlan, samplePlan, sprintsPlan } from "../../test/releasePlanFixtures";
import { LF } from "./constants";
import { computeBoardLayout, computeFlippedLayout, computeLayout } from "./layout";

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

describe("computeFlippedLayout", () => {
  it("places milestone columns, gaps, epic groups and feature rows at exact coordinates", () => {
    const lay = computeFlippedLayout(samplePlan());
    expect(lay.orientation).toBe("flipped");
    expect(lay.headH).toBe(158);
    expect(lay.colX0).toBe(226);
    expect(lay.columns.map((c) => [c.band.name, c.x, c.w])).toEqual([
      ["MVP", 226, 180],
      ["Release 2", 406, 180],
      ["Unplanned", 586, 180],
    ]);
    expect(lay.gaps).toEqual([
      { idx: 1, x: 406, afterMsId: "ms_mvp" },
      { idx: 2, x: 586, afterMsId: "ms_r2" },
    ]);
    expect(lay.flags).toEqual([]);
    expect(lay.width).toBe(778);
    expect(lay.epics.map((e) => [e.epic.id, e.y, e.h, e.rows.map((r) => [r.feature.id, r.y])])).toEqual([
      [1, 174, 196, [[11, 184], [12, 276]]],
      [2, 388, 288, [[21, 398], [22, 490], [23, 582]]],
      [3, 694, 104, []],
    ]);
    expect(lay.height).toBe(822);
  });

  it("adds a FLAG_H column after its milestone and the gap after the flags; no gap before the first milestone", () => {
    const plan = sprintsPlan();
    const lay = computeFlippedLayout(plan);
    expect(lay.columns.map((c) => c.x)).toEqual([226, 440, 620]);
    expect(lay.flags).toEqual([{ flag: plan.flags[0], x: 406, w: 34 }]);
    expect(lay.gaps).toEqual([
      { idx: 1, x: 440, afterMsId: "sp_1" },
      { idx: 2, x: 620, afterMsId: "sp_2" },
    ]);
    expect(Math.min(...lay.gaps.map((g) => g.x))).toBeGreaterThan(lay.colX0);
    expect(lay.width).toBe(812);
    expect(lay.height).toBe(174 + 288 + 24);
  });

  it("has a minimum size and gives an epic without features one empty row of height", () => {
    const empty = computeFlippedLayout(makePlan());
    expect(empty.width).toBe(LF.MIN_W);
    expect(empty.height).toBe(LF.MIN_H);
    const lay = computeFlippedLayout(makePlan({ epics: [makeEpic({ id: 1 })] }));
    expect(lay.epics[0]).toMatchObject({ y: LF.TOP, h: 104, rows: [] });
  });

  it("is selected by computeBoardLayout; the standard orientation keeps computeLayout", () => {
    const plan = samplePlan();
    expect(computeBoardLayout(plan, "flipped")).toEqual(computeFlippedLayout(plan));
    expect(computeBoardLayout(plan, "standard")).toEqual(computeLayout(plan));
    expect(computeLayout(plan).orientation).toBe("standard");
  });
});
