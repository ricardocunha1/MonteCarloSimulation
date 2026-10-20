import { describe, expect, it } from "vitest";
import { clampZoom, fitZoom, zoomIn, zoomLabel, zoomOut } from "./zoom";

describe("zoom", () => {
  it("steps by 0.1, rounded to 2 decimals and clamped to [0.3, 1.5]", () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomIn(0.7)).toBe(0.8);
    expect(zoomIn(1.5)).toBe(1.5);
    expect(zoomOut(0.3)).toBe(0.3);
    expect(clampZoom(0.123)).toBe(0.3);
    expect(clampZoom(1.234)).toBe(1.23);
  });

  it("fits the layout width, never above 1", () => {
    expect(fitZoom(654, 1300)).toBe(0.5);
    expect(fitZoom(3000, 1300)).toBe(1);
    expect(fitZoom(100, 1300)).toBe(0.3);
  });

  it("labels as a rounded percentage", () => {
    expect(zoomLabel(1)).toBe("100%");
    expect(zoomLabel(0.35)).toBe("35%");
  });
});
