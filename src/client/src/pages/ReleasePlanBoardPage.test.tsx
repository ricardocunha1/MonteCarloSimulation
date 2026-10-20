import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlanStorage } from "../lib/releasePlan/storage";
import { makeEpic, makeFeature, samplePlan, sprintsPlan } from "../test/releasePlanFixtures";
import { BOARD_TEST_TIMEOUT_MS, renderBoard } from "../test/renderBoard";

const location = () => screen.getByTestId("location").textContent;
const summaryBox = (name: string) => within(screen.getByRole("region", { name: "Milestone summary" })).getByRole("group", { name });
const featureCount = (name: string) => summaryBox(name).querySelector(".n")?.textContent;
const zoomValue = () => screen.getByTestId("zoom-value").textContent;

describe("ReleasePlanBoardPage", { timeout: BOARD_TEST_TIMEOUT_MS }, () => {
  it("redirects to /release-plan when there is no plan", () => {
    renderBoard(null);
    expect(location()).toBe("/release-plan");
    expect(screen.getByText("release plan home page")).toBeInTheDocument();
  });

  it("renders the board with its title, toolbar, summary and hint, and nothing draggable", () => {
    const { container } = renderBoard(samplePlan());
    expect(document.title).toBe("CM Estimations Hub – Release Plan – Board");
    expect(container.querySelector(".rp")).not.toBeNull();
    expect(screen.getByLabelText("Plan name")).toHaveValue("Sample Release Plan");
    expect(screen.getByTestId("source-info")).toHaveTextContent("Azure DevOps · Area Path: Proj\\Team");
    expect(screen.getByText(/Click any work item to see its description/)).toHaveTextContent(
      "Click any work item to see its description. Use the + between milestones to insert a new one (in Sprint mode, also a milestone flag). ✓ = Resolved / Done / Closed.",
    );
    expect(container.querySelector("[draggable]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Load Plan|Save Plan|Export PNG/ })).not.toBeInTheDocument();
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

  it("zooms with −/+ in 0.1 steps clamped to [30%, 150%], scales the board, and fits the scroll box", async () => {
    const user = userEvent.setup();
    renderBoard(samplePlan());
    expect(zoomValue()).toBe("100%");
    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByRole("button", { name: "Zoom in" }));
    }
    expect(zoomValue()).toBe("150%");
    expect(screen.getByTestId("board-scale")).toHaveStyle({ transform: "scale(1.5)", width: "1950px", height: "840px" });
    for (let i = 0; i < 15; i++) {
      await user.click(screen.getByRole("button", { name: "Zoom out" }));
    }
    expect(zoomValue()).toBe("30%");
    // Fit = min(1, (clientWidth - 4) / layout.width); the sample layout is 1300px wide.
    Object.defineProperty(screen.getByTestId("board-scroll"), "clientWidth", { configurable: true, value: 654 });
    await user.click(screen.getByRole("button", { name: "Fit" }));
    expect(zoomValue()).toBe("50%");
    Object.defineProperty(screen.getByTestId("board-scroll"), "clientWidth", { configurable: true, value: 5000 });
    await user.click(screen.getByRole("button", { name: "Fit" }));
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

  it("shows flag boxes in the summary for a Sprints plan", () => {
    renderBoard(sprintsPlan());
    const box = summaryBox("Flag Beta");
    expect(box).toHaveTextContent("after Sprint 1");
    expect(box).toHaveTextContent("1 Features (cumulative)");
    expect(box).toHaveTextContent("Epics completed by this flag: 0");
  });
});
