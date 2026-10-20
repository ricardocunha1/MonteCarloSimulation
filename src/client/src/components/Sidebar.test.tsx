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

  it("lists Monte Carlo and Release Plan, in registry order", () => {
    renderSidebar("/");
    const group = screen.getByRole("group", { name: "Estimations" });
    const links = within(group).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Monte Carlo", "Release Plan"]);
    expect(within(group).getByRole("link", { name: "Release Plan" })).toHaveAttribute("href", "/release-plan");
  });

  it.each(["/release-plan", "/release-plan/board"])("marks Release Plan (and only it) active on %s", (path) => {
    renderSidebar(path);
    expect(screen.getByRole("link", { name: "Release Plan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Monte Carlo" })).not.toHaveAttribute("aria-current");
  });

  it("does not mark Release Plan active on Monte Carlo pages", () => {
    renderSidebar("/monte-carlo");
    expect(screen.getByRole("link", { name: "Release Plan" })).not.toHaveAttribute("aria-current");
  });
});
