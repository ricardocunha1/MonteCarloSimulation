import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AdoTreeNode } from "../../lib/releasePlan/adoTypes";
import { areaTree, iterationTree } from "../../test/adoFixtures";
import { PathTree } from "./PathTree";

function Harness({ root = areaTree(), initial = null, onSelect }: { root?: AdoTreeNode; initial?: string | null; onSelect?: (p: string) => void }) {
  const [selected, setSelected] = useState<string | null>(initial);
  return (
    <PathTree
      root={root}
      label="Area path"
      selectedPath={selected}
      onSelect={(path) => {
        setSelected(path);
        onSelect?.(path);
      }}
    />
  );
}

const tree = () => screen.getByRole("tree", { name: "Area path" });
const item = (name: string) => within(tree()).getByRole("treeitem", { name: new RegExp(`^${name}`) });
const names = () => within(tree()).getAllByRole("treeitem").map((el) => el.textContent?.replace(/^[▸▾]/, ""));

describe("PathTree", () => {
  it("starts with the root expanded and its children visible", () => {
    render(<Harness />);
    expect(names()).toEqual(["Proj", "Team A", "Team B"]);
    expect(item("Proj")).toHaveAttribute("aria-expanded", "true");
    expect(item("Proj")).toHaveAttribute("aria-level", "1");
    expect(item("Team A")).toHaveAttribute("aria-expanded", "false");
    expect(item("Team A")).toHaveAttribute("aria-level", "2");
    expect(item("Team B")).not.toHaveAttribute("aria-expanded");
  });

  it("expands and collapses with the toggle", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(within(item("Team A")).getByTestId("tree-toggle"));
    expect(names()).toEqual(["Proj", "Team A", "Squad 1", "Team B"]);
    await user.click(within(item("Team A")).getByTestId("tree-toggle"));
    expect(names()).toEqual(["Proj", "Team A", "Team B"]);
  });

  it("selects a node on click, including the root", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await user.click(item("Team B"));
    expect(onSelect).toHaveBeenLastCalledWith("Proj\\Team B");
    expect(item("Team B")).toHaveAttribute("aria-selected", "true");
    expect(item("Proj")).toHaveAttribute("aria-selected", "false");
    await user.click(item("Proj"));
    expect(onSelect).toHaveBeenLastCalledWith("Proj");
  });

  it("expands the ancestors of an initially selected path", () => {
    render(<Harness initial={"Proj\\Team A\\Squad 1"} />);
    expect(item("Squad 1")).toHaveAttribute("aria-selected", "true");
    expect(item("Squad 1")).toHaveAttribute("tabindex", "0");
  });

  it("filters to matches plus ancestors (case-insensitive) and auto-expands them", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Search Area path"), "squad");
    expect(names()).toEqual(["Proj", "Team A", "Squad 1"]);
    expect(item("Team A")).toHaveAttribute("aria-expanded", "true");
    await user.clear(screen.getByLabelText("Search Area path"));
    await user.type(screen.getByLabelText("Search Area path"), "proj\\team b");
    expect(names()).toEqual(["Proj", "Team B"]);
    await user.clear(screen.getByLabelText("Search Area path"));
    expect(names()).toEqual(["Proj", "Team A", "Squad 1", "Team B"]);
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Search Area path"), "zzz");
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(screen.getByText("No matching paths.")).toBeInTheDocument();
  });

  it("supports the arrow keys, Home/End and Enter/Space", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    expect(item("Proj")).toHaveAttribute("tabindex", "0");
    await user.tab();
    await user.tab();
    expect(item("Proj")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(item("Team A")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(item("Team A")).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{ArrowRight}");
    expect(item("Squad 1")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith("Proj\\Team A\\Squad 1");
    await user.keyboard("{ArrowLeft}");
    expect(item("Team A")).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(item("Team A")).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{End}");
    expect(item("Team B")).toHaveFocus();
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenLastCalledWith("Proj\\Team B");
    await user.keyboard("{Home}");
    expect(item("Proj")).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(item("Proj")).toHaveFocus();
  });

  it("shows iteration finish dates", () => {
    render(<PathTree root={iterationTree()} label="Area path" selectedPath={"Proj\\Phase 1\\Sprint 01"} onSelect={vi.fn()} />);
    expect(item("Sprint 01")).toHaveTextContent("2026-10-30");
  });

  it("moves focus to a node collapsed with the mouse while a descendant has focus", () => {
    render(<Harness initial={"Proj\\Team A\\Squad 1"} />);
    act(() => item("Squad 1").focus());
    expect(item("Squad 1")).toHaveFocus();
    // A plain click on the toggle (no mousedown focus): the focused row disappears.
    const toggle = item("Team A").querySelector('[data-testid="tree-toggle"]');
    if (!toggle) throw new Error("no toggle");
    fireEvent.click(toggle);
    expect(within(tree()).queryByRole("treeitem", { name: /^Squad 1/ })).not.toBeInTheDocument();
    expect(item("Team A")).toHaveFocus();
    expect(item("Team A")).toHaveAttribute("tabindex", "0");
  });

  it("does not steal focus when collapsing a node whose descendants are not focused", async () => {
    const user = userEvent.setup();
    render(<Harness initial={"Proj\\Team A\\Squad 1"} />);
    const search = screen.getByLabelText("Search Area path");
    search.focus();
    const toggle = item("Team A").querySelector('[data-testid="tree-toggle"]');
    if (!toggle) throw new Error("no toggle");
    fireEvent.click(toggle);
    expect(search).toHaveFocus();
    await user.click(item("Team B"));
    expect(item("Team B")).toHaveAttribute("aria-selected", "true");
  });

  it("disabled: browsing works but search and selection are blocked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PathTree root={areaTree()} label="Area path" selectedPath={"Proj\\Team B"} onSelect={onSelect} disabled />);
    expect(tree()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Search Area path")).toBeDisabled();
    await user.click(item("Team A"));
    item("Proj").focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onSelect).not.toHaveBeenCalled();
    item("Team A").focus();
    await user.keyboard("{ArrowRight}");
    expect(item("Team A")).toHaveAttribute("aria-expanded", "true");
  });
});
