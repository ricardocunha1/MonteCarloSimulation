import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileSpreadsheetIcon } from "./FileSpreadsheetIcon";

describe("FileSpreadsheetIcon", () => {
  it("renders a decorative, non-focusable svg that inherits the text color", () => {
    const { container } = render(<FileSpreadsheetIcon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveClass("h-5", "w-5");
  });

  it("accepts a className", () => {
    const { container } = render(<FileSpreadsheetIcon className="h-6 w-6" />);
    expect(container.querySelector("svg")).toHaveAttribute("class", "h-6 w-6");
  });
});
