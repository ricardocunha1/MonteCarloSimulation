import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useReleasePlan } from "../releasePlanStore";
import { samplePlan } from "../test/releasePlanFixtures";
import { renderAt } from "../test/render";
import { ReleasePlanHomePage } from "./ReleasePlanHomePage";

const adoCard = () => screen.getByRole("button", { name: /Create from Azure DevOps/ });
const location = () => screen.getByTestId("location").textContent;

/** Board stub that shows the store's plan name. */
function BoardStub() {
  const { plan } = useReleasePlan();
  return <p>board: {plan?.name ?? "none"}</p>;
}

const routes = { "/release-plan/board": <BoardStub /> };
const planFile = (name: string) =>
  new File([JSON.stringify(samplePlan({ name }))], "plan.json", { type: "application/json" });

async function importFile(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.click(screen.getByRole("button", { name: /Import a JSON file/ }));
  await user.upload(screen.getByLabelText("Release plan file"), file);
  await user.click(screen.getByRole("button", { name: "Create board" }));
}

describe("ReleasePlanHomePage", () => {
  it("renders inside the Release Plan layout with its title", () => {
    renderAt("/release-plan", <ReleasePlanHomePage />);
    expect(screen.getByRole("heading", { level: 2, name: "Release Plan" })).toBeInTheDocument();
    expect(document.title).toBe("CM Estimations Hub – Release Plan");
  });

  it("shows the Azure DevOps card as disabled with a Coming soon badge", () => {
    renderAt("/release-plan", <ReleasePlanHomePage />);
    expect(adoCard()).toHaveAttribute("aria-disabled", "true");
    expect(adoCard()).toHaveTextContent("Coming soon");
  });

  it("does nothing when the Azure DevOps card is clicked", async () => {
    const user = userEvent.setup();
    renderAt("/release-plan", <ReleasePlanHomePage />);
    await user.click(adoCard());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location()).toBe("/release-plan");
  });

  it("opens and closes the import modal from the JSON card", async () => {
    const user = userEvent.setup();
    renderAt("/release-plan", <ReleasePlanHomePage />);
    await user.click(screen.getByRole("button", { name: /Import a JSON file/ }));
    expect(screen.getByRole("dialog", { name: "Import a JSON file" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has no Continue action without a plan", () => {
    renderAt("/release-plan", <ReleasePlanHomePage />);
    expect(screen.queryByRole("link", { name: "Continue last board" })).not.toBeInTheDocument();
  });

  it("imports a valid file: stores it, opens the board and toasts 'Plan loaded: <name>'", async () => {
    const user = userEvent.setup();
    renderAt("/release-plan", <ReleasePlanHomePage />, { routes });
    await importFile(user, planFile("Imported"));
    expect(await screen.findByText("board: Imported")).toBeInTheDocument();
    expect(location()).toBe("/release-plan/board");
    expect(screen.getByRole("status")).toHaveTextContent("Plan loaded: Imported");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the modal open with the inline error for an invalid file", async () => {
    const user = userEvent.setup();
    renderAt("/release-plan", <ReleasePlanHomePage />, { routes });
    await importFile(user, new File(["{bad"], "plan.json", { type: "application/json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read the file: it is not valid JSON.");
    expect(screen.getByRole("dialog", { name: "Import a JSON file" })).toBeInTheDocument();
    expect(location()).toBe("/release-plan");
  });

  it("shows Continue last board with the plan name and source info, linking to the board", async () => {
    const user = userEvent.setup();
    renderAt("/release-plan", <ReleasePlanHomePage />, { routes, initialPlan: samplePlan() });
    const section = screen.getByRole("region", { name: "Last board" });
    expect(within(section).getByText("Sample Release Plan")).toBeInTheDocument();
    expect(within(section).getByText(/Azure DevOps · Area Path: Proj\\Team/)).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Continue last board" }));
    expect(location()).toBe("/release-plan/board");
    expect(screen.getByText("board: Sample Release Plan")).toBeInTheDocument();
  });

  it("asks 'Replace the current board?' before overwriting; Cancel keeps the current plan", async () => {
    const user = userEvent.setup();
    renderAt("/release-plan", <ReleasePlanHomePage />, { routes, initialPlan: samplePlan() });
    await importFile(user, planFile("Other"));
    const confirm = await screen.findByRole("dialog", { name: "Replace the current board?" });
    expect(confirm).toHaveTextContent('"Sample Release Plan" will be replaced by "Other"');
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Replace the current board?" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Import a JSON file" })).toBeInTheDocument();
    expect(location()).toBe("/release-plan");
    expect(within(screen.getByRole("region", { name: "Last board" })).getByText("Sample Release Plan")).toBeInTheDocument();
  });

  it("replaces the current plan after confirmation", async () => {
    const user = userEvent.setup();
    renderAt("/release-plan", <ReleasePlanHomePage />, { routes, initialPlan: samplePlan() });
    await importFile(user, planFile("Other"));
    await user.click(await screen.findByRole("button", { name: "Replace" }));
    expect(await screen.findByText("board: Other")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Plan loaded: Other");
  });
});
