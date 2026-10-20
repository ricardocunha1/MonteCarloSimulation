import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ToastProvider } from "./components/Toast";
import { ForecastProvider } from "./store";

function renderApp(path: string) {
  render(
    <ToastProvider>
      <ForecastProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </ForecastProvider>
    </ToastProvider>,
  );
}

describe("App routing", () => {
  // ScrollToTop calls window.scrollTo, which jsdom does not implement.
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the hub home page at /", () => {
    renderApp("/");
    expect(screen.getByRole("link", { name: "Open Monte Carlo" })).toBeInTheDocument();
  });

  it("renders the Monte Carlo input step at /monte-carlo", () => {
    renderApp("/monte-carlo");
    expect(screen.getByRole("heading", { level: 2, name: "Monte Carlo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How to Use" })).toBeInTheDocument();
  });

  it("redirects unknown paths to the hub home page", () => {
    renderApp("/confirm");
    expect(screen.getByRole("link", { name: "Open Monte Carlo" })).toBeInTheDocument();
  });

  it("redirects Monte Carlo steps without data to the input step", () => {
    renderApp("/monte-carlo/results");
    expect(document.title).toBe("CM Estimations Hub – Monte Carlo – Data Input");
  });
});
