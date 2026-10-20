import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MonteCarloLayout } from "./MonteCarloLayout";

function renderView() {
  render(
    <MemoryRouter initialEntries={["/monte-carlo"]}>
      <MonteCarloLayout pageTitle="Data Input" currentStep={1}>
        <p>step content</p>
      </MonteCarloLayout>
    </MemoryRouter>,
  );
}

describe("MonteCarloLayout", () => {
  it("renders the hub header, the Monte Carlo view header, breadcrumb and content", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 1, name: "CM Estimations Hub" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Monte Carlo" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Progress" })).toBeInTheDocument();
    expect(screen.getByText("step content")).toBeInTheDocument();
    expect(document.title).toBe("CM Estimations Hub – Monte Carlo – Data Input");
  });

  it("opens and closes the help modal from the How to Use button", async () => {
    const user = userEvent.setup();
    renderView();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "How to Use" }));
    expect(screen.getByRole("dialog", { name: "How to Use This Application" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
