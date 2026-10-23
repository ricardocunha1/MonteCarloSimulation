import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReleasePlan } from "../releasePlanStore";
import { makeBacklog, makeConnectResponse } from "../test/adoFixtures";
import { samplePlan } from "../test/releasePlanFixtures";
import { renderAt } from "../test/render";
import { ReleasePlanHomePage } from "./ReleasePlanHomePage";

const adoCard = () => screen.getByRole("button", { name: /Create from Azure DevOps/ });
const location = () => screen.getByTestId("location").textContent;

/** Board stub that shows the store's plan name (and its Epic titles). */
function BoardStub() {
  const { plan } = useReleasePlan();
  return (
    <>
      <p>board: {plan?.name ?? "none"}</p>
      <p data-testid="board-epics">{plan?.epics.map((e) => e.title).join(" | ")}</p>
    </>
  );
}

const routes = { "/release-plan/board": <BoardStub /> };
const planFile = (name: string) =>
  new File([JSON.stringify(samplePlan({ name }))], "plan.json", { type: "application/json" });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Stubs `fetch` for the two ADO routes with synthetic fixtures. */
function mockAdo(backlog = makeBacklog()) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    String(input) === "/api/ado/connect" ? json(makeConnectResponse()) : json(backlog),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Runs the ADO modal: Collaboration Hub, URL, PAT, Connect, "Team A", Create board. */
async function createFromAdo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(adoCard());
  const dialog = screen.getByRole("dialog", { name: "Create from Azure DevOps" });
  await user.click(within(dialog).getByRole("radio", { name: "Collaboration Hub" }));
  await user.type(within(dialog).getByLabelText("Project URL"), "https://dev.azure.com/org/Proj");
  await user.type(within(dialog).getByLabelText("Personal Access Token"), "pat-value");
  await user.click(within(dialog).getByRole("button", { name: "Connect" }));
  await user.click(within(await screen.findByRole("tree", { name: "Area path" })).getByRole("treeitem", { name: /^Team A/ }));
  await user.click(within(dialog).getByRole("button", { name: "Create board" }));
}

async function importFile(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.click(screen.getByRole("button", { name: /Import a JSON file/ }));
  await user.upload(screen.getByLabelText("Release plan file"), file);
  await user.click(screen.getByRole("button", { name: "Create board" }));
}

describe("ReleasePlanHomePage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders inside the Release Plan layout with its title", () => {
    renderAt("/release-plan", <ReleasePlanHomePage />);
    expect(screen.queryByRole("heading", { name: "Release Plan" })).not.toBeInTheDocument();
    expect(document.title).toBe("Planning Hub – Release Plan");
  });

  it("shows the Azure DevOps card enabled (no Coming soon badge)", () => {
    renderAt("/release-plan", <ReleasePlanHomePage />);
    expect(adoCard()).toBeEnabled();
    expect(adoCard()).not.toHaveAttribute("aria-disabled");
    expect(adoCard()).not.toHaveTextContent("Coming soon");
  });

  it("opens and closes the Azure DevOps modal from its card", async () => {
    const user = userEvent.setup();
    renderAt("/release-plan", <ReleasePlanHomePage />);
    await user.click(adoCard());
    expect(screen.getByRole("dialog", { name: "Create from Azure DevOps" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location()).toBe("/release-plan");
  });

  it("creates a board from Azure DevOps: stores it, opens the board and toasts 'Plan loaded' and the warnings", async () => {
    const user = userEvent.setup();
    const warning = "The field Custom.EstimatedSize does not exist in this project; sizes are empty.";
    mockAdo(makeBacklog({ warnings: [warning] }));
    renderAt("/release-plan", <ReleasePlanHomePage />, { routes });
    await createFromAdo(user);
    expect(await screen.findByText("board: Proj – Feature Release Plan")).toBeInTheDocument();
    expect(screen.getByTestId("board-epics")).toHaveTextContent("Wave 1 | Wave 2 | Features without an Epic");
    expect(location()).toBe("/release-plan/board");
    const toasts = screen.getAllByRole("status").map((el) => el.textContent);
    expect(toasts.some((t) => t?.includes("Plan loaded: Proj – Feature Release Plan"))).toBe(true);
    expect(toasts.some((t) => t?.includes(warning))).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks before replacing a plan with an Azure DevOps board; Cancel keeps the modal and the plan", async () => {
    const user = userEvent.setup();
    mockAdo();
    renderAt("/release-plan", <ReleasePlanHomePage />, { routes, initialPlan: samplePlan() });
    await createFromAdo(user);
    const confirm = await screen.findByRole("dialog", { name: "Replace the current board?" });
    expect(confirm).toHaveTextContent('"Sample Release Plan" will be replaced by "Proj – Feature Release Plan"');
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Create from Azure DevOps" })).toBeInTheDocument();
    expect(location()).toBe("/release-plan");
    await user.click(screen.getByRole("button", { name: "Create board" }));
    await user.click(await screen.findByRole("button", { name: "Replace" }));
    expect(await screen.findByText("board: Proj – Feature Release Plan")).toBeInTheDocument();
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
