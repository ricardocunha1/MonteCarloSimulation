import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../lib/monteCarlo/api";
import { ApiError } from "../../lib/monteCarlo/api";
import { adoSource, excelSource, result, validation } from "../../test/monteCarloFixtures";
import { renderAt } from "../../test/render";
import { InputPage } from "./InputPage";

const source = excelSource("history.xlsx");

function renderInput(options: Parameters<typeof renderAt>[2] = {}) {
  return renderAt("/monte-carlo/input", <InputPage />, { dataSource: source, ...options });
}

vi.mock("../../lib/monteCarlo/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/monteCarlo/api")>();
  return { ...actual, validate: vi.fn(), simulate: vi.fn() };
});

const validateMock = vi.mocked(api.validate);
const simulateMock = vi.mocked(api.simulate);

function submit() {
  // fireEvent.submit bypasses the browser's `required` checks, so the
  // server-side messages are what's under test.
  fireEvent.submit(screen.getByRole("button", { name: "Continue" }).closest("form")!);
}

describe("InputPage", () => {
  beforeEach(() => {
    validateMock.mockReset();
    simulateMock.mockReset();
  });

  it("renders the form defaults", () => {
    renderInput();
    expect(screen.getByLabelText(/Target Type/)).toHaveValue("Items Resolved");
    expect(screen.getByLabelText(/Number of Simulations/)).toHaveValue(10000);
    expect(screen.getByLabelText(/Sprint Length/)).toHaveValue(10);
    expect(screen.getByLabelText(/Exclude Latest Sprints/)).toHaveValue(0);
    expect(screen.getByLabelText(/Team Capacity Factor/)).toHaveValue(1);
    expect(screen.getByLabelText(/Skip Historical Sprint Validation/)).not.toBeChecked();
  });

  it("shows server errors in a toast and keeps the entered values", async () => {
    validateMock.mockRejectedValue(
      new ApiError(["Number of Simulations must not exceed 20000.", "A Sprint History Excel file is required."], 422),
    );
    renderInput();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/Number of Simulations/));
    await user.type(screen.getByLabelText(/Number of Simulations/), "20001");
    await user.type(screen.getByLabelText(/Target Value/), "100");

    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Please correct the following:");
    expect(alert).toHaveTextContent("Number of Simulations must not exceed 20000.");
    expect(alert).toHaveTextContent("A Sprint History Excel file is required.");
    expect(screen.getByLabelText(/Number of Simulations/)).toHaveValue(20001);
    expect(screen.getByLabelText(/Target Value/)).toHaveValue(100);
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/monte-carlo\/input$/);
  });

  it("sends every field as multipart form data", async () => {
    validateMock.mockResolvedValue(validation);
    renderInput();

    submit();

    await waitFor(() => expect(validateMock).toHaveBeenCalledOnce());
    const formData = validateMock.mock.calls[0][0];
    expect(formData.get("target_type")).toBe("Items Resolved");
    expect(formData.get("num_simulations")).toBe("10000");
    expect(formData.get("target_value")).toBe("");
    expect(formData.has("skip_validation")).toBe(false);
    expect(formData.get("sprint_start_date")).toBe("");
    expect(formData.get("sprint_length")).toBe("10");
    expect(formData.get("exclude_latest_sprints")).toBe("0");
    expect(formData.get("team_capacity_factor")).toBe("1.0");
    expect(formData.has("skip_validation")).toBe(false);
    // The very File chosen in the Import Excel modal, under the same field name.
    expect(formData.get("sprint_history_file")).toBe(source.kind === "excel" ? source.file : null);
    expect([...formData.keys()].sort()).toEqual(
      [
        "exclude_latest_sprints",
        "num_simulations",
        "sprint_history_file",
        "sprint_length",
        "sprint_start_date",
        "target_type",
        "target_value",
        "team_capacity_factor",
      ],
    );
  });

  it("has no file input and shows the chosen Excel file in the data source card", () => {
    const { container } = renderInput();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByLabelText(/Sprint History Data/)).not.toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Data source: Excel file" });
    expect(card).toHaveTextContent("history.xlsx");
  });

  it("shows an Azure DevOps source with its project and paths", () => {
    renderInput({ dataSource: adoSource });
    const card = screen.getByRole("region", { name: "Data source: Azure DevOps" });
    expect(card).toHaveTextContent("MES Core\\Team A");
    expect(card).toHaveTextContent("MES Core\\Release 11");
  });

  it("redirects to the data source page when no source was chosen", () => {
    renderAt("/monte-carlo/input", <InputPage />);
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/monte-carlo$/);
    expect(screen.getByText("data source page")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("goes to the confirm step after a successful validation", async () => {
    validateMock.mockResolvedValue(validation);
    renderInput();
    submit();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/monte-carlo\/confirm$/));
    expect(simulateMock).not.toHaveBeenCalled();
  });

  it("skips straight to results when skip validation is checked", async () => {
    validateMock.mockResolvedValue({ ...validation, params: { ...validation.params, skip_validation: true } });
    simulateMock.mockResolvedValue(result);
    renderInput();
    await userEvent.click(screen.getByLabelText(/Skip Historical Sprint Validation/));

    submit();

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/monte-carlo\/results$/));
    expect(validateMock.mock.calls[0][0].get("skip_validation")).toBe("on");
    expect(simulateMock).toHaveBeenCalledWith(validation.summary, { ...validation.params, skip_validation: true });
  });

  it("shows simulation errors in a toast and stays on the input step when skipping validation", async () => {
    validateMock.mockResolvedValue(validation);
    simulateMock.mockRejectedValue(new ApiError(["No sprints are available in the sampling pool."], 422));
    renderInput();
    await userEvent.click(screen.getByLabelText(/Skip Historical Sprint Validation/));

    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("No sprints are available in the sampling pool.");
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/monte-carlo\/input$/);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("dismisses the toast", async () => {
    validateMock.mockRejectedValue(new ApiError(["A Sprint History Excel file is required."], 422));
    renderInput();
    submit();
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("links back to the data source choice from the data source card", async () => {
    renderInput();
    const back = screen.getByRole("link", { name: "Change data source" });
    expect(back).toHaveAttribute("href", "/monte-carlo");

    await userEvent.click(back);

    expect(screen.getByTestId("location")).toHaveTextContent(/^\/monte-carlo$/);
    expect(screen.getByText("data source page")).toBeInTheDocument();
    expect(validateMock).not.toHaveBeenCalled();
  });

  it("keeps the Data Input title and step 1 in the breadcrumb", () => {
    renderInput();
    expect(document.title).toBe("Planning Hub – Monte Carlo – Data Input");
    expect(screen.getByRole("navigation", { name: "Progress" }).querySelector('[aria-current="step"]')).toHaveTextContent("Input");
  });
});
