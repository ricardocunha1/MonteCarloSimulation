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

  it("shows the groups in order: Estimations, then Planning", () => {
    renderSidebar("/");
    expect(screen.getAllByRole("group").map((group) => group.getAttribute("aria-labelledby"))).toEqual([
      "sidebar-group-estimations",
      "sidebar-group-planning",
    ]);
  });

  it("lists only Monte Carlo under Estimations", () => {
    renderSidebar("/");
    const group = screen.getByRole("group", { name: "Estimations" });
    expect(within(group).getAllByRole("link").map((link) => link.textContent)).toEqual(["Monte Carlo"]);
  });

  it("shows the Planning group with a Release Plan link", () => {
    renderSidebar("/");
    const group = screen.getByRole("group", { name: "Planning" });
    const links = within(group).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Release Plan"]);
    expect(links[0]).toHaveAttribute("href", "/release-plan");
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
