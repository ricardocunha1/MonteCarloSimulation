import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SyncDiff } from "../../lib/releasePlan/syncDiff";
import { NO_EPIC_ID, NO_EPIC_TITLE } from "../../lib/releasePlan/types";
import { SyncPreviewDialog } from "./SyncPreviewDialog";

const EMPTY: SyncDiff = {
  newEpics: [],
  newFeatures: [],
  updatedEpics: [],
  updatedFeatures: [],
  goneEpics: [],
  goneFeatures: [],
  iterationsChanged: false,
};

const FULL: SyncDiff = {
  newEpics: [{ id: 120, title: "Wave 3" }],
  newFeatures: [
    { id: 121, title: "Search", epicId: 120, epicTitle: "Wave 3" },
    { id: 122, title: "Loose", epicId: NO_EPIC_ID, epicTitle: NO_EPIC_TITLE },
  ],
  updatedEpics: [{ id: 101, title: "Wave 1b", changes: ["title", "state"] }],
  updatedFeatures: [{ id: "104", title: "Dash", changes: ["size", "iterationPath", "epic"] }],
  goneEpics: [{ id: 103, title: "Wave 2" }],
  goneFeatures: [
    { id: 105, title: "Reports" },
    { id: 106, title: "Exports" },
  ],
  iterationsChanged: true,
};

function renderDialog(diff: SyncDiff | null) {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  const view = render(<SyncPreviewDialog diff={diff} onApply={onApply} onCancel={onCancel} />);
  return { onApply, onCancel, ...view };
}

const section = (summary: string) => {
  const details = screen.getByText(summary, { selector: "summary" }).closest("details");
  if (!details) {
    throw new Error(`no section ${summary}`);
  }
  return details;
};

describe("SyncPreviewDialog", () => {
  it("renders nothing without a diff", () => {
    renderDialog(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the count lines, focuses Apply and keeps the lists collapsed", () => {
    renderDialog(FULL);
    const dialog = screen.getByRole("dialog", { name: "Sync from Azure DevOps" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect([...dialog.querySelectorAll("summary")].map((s) => s.textContent)).toEqual([
      "2 new Features",
      "1 new Epic",
      "2 updated",
      "3 no longer in scope",
    ]);
    expect(section("2 new Features")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Apply" })).toHaveFocus();
    expect(screen.queryByText("The board is up to date with Azure DevOps.")).not.toBeInTheDocument();
  });

  it("lists `#id title` with the target Epic or the changed fields", async () => {
    const user = userEvent.setup();
    renderDialog(FULL);
    await user.click(screen.getByText("2 new Features"));
    expect(section("2 new Features")).toHaveAttribute("open");
    expect(within(section("2 new Features")).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "#121 Search (in Wave 3)",
      `#122 Loose (in ${NO_EPIC_TITLE})`,
    ]);
    expect(within(section("1 new Epic")).getAllByRole("listitem", { hidden: true }).map((li) => li.textContent)).toEqual(["#120 Wave 3"]);
    expect(within(section("2 updated")).getAllByRole("listitem", { hidden: true }).map((li) => li.textContent)).toEqual([
      "#101 Wave 1b (Epic: title, state)",
      "#104 Dash (size, iteration, Epic)",
    ]);
    expect(within(section("3 no longer in scope")).getAllByRole("listitem", { hidden: true }).map((li) => li.textContent)).toEqual([
      "#103 Wave 2 (Epic)",
      "#105 Reports",
      "#106 Exports",
    ]);
  });

  it("hides the sections with no items", () => {
    renderDialog({ ...EMPTY, newFeatures: [{ id: 1, title: "A", epicId: 9, epicTitle: "E" }] });
    expect([...screen.getByRole("dialog").querySelectorAll("summary")].map((s) => s.textContent)).toEqual(["1 new Feature"]);
  });

  it("Apply passes removeGone=false by default and true once the box is ticked", async () => {
    const user = userEvent.setup();
    const { onApply, unmount } = renderDialog(FULL);
    const box = screen.getByRole("checkbox", { name: "Remove items no longer in scope" });
    expect(box).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenLastCalledWith(false);
    await user.click(box);
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenLastCalledWith(true);
    unmount();
  });

  it("does not offer the removal checkbox when nothing is gone", () => {
    renderDialog({ ...FULL, goneEpics: [], goneFeatures: [] });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/no longer in scope/)).not.toBeInTheDocument();
  });

  it("says the board is up to date when nothing changed; Apply still applies", async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog(EMPTY);
    expect(screen.getByText("The board is up to date with Azure DevOps.")).toBeInTheDocument();
    expect(screen.queryByText("The iteration list will be refreshed.")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(false);
  });

  it("mentions refreshed iterations when only they changed", () => {
    renderDialog({ ...EMPTY, iterationsChanged: true });
    expect(screen.getByText("The board is up to date with Azure DevOps.")).toBeInTheDocument();
    expect(screen.getByText("The iteration list will be refreshed.")).toBeInTheDocument();
  });

  it("Cancel, Escape and the backdrop cancel without applying", async () => {
    const user = userEvent.setup();
    const { onApply, onCancel } = renderDialog(FULL);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("sync-preview-backdrop"));
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("resets the checkbox when reopened", async () => {
    const user = userEvent.setup();
    const { rerender, onApply, onCancel } = renderDialog(FULL);
    await user.click(screen.getByRole("checkbox"));
    rerender(<SyncPreviewDialog diff={null} onApply={onApply} onCancel={onCancel} />);
    rerender(<SyncPreviewDialog diff={FULL} onApply={onApply} onCancel={onCancel} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});
