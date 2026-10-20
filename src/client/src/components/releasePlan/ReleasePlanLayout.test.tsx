import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ReleasePlanLayout } from "./ReleasePlanLayout";

function renderView(page?: string) {
  render(
    <MemoryRouter initialEntries={["/release-plan"]}>
      <ReleasePlanLayout page={page}>
        <p>page content</p>
      </ReleasePlanLayout>
    </MemoryRouter>,
  );
}

describe("ReleasePlanLayout", () => {
  it("renders the hub header, the Release Plan heading and content", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 1, name: "CM Estimations Hub" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Release Plan" })).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("sets the home document title without a page", () => {
    renderView();
    expect(document.title).toBe("CM Estimations Hub – Release Plan");
  });

  it("appends the page to the document title", () => {
    renderView("Board");
    expect(document.title).toBe("CM Estimations Hub – Release Plan – Board");
  });
});
