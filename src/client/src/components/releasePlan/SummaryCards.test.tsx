import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fmtDate } from "../../lib/releasePlan/selectors";
import { makePlan, samplePlan, sprintsPlan } from "../../test/releasePlanFixtures";
import { SummaryCards } from "./SummaryCards";

const box = (name: string) => within(screen.getByRole("region", { name: "Milestone summary" })).getByRole("group", { name });

describe("SummaryCards", () => {
  it("shows one box per milestone and Unplanned with counts, dates and epic stats", () => {
    render(<SummaryCards plan={samplePlan()} />);
    expect(box("MVP")).toHaveTextContent(`MVP${fmtDate("2026-11-30")}2 Features`);
    expect(box("MVP")).toHaveTextContent("Epics completed: 1");
    expect(box("MVP")).toHaveStyle({ "--msc": "#4E98D1" });
    expect(box("Release 2")).toHaveTextContent("No date");
    expect(box("Release 2")).toHaveTextContent("Epics completed: 0");
    expect(box("Unplanned")).toHaveTextContent("No milestone");
    expect(box("Unplanned")).toHaveTextContent("Epics with unplanned features: 1");
    expect(box("Unplanned").querySelector(".n")).toHaveTextContent("1");
  });

  it("places flag boxes after their milestone with cumulative counts", () => {
    render(<SummaryCards plan={sprintsPlan()} />);
    const names = within(screen.getByRole("region", { name: "Milestone summary" }))
      .getAllByRole("group")
      .map((g) => g.getAttribute("aria-label"));
    expect(names).toEqual(["Sprint 1", "Flag Beta", "Sprint 2", "Unplanned"]);
    expect(box("Flag Beta")).toHaveClass("flag");
    expect(box("Flag Beta")).toHaveTextContent(`${fmtDate("2026-09-25")} · after Sprint 1`);
  });

  it("shows 'No features' chips when a band is empty", () => {
    render(<SummaryCards plan={makePlan()} />);
    expect(box("Unplanned")).toHaveTextContent("No features");
  });
});
