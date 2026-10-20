import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";

function renderSidebar(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  it("shows the Estimations group with a Monte Carlo link", () => {
    renderSidebar("/");
    const group = screen.getByRole("group", { name: "Estimations" });
    const link = within(group).getByRole("link", { name: "Monte Carlo" });
    expect(link).toHaveAttribute("href", "/monte-carlo");
  });

  it("does not mark Monte Carlo active on the hub home page", () => {
    renderSidebar("/");
    expect(screen.getByRole("link", { name: "Monte Carlo" })).not.toHaveAttribute("aria-current");
  });

  it.each(["/monte-carlo", "/monte-carlo/confirm", "/monte-carlo/results"])(
    "marks Monte Carlo active on %s",
    (path) => {
      renderSidebar(path);
      expect(screen.getByRole("link", { name: "Monte Carlo" })).toHaveAttribute("aria-current", "page");
    },
  );
});
