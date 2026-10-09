import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { ApiError } from "../api";
import { result, validation } from "../test/fixtures";
import { renderAt } from "../test/render";
import { InputPage } from "./InputPage";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
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
    renderAt("/", <InputPage />);
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
    renderAt("/", <InputPage />);
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
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("sends every field as multipart form data", async () => {
    validateMock.mockResolvedValue(validation);
    renderAt("/", <InputPage />);
    const file = new File(["xlsx"], "history.xlsx");
    await userEvent.upload(screen.getByLabelText(/Sprint History Data/), file);

    submit();

    await waitFor(() => expect(validateMock).toHaveBeenCalledOnce());
    const formData = validateMock.mock.calls[0][0];
    expect(formData.get("target_type")).toBe("Items Resolved");
    expect(formData.get("num_simulations")).toBe("10000");
    expect(formData.get("target_value")).toBe("");
    expect(formData.has("skip_validation")).toBe(false);
    expect((formData.get("sprint_history_file") as File).name).toBe("history.xlsx");
  });

  it("goes to the confirm step after a successful validation", async () => {
    validateMock.mockResolvedValue(validation);
    renderAt("/", <InputPage />);
    submit();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/confirm"));
    expect(simulateMock).not.toHaveBeenCalled();
  });

  it("skips straight to results when skip validation is checked", async () => {
    validateMock.mockResolvedValue({ ...validation, params: { ...validation.params, skip_validation: true } });
    simulateMock.mockResolvedValue(result);
    renderAt("/", <InputPage />);
    await userEvent.click(screen.getByLabelText(/Skip Historical Sprint Validation/));

    submit();

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/results"));
    expect(validateMock.mock.calls[0][0].get("skip_validation")).toBe("on");
    expect(simulateMock).toHaveBeenCalledWith(validation.summary, { ...validation.params, skip_validation: true });
  });

  it("shows simulation errors in a toast and stays on the input step when skipping validation", async () => {
    validateMock.mockResolvedValue(validation);
    simulateMock.mockRejectedValue(new ApiError(["No sprints are available in the sampling pool."], 422));
    renderAt("/", <InputPage />);
    await userEvent.click(screen.getByLabelText(/Skip Historical Sprint Validation/));

    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("No sprints are available in the sampling pool.");
    expect(screen.getByTestId("location")).toHaveTextContent("/");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("dismisses the toast", async () => {
    validateMock.mockRejectedValue(new ApiError(["A Sprint History Excel file is required."], 422));
    renderAt("/", <InputPage />);
    submit();
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
