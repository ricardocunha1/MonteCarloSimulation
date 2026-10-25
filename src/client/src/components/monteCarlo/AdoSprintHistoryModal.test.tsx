import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ADO_CONNECTION_KEY } from "../../lib/monteCarlo/constants";
import { ADO_CONNECTION_KEY as RELEASE_PLAN_KEY } from "../../lib/releasePlan/constants";
import { makeConnectResponse } from "../../test/adoFixtures";
import { makeSprintHistory } from "../../test/monteCarloFixtures";
import { AdoSprintHistoryModal } from "./AdoSprintHistoryModal";

const PAT = "s3cr3t-pat-value";
const URL_OK = "https://dev.azure.com/org/Proj";

type Handler = (init: RequestInit) => Response | Promise<Response>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Stubs `fetch`, routing `/api/ado/connect` and `/api/ado/sprint-history` to the handlers (200 fixtures by default). */
function mockFetch(handlers: { connect?: Handler; history?: Handler } = {}): Mock {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url === "/api/ado/connect") {
      return handlers.connect ? handlers.connect(init) : json(makeConnectResponse());
    }
    if (url === "/api/ado/sprint-history") {
      return handlers.history ? handlers.history(init) : json(makeSprintHistory());
    }
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderModal() {
  const onClose = vi.fn();
  const onLoaded = vi.fn();
  const view = render(<AdoSprintHistoryModal open onClose={onClose} onLoaded={onLoaded} />);
  return { onClose, onLoaded, ...view };
}

const urlInput = () => screen.getByLabelText("Project URL");
const patInput = () => screen.getByLabelText("Personal Access Token");
const submitButton = () => screen.getByRole("button", { name: /^(Load sprint history|Loading work items…)$/ });

async function fillAndConnect(user: ReturnType<typeof userEvent.setup>, url = URL_OK) {
  await user.click(screen.getByRole("radio", { name: "Collaboration Hub" }));
  await user.clear(urlInput());
  await user.type(urlInput(), url);
  await user.type(patInput(), PAT);
  await user.click(screen.getByRole("button", { name: "Connect" }));
}

describe("AdoSprintHistoryModal", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders nothing when closed", () => {
    render(<AdoSprintHistoryModal open={false} onClose={vi.fn()} onLoaded={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has the Monte Carlo title, the connection fields and a disabled 'Load sprint history'", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Load from Azure DevOps" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("radio", { name: "On-Prem" })).toBeInTheDocument();
    expect(patInput()).toHaveAttribute("type", "password");
    expect(submitButton()).toHaveTextContent("Load sprint history");
    expect(submitButton()).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Sync/ })).not.toBeInTheDocument();
  });

  it("defaults to Collaboration Hub with its URL placeholder when no connection is remembered", () => {
    renderModal();
    expect(screen.getByRole("radio", { name: "Collaboration Hub" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "On-Prem" })).not.toBeChecked();
    expect(urlInput()).toHaveValue("");
    expect(urlInput()).toHaveAttribute("placeholder", "https://dev.azure.com/<ORGANIZATION>/<PROJECT_NAME>");
  });

  it("connects with the default source without touching the radios", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    renderModal();
    await user.type(urlInput(), URL_OK);
    await user.type(patInput(), PAT);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByRole("tree", { name: "Iteration path" })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ado/connect");
    expect(JSON.parse(String(init.body))).toMatchObject({ source: "cloud" });
  });

  it("checks the URL shape without a request", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    renderModal();
    await fillAndConnect(user, "https://dev.azure.com/org");
    expect(screen.getByRole("alert")).toHaveTextContent("Collaboration Hub URLs look like https://dev.azure.com/<organization>/<project>.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("after Connect offers only the Iteration tree (no Area/Iteration toggle)", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderModal();
    await fillAndConnect(user);
    expect(await screen.findByRole("tree", { name: "Iteration path" })).toBeInTheDocument();
    expect(screen.queryByRole("tree", { name: "Area path" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Path type" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Area path" })).not.toBeInTheDocument();
    expect(screen.getByTestId("ado-selected-path")).toHaveTextContent("Select an Iteration path (child paths are included).");
    expect(screen.getByLabelText("Search Iteration path")).toBeInTheDocument();
  });

  it("remembers the connection under the Monte Carlo key only (never the PAT)", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderModal();
    await fillAndConnect(user);
    await screen.findByRole("tree");
    expect(JSON.parse(window.localStorage.getItem(ADO_CONNECTION_KEY) ?? "null")).toEqual({
      source: "cloud",
      projectUrl: "https://dev.azure.com/org/Proj",
    });
    expect(window.localStorage.getItem(RELEASE_PLAN_KEY)).toBeNull();
    for (let i = 0; i < window.localStorage.length; i++) {
      expect(window.localStorage.getItem(window.localStorage.key(i) ?? "")).not.toContain(PAT);
    }
  });

  it("pre-fills from the Monte Carlo remembered connection, not Release Plan's", () => {
    window.localStorage.setItem(RELEASE_PLAN_KEY, JSON.stringify({ source: "cloud", projectUrl: "https://dev.azure.com/o/RP" }));
    window.localStorage.setItem(ADO_CONNECTION_KEY, JSON.stringify({ source: "onprem", projectUrl: "https://tfs.example.com/C/P" }));
    renderModal();
    expect(screen.getByRole("radio", { name: "On-Prem" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Collaboration Hub" })).not.toBeChecked();
    expect(urlInput()).toHaveAttribute("placeholder", "https://tfs-projects.cmf.criticalmanufacturing.com/ImplementationProjects/<PROJECT_NAME>");
    expect(urlInput()).toHaveValue("https://tfs.example.com/C/P");
    expect(patInput()).toHaveValue("");
  });

  it("loads the sprint history for the picked Iteration path and hands it over", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    const { onLoaded } = renderModal();
    await fillAndConnect(user);
    const tree = await screen.findByRole("tree", { name: "Iteration path" });
    await user.click(within(tree).getByRole("treeitem", { name: /^Phase 1/ }));
    expect(screen.getByTestId("ado-selected-path")).toHaveTextContent("Proj\\Phase 1");
    await user.click(submitButton());
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    expect(onLoaded).toHaveBeenCalledWith(makeSprintHistory(), {
      source: "cloud",
      projectUrl: "https://dev.azure.com/org/Proj",
      scopeType: "iteration",
      scopePath: "Proj\\Phase 1",
    });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/ado/sprint-history");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      source: "cloud",
      projectUrl: "https://dev.azure.com/org/Proj",
      pat: PAT,
      iterationPath: "Proj\\Phase 1",
    });
  });

  it("shows 'Loading work items…' while loading and a 422 inline, keeping the modal open", async () => {
    const user = userEvent.setup();
    const message = "No resolved User Stories or Bugs were found under Iteration path: Proj.";
    let release: (r: Response) => void = () => undefined;
    mockFetch({ history: () => new Promise<Response>((resolve) => (release = resolve)) });
    const { onLoaded } = renderModal();
    await fillAndConnect(user);
    await user.click(within(await screen.findByRole("tree")).getByRole("treeitem", { name: /^Proj/ }));
    await user.click(submitButton());
    expect(submitButton()).toHaveTextContent("Loading work items…");
    expect(submitButton()).toBeDisabled();
    release(json({ errors: [message] }, 422));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(submitButton()).toBeEnabled();
    expect(patInput()).toHaveValue(PAT);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onLoaded).not.toHaveBeenCalled();
  });

  it("aborts the in-flight load when it closes", async () => {
    const user = userEvent.setup();
    const signals: AbortSignal[] = [];
    mockFetch({
      history: (init) =>
        new Promise<Response>((_resolve, reject) => {
          if (init.signal) {
            signals.push(init.signal);
            init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }
        }),
    });
    const { onLoaded, onClose, rerender } = renderModal();
    await fillAndConnect(user);
    await user.click(within(await screen.findByRole("tree")).getByRole("treeitem", { name: /^Phase 1/ }));
    await user.click(submitButton());
    expect(signals).toHaveLength(1);
    rerender(<AdoSprintHistoryModal open={false} onClose={onClose} onLoaded={onLoaded} />);
    expect(signals[0].aborted).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onLoaded).not.toHaveBeenCalled();
  });

  it("Cancel, Escape and the backdrop close", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("ado-connect-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
