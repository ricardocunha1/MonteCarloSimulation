import { describe, expect, it } from "vitest";
import { buildCalendarData, parseIsoDay, type CalendarCell, type CalendarData } from "./calendar";
import { CONFIDENCE_COLORS } from "./confidence";

function cells(data: CalendarData, monthLabel: string): (CalendarCell | null)[] {
  const month = data.months.find((m) => m.label === monthLabel);
  if (!month) {
    throw new Error(`no month ${monthLabel}`);
  }
  return month.weeks.flat();
}

function cell(data: CalendarData, monthLabel: string, day: number): CalendarCell | undefined {
  return cells(data, monthLabel).find((c) => c?.day === day) ?? undefined;
}

describe("buildCalendarData", () => {
  const rows = [
    { confidence: 50, completion_date: "2026-01-16" },
    { confidence: 70, completion_date: "2026-01-30" },
    { confidence: 85, completion_date: "2026-02-03" },
    { confidence: 95, completion_date: null },
  ];

  it("returns null when no row has a completion date", () => {
    expect(buildCalendarData("2026-01-05", [{ confidence: 95, completion_date: null }])).toBeNull();
    expect(buildCalendarData("2026-01-05", [])).toBeNull();
  });

  it("spans start month to the furthest completion month", () => {
    const data = buildCalendarData("2026-01-05", rows)!;
    expect(data.months.map((m) => m.label)).toEqual(["January 2026", "February 2026"]);
  });

  it("colors each weekday with the lowest band whose completion date is on/after it", () => {
    const data = buildCalendarData("2026-01-05", rows)!;
    expect(cell(data, "January 2026", 5)?.color).toBe(CONFIDENCE_COLORS[50]);
    expect(cell(data, "January 2026", 16)?.color).toBe(CONFIDENCE_COLORS[50]);
    expect(cell(data, "January 2026", 19)?.color).toBe(CONFIDENCE_COLORS[70]);
    expect(cell(data, "January 2026", 30)?.color).toBe(CONFIDENCE_COLORS[70]);
    expect(cell(data, "February 2026", 2)?.color).toBe(CONFIDENCE_COLORS[85]);
    expect(cell(data, "February 2026", 3)?.color).toBe(CONFIDENCE_COLORS[85]);
  });

  it("leaves days outside start..end empty", () => {
    const data = buildCalendarData("2026-01-05", rows)!;
    expect(cell(data, "January 2026", 4)).toBeUndefined();
    expect(cell(data, "February 2026", 4)).toBeUndefined();
  });

  it("lays weeks out Monday-first with padding", () => {
    const data = buildCalendarData("2026-01-05", rows)!;
    const january = data.months[0].weeks;
    // 2026-01-05 is a Monday: first in-range day starts week 2.
    expect(january[0].every((c) => c === null)).toBe(true);
    expect(january[1][0]?.day).toBe(5);
    expect(january.every((week) => week.length === 7)).toBe(true);
  });

  it("marks weekends uncolored", () => {
    const data = buildCalendarData("2026-01-05", rows)!;
    const saturday = cell(data, "January 2026", 10)!;
    const sunday = cell(data, "January 2026", 11)!;
    expect(saturday).toEqual({ day: 10, color: null, isWeekend: true });
    expect(sunday).toEqual({ day: 11, color: null, isWeekend: true });
    expect(cell(data, "January 2026", 12)?.isWeekend).toBe(false);
  });

  it("lets the lower percentile win ties", () => {
    const data = buildCalendarData("2026-01-05", [
      { confidence: 50, completion_date: "2026-01-09" },
      { confidence: 70, completion_date: "2026-01-09" },
    ])!;
    expect(cell(data, "January 2026", 9)?.color).toBe(CONFIDENCE_COLORS[50]);
    expect(data.legend.map((l) => l.label)).toEqual(["P50", "P70"]);
  });

  it("excludes undated rows from the legend", () => {
    const data = buildCalendarData("2026-01-05", rows)!;
    expect(data.legend).toEqual([
      { label: "P50", color: CONFIDENCE_COLORS[50] },
      { label: "P70", color: CONFIDENCE_COLORS[70] },
      { label: "P85", color: CONFIDENCE_COLORS[85] },
    ]);
  });

  it("spans a year boundary", () => {
    const data = buildCalendarData("2026-12-28", [{ confidence: 50, completion_date: "2027-01-08" }])!;
    expect(data.months.map((m) => m.label)).toEqual(["December 2026", "January 2027"]);
    expect(cell(data, "December 2026", 31)?.color).toBe(CONFIDENCE_COLORS[50]);
    expect(cell(data, "January 2027", 1)?.color).toBe(CONFIDENCE_COLORS[50]);
    expect(cell(data, "January 2027", 2)?.isWeekend).toBe(true);
    expect(cell(data, "January 2027", 9)).toBeUndefined();
  });
});

describe("parseIsoDay", () => {
  it("parses calendar days without timezone shifts", () => {
    expect(parseIsoDay("1970-01-02")).toBe(1);
    expect(parseIsoDay("2026-03-29") - parseIsoDay("2026-03-28")).toBe(1);
  });

  it("rejects malformed dates", () => {
    expect(() => parseIsoDay("2026-1-5")).toThrow();
  });
});
