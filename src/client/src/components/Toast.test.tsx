import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function Trigger() {
  const { showError, showInfo } = useToast();
  return (
    <>
      <button type="button" onClick={() => showInfo("Board saved")}>
        info
      </button>
      <button type="button" onClick={() => showError(["Boom"])}>
        error
      </button>
    </>
  );
}

function renderToasts() {
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("showInfo renders a status message that auto-dismisses after about 2.2s", () => {
    renderToasts();
    act(() => {
      screen.getByRole("button", { name: "info" }).click();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Board saved");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("showError still renders an alert that stays for 8s", () => {
    renderToasts();
    act(() => {
      screen.getByRole("button", { name: "error" }).click();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(7900);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
