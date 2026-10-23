// QA integration tests for the read-only "Sync from ADO" connection (only the PAT is entered; the
// project URL and Area/Iteration path come from plan.source, which Save/Load Plan JSON round-trips).
// Real App routes, pages, store with the real localStorage autosave and real adoApi; only `fetch`
// and the browser download boundary are mocked.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ToastProvider } from "../components/Toast";
import { ADO_CONNECTION_KEY, STORAGE_KEY } from "../lib/releasePlan/constants";
import { planFromBacklog } from "../lib/releasePlan/fromBacklog";
import type { ReleasePlan } from "../lib/releasePlan/types";
import { ForecastProvider } from "../monteCarloStore";
import { makeBacklog, makeConnection } from "../test/adoFixtures";
import { samplePlan, sequentialIds } from "../test/releasePlanFixtures";

const PAT = "qa-readonly-sync-pat-0123456789";
const TIMEOUT = 30_000;
const FIND = { timeout: 5_000 };

const CLOUD = makeConnection({
  source: "cloud",
  projectUrl: "https://dev.azure.com/contoso/Board%20A",
  scopeType: "iteration",
  scopePath: "Board A\\Phase 1",
});
const ONPREM = makeConnection({
  source: "onprem",
  projectUrl: "https://tfs-projects.cmf.criticalmanufacturing.com/ImplementationProjects/Board%20B",
  scopeType: "area",
  scopePath: "Board B\\Team X",
});

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

type User = ReturnType<typeof userEvent.setup>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const location = () => screen.getByTestId("location").textContent;
const toolbar = () => {
  const el = document.querySelector<HTMLElement>(".rp .toolbar");
  if (!el) throw new Error("toolbar not rendered");
  return el;
};
const syncDialog = () => screen.getByRole("dialog", { name: "Sync from Azure DevOps" });
const shown = (dialog: HTMLElement, label: string) => within(dialog).queryByText(label, { selector: "dt" })?.nextElementSibling?.textContent ?? null;
const NOT_LINKED = "This board isn't linked to an Azure DevOps project, so it can't be synced.";

function linkedPlan(connection: typeof CLOUD, name: string): ReleasePlan {
  const backlog = makeBacklog({ projectUrl: connection.projectUrl, scope: `${connection.scopeType}: ${connection.scopePath}` });
  return { ...planFromBacklog(backlog, connection, sequentialIds()), name };
}

function planFile(plan: unknown, name: string): File {
  return new File([JSON.stringify(plan)], name, { type: "application/json" });
}

function mockBacklog() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input) === "/api/ado/backlog") {
      return json(makeBacklog());
    }
    return json({ errors: [`unexpected ${String(input)}`] }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openSync(user: User) {
  await user.click(within(toolbar()).getByRole("button", { name: "Sync from ADO" }));
  return syncDialog();
}

async function closeSync(user: User, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole("button", { name: /^(Cancel|Close)$/ }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
}

function expectConnectionShown(dialog: HTMLElement, c: typeof CLOUD) {
  expect(shown(dialog, "Azure DevOps source")).toBe(c.source === "cloud" ? "Collaboration Hub" : "On-Prem");
  expect(shown(dialog, "Project URL")).toBe(c.projectUrl);
  expect(shown(dialog, c.scopeType === "area" ? "Area path" : "Iteration path")).toBe(c.scopePath);
  expect(shown(dialog, c.scopeType === "area" ? "Iteration path" : "Area path")).toBeNull();
  // Nothing about the connection is editable: the PAT is the only form control besides the buttons.
  expect(within(dialog).queryAllByRole("radio")).toHaveLength(0);
  expect(within(dialog).queryAllByRole("textbox")).toHaveLength(0);
  expect(within(dialog).queryByRole("tree")).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
  expect(dialog.querySelectorAll("input")).toHaveLength(1);
  expect(within(dialog).getByLabelText("Personal Access Token")).toHaveValue("");
}

async function loadPlanFromToolbar(user: User, file: File) {
  await user.click(within(toolbar()).getByRole("button", { name: "Load Plan" }));
  const dialog = screen.getByRole("dialog", { name: "Load a plan" });
  await user.upload(within(dialog).getByLabelText("Release plan file"), file);
  await user.click(within(dialog).getByRole("button", { name: "Load" }));
  await user.click(await screen.findByRole("button", { name: "Replace" }, FIND));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), FIND);
}

async function importFromHome(user: User, file: File) {
  await user.click(within(screen.getByRole("navigation", { name: "Hub navigation" })).getByRole("link", { name: "Release Plan" }));
  await user.click(await screen.findByRole("button", { name: /Import a JSON file/ }, FIND));
  const dialog = screen.getByRole("dialog", { name: "Import a JSON file" });
  await user.upload(within(dialog).getByLabelText("Release plan file"), file);
  await user.click(within(dialog).getByRole("button", { name: "Create board" }));
  await user.click(await screen.findByRole("button", { name: "Replace" }, FIND));
  await waitFor(() => expect(location()).toBe("/release-plan/board"), FIND);
}

function captureDownloads(): Blob[] {
  const blobs: Blob[] = [];
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      blobs.push(blob);
      return "blob:plan";
    },
    revokeObjectURL: () => undefined,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return blobs;
}

const blobText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

describe("Release Plan – read-only Sync connection restored from JSON / storage (integration)", { timeout: TIMEOUT }, () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("Save Plan → Load Plan of another board → Load the saved file again: Sync always shows the loaded file's connection", async () => {
    const user = userEvent.setup();
    const blobs = captureDownloads();
    const fetchMock = mockBacklog();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(linkedPlan(CLOUD, "Board A")));
    renderApp("/release-plan/board");

    expectConnectionShown(await openSync(user), CLOUD);
    await closeSync(user, syncDialog());

    fireEvent.click(within(toolbar()).getByRole("button", { name: "Save Plan" }));
    expect(blobs).toHaveLength(1);
    const savedA = await blobText(blobs[0]);

    await loadPlanFromToolbar(user, planFile(linkedPlan(ONPREM, "Board B"), "b.json"));
    expectConnectionShown(await openSync(user), ONPREM);
    await closeSync(user, syncDialog());

    await loadPlanFromToolbar(user, new File([savedA], "a.json", { type: "application/json" }));
    const dialog = await openSync(user);
    expectConnectionShown(dialog, CLOUD);
    await user.type(within(dialog).getByLabelText("Personal Access Token"), PAT);
    await user.click(within(dialog).getByRole("button", { name: "Preview changes" }));
    await screen.findByRole("button", { name: "Apply" }, FIND);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ ...CLOUD, pat: PAT });
  });

  it("Load Plan of a file without a connection after a linked board: Sync says not linked, never the previous connection", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(linkedPlan(CLOUD, "Board A")));
    window.localStorage.setItem(ADO_CONNECTION_KEY, JSON.stringify({ source: "onprem", projectUrl: ONPREM.projectUrl }));
    const fetchMock = mockBacklog();
    renderApp("/release-plan/board");

    await loadPlanFromToolbar(user, planFile(samplePlan({ name: "Template board" }), "t.json"));
    const dialog = await openSync(user);
    expect(dialog).toHaveTextContent(NOT_LINKED);
    expect(dialog).not.toHaveTextContent(CLOUD.projectUrl);
    expect(dialog).not.toHaveTextContent(ONPREM.projectUrl);
    expect(within(dialog).queryByLabelText("Personal Access Token")).not.toBeInTheDocument();
    await closeSync(user, dialog);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("home-page import of a linked file replaces a different linked board's connection", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(linkedPlan(CLOUD, "Board A")));
    mockBacklog();
    renderApp("/release-plan/board");
    await importFromHome(user, planFile(linkedPlan(ONPREM, "Board B"), "b.json"));
    expectConnectionShown(await openSync(user), ONPREM);
  });

  it("the connection survives a reload (localStorage hydration) and Sync posts it", async () => {
    const user = userEvent.setup();
    const fetchMock = mockBacklog();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(linkedPlan(ONPREM, "Board B")));
    const first = renderApp("/release-plan/board");
    await loadPlanFromToolbar(user, planFile(linkedPlan(CLOUD, "Board A"), "a.json"));
    first.unmount();

    renderApp("/release-plan/board");
    const dialog = await openSync(user);
    expectConnectionShown(dialog, CLOUD);
    await user.type(within(dialog).getByLabelText("Personal Access Token"), `${PAT}{Enter}`);
    await screen.findByRole("button", { name: "Apply" }, FIND);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ ...CLOUD, pat: PAT });
    await user.click(screen.getByRole("button", { name: "Apply" }));
    // applySync writes the same connection back; the PAT is never persisted.
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!) as ReleasePlan;
    expect(stored.source).toMatchObject({ kind: CLOUD.source, projectUrl: CLOUD.projectUrl, scopeType: CLOUD.scopeType, scopePath: CLOUD.scopePath });
    expect(Object.values(window.localStorage).join("\n")).not.toContain(PAT);

    // A second sync after Apply still uses the same, unchanged connection.
    const again = await openSync(user);
    expectConnectionShown(again, CLOUD);
  });

  it.each([
    ["an unknown kind", { kind: "azure" }],
    ["an unknown scopeType", { scopeType: "team" }],
    ["no scopePath", { scopePath: undefined }],
    ["no projectUrl", { projectUrl: undefined }],
    ["a non-string projectUrl", { projectUrl: 42 }],
    ["an empty scopePath", { scopePath: "" }],
  ])("a JSON source with %s loads but the board is not linked", async (_label, patch) => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(linkedPlan(CLOUD, "Board A")));
    const fetchMock = mockBacklog();
    renderApp("/release-plan/board");
    const plan = linkedPlan(ONPREM, "Partial");
    await loadPlanFromToolbar(user, planFile({ ...plan, source: { ...plan.source, ...patch } }, "partial.json"));
    const dialog = await openSync(user);
    expect(dialog).toHaveTextContent(NOT_LINKED);
    expect(dialog).not.toHaveTextContent(CLOUD.projectUrl);
    await closeSync(user, dialog);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a whitespace-only scopePath from JSON is shown as-is and the server's 422 appears inline (no crash, nothing saved)", async () => {
    const user = userEvent.setup();
    const plan = linkedPlan(CLOUD, "Blank path");
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...plan, source: { ...plan.source, scopePath: "   " } }));
    const fetchMock = vi.fn(async () => json({ errors: ["Select an Area or Iteration path."] }, 422));
    vi.stubGlobal("fetch", fetchMock);
    renderApp("/release-plan/board");
    const dialog = await openSync(user);
    const before = window.localStorage.getItem(STORAGE_KEY);
    expect(within(dialog).getByLabelText("Personal Access Token")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Personal Access Token"), `${PAT}{Enter}`);
    expect(await within(dialog).findByRole("alert", {}, FIND)).toHaveTextContent("Select an Area or Iteration path.");
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("focus goes to the PAT input on open and returns to the Sync button on close", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(linkedPlan(CLOUD, "Board A")));
    renderApp("/release-plan/board");
    const button = within(toolbar()).getByRole("button", { name: "Sync from ADO" });
    await user.click(button);
    const dialog = syncDialog();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByLabelText("Personal Access Token")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});
