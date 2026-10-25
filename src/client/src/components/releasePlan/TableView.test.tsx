import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { samplePlan, sprintsPlan } from "../../test/releasePlanFixtures";
import { BOARD_TEST_TIMEOUT_MS, renderBoard } from "../../test/renderBoard";

async function openTable(plan = samplePlan()) {
  const user = userEvent.setup();
  renderBoard(plan);
  await user.click(screen.getByRole("tab", { name: "Table" }));
  return user;
}

const rowTitles = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[1].textContent);
const count = () => screen.getByText(/features shown$/).textContent;

describe("TableView", { timeout: BOARD_TEST_TIMEOUT_MS }, () => {
  it("lists Epic rows (with ≥1 feature) and Feature rows with their columns", async () => {
    await openTable();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["ID", "Title", "State", "Estimated size", "Milestone"]);
    expect(rowTitles()).toEqual([
      "EPICWave 1 - MVP",
      "FEATURELogin page",
      "FEATUREDashboard",
      "EPICWave 2 - Reporting",
      "FEATUREReports",
      "FEATUREExports",
      "FEATURECharts",
    ]);
    expect(count()).toBe("5 features shown");
    const epic2 = screen.getAllByRole("row")[4];
    expect(epic2).toHaveClass("epicrow");
    expect(within(epic2).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "#2",
      "EPICWave 2 - Reporting",
      "New",
      "S×1 · JUMBO×1 · ?×1",
      "Unplanned (latest: Release 2, 1 unplanned)",
    ]);
    const epic1 = screen.getAllByRole("row")[1];
    expect(within(epic1).getAllByRole("cell")[4]).toHaveTextContent(/^MVP$/);
  });

  it("filters by text on the Feature or its Epic (title or ID)", async () => {
    const user = await openTable();
    const search = screen.getByRole("textbox", { name: "Search" });
    await user.type(search, "dash");
    expect(rowTitles()).toEqual(["EPICWave 1 - MVP", "FEATUREDashboard"]);
    await user.clear(search);
    await user.type(search, "23");
    expect(rowTitles()).toEqual(["EPICWave 2 - Reporting", "FEATURECharts"]);
    await user.clear(search);
    await user.type(search, "reporting");
    expect(count()).toBe("3 features shown");
    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getAllByRole("row")).toHaveLength(1);
    expect(count()).toBe("0 features shown");
  });

  it("filters by Epic and by milestone (including Unplanned)", async () => {
    const user = await openTable();
    expect(within(screen.getByRole("combobox", { name: "Filter by Epic" })).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All Epics",
      "Wave 1 - MVP",
      "Wave 2 - Reporting",
      "Wave 3 - Empty",
    ]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by Epic" }), "Wave 2 - Reporting");
    expect(count()).toBe("3 features shown");
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by milestone" }), "Unplanned");
    expect(rowTitles()).toEqual(["EPICWave 2 - Reporting", "FEATUREExports"]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by Epic" }), "All Epics");
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by milestone" }), "MVP");
    expect(rowTitles()).toEqual(["EPICWave 1 - MVP", "FEATURELogin page", "FEATUREDashboard"]);
  });

  it("changes a Feature's milestone from its select ('name (date)' options) and keeps valid filters", async () => {
    const user = await openTable();
    const msFilter = screen.getByRole("combobox", { name: "Filter by milestone" });
    await user.selectOptions(msFilter, "MVP");
    const select = screen.getByRole("combobox", { name: "Milestone for Dashboard" });
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options[0]).toBe("Unplanned");
    expect(options[1]).toMatch(/^MVP \(.+\)$/);
    expect(options[2]).toBe("Release 2");
    expect(select).toHaveValue("ms_mvp");
    await user.selectOptions(select, "Release 2");
    // Still filtered on MVP: Dashboard left it.
    expect(msFilter).toHaveValue("ms_mvp");
    expect(rowTitles()).toEqual(["EPICWave 1 - MVP", "FEATURELogin page"]);
    await user.selectOptions(msFilter, "Release 2");
    expect(screen.getByRole("combobox", { name: "Milestone for Dashboard" })).toHaveValue("ms_r2");
    await user.selectOptions(screen.getByRole("combobox", { name: "Milestone for Dashboard" }), "Unplanned");
    await user.selectOptions(msFilter, "Unplanned");
    expect(rowTitles()).toContain("FEATUREDashboard");
  });

  it("shows the Milestone flag column only when there are flags", async () => {
    await openTable(sprintsPlan());
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toContain("Milestone flag");
    const first = screen.getAllByRole("row").find((r) => within(r).queryByText("First"));
    expect(first && within(first).getAllByRole("cell")[5]).toHaveTextContent("Beta");
    const second = screen.getAllByRole("row").find((r) => within(r).queryByText("Second"));
    expect(second && within(second).getAllByRole("cell")[5]).toHaveTextContent("–");
  });

  it("opens the details modal from title links", async () => {
    const user = await openTable();
    await user.click(screen.getByRole("button", { name: "Charts" }));
    expect(screen.getByRole("dialog", { name: "Charts" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Wave 1 - MVP" }));
    expect(screen.getByRole("dialog", { name: "Wave 1 - MVP" })).toBeInTheDocument();
  });
});
