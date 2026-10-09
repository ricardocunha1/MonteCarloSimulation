import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { ApiError } from "../api";
import { result, validation } from "../test/fixtures";
import { renderAt } from "../test/render";
import { ConfirmPage } from "./ConfirmPage";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, simulate: vi.fn() };
});

const simulateMock = vi.mocked(api.simulate);

describe("ConfirmPage", () => {
  beforeEach(() => {
    simulateMock.mockReset();
  });

  it("redirects to the input step without validation state", () => {
    renderAt("/confirm", <ConfirmPage />);
    expect(screen.getByTestId("location")).toHaveTextContent("/");
    expect(screen.getByText("input page")).toBeInTheDocument();
  });

  it("renders the sprint summary table", () => {
    renderAt("/confirm", <ConfirmPage />, { validation });
    const rows = screen.getAllByRole("row");
    expect(within(rows[0]).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Sprint", "Items Resolved", "Story Points", "Last Resolved Date", "Recency Rank", "In Sampling Pool?",
    ]);
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Sprint 1", "10", "21", "2025-01-10", "2", "Yes",
    ]);
    expect(within(rows[2]).getAllByRole("cell").at(-1)).toHaveTextContent("No");
  });

  it("runs the simulation and goes to results", async () => {
    simulateMock.mockResolvedValue(result);
    renderAt("/confirm", <ConfirmPage />, { validation });
    await userEvent.click(screen.getByRole("button", { name: "Confirm and Run Simulation" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/results"));
    expect(simulateMock).toHaveBeenCalledWith(validation.summary, validation.params);
  });

  it("shows simulation errors in a toast and stays on the confirm step", async () => {
    simulateMock.mockRejectedValue(new ApiError(["No sprints are available in the sampling pool."], 422));
    renderAt("/confirm", <ConfirmPage />, { validation });
    await userEvent.click(screen.getByRole("button", { name: "Confirm and Run Simulation" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Simulation error");
    expect(alert).toHaveTextContent("No sprints are available in the sampling pool.");
    expect(screen.getByTestId("location")).toHaveTextContent("/confirm");
    expect(screen.getByRole("button", { name: "Confirm and Run Simulation" })).toBeEnabled();
  });
});
