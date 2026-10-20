import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ToastProvider } from "./components/Toast";
import { ForecastProvider } from "./store";
import { result, validation } from "./test/fixtures";

// Full-app integration: real App routes, real pages, real api.ts; only the
// network (`fetch`) and the Plotly chart (needs a real browser) are mocked.
vi.mock("./components/HistogramChart", () => ({
  default: ({ histogram }: { histogram: { labels: string[] } }) => (
    <div data-testid="histogram">{histogram.labels.length} buckets</div>
  ),
}));

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderApp(path = "/") {
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();

function sidebarMonteCarlo() {
  // Each page renders its own Layout, so re-query after every navigation.
  const nav = screen.getByRole("navigation", { name: "Hub navigation" });
  return within(nav).getByRole("link", { name: "Monte Carlo" });
}

function location() {
  return screen.getByTestId("location").textContent;
}

async function fillInputAndSubmit(user: ReturnType<typeof userEvent.setup>, { skip }: { skip: boolean }) {
  await user.upload(
    screen.getByLabelText(/Sprint History Data/),
    new File(["xlsx"], "Sprint_History.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  await user.type(screen.getByLabelText(/Target Value/), "100");
  fireEvent.change(screen.getByLabelText(/Sprint Start Date/), { target: { value: "2026-01-05" } });
  if (skip) {
    await user.click(screen.getByLabelText(/Skip Historical Sprint Validation/));
  }
  // jsdom does not see files set by user.upload for `required` constraint
  // validation, so a click would be blocked; submit the form directly.
  fireEvent.submit(screen.getByRole("button", { name: "Continue" }).closest("form")!);
}

describe("CM Estimations Hub – full app flow", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("goes home → sidebar Monte Carlo → input → confirm → results under /monte-carlo", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(validation))
      .mockResolvedValueOnce(jsonResponse(result));
    const user = userEvent.setup();
    renderApp("/");

    // Home: hub title, tool card, no Help button.
    expect(document.title).toBe("CM Estimations Hub");
    expect(screen.getByRole("heading", { level: 1, name: "CM Estimations Hub" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "How to Use" })).not.toBeInTheDocument();

    // Sidebar → Monte Carlo.
    expect(sidebarMonteCarlo()).not.toHaveAttribute("aria-current");
    await user.click(sidebarMonteCarlo());
    expect(location()).toBe("/monte-carlo");
    expect(sidebarMonteCarlo()).toHaveAttribute("aria-current", "page");
    expect(document.title).toBe("CM Estimations Hub – Monte Carlo – Data Input");

    await fillInputAndSubmit(user, { skip: false });

    expect(await screen.findByRole("button", { name: "Confirm and Run Simulation" })).toBeInTheDocument();
    expect(location()).toBe("/monte-carlo/confirm");
    expect(document.title).toBe("CM Estimations Hub – Monte Carlo – Confirm Sprint Data");
    expect(screen.getByText("Sprint 1")).toBeInTheDocument();

    const [validateUrl, validateInit] = fetchMock.mock.calls[0];
    expect(validateUrl).toBe("/api/validate");
    expect(validateInit?.method).toBe("POST");
    const form = validateInit?.body as FormData;
    expect(form.get("target_value")).toBe("100");
    expect(form.get("sprint_start_date")).toBe("2026-01-05");
    expect(form.has("skip_validation")).toBe(false);
    expect((form.get("sprint_history_file") as File).name).toBe("Sprint_History.xlsx");

    await user.click(screen.getByRole("button", { name: "Confirm and Run Simulation" }));

    expect(await screen.findByText("Calendar View")).toBeInTheDocument();
    expect(location()).toBe("/monte-carlo/results");
    await waitFor(() => expect(document.title).toBe("CM Estimations Hub – Monte Carlo – Results"));
    expect(sidebarMonteCarlo()).toHaveAttribute("aria-current", "page");

    const [simulateUrl, simulateInit] = fetchMock.mock.calls[1];
    expect(simulateUrl).toBe("/api/simulate");
    expect(JSON.parse(simulateInit?.body as string)).toEqual({ summary: validation.summary, params: validation.params });
  });

  it("skips validation straight from input to /monte-carlo/results", async () => {
    const skipped = { ...validation, params: { ...validation.params, skip_validation: true } };
    fetchMock.mockResolvedValueOnce(jsonResponse(skipped)).mockResolvedValueOnce(jsonResponse(result));
    const user = userEvent.setup();
    renderApp("/");

    await user.click(screen.getByRole("link", { name: "Open Monte Carlo" }));
    expect(location()).toBe("/monte-carlo");

    await fillInputAndSubmit(user, { skip: true });

    expect(await screen.findByText("Calendar View")).toBeInTheDocument();
    expect(location()).toBe("/monte-carlo/results");
    expect((fetchMock.mock.calls[0][1]?.body as FormData).get("skip_validation")).toBe("on");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a 422 {errors} from /api/validate as a toast and stays on /monte-carlo", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ errors: ["Could not read Excel file: File is not a zip file"] }, 422));
    const user = userEvent.setup();
    renderApp("/monte-carlo");

    await fillInputAndSubmit(user, { skip: false });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not read Excel file: File is not a zip file");
    expect(location()).toBe("/monte-carlo");
  });

  it("shows a simulate failure as a toast and stays on /monte-carlo/confirm", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(validation))
      .mockResolvedValueOnce(jsonResponse({ errors: ["The sampling pool is empty."] }, 422));
    const user = userEvent.setup();
    renderApp("/monte-carlo");

    await fillInputAndSubmit(user, { skip: false });
    await user.click(await screen.findByRole("button", { name: "Confirm and Run Simulation" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The sampling pool is empty.");
    expect(location()).toBe("/monte-carlo/confirm");
  });

  it("opens the Help modal from every Monte Carlo step", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(validation)).mockResolvedValueOnce(jsonResponse(result));
    const user = userEvent.setup();
    renderApp("/monte-carlo");

    async function openAndCloseHelp() {
      await user.click(screen.getByRole("button", { name: "How to Use" }));
      expect(screen.getByRole("dialog", { name: "How to Use This Application" })).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }

    await openAndCloseHelp();
    await fillInputAndSubmit(user, { skip: false });
    await screen.findByRole("button", { name: "Confirm and Run Simulation" });
    await openAndCloseHelp();
    await user.click(screen.getByRole("button", { name: "Confirm and Run Simulation" }));
    await screen.findByText("Calendar View");
    await openAndCloseHelp();
  });

  it("returns to the hub home from the header logo and from unknown paths", async () => {
    const user = userEvent.setup();
    renderApp("/no/such/page");
    expect(location()).toBe("/");

    await user.click(screen.getByRole("link", { name: "Open Monte Carlo" }));
    expect(location()).toBe("/monte-carlo");

    await user.click(screen.getByRole("link", { name: "CM Estimations Hub home" }));
    expect(location()).toBe("/");
    expect(screen.getByRole("link", { name: "Monte Carlo" })).not.toHaveAttribute("aria-current");
  });

  it.each(["/monte-carlo/confirm", "/monte-carlo/results"])("redirects %s without data to /monte-carlo", (path) => {
    renderApp(path);
    expect(location()).toBe("/monte-carlo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["/confirm", "/results"])("redirects the legacy route %s to the hub home", (path) => {
    renderApp(path);
    expect(location()).toBe("/");
  });
});
