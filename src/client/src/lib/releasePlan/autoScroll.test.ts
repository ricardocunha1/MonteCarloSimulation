import { describe, expect, it } from "vitest";
import { AUTO_SCROLL_MAX, edgeSpeed } from "./autoScroll";

describe("edgeSpeed", () => {
  // A 0..1000 box: EDGE = min(70, 250) = 70.
  it("is negative near the top, scaled linearly, and -MAX at (or above) the edge", () => {
    expect(edgeSpeed(0, 0, 1000)).toBe(-AUTO_SCROLL_MAX);
    expect(edgeSpeed(35, 0, 1000)).toBeCloseTo(-12);
    expect(edgeSpeed(-50, 0, 1000)).toBe(-AUTO_SCROLL_MAX);
    expect(edgeSpeed(70, 0, 1000)).toBe(0);
  });

  it("is positive near the bottom, scaled linearly, and +MAX at (or below) the edge", () => {
    expect(edgeSpeed(1000, 0, 1000)).toBe(AUTO_SCROLL_MAX);
    expect(edgeSpeed(965, 0, 1000)).toBeCloseTo(12);
    expect(edgeSpeed(1200, 0, 1000)).toBe(AUTO_SCROLL_MAX);
    expect(edgeSpeed(930, 0, 1000)).toBe(0);
  });

  it("is 0 in the middle", () => {
    expect(edgeSpeed(500, 0, 1000)).toBe(0);
    expect(edgeSpeed(300, 100, 700)).toBe(0);
  });

  it("clamps EDGE to a quarter of a small box", () => {
    // 100..300: EDGE = min(70, 50) = 50.
    expect(edgeSpeed(125, 100, 300)).toBeCloseTo(-12);
    expect(edgeSpeed(150, 100, 300)).toBe(0);
    expect(edgeSpeed(260, 100, 300)).toBeCloseTo(4.8);
    expect(edgeSpeed(240, 100, 300)).toBe(0);
  });

  it("is 0 for an empty or inverted range", () => {
    expect(edgeSpeed(0, 0, 0)).toBe(0);
    expect(edgeSpeed(10, 50, 20)).toBe(0);
  });
});
