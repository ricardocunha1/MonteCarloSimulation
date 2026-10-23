import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replaceBoardMessage } from "../components/releasePlan/ReplaceBoardDialog";
import type { AdoBacklog } from "../lib/releasePlan/adoTypes";
import { planToJson } from "../lib/releasePlan/exportFile";
import { planFromBacklog } from "../lib/releasePlan/fromBacklog";
import type { PlanStorage } from "../lib/releasePlan/storage";
import type { ReleasePlan } from "../lib/releasePlan/types";
import { FakeImage, RecordingContext, stubCanvas } from "../test/canvas";
import { makeBacklog, makeConnection, makeConnectResponse, makeFeatureItem } from "../test/adoFixtures";
import { makeEpic, makeFeature, makeMilestone, samplePlan, sequentialIds, sprintsPlan } from "../test/releasePlanFixtures";
import { BOARD_TEST_TIMEOUT_MS, renderBoard } from "../test/renderBoard";

const location = () => screen.getByTestId("location").textContent;
const summaryBox = (name: string) => within(screen.getByRole("region", { name: "Milestone summary" })).getByRole("group", { name });
const featureCount = (name: string) => summaryBox(name).querySelector(".n")?.textContent;
const zoomValue = () => screen.getByTestId("zoom-value").textContent;

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(blob);
  });
}

describe("ReleasePlanBoardPage", { timeout: BOARD_TEST_TIMEOUT_MS }, () => {
  it("redirects to /release-plan when there is no plan", () => {
    renderBoard(null);
    expect(location()).toBe("/release-plan");
    expect(screen.getByText("release plan home page")).toBeInTheDocument();
  });

  it("renders the board with its title, toolbar, summary and hint; only epic headers and cards are draggable", () => {
    const { container } = renderBoard(samplePlan());
    expect(document.title).toBe("Planning Hub – Release Plan – Board");
    expect(container.querySelector(".rp")).not.toBeNull();
    expect(screen.getByLabelText("Plan name")).toHaveValue("Sample Release Plan");
    expect(screen.getByTestId("source-info")).toHaveTextContent("Azure DevOps · Area Path: Proj\\Team");
    expect(screen.getByText(/Click any work item to see its description/)).toHaveTextContent(
      "Drag Epics to reorder them. Drag a Feature card up or down to move it to another milestone, or onto another column of the same Epic to reorder it. Ctrl+click (⌘+click on Mac) selects several Features of the same Epic to move them together. Click any work item to see its description. Use the + between milestones to insert a new one (in Sprint mode, also a milestone flag). ✓ = Resolved / Done / Closed.",
    );
    expect(screen.getByText("Ctrl+click").tagName).toBe("B");
    const draggable = [...container.querySelectorAll('[draggable="true"]')];
    expect(draggable.every((el) => el.matches(".epic, .fcard"))).toBe(true);
    expect(draggable).toHaveLength(3 + 5);
    expect([...container.querySelectorAll('[draggable="false"]')].map((el) => el.textContent)).toEqual(["◀", "▶", "◀", "▶", "◀", "▶"]);
    expect(screen.getByRole("button", { name: "Load Plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export PNG" })).toBeInTheDocument();
  });

  it("shows 'Restored your last session' once when hydrated from storage, and autosaves changes", async () => {
    const user = userEvent.setup();
    const save = vi.fn<PlanStorage["save"]>();
    const storage: PlanStorage = { load: () => samplePlan(), save };
    renderBoard(null, storage);
    expect(screen.getAllByRole("status").filter((s) => s.textContent === "Restored your last session")).toHaveLength(1);
    await user.click(screen.getByRole("tab", { name: "Table" }));
    await user.click(screen.getByRole("tab", { name: "Board" }));
    expect(screen.getAllByText("Restored your last session")).toHaveLength(1);
    const name = screen.getByLabelText("Plan name");
    await user.clear(name);
    await user.type(name, "Autosaved{Enter}");
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Autosaved" }));
  });

  it("does not show the restored toast for an in-memory plan", () => {
    renderBoard(samplePlan());
    expect(screen.queryByText("Restored your last session")).not.toBeInTheDocument();
  });

  it("renames the plan on commit (trimmed; empty → 'Feature Release Plan') and sizes the input", async () => {
    const user = userEvent.setup();
    renderBoard(samplePlan());
    const name = screen.getByLabelText("Plan name");
    expect(name).toHaveStyle({ width: `${"Sample Release Plan".length + 3}ch` });
    await user.clear(name);
    await user.type(name, "  Q4 plan  ");
    await user.tab();
    expect(name).toHaveValue("Q4 plan");
    await user.clear(name);
    await user.tab();
    expect(name).toHaveValue("Feature Release Plan");
  });

  it("switches between Board and Table tabs and hides zoom in Table view", async () => {
    const user = userEvent.setup();
    renderBoard(samplePlan());
    const boardTab = screen.getByRole("tab", { name: "Board" });
    const tableTab = screen.getByRole("tab", { name: "Table" });
    expect(boardTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("group", { name: "Zoom" })).toBeInTheDocument();
    await user.click(tableTab);
    expect(tableTab).toHaveAttribute("aria-selected", "true");
    expect(boardTab).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Zoom" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Board" })).not.toBeInTheDocument();
    // The summary stays in both views.
    expect(summaryBox("MVP")).toBeInTheDocument();
  });

  it("zooms with −/+ in 0.1 steps clamped to [30%, 150%], scales the board, and fits the scroll box", () => {
    // ~25 clicks that each re-render the whole board: fireEvent (not userEvent) and the buttons are looked up
    // once (role queries over the full board are slow), so this stays fast under parallel load.
    renderBoard(samplePlan());
    const zoomGroup = within(screen.getByRole("group", { name: "Zoom" }));
    const zoomInBtn = zoomGroup.getByRole("button", { name: "Zoom in" });
    const zoomOutBtn = zoomGroup.getByRole("button", { name: "Zoom out" });
    const fitBtn = zoomGroup.getByRole("button", { name: "Fit" });
    expect(zoomValue()).toBe("100%");
    fireEvent.click(zoomInBtn);
    expect(zoomValue()).toBe("110%");
    for (let i = 1; i < 8; i++) {
      fireEvent.click(zoomInBtn);
    }
    expect(zoomValue()).toBe("150%");
    expect(screen.getByTestId("board-scale")).toHaveStyle({ transform: "scale(1.5)", width: "1950px", height: "840px" });
    fireEvent.click(zoomOutBtn);
    expect(zoomValue()).toBe("140%");
    for (let i = 1; i < 15; i++) {
      fireEvent.click(zoomOutBtn);
    }
    expect(zoomValue()).toBe("30%");
    // Fit = min(1, (clientWidth - 4) / layout.width); the sample layout is 1300px wide.
    Object.defineProperty(screen.getByTestId("board-scroll"), "clientWidth", { configurable: true, value: 654 });
    fireEvent.click(fitBtn);
    expect(zoomValue()).toBe("50%");
    Object.defineProperty(screen.getByTestId("board-scroll"), "clientWidth", { configurable: true, value: 5000 });
    fireEvent.click(fitBtn);
    expect(zoomValue()).toBe("100%");
  });

  it("adds the frozen-column shadow class when scrolled horizontally", () => {
    renderBoard(samplePlan());
    const box = screen.getByTestId("board-scroll");
    box.scrollLeft = 40;
    fireEvent.scroll(box);
    expect(box).toHaveClass("scrolledX");
    box.scrollLeft = 0;
    fireEvent.scroll(box);
    expect(box).not.toHaveClass("scrolledX");
  });

  describe("Releases/Sprints switch", () => {
    const radio = (name: string) => within(screen.getByRole("radiogroup", { name: "Milestones as" })).getByRole("radio", { name });

    it("reflects the mode and ignores clicking the current one", async () => {
      const user = userEvent.setup();
      renderBoard(samplePlan());
      expect(radio("Releases")).toHaveAttribute("aria-checked", "true");
      expect(radio("Sprints")).toHaveAttribute("aria-checked", "false");
      await user.click(radio("Releases"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("confirms with the template text; Cancel keeps the milestones", async () => {
      const user = userEvent.setup();
      renderBoard(samplePlan());
      await user.click(radio("Sprints"));
      const dialog = screen.getByRole("dialog", { name: "Switch milestone type" });
      expect(within(dialog).getByText(/^Switch milestones to Sprints\?/).textContent).toBe(
        "Switch milestones to Sprints?\n\nThe current milestones will be replaced by 3 sprints (Sprint 1, Sprint 2, Sprint 10) and ALL Features will be reset to their initial milestone: the sprint of their Iteration Path (e.g. Sprint 1).\n1 Features without a sprint will go to Unplanned.\n\nAny manual planning (and milestone flags) will be lost. Save the plan first if you want to keep it.",
      );
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(radio("Releases")).toHaveAttribute("aria-checked", "true");
      expect(summaryBox("MVP")).toBeInTheDocument();
    });

    it("switches to Sprints on confirm, then back to Releases", async () => {
      const user = userEvent.setup();
      renderBoard(samplePlan());
      await user.click(radio("Sprints"));
      await user.click(screen.getByRole("button", { name: "Switch" }));
      expect(radio("Sprints")).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("status")).toHaveTextContent("Milestones switched to Sprints");
      expect(featureCount("Sprint 10")).toBe("1");
      expect(featureCount("Unplanned")).toBe("1");

      await user.click(radio("Releases"));
      expect(screen.getByRole("dialog")).toHaveTextContent('replaced by a single "MVP" milestone');
      await user.click(screen.getByRole("button", { name: "Switch" }));
      expect(radio("Releases")).toHaveAttribute("aria-checked", "true");
      expect(featureCount("MVP")).toBe("5");
      expect(screen.getByText("Milestones switched to Releases")).toBeInTheDocument();
    });

    it("toasts and aborts when no feature has a sprint below the project root", async () => {
      const user = userEvent.setup();
      const plan = samplePlan({ epics: [makeEpic({ id: 9, features: [makeFeature({ id: 91, iterationPath: "Proj" })] })] });
      renderBoard(plan);
      await user.click(radio("Sprints"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("No Iteration Paths below the project root were found");
      expect(radio("Releases")).toHaveAttribute("aria-checked", "true");
    });
  });

  it("shows Sync from ADO, Load Plan, Save Plan and Export PNG in both the Board and Table views", () => {
    renderBoard(samplePlan());
    const toolbarButtons = () => screen.getAllByRole("button").filter((b) => b.closest(".toolbar")).map((b) => b.textContent);
    expect(toolbarButtons().slice(-4)).toEqual(["Sync from ADO", "Load Plan", "Save Plan", "Export PNG"]);
    fireEvent.click(screen.getByRole("tab", { name: "Table" }));
    expect(screen.queryByRole("group", { name: "Zoom" })).not.toBeInTheDocument();
    expect(toolbarButtons().slice(-4)).toEqual(["Sync from ADO", "Load Plan", "Save Plan", "Export PNG"]);
    expect(screen.getByRole("button", { name: "Load Plan" })).toHaveClass("btn");
    expect(screen.getByRole("button", { name: "Save Plan" })).toHaveClass("btn");
    expect(screen.getByRole("button", { name: "Export PNG" })).toHaveClass("btn", "primary");
    expect(screen.getByRole("button", { name: "Export PNG" })).toBeEnabled();
    expect(document.querySelector(".rp .toolbar .spacer")).not.toBeNull();
  });

  it("shows a decorative icon before the Sync from ADO / Load Plan / Save Plan labels in both views", () => {
    const { container } = renderBoard(samplePlan());
    const toolbar = () => {
      const el = container.querySelector<HTMLElement>(".rp .toolbar");
      if (!el) throw new Error("toolbar not rendered");
      return el;
    };
    const expectIcons = () => {
      for (const name of ["Sync from ADO", "Load Plan", "Save Plan"]) {
        const button = within(toolbar()).getByRole("button", { name });
        const svg = button.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg).toHaveAttribute("aria-hidden", "true");
        expect(button.firstElementChild).toBe(svg);
        expect(button).toHaveTextContent(name);
      }
    };
    expectIcons();
    fireEvent.click(within(toolbar()).getByRole("tab", { name: "Table" }));
    expectIcons();
  });

  describe("Save Plan", () => {
    const NOW = new Date("2026-10-21T09:15:00.000Z");
    let blobs: Blob[] = [];
    let downloads: string[] = [];

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOW);
      blobs = [];
      downloads = [];
      Object.assign(URL, {
        createObjectURL: (blob: Blob) => {
          blobs.push(blob);
          return "blob:plan";
        },
        revokeObjectURL: () => undefined,
      });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("downloads the plan JSON as <name>_<date>.json, toasts, and leaves the store untouched", async () => {
      const plan = samplePlan();
      const save = vi.fn<PlanStorage["save"]>();
      renderBoard(null, { load: () => plan, save });
      const savesBefore = save.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "Save Plan" }));

      expect(downloads).toEqual(["Sample_Release_Plan_2026-10-21.json"]);
      expect(blobs).toHaveLength(1);
      expect(blobs[0].type).toBe("application/json");
      expect(await readBlob(blobs[0])).toBe(planToJson(plan, NOW));
      expect(JSON.parse(await readBlob(blobs[0]))).toMatchObject({ schema: "release-planner-features", version: 1, savedAt: NOW.toISOString() });
      expect(screen.getAllByRole("status").some((s) => s.textContent === "Plan saved")).toBe(true);
      // No store change: no autosave and no savedAt in the in-memory plan.
      expect(save.mock.calls.length).toBe(savesBefore);
      expect(screen.getByLabelText("Plan name")).toHaveValue("Sample Release Plan");
    });
  });

  describe("Export PNG", () => {
    const NOW = new Date("2026-10-21T09:15:00.000Z");
    let downloads: string[] = [];

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOW);
      vi.stubGlobal("Image", FakeImage);
      FakeImage.reset();
      downloads = [];
      Object.assign(URL, { createObjectURL: () => "blob:png", revokeObjectURL: () => undefined });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
      stubCanvas({ context: new RecordingContext(), blob: new Blob(["png"], { type: "image/png" }) });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      FakeImage.reset();
    });

    for (const view of ["Board", "Table"] as const) {
      it(`downloads <name>_<date>.png and toasts from the ${view} view`, async () => {
        renderBoard(samplePlan());
        fireEvent.click(screen.getByRole("tab", { name: view }));
        fireEvent.click(screen.getByRole("button", { name: "Export PNG" }));
        expect(await screen.findByText("PNG exported")).toBeInTheDocument();
        expect(downloads).toEqual(["Sample_Release_Plan_2026-10-21.png"]);
      });
    }

    it("disables Export PNG while an export is running", async () => {
      FakeImage.hold = true;
      renderBoard(samplePlan());
      const button = screen.getByRole("button", { name: "Export PNG" });
      fireEvent.click(button);
      await waitFor(() => expect(button).toBeDisabled());
      fireEvent.click(button);
      act(() => FakeImage.release());
      expect(await screen.findByText("PNG exported")).toBeInTheDocument();
      expect(button).toBeEnabled();
      expect(downloads).toEqual(["Sample_Release_Plan_2026-10-21.png"]);
    });
  });

  describe("Load Plan", () => {
    const planFile = (plan: ReleasePlan, name = "other.json") => new File([JSON.stringify(plan)], name, { type: "application/json" });
    const otherPlan = () => samplePlan({ name: "Other Plan", milestones: [makeMilestone({ id: "ms_x", name: "Gamma" })], epics: [makeEpic({ id: 7, title: "Loaded Epic", features: [makeFeature({ id: 71, title: "Loaded Feature", milestoneId: "ms_x" })] })] });
    const loadDialog = () => screen.getByRole("dialog", { name: "Load a plan" });

    async function chooseFile(file: File) {
      const user = userEvent.setup();
      fireEvent.click(screen.getByRole("button", { name: "Load Plan" }));
      await user.upload(within(loadDialog()).getByLabelText("Release plan file"), file);
      await user.click(within(loadDialog()).getByRole("button", { name: "Load" }));
      return user;
    }

    it("shows an invalid file's error inline and keeps the board", async () => {
      renderBoard(samplePlan());
      await chooseFile(new File(["{oops"], "bad.json", { type: "application/json" }));
      expect(await within(loadDialog()).findByRole("alert")).toHaveTextContent("Could not read the file: it is not valid JSON.");
      expect(screen.queryByRole("dialog", { name: "Replace the current board?" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Plan name")).toHaveValue("Sample Release Plan");
    });

    it("asks to replace the board; Replace loads it, closes the dialogs, toasts and stays on the board", async () => {
      renderBoard(samplePlan());
      const user = await chooseFile(planFile(otherPlan()));
      const confirm = await screen.findByRole("dialog", { name: "Replace the current board?" });
      expect(confirm).toHaveTextContent(replaceBoardMessage("Sample Release Plan", "Other Plan"));
      await user.click(within(confirm).getByRole("button", { name: "Replace" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Plan name")).toHaveValue("Other Plan");
      expect(summaryBox("Gamma")).toBeInTheDocument();
      expect(screen.getByText("Loaded Feature")).toBeInTheDocument();
      expect(screen.getAllByRole("status").some((s) => s.textContent === "Plan loaded: Other Plan")).toBe(true);
      expect(location()).toBe("/release-plan/board");
    });

    it("Cancel closes only the confirmation and keeps the current board", async () => {
      renderBoard(samplePlan());
      const user = await chooseFile(planFile(otherPlan()));
      const confirm = await screen.findByRole("dialog", { name: "Replace the current board?" });
      await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog", { name: "Replace the current board?" })).not.toBeInTheDocument();
      expect(loadDialog()).toBeInTheDocument();
      expect(screen.getByLabelText("Plan name")).toHaveValue("Sample Release Plan");
      expect(summaryBox("MVP")).toBeInTheDocument();
    });

    it("clears the Ctrl+click selection and keeps the view and zoom after a load", async () => {
      renderBoard(samplePlan());
      const card = (title: string) => within(screen.getByRole("region", { name: "Board" })).getByRole("button", { name: new RegExp(title) });
      fireEvent.click(card("Reports"), { ctrlKey: true });
      expect(card("Reports")).toHaveClass("selected");
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      // Reload the same plan: the cards are the same, only the remount clears the selection.
      const user = await chooseFile(planFile(samplePlan({ name: "Same Cards" })));
      await user.click(await screen.findByRole("button", { name: "Replace" }));
      expect(screen.getByLabelText("Plan name")).toHaveValue("Same Cards");
      expect(card("Reports")).not.toHaveClass("selected");
      expect(document.querySelectorAll(".fcard.selected")).toHaveLength(0);
      expect(zoomValue()).toBe("110%");
      expect(screen.getByRole("tab", { name: "Board" })).toHaveAttribute("aria-selected", "true");
    });

    it("closes the open work-item modal when a plan is loaded", async () => {
      renderBoard(samplePlan());
      fireEvent.click(within(screen.getByRole("region", { name: "Board" })).getByRole("button", { name: /Reports/ }));
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      const workItem = screen.getByRole("dialog");
      expect(workItem).not.toHaveAccessibleName("Load a plan");
      const user = await chooseFile(planFile(otherPlan()));
      await user.click(await screen.findByRole("button", { name: "Replace" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("Sync from ADO", () => {
    const PAT = "sync-pat-value";
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    /** The board created from the default backlog (Epic 101: 102, 104; Epic 103: 105; synthetic: 106, 107). */
    const adoPlan = () => planFromBacklog(makeBacklog(), makeConnection(), sequentialIds());
    /** Default backlog with Feature 102 renamed, a new Feature 108 under Epic 101, Feature 105 gone, and one warning. */
    const changedBacklog = () => {
      const base = makeBacklog();
      return makeBacklog({
        fetchedAt: "2026-10-24T09:00:00Z",
        warnings: ["The field Custom.EstimatedSize does not exist in this project; sizes are empty."],
        workItems: [
          ...base.workItems.filter((i) => i.id !== 105).map((i) => (i.id === 102 ? { ...i, title: "Sign in" } : i)),
          makeFeatureItem({ id: 108, title: "Search", parentId: 101 }),
        ],
      });
    };
    const connectDialog = () => screen.getByRole("dialog", { name: "Sync from Azure DevOps" });
    const toasts = () => screen.getAllByRole("status").map((s) => s.textContent);

    function mockFetch(backlog: AdoBacklog = changedBacklog()) {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/ado/connect") {
          return json(makeConnectResponse());
        }
        if (url === "/api/ado/backlog") {
          return json(backlog);
        }
        throw new Error(`unexpected ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    /** Toolbar → connection form (pre-filled) → PAT → Connect → Preview changes → the preview dialog. */
    async function openPreview(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: "Sync from ADO" }));
      await user.type(within(connectDialog()).getByLabelText("Personal Access Token"), PAT);
      await user.click(within(connectDialog()).getByRole("button", { name: "Connect" }));
      await within(connectDialog()).findByRole("tree", { name: "Area path" });
      await user.click(within(connectDialog()).getByRole("button", { name: "Preview changes" }));
      return screen.findByRole("button", { name: "Apply" });
    }

    beforeEach(() => window.localStorage.clear());
    afterEach(() => {
      vi.unstubAllGlobals();
      window.localStorage.clear();
    });

    it("pre-fills the connection and the path from plan.source (never a PAT)", async () => {
      const user = userEvent.setup();
      mockFetch();
      renderBoard(adoPlan());
      await user.click(screen.getByRole("button", { name: "Sync from ADO" }));
      const dialog = connectDialog();
      expect(within(dialog).getByRole("radio", { name: "Collaboration Hub" })).toBeChecked();
      expect(within(dialog).getByLabelText("Project URL")).toHaveValue("https://dev.azure.com/org/Proj");
      expect(within(dialog).getByLabelText("Personal Access Token")).toHaveValue("");
      await user.type(within(dialog).getByLabelText("Personal Access Token"), PAT);
      await user.click(within(dialog).getByRole("button", { name: "Connect" }));
      const tree = await within(dialog).findByRole("tree", { name: "Area path" });
      expect(within(tree).getByRole("treeitem", { name: /^Team A/ })).toHaveAttribute("aria-selected", "true");
      expect(within(dialog).getByRole("button", { name: "Preview changes" })).toBeEnabled();
    });

    it("shows an empty form (default Collaboration Hub source) for an old plan without connection info", async () => {
      const user = userEvent.setup();
      renderBoard(samplePlan());
      await user.click(screen.getByRole("button", { name: "Sync from ADO" }));
      const dialog = connectDialog();
      expect(within(dialog).getByRole("radio", { name: "On-Prem" })).not.toBeChecked();
      expect(within(dialog).getByRole("radio", { name: "Collaboration Hub" })).toBeChecked();
      expect(within(dialog).getByLabelText("Project URL")).toHaveValue("");
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("previews the diff; Apply updates the board in one autosave, closes the work-item modal and toasts with the warnings", async () => {
      const user = userEvent.setup();
      mockFetch();
      const save = vi.fn<PlanStorage["save"]>();
      renderBoard(null, { load: () => adoPlan(), save });
      await openPreview(user);
      const preview = screen.getByRole("dialog", { name: "Sync from Azure DevOps" });
      expect(within(preview).queryByLabelText("Personal Access Token")).not.toBeInTheDocument();
      expect([...preview.querySelectorAll("summary")].map((s) => s.textContent)).toEqual(["1 new Feature", "1 updated", "1 no longer in scope"]);
      expect(within(preview).getByRole("checkbox", { name: "Remove items no longer in scope" })).not.toBeChecked();
      const savesBefore = save.mock.calls.length;
      await user.click(screen.getByRole("button", { name: "Apply" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(save.mock.calls.length - savesBefore).toBe(1);
      const saved = save.mock.lastCall?.[0];
      expect(saved?.epics[0].features.map((f) => [f.id, f.title, f.milestoneId])).toEqual([
        [102, "Sign in", "ms_1"],
        [104, "Dashboard", "ms_1"],
        [108, "Search", null],
      ]);
      // Not removed: the box was unticked.
      expect(saved?.epics[1].features.map((f) => f.id)).toEqual([105]);
      expect(saved?.source.fetchedAt).toBe("2026-10-24T09:00:00Z");
      const board = within(screen.getByRole("region", { name: "Board" }));
      expect(board.getByText("Sign in")).toBeInTheDocument();
      expect(board.getByText("Search")).toBeInTheDocument();
      expect(toasts()).toEqual(
        expect.arrayContaining(["Board synchronized with Azure DevOps", "The field Custom.EstimatedSize does not exist in this project; sizes are empty."]),
      );
      for (let i = 0; i < window.localStorage.length; i++) {
        expect(window.localStorage.getItem(window.localStorage.key(i) ?? "")).not.toContain(PAT);
      }
    });

    it("removes the items no longer in scope when the box is ticked", async () => {
      const user = userEvent.setup();
      mockFetch();
      renderBoard(adoPlan());
      await openPreview(user);
      await user.click(screen.getByRole("checkbox", { name: "Remove items no longer in scope" }));
      await user.click(screen.getByRole("button", { name: "Apply" }));
      expect(within(screen.getByRole("region", { name: "Board" })).queryByText("Reports")).not.toBeInTheDocument();
    });

    it("closes a work-item modal that was open when the sync is applied", async () => {
      const user = userEvent.setup();
      mockFetch();
      renderBoard(adoPlan());
      fireEvent.click(within(screen.getByRole("region", { name: "Board" })).getByRole("button", { name: /Reports/ }));
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      await openPreview(user);
      await user.click(screen.getByRole("button", { name: "Apply" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("says the board is up to date when nothing changed", async () => {
      const user = userEvent.setup();
      mockFetch(makeBacklog());
      renderBoard(adoPlan());
      await openPreview(user);
      expect(screen.getByText("The board is up to date with Azure DevOps.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Apply" }));
      expect(toasts()).toContain("Board synchronized with Azure DevOps");
    });

    it("Cancel in the preview changes nothing and saves nothing", async () => {
      const user = userEvent.setup();
      mockFetch();
      const save = vi.fn<PlanStorage["save"]>();
      renderBoard(null, { load: () => adoPlan(), save });
      await openPreview(user);
      const savesBefore = save.mock.calls.length;
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(save.mock.calls.length).toBe(savesBefore);
      const board = within(screen.getByRole("region", { name: "Board" }));
      expect(board.getByText("Login")).toBeInTheDocument();
      expect(board.queryByText("Search")).not.toBeInTheDocument();
      // queryAll: there may be no toast at all once "Restored your last session" (2.2s) has auto-dismissed.
      expect(screen.queryAllByRole("status").map((s) => s.textContent)).not.toContain("Board synchronized with Azure DevOps");
    });
  });

  it("shows flag boxes in the summary for a Sprints plan", () => {
    renderBoard(sprintsPlan());
    const box = summaryBox("Flag Beta");
    expect(box).toHaveTextContent("after Sprint 1");
    expect(box).toHaveTextContent("1 Features (cumulative)");
    expect(box).toHaveTextContent("Epics completed by this flag: 0");
  });
});
