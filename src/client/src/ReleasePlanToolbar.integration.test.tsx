import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ToastProvider } from "./components/Toast";
import { STORAGE_KEY } from "./lib/releasePlan/constants";
import { ForecastProvider } from "./monteCarloStore";
import { makeEpic, makeFeature, makeMilestone, samplePlan } from "./test/releasePlanFixtures";

// Board toolbar "Load Plan" / "Save Plan" (with their decorative icons) through
// the real App routes, the real ReleasePlanProvider and the real jsdom
// localStorage. Only the browser download primitives are stubbed.

const FLOW_TIMEOUT_MS = 20_000;
const FIND = { timeout: 5_000 };

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderApp(path: string) {
  return render(
    <ToastProvider>
      <ForecastProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
          <LocationProbe />
        </MemoryRouter>
      </ForecastProvider>
    </ToastProvider>,
  );
}

const location = () => screen.getByTestId("location").textContent;
const toolbar = () => {
  const el = document.querySelector<HTMLElement>(".rp .toolbar");
  if (!el) throw new Error("toolbar not rendered");
  return el;
};
const savedName = () => (JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as { name: string } | null)?.name;

function expectDecoratedButtons() {
  for (const name of ["Sync from ADO", "Load Plan", "Save Plan"]) {
    // Exact accessible name: the icon contributes nothing to it.
    const button = within(toolbar()).getByRole("button", { name });
    expect(button).toHaveAccessibleName(name);
    const svgs = button.querySelectorAll("svg");
    expect(svgs).toHaveLength(1);
    expect(button.firstElementChild).toBe(svgs[0]);
    expect(svgs[0]).toHaveAttribute("aria-hidden", "true");
    expect(svgs[0]).toHaveAttribute("focusable", "false");
    expect(svgs[0]).toHaveClass("btnIcon");
    expect(button).toHaveClass("btn", "withIcon");
  }
  // The three icons differ (sync vs upload vs download), and no other toolbar button is decorated.
  const icons = ["Sync from ADO", "Load Plan", "Save Plan"].map((name) => within(toolbar()).getByRole("button", { name }).querySelector("svg")?.innerHTML);
  expect(new Set(icons).size).toBe(3);
  expect(toolbar().querySelectorAll(".btn.withIcon")).toHaveLength(3);
  expect(toolbar().querySelectorAll(".zoom .withIcon, .zoom svg")).toHaveLength(0);
}

describe("Release Plan – toolbar Load Plan / Save Plan through the app", () => {
  let blobs: Blob[] = [];
  let downloads: string[] = [];

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(samplePlan()));
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
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
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the decorated buttons in both views; Save Plan downloads from either view", () => {
    renderApp("/release-plan/board");
    expect(location()).toBe("/release-plan/board");
    expectDecoratedButtons();

    fireEvent.click(within(toolbar()).getByRole("button", { name: "Save Plan" }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^Sample_Release_Plan_\d{4}-\d{2}-\d{2}\.json$/);
    expect(blobs[0].type).toBe("application/json");

    fireEvent.click(within(toolbar()).getByRole("tab", { name: "Table" }));
    expect(screen.queryByRole("group", { name: "Zoom" })).not.toBeInTheDocument();
    expectDecoratedButtons();
    fireEvent.click(within(toolbar()).getByRole("button", { name: "Save Plan" }));
    expect(downloads).toHaveLength(2);
    expect(location()).toBe("/release-plan/board");
  });

  it(
    "Load Plan (from the Table view) replaces the board and autosaves it under the new key",
    async () => {
      const user = userEvent.setup();
      renderApp("/release-plan/board");
      await user.click(within(toolbar()).getByRole("tab", { name: "Table" }));
      await user.click(within(toolbar()).getByRole("button", { name: "Load Plan" }));
      const dialog = screen.getByRole("dialog", { name: "Load a plan" });
      const other = samplePlan({
        name: "Loaded Plan",
        milestones: [makeMilestone({ id: "ms_x", name: "Gamma" })],
        epics: [makeEpic({ id: 7, title: "Loaded Epic", features: [makeFeature({ id: 71, title: "Loaded Feature", milestoneId: "ms_x" })] })],
      });
      await user.upload(within(dialog).getByLabelText("Release plan file"), new File([JSON.stringify(other)], "p.json", { type: "application/json" }));
      await user.click(within(dialog).getByRole("button", { name: "Load" }));
      await user.click(await screen.findByRole("button", { name: "Replace" }, FIND));
      expect(await screen.findByText("Plan loaded: Loaded Plan", undefined, FIND)).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Plan name" })).toHaveValue("Loaded Plan");
      expect(location()).toBe("/release-plan/board");
      expect(savedName()).toBe("Loaded Plan");
      expectDecoratedButtons();
    },
    FLOW_TIMEOUT_MS,
  );

  it("does not read the pre-rename key (intended: no migration)", () => {
    window.localStorage.clear();
    window.localStorage.setItem("cmEstimationsHub.releasePlan.v1", JSON.stringify(samplePlan()));
    renderApp("/release-plan/board");
    expect(location()).toBe("/release-plan");
    expect(STORAGE_KEY).toBe("cmPlanningHub.releasePlan.v1");
  });
});
