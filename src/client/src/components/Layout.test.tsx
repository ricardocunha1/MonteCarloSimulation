import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { SIDEBAR_COLLAPSED_KEY } from "../lib/sidebarPreference";
import { Layout } from "./Layout";

function renderLayout(path = "/monte-carlo") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout title="Test title">
        <p>Content</p>
      </Layout>
    </MemoryRouter>,
  );
}

function sidebarAside(): HTMLElement {
  const aside = screen.getByRole("navigation", { name: "Hub navigation" }).closest("aside");
  if (!aside) {
    throw new Error("sidebar <aside> not found");
  }
  return aside;
}

afterEach(() => {
  window.localStorage.clear();
});

describe("Layout sidebar collapse", () => {
  it("starts expanded by default", () => {
    renderLayout();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
    expect(sidebarAside()).toHaveClass("md:w-60");
    expect(document.title).toBe("Test title");
  });

  it("collapses and expands, persisting the preference", async () => {
    renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    const expand = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(sidebarAside()).toHaveClass("md:w-16");
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("1");
    expect(screen.getByRole("link", { name: "Monte Carlo" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(expand);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
    expect(sidebarAside()).toHaveClass("md:w-60");
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("0");
  });

  it("restores the collapsed preference from localStorage", () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");
    renderLayout("/release-plan");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
    expect(sidebarAside()).toHaveClass("md:w-16");
    expect(screen.getByRole("link", { name: "Release Plan" })).toHaveAttribute("title", "Release Plan");
  });
});
