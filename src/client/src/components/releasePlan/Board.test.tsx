import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_EPIC_ID, NO_EPIC_TITLE } from "../../lib/releasePlan/types";
import { makeEpic, makeFeature, samplePlan, sprintsPlan } from "../../test/releasePlanFixtures";
import { BOARD_TEST_TIMEOUT_MS, renderBoard } from "../../test/renderBoard";

const board = () => screen.getByRole("region", { name: "Board" });
const msLabel = (name: string) => within(board()).getByRole("group", { name: `Milestone ${name}` });
const flagLabel = (name: string) => within(board()).getByRole("group", { name: `Milestone flag ${name}` });
const summaryNames = () =>
  within(screen.getByRole("region", { name: "Milestone summary" }))
    .getAllByRole("group")
    .map((g) => g.getAttribute("aria-label"));
const featureCount = (name: string) =>
  within(screen.getByRole("region", { name: "Milestone summary" })).getByRole("group", { name }).querySelector(".n")?.textContent;
const card = (title: string) => within(board()).getByRole("button", { name: new RegExp(title) });
const cellTop = (title: string) => (card(title).closest(".cell") as HTMLElement).style.top;
const epicTitles = () => [...board().querySelectorAll(".epic .name > span:first-child")].map((n) => n.textContent);

describe("Board", { timeout: BOARD_TEST_TIMEOUT_MS }, () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the synthetic 'Features without an Epic' header without an id", () => {
    const plan = samplePlan();
    renderBoard({ ...plan, epics: [...plan.epics, makeEpic({ id: NO_EPIC_ID, title: NO_EPIC_TITLE, features: [makeFeature({ id: 99, title: "Loose" })] })] });
    expect(epicTitles()).toContain(NO_EPIC_TITLE);
    const header = board().querySelector(`[data-epic="${NO_EPIC_ID}"] .meta`);
    expect(header).toHaveTextContent(/^Unplanned$/);
    expect(within(board()).queryByText(/#no-epic/)).not.toBeInTheDocument();
  });

  it("renders bands, epic headers, cards in their bands and the Unplanned label", () => {
    renderBoard(samplePlan());
    expect(within(msLabel("MVP")).getByLabelText("Milestone name")).toHaveValue("MVP");
    expect(within(msLabel("MVP")).getByText("2 Features")).toBeInTheDocument();
    expect(within(board()).getByRole("group", { name: "Unplanned" })).toHaveTextContent("1 Features · not assigned");
    expect(epicTitles()).toEqual(["Wave 1 - MVP", "Wave 2 - Reporting", "Wave 3 - Empty"]);
    expect(within(board()).getByText("Epic #1 · Done in MVP")).toBeInTheDocument();
    expect(within(board()).getByText("Epic #2 · Release 2 · 1 unplanned")).toBeInTheDocument();
    expect(within(board()).getByText("Epic #3 · No features")).toBeInTheDocument();
    expect(cellTop("Login page")).toBe("74px");
    expect(cellTop("Charts")).toBe("232px");
    expect(cellTop("Exports")).toBe("390px");
    expect(board().querySelectorAll(".fcard")).toHaveLength(5);
    expect(board().querySelectorAll(".cell")).toHaveLength(15);
  });

  it("renders card content, done mark and tooltip", () => {
    renderBoard(samplePlan());
    const login = card("Login page");
    expect(login).toHaveTextContent("Feature #11");
    expect(within(login).getByRole("img", { name: "Done" })).toHaveTextContent("✓");
    expect(login).toHaveClass("done");
    expect(within(card("Reports")).getByText("?")).toHaveClass("tsize", "none");
    expect(login).toHaveAttribute(
      "title",
      "Login page\nState: Done\nEstimated size: M\nIteration: Proj\\Sprint 1\nClick to see the description · Ctrl+click to select several features of this Epic",
    );
  });

  it("opens the work item modal from a card (click or Enter) and from an epic title", async () => {
    const user = userEvent.setup();
    renderBoard(samplePlan());
    await user.click(card("Dashboard"));
    expect(screen.getByRole("dialog", { name: "Dashboard" })).toHaveTextContent("FEATURE");
    await user.click(screen.getByRole("button", { name: "Close" }));
    card("Charts").focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Charts" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(within(board()).getByRole("button", { name: /Wave 2 - Reporting/ }));
    expect(screen.getByRole("dialog", { name: "Wave 2 - Reporting" })).toHaveTextContent("EPIC");
  });

  it("moves epics with ◀/▶ (no-op at the ends)", async () => {
    const user = userEvent.setup();
    renderBoard(samplePlan());
    const [left1] = within(board()).getAllByRole("button", { name: "Move Epic left" });
    await user.click(left1);
    expect(epicTitles()).toEqual(["Wave 1 - MVP", "Wave 2 - Reporting", "Wave 3 - Empty"]);
    await user.click(within(board()).getAllByRole("button", { name: "Move Epic right" })[0]);
    expect(epicTitles()).toEqual(["Wave 2 - Reporting", "Wave 1 - MVP", "Wave 3 - Empty"]);
    await user.click(within(board()).getAllByRole("button", { name: "Move Epic right" })[2]);
    expect(epicTitles()).toEqual(["Wave 2 - Reporting", "Wave 1 - MVP", "Wave 3 - Empty"]);
  });

  describe("milestone labels", () => {
    it("renames on commit (trim, empty → 'Milestone') and sets the date", async () => {
      const user = userEvent.setup();
      renderBoard(samplePlan());
      const name = within(msLabel("Release 2")).getByLabelText("Milestone name");
      await user.clear(name);
      await user.type(name, " Beta {Enter}");
      expect(summaryNames()).toContain("Beta");
      const renamed = within(msLabel("Beta")).getByLabelText("Milestone name");
      await user.clear(renamed);
      await user.tab();
      expect(summaryNames()).toContain("Milestone");
      fireEvent.change(within(msLabel("Milestone")).getByLabelText("Milestone date"), { target: { value: "2027-01-15" } });
      expect(within(msLabel("Milestone")).getByLabelText("Milestone date")).toHaveValue("2027-01-15");
      expect(within(screen.getByRole("region", { name: "Milestone summary" })).getByRole("group", { name: "Milestone" })).not.toHaveTextContent(
        "No date",
      );
    });

    it("moves milestones with ▲/▼, disabled at the ends", async () => {
      const user = userEvent.setup();
      renderBoard(samplePlan());
      expect(within(msLabel("MVP")).getByRole("button", { name: "Move up" })).toBeDisabled();
      expect(within(msLabel("Release 2")).getByRole("button", { name: "Move down" })).toBeDisabled();
      await user.click(within(msLabel("MVP")).getByRole("button", { name: "Move down" }));
      expect(summaryNames()).toEqual(["Release 2", "MVP", "Unplanned"]);
      expect(cellTop("Login page")).toBe("232px");
      await user.click(within(msLabel("MVP")).getByRole("button", { name: "Move up" }));
      expect(summaryNames()).toEqual(["MVP", "Release 2", "Unplanned"]);
    });

    it("deletes a milestone after confirmation; its features become unplanned", async () => {
      const user = userEvent.setup();
      renderBoard(samplePlan());
      await user.click(within(msLabel("MVP")).getByRole("button", { name: "Delete milestone" }));
      const dialog = screen.getByRole("dialog", { name: "Delete milestone" });
      expect(dialog).toHaveTextContent('Delete milestone "MVP"? Its 2 features become unplanned.');
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(summaryNames()).toContain("MVP");

      await user.click(within(msLabel("MVP")).getByRole("button", { name: "Delete milestone" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(summaryNames()).toEqual(["Release 2", "Unplanned"]);
      expect(featureCount("Unplanned")).toBe("3");
    });
  });

  describe('"+" gap buttons', () => {
    it("has no '+' before the first milestone", () => {
      renderBoard(samplePlan());
      expect(within(board()).getAllByRole("button", { name: /^Insert after/ }).map((b) => b.getAttribute("aria-label"))).toEqual([
        "Insert after MVP",
        "Insert after Release 2",
      ]);
    });

    it("inserts 'Release <n>' in Releases mode, toasts, and focuses/selects its name", async () => {
      const user = userEvent.setup();
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      renderBoard(samplePlan());
      await user.click(within(board()).getByRole("button", { name: "Insert after MVP" }));
      expect(summaryNames()).toEqual(["MVP", "Release 3", "Release 2", "Unplanned"]);
      expect(screen.getByRole("status")).toHaveTextContent("Milestone added");
      const input = within(msLabel("Release 3")).getByLabelText("Milestone name") as HTMLInputElement;
      expect(input).toHaveFocus();
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, "Release 3".length]);
      expect(scrollIntoView).toHaveBeenCalled();
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    });

    it("opens the gap menu in Sprints mode: add a sprint", async () => {
      const user = userEvent.setup();
      renderBoard(sprintsPlan());
      await user.click(within(board()).getByRole("button", { name: "Insert after Sprint 2" }));
      const menu = screen.getByRole("menu");
      expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["+ Add sprint here", " Add milestone flag here"]);
      expect(within(menu).getAllByRole("menuitem")[0]).toHaveFocus();
      await user.click(within(menu).getByRole("menuitem", { name: /Add sprint here/ }));
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(summaryNames()).toEqual(["Sprint 1", "Flag Beta", "Sprint 2", "New Sprint", "Unplanned"]);
      expect(screen.getByRole("status")).toHaveTextContent("Sprint added");
      expect(within(msLabel("New Sprint")).getByLabelText("Milestone name")).toHaveFocus();
    });

    it("adds a milestone flag from the gap menu and focuses its name", async () => {
      const user = userEvent.setup();
      renderBoard(sprintsPlan());
      await user.click(within(board()).getByRole("button", { name: "Insert after Sprint 2" }));
      await user.click(screen.getByRole("menuitem", { name: /Add milestone flag here/ }));
      expect(screen.getByRole("status")).toHaveTextContent("Milestone flag added after Sprint 2");
      const input = within(flagLabel("Milestone")).getByLabelText("Flag name");
      expect(input).toHaveFocus();
      expect(within(flagLabel("Milestone")).getByLabelText("Flag date")).toHaveValue("2026-10-02");
      expect(summaryNames()).toContain("Flag Milestone");
    });

    it("closes the gap menu on Escape, an outside click and a late board scroll", async () => {
      const user = userEvent.setup();
      renderBoard(sprintsPlan());
      const plus = () => within(board()).getByRole("button", { name: "Insert after Sprint 1" });
      await user.click(plus());
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      await user.click(plus());
      await user.click(screen.getByLabelText("Plan name"));
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();

      const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
      await user.click(plus());
      fireEvent.scroll(screen.getByTestId("board-scroll"));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      now.mockReturnValue(1_500);
      fireEvent.scroll(screen.getByTestId("board-scroll"));
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  describe("flags", () => {
    it("renders the flag row tag and label", () => {
      renderBoard(sprintsPlan());
      expect(within(flagLabel("Beta")).getByLabelText("Flag name")).toHaveValue("Beta");
      expect(board().querySelector(".flagtag")).toHaveTextContent(/^Beta · /);
      expect(within(flagLabel("Beta")).getByRole("button", { name: "Set flag date" })).toHaveAttribute("title", expect.stringMatching(/^Set flag date \(/));
    });

    it("renames (trim, empty → 'Milestone') and removes a flag", async () => {
      const user = userEvent.setup();
      renderBoard(sprintsPlan());
      const name = within(flagLabel("Beta")).getByLabelText("Flag name");
      await user.clear(name);
      await user.type(name, " RC {Enter}");
      expect(summaryNames()).toContain("Flag RC");
      const renamed = within(flagLabel("RC")).getByLabelText("Flag name");
      await user.clear(renamed);
      await user.tab();
      expect(summaryNames()).toContain("Flag Milestone");
      await user.click(within(flagLabel("Milestone")).getByRole("button", { name: "Remove flag" }));
      expect(summaryNames()).toEqual(["Sprint 1", "Sprint 2", "Unplanned"]);
      expect(board().querySelector(".flagrow")).toBeNull();
    });

    it("📅 calls showPicker on the date input when available", async () => {
      const user = userEvent.setup();
      const showPicker = vi.fn();
      HTMLInputElement.prototype.showPicker = showPicker;
      try {
        renderBoard(sprintsPlan());
        await user.click(within(flagLabel("Beta")).getByRole("button", { name: "Set flag date" }));
        expect(showPicker).toHaveBeenCalledTimes(1);
        expect(within(flagLabel("Beta")).getByLabelText("Flag date")).not.toHaveClass("revealed");
      } finally {
        delete (HTMLInputElement.prototype as Partial<HTMLInputElement>).showPicker;
      }
    });

    it("📅 reveals the date input inline when showPicker is unavailable, and sets the date", async () => {
      const user = userEvent.setup();
      renderBoard(sprintsPlan());
      await user.click(within(flagLabel("Beta")).getByRole("button", { name: "Set flag date" }));
      const date = within(flagLabel("Beta")).getByLabelText("Flag date");
      expect(date).toHaveClass("revealed");
      expect(date).toHaveFocus();
      fireEvent.change(date, { target: { value: "2026-09-30" } });
      expect(within(flagLabel("Beta")).getByLabelText("Flag date")).toHaveValue("2026-09-30");
    });
  });
});
