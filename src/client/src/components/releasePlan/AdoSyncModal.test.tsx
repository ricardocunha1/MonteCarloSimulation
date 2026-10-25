import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { PlanSource } from "../../lib/releasePlan/types";
import { makeBacklog } from "../../test/adoFixtures";
import { AdoSyncModal } from "./AdoSyncModal";

const PAT = "sync-s3cr3t-pat";
const CLOUD_SOURCE: PlanSource = {
  system: "Azure DevOps",
  project: "Proj",
  scope: "Area Path: Proj\\Team A",
  fetchedAt: "2026-10-23T10:00:00Z",
  kind: "cloud",
  projectUrl: "https://dev.azure.com/org/Proj",
  scopeType: "area",
  scopePath: "Proj\\Team A",
};
const ONPREM_SOURCE: PlanSource = {
  kind: "onprem",
  projectUrl: "https://tfs.example.com/Coll/My%20Proj",
  scopeType: "iteration",
  scopePath: "My Proj\\Phase 1",
};

type Handler = (init: RequestInit) => Response | Promise<Response>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockFetch(handler: Handler = () => json(makeBacklog())): Mock {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (String(input) !== "/api/ado/backlog") {
      throw new Error(`unexpected ${String(input)}`);
    }
    return handler(init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderModal(source: PlanSource = CLOUD_SOURCE) {
  const onClose = vi.fn();
  const onBacklog = vi.fn();
  const view = render(<AdoSyncModal open source={source} onClose={onClose} onBacklog={onBacklog} />);
  return { onClose, onBacklog, ...view };
}

const patInput = () => screen.getByLabelText("Personal Access Token");
const previewButton = () => screen.getByRole("button", { name: /^(Preview changes|Loading work items…)$/ });
/** The `<dd>` shown next to a `<dt>` label. */
const valueOf = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;

describe("AdoSyncModal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders nothing when closed", () => {
    render(<AdoSyncModal open={false} source={CLOUD_SOURCE} onClose={vi.fn()} onBacklog={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a Collaboration Hub Area-path connection read-only, with only the PAT editable", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Sync from Azure DevOps" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(valueOf("Azure DevOps source")).toBe("Collaboration Hub");
    expect(valueOf("Project URL")).toBe("https://dev.azure.com/org/Proj");
    expect(valueOf("Area path")).toBe("Proj\\Team A");
    expect(screen.queryByText("Iteration path")).not.toBeInTheDocument();
    // The only form control is the PAT; no URL input, source/scope radios, tree or Connect step.
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
    expect(dialog.querySelectorAll("input")).toHaveLength(1);
    expect(patInput()).toHaveFocus();
    expect(patInput()).toHaveValue("");
    expect(previewButton()).toHaveTextContent("Preview changes");
    expect(previewButton()).toBeEnabled();
  });

  it("shows an On-Prem Iteration-path connection", () => {
    renderModal(ONPREM_SOURCE);
    expect(valueOf("Azure DevOps source")).toBe("On-Prem");
    expect(valueOf("Project URL")).toBe("https://tfs.example.com/Coll/My%20Proj");
    expect(valueOf("Iteration path")).toBe("My Proj\\Phase 1");
    expect(screen.queryByText("Area path")).not.toBeInTheDocument();
  });

  it("opts the PAT input out of autocomplete and password managers and describes it", () => {
    renderModal();
    expect(patInput()).toHaveAttribute("type", "password");
    expect(patInput()).toHaveAttribute("autocomplete", "off");
    expect(patInput()).toHaveAttribute("data-1p-ignore", "true");
    expect(patInput()).toHaveAttribute("data-lpignore", "true");
    expect(patInput()).toHaveAttribute("data-form-type", "other");
    expect(patInput()).toHaveAccessibleDescription("Needs the Work Items (Read) scope. It is sent only to connect and is never stored.");
  });

  it("requires a PAT: inline error linked to the input, no request; typing clears it", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    const { onBacklog } = renderModal();
    await user.type(patInput(), "   ");
    await user.click(previewButton());
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Enter a Personal Access Token.");
    expect(patInput()).toHaveAttribute("aria-invalid", "true");
    expect(patInput().getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onBacklog).not.toHaveBeenCalled();
    await user.type(patInput(), "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(patInput()).not.toHaveAttribute("aria-invalid");
  });

  it("posts the plan's connection with the PAT and hands the backlog and connection (no PAT) to onBacklog", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    const { onBacklog } = renderModal(ONPREM_SOURCE);
    await user.type(patInput(), PAT);
    await user.click(previewButton());
    await vi.waitFor(() => expect(onBacklog).toHaveBeenCalledTimes(1));
    const connection = { source: "onprem", projectUrl: "https://tfs.example.com/Coll/My%20Proj", scopeType: "iteration", scopePath: "My Proj\\Phase 1" };
    expect(onBacklog).toHaveBeenCalledWith(makeBacklog(), connection);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ado/backlog");
    expect(url).not.toContain(PAT);
    expect(init.method).toBe("POST");
    expect(JSON.stringify(init.headers)).not.toContain(PAT);
    expect(JSON.parse(String(init.body))).toEqual({ ...connection, pat: PAT });
  });

  it("submits with Enter in the PAT field", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    const { onBacklog } = renderModal();
    await user.type(patInput(), `${PAT}{Enter}`);
    await vi.waitFor(() => expect(onBacklog).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows 'Loading work items…' while loading and a server error inline, keeping the modal and the PAT", async () => {
    const user = userEvent.setup();
    let release: (r: Response) => void = () => undefined;
    mockFetch(() => new Promise<Response>((resolve) => (release = resolve)));
    const { onBacklog, onClose } = renderModal();
    await user.type(patInput(), PAT);
    await user.click(previewButton());
    expect(previewButton()).toHaveTextContent("Loading work items…");
    expect(previewButton()).toBeDisabled();
    release(json({ errors: ["Unknown Area path: Proj\\Team A."] }, 422));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unknown Area path: Proj\\Team A.");
    expect(patInput()).toHaveValue(PAT);
    expect(patInput()).not.toHaveAttribute("aria-invalid");
    expect(previewButton()).toHaveTextContent("Preview changes");
    expect(previewButton()).toBeEnabled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onBacklog).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a network failure inline", async () => {
    const user = userEvent.setup();
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    renderModal();
    await user.type(patInput(), PAT);
    await user.click(previewButton());
    expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Cancel, Escape and the backdrop close", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("ado-sync-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("aborts an in-flight request when it closes, and starts fresh when reopened", async () => {
    const user = userEvent.setup();
    const signals: AbortSignal[] = [];
    mockFetch(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal;
          if (signal) {
            signals.push(signal);
            signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }
        }),
    );
    const { onBacklog, onClose, rerender } = renderModal();
    await user.type(patInput(), PAT);
    await user.click(previewButton());
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);
    rerender(<AdoSyncModal open={false} source={CLOUD_SOURCE} onClose={onClose} onBacklog={onBacklog} />);
    expect(signals[0].aborted).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<AdoSyncModal open source={CLOUD_SOURCE} onClose={onClose} onBacklog={onBacklog} />);
    expect(patInput()).toHaveValue("");
    expect(previewButton()).toBeEnabled();
    expect(onBacklog).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty source", {}],
    ["a source without a scope path", { ...CLOUD_SOURCE, scopePath: undefined }],
    ["a source without a project URL", { ...ONPREM_SOURCE, projectUrl: undefined }],
  ] as [string, PlanSource][])("explains that a board with %s can't be synced, with only a Close button", async (_name, source) => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    const { onClose } = renderModal(source);
    const dialog = screen.getByRole("dialog", { name: "Sync from Azure DevOps" });
    expect(dialog).toHaveTextContent("This board isn't linked to an Azure DevOps project, so it can't be synced.");
    expect(dialog).toHaveTextContent("create the board from Azure DevOps");
    expect(screen.queryByLabelText("Personal Access Token")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview changes" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Close"]);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
