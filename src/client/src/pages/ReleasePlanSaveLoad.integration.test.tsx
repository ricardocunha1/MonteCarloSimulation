// QA integration tests for Release Plan "Save Plan" / "Load Plan" (plans/release-plan-import-export.md, Phase 1).
// Real board page + real home page through the router, real store with an in-memory PlanStorage; only the
// browser download boundary (URL.createObjectURL/revokeObjectURL, anchor click) is stubbed.
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePlan } from "../lib/releasePlan/validate";
import type { PlanStorage } from "../lib/releasePlan/storage";
import type { ReleasePlan } from "../lib/releasePlan/types";
import { samplePlan } from "../test/releasePlanFixtures";
import { renderAt } from "../test/render";
import { BOARD_TEST_TIMEOUT_MS } from "../test/renderBoard";
import { ReleasePlanBoardPage } from "./ReleasePlanBoardPage";
import { ReleasePlanHomePage } from "./ReleasePlanHomePage";

const board = () => screen.getByRole("region", { name: "Board" });
const msLabel = (name: string) => within(board()).getByRole("group", { name: `Milestone ${name}` });
const summaryNames = () =>
  within(screen.getByRole("region", { name: "Milestone summary" }))
    .getAllByRole("group")
    .map((g) => g.getAttribute("aria-label"));
const toastTexts = () => screen.queryAllByRole("status").map((s) => s.textContent);
const loadDialog = () => screen.getByRole("dialog", { name: "Load a plan" });
const confirmDialog = () => screen.getByRole("dialog", { name: "Replace the current board?" });

/** In-memory PlanStorage that survives provider re-mounts (stands in for localStorage). */
function memoryStorage(initial: ReleasePlan | null): PlanStorage & { current: () => ReleasePlan | null; saves: () => number } {
  let stored: string | null = initial ? JSON.stringify(initial) : null;
  let saves = 0;
  return {
    load: () => (stored ? normalizePlan(JSON.parse(stored)) : null),
    save: (plan) => {
      saves += 1;
      stored = JSON.stringify(plan);
    },
    current: () => (stored ? (JSON.parse(stored) as ReleasePlan) : null),
    saves: () => saves,
  };
}

function renderBoardPage(storage: PlanStorage) {
  return renderAt("/release-plan/board", <ReleasePlanBoardPage />, {
    planStorage: storage,
    routes: { "/release-plan": <ReleasePlanHomePage /> },
  });
}

async function renameMilestone(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  const input = within(msLabel(from)).getByLabelText("Milestone name");
  await user.clear(input);
  await user.type(input, `${to}{Enter}`);
}

async function loadFile(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.click(screen.getByRole("button", { name: "Load Plan" }));
  await user.upload(within(loadDialog()).getByLabelText("Release plan file"), file);
  await user.click(within(loadDialog()).getByRole("button", { name: "Load" }));
  return screen.findByRole("dialog", { name: "Replace the current board?" });
}

describe("Release Plan Save/Load integration", { timeout: BOARD_TEST_TIMEOUT_MS }, () => {
  let blobs: Blob[];
  let downloads: string[];
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  beforeEach(() => {
    // Anchors left by earlier tests' downloads (their real 500 ms cleanup timer may not have fired yet).
    document.querySelectorAll("a[download]").forEach((a) => a.remove());
    blobs = [];
    downloads = [];
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return `blob:plan-${blobs.length}`;
      },
      revokeObjectURL: () => undefined,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.assign(URL, { createObjectURL: original.create, revokeObjectURL: original.revoke });
  });

  /** The file the user would get from the last Save Plan download. */
  async function savedFile(): Promise<File> {
    expect(blobs.length).toBeGreaterThan(0);
    const blob = blobs[blobs.length - 1];
    return new File([await blob.text()], downloads[downloads.length - 1], { type: "application/json" });
  }

  it("Save Plan → change a milestone → Load Plan with the saved file → Replace restores the saved state, which survives a re-mount", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage(samplePlan());
    const first = renderBoardPage(storage);

    // Save the original board.
    await user.click(screen.getByRole("button", { name: "Save Plan" }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^Sample_Release_Plan_\d{4}-\d{2}-\d{2}\.json$/);
    expect(toastTexts()).toContain("Plan saved");
    const file = await savedFile();

    // Change a milestone (rename + date); the change is autosaved.
    await renameMilestone(user, "Release 2", "Beta");
    fireEvent.change(within(msLabel("Beta")).getByLabelText("Milestone date"), { target: { value: "2027-01-15" } });
    expect(summaryNames()).toContain("Beta");
    expect(storage.current()?.milestones.map((m) => m.name)).toEqual(["MVP", "Beta"]);

    // Load the saved file back.
    const confirm = await loadFile(user, file);
    expect(confirm).toHaveTextContent('The current board "Sample Release Plan" will be replaced by "Sample Release Plan".');
    await user.click(within(confirm).getByRole("button", { name: "Replace" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toBe("/release-plan/board");
    expect(toastTexts()).toContain("Plan loaded: Sample Release Plan");
    expect(summaryNames()).toContain("Release 2");
    expect(summaryNames()).not.toContain("Beta");
    expect(within(msLabel("Release 2")).getByLabelText("Milestone date")).toHaveValue("");

    // The store (and so the autosave) now holds the saved file's plan, savedAt included.
    const persisted = storage.current();
    const { savedAt, ...rest } = persisted ?? ({} as ReleasePlan);
    expect(savedAt).toEqual(expect.any(String));
    expect(rest).toEqual(samplePlan());

    // Re-mount the provider (≈ page reload): the loaded state is restored from storage.
    first.unmount();
    renderBoardPage(storage);
    expect(screen.getByLabelText("Plan name")).toHaveValue("Sample Release Plan");
    expect(summaryNames()).toContain("Release 2");
    expect(summaryNames()).not.toContain("Beta");
    expect(within(msLabel("Release 2")).getByLabelText("Milestone date")).toHaveValue("");
    expect(await screen.findByText("Restored your last session")).toBeInTheDocument();
  });

  it("Save Plan does not autosave or change the store (no savedAt written to storage)", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage(samplePlan());
    renderBoardPage(storage);
    const savesBefore = storage.saves();
    await user.click(screen.getByRole("button", { name: "Save Plan" }));
    await user.click(screen.getByRole("tab", { name: "Table" }));
    await user.click(screen.getByRole("button", { name: "Save Plan" }));
    expect(downloads).toHaveLength(2);
    expect(storage.saves()).toBe(savesBefore);
    expect(storage.current()?.savedAt).toBeUndefined();
    // The file itself carries a fresh savedAt.
    const json = JSON.parse(await blobs[1].text()) as ReleasePlan;
    expect(json.savedAt).toEqual(expect.any(String));
    expect(json).toMatchObject({ schema: "release-planner-features", version: 1, name: "Sample Release Plan" });
  });

  it("revokes the download URL and removes the anchor after 500 ms", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const revoke = vi.fn();
      Object.assign(URL, { revokeObjectURL: revoke });
      renderBoardPage(memoryStorage(samplePlan()));
      fireEvent.click(screen.getByRole("button", { name: "Save Plan" }));
      expect(document.querySelectorAll('a[download][href="blob:plan-1"]')).toHaveLength(1);
      expect(document.querySelectorAll("a[download]")).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(revoke).toHaveBeenCalledWith("blob:plan-1");
      expect(document.querySelectorAll("a[download]")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Loads from the Table view and stays in the Table view", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage(samplePlan());
    renderBoardPage(storage);
    await user.click(screen.getByRole("tab", { name: "Table" }));
    const other = samplePlan({ name: "Other Plan" });
    const confirm = await loadFile(user, new File([JSON.stringify(other)], "other.json", { type: "application/json" }));
    await user.click(within(confirm).getByRole("button", { name: "Replace" }));
    expect(screen.getByLabelText("Plan name")).toHaveValue("Other Plan");
    expect(screen.getByRole("tab", { name: "Table" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Table" })).toBeInTheDocument();
    expect(storage.current()?.name).toBe("Other Plan");
  });

  it("Esc closes only the topmost dialog: first the confirmation, then the Load modal; the board is unchanged", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage(samplePlan());
    renderBoardPage(storage);
    await loadFile(user, new File([JSON.stringify(samplePlan({ name: "Other Plan" }))], "other.json", { type: "application/json" }));
    expect(confirmDialog()).toBeInTheDocument();
    expect(within(confirmDialog()).getByRole("button", { name: "Replace" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Replace the current board?" })).not.toBeInTheDocument();
    expect(loadDialog()).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Plan name")).toHaveValue("Sample Release Plan");
    expect(storage.current()?.name).toBe("Sample Release Plan");
    expect(toastTexts()).not.toContain("Plan loaded: Other Plan");
    // Focus goes back to the toolbar button that opened the Load modal.
    expect(screen.getByRole("button", { name: "Load Plan" })).toHaveFocus();
  });

  it("returns focus to the Load Plan button after Replace", async () => {
    const user = userEvent.setup();
    renderBoardPage(memoryStorage(samplePlan()));
    const confirm = await loadFile(user, new File([JSON.stringify(samplePlan({ name: "Other Plan" }))], "other.json", { type: "application/json" }));
    await user.click(within(confirm).getByRole("button", { name: "Replace" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load Plan" })).toHaveFocus();
  });

  it("Cancel in the Load modal closes it without a confirmation; reopening resets the chosen file", async () => {
    const user = userEvent.setup();
    renderBoardPage(memoryStorage(samplePlan()));
    await user.click(screen.getByRole("button", { name: "Load Plan" }));
    await user.upload(within(loadDialog()).getByLabelText("Release plan file"), new File(["{}"], "x.json", { type: "application/json" }));
    await user.click(within(loadDialog()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load Plan" }));
    expect(within(loadDialog()).getByTestId("import-json-file-name")).toHaveTextContent("No file selected.");
  });

  it("after a Load and a re-mount, the home page's 'Last board' shows the loaded plan and its saved time", async () => {
    const user = userEvent.setup();
    const storage = memoryStorage(samplePlan());
    const first = renderBoardPage(storage);
    await user.click(screen.getByRole("button", { name: "Save Plan" }));
    const file = await savedFile();
    await renameMilestone(user, "MVP", "Alpha");
    const confirm = await loadFile(user, file);
    await user.click(within(confirm).getByRole("button", { name: "Replace" }));
    expect(summaryNames()).toContain("MVP");
    first.unmount();
    renderAt("/release-plan", <ReleasePlanHomePage />, { planStorage: storage });
    const last = screen.getByRole("region", { name: "Last board" });
    expect(last).toHaveTextContent("Sample Release Plan");
    expect(last).toHaveTextContent(/· saved /);
  });
});
