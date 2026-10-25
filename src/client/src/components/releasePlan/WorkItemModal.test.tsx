import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { samplePlan, sprintsPlan } from "../../test/releasePlanFixtures";
import { BOARD_TEST_TIMEOUT_MS, renderBoard } from "../../test/renderBoard";

const board = () => screen.getByRole("region", { name: "Board" });
const meta = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll(".wi-meta > div")].map((d) => [d.children[0].textContent, d.children[1].textContent]);

describe("WorkItemModal", { timeout: BOARD_TEST_TIMEOUT_MS }, () => {
  it("shows a Feature: type pill, id, crumb, meta and description; focuses ✕", async () => {
    const user = userEvent.setup();
    renderBoard(samplePlan());
    await user.click(within(board()).getByRole("button", { name: /Login page/ }));
    const dialog = screen.getByRole("dialog", { name: "Login page" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("FEATURE")).toHaveClass("wi-type");
    expect(within(dialog).getByText("#11")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    expect(dialog.querySelector(".wi-crumb")).toHaveTextContent("Epic: Wave 1 - MVP");
    expect(meta(dialog)).toEqual([
      ["State", "✓ Done"],
      ["Estimated size", "M"],
      ["Milestone", "MVP"],
      ["Iteration Path", "Proj\\Sprint 1"],
    ]);
    expect(within(dialog).getByTestId("work-item-description").innerHTML).toBe("<p>Login <em>flow</em></p>");
  });

  it("shows an Epic with its features count/summary, sanitized description and features list", async () => {
    const user = userEvent.setup();
    renderBoard(samplePlan());
    await user.click(within(board()).getByRole("button", { name: /Wave 1 - MVP/ }));
    const dialog = screen.getByRole("dialog", { name: "Wave 1 - MVP" });
    expect(within(dialog).getByText("EPIC")).toBeInTheDocument();
    expect(dialog.querySelector(".wi-crumb")).toHaveTextContent("2 Features · M×1 · XL×1");
    expect(meta(dialog)).toEqual([
      ["State", " Active"],
      ["Features", "2"],
      ["Done features", "1"],
      ["Delivered in", "MVP"],
    ]);
    const html = within(dialog).getByTestId("work-item-description").innerHTML;
    expect(html).not.toMatch(/script|onerror|javascript|<img/i);
    expect(within(dialog).getByRole("link", { name: "good link" })).toHaveAttribute("target", "_blank");
    const items = within(dialog).getAllByRole("listitem");
    expect(items.map((li) => within(li).getByRole("button").textContent)).toEqual(["Login page", "Dashboard"]);
  });

  it("shows 'N unplanned' for an Epic with unplanned features and the empty-description note", async () => {
    const user = userEvent.setup();
    renderBoard(samplePlan());
    await user.click(within(board()).getByRole("button", { name: /Wave 2 - Reporting/ }));
    const dialog = screen.getByRole("dialog", { name: "Wave 2 - Reporting" });
    expect(meta(dialog)).toContainEqual(["Delivered in", "1 unplanned"]);
    expect(within(dialog).getByText("No description in Azure DevOps.")).toHaveClass("wi-empty");
  });

  it("navigates Epic → Feature → Epic", async () => {
    const user = userEvent.setup();
    renderBoard(samplePlan());
    await user.click(within(board()).getByRole("button", { name: /Wave 1 - MVP/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Dashboard" }));
    const feature = screen.getByRole("dialog", { name: "Dashboard" });
    expect(within(feature).getByRole("button", { name: "Close" })).toHaveFocus();
    await user.click(within(feature).getByRole("button", { name: "Wave 1 - MVP" }));
    expect(screen.getByRole("dialog", { name: "Wave 1 - MVP" })).toBeInTheDocument();
  });

  it("closes with ✕, Escape and a backdrop click", async () => {
    const user = userEvent.setup();
    renderBoard(samplePlan());
    const open = () => user.click(within(board()).getByRole("button", { name: /Charts/ }));
    await open();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await open();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await open();
    await user.click(screen.getByTestId("work-item-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the Milestone flag only when the plan has flags", async () => {
    const user = userEvent.setup();
    renderBoard(sprintsPlan());
    await user.click(within(board()).getByRole("button", { name: /First/ }));
    expect(meta(screen.getByRole("dialog"))).toContainEqual(["Milestone flag", "Beta"]);
    await user.keyboard("{Escape}");
    await user.click(within(board()).getByRole("button", { name: /Third/ }));
    expect(meta(screen.getByRole("dialog"))).toContainEqual(["Milestone", "Unplanned"]);
    expect(meta(screen.getByRole("dialog"))).toContainEqual(["Milestone flag", "–"]);
    await user.keyboard("{Escape}");
    await user.click(within(board()).getByRole("button", { name: /Sprint Epic/ }));
    expect(meta(screen.getByRole("dialog"))).toContainEqual(["Milestone flag", "–"]);
  });
});
