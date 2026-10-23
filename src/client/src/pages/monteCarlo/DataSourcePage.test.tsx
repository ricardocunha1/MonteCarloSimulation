import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useForecast } from "../../monteCarloStore";
import { result, validation } from "../../test/monteCarloFixtures";
import { renderAt } from "../../test/render";
import { DataSourcePage } from "./DataSourcePage";

const adoCard = () => screen.getByRole("button", { name: /Load from Azure DevOps/ });
const excelCard = () => screen.getByRole("button", { name: /Import an Excel file/ });
const location = () => screen.getByTestId("location").textContent;

/** Stub of the input route that shows what the store holds after the navigation. */
function StoreProbe() {
  const { dataSource, validation: storedValidation, execution } = useForecast();
  return (
    <div>
      <p>input page</p>
      <p data-testid="source">{dataSource?.kind === "excel" ? `excel:${dataSource.file.name}` : String(dataSource)}</p>
      <p data-testid="stale">{`${storedValidation === null}/${execution === null}`}</p>
    </div>
  );
}

describe("DataSourcePage", () => {
  it("renders inside the Monte Carlo layout as the Data Source step", () => {
    renderAt("/monte-carlo", <DataSourcePage />);
    expect(document.title).toBe("Planning Hub – Monte Carlo – Data Source");
    expect(screen.getByRole("heading", { name: "Load sprint history" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Progress" }).querySelector('[aria-current="step"]')).toHaveTextContent("Input");
  });

  it("shows the Azure DevOps card as disabled with a Coming soon badge", () => {
    renderAt("/monte-carlo", <DataSourcePage />);
    expect(adoCard()).toHaveAttribute("aria-disabled", "true");
    expect(adoCard()).toHaveAttribute("tabindex", "-1");
    expect(adoCard()).toHaveTextContent("Coming soon");
  });

  it("does nothing when the Azure DevOps card is clicked", async () => {
    const user = userEvent.setup();
    renderAt("/monte-carlo", <DataSourcePage />);
    await user.click(adoCard());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location()).toBe("/monte-carlo");
  });

  it("opens the Import Excel modal from the Excel card", async () => {
    const user = userEvent.setup();
    renderAt("/monte-carlo", <DataSourcePage />);
    expect(excelCard()).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(excelCard());
    expect(screen.getByRole("dialog", { name: "Import an Excel file" })).toBeInTheDocument();
    expect(screen.getByLabelText("Sprint history file")).toHaveFocus();
    expect(location()).toBe("/monte-carlo");
  });

  it("opens the modal from the keyboard and Cancel returns focus to the card", async () => {
    const user = userEvent.setup();
    renderAt("/monte-carlo", <DataSourcePage />);
    excelCard().focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(excelCard()).toHaveFocus();
    expect(location()).toBe("/monte-carlo");
  });

  it("stores the chosen file, clears stale results and goes to the input form", async () => {
    const user = userEvent.setup();
    renderAt("/monte-carlo", <DataSourcePage />, {
      validation,
      execution: { result, sprintStartDate: "2026-01-05" },
      routes: { "/monte-carlo/input": <StoreProbe /> },
    });
    await user.click(excelCard());
    await user.upload(screen.getByLabelText("Sprint history file"), new File(["xlsx"], "history.xlsx"));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(location()).toBe("/monte-carlo/input");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("source")).toHaveTextContent("excel:history.xlsx");
    expect(screen.getByTestId("stale")).toHaveTextContent("true/true");
  });

  it("keeps the modal open and stays on the page for an invalid choice", async () => {
    const user = userEvent.setup();
    renderAt("/monte-carlo", <DataSourcePage />);
    await user.click(excelCard());
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Select an .xlsx file.");
    expect(location()).toBe("/monte-carlo");
  });

  it("opens the How to Use help, which mentions the upcoming Azure DevOps source", async () => {
    const user = userEvent.setup();
    renderAt("/monte-carlo", <DataSourcePage />);
    await user.click(screen.getByRole("button", { name: "How to Use" }));
    const dialog = screen.getByRole("dialog", { name: "How to Use This Application" });
    expect(within(dialog).getByText(/directly from Azure DevOps is coming soon/)).toBeInTheDocument();
    expect(within(dialog).getByText(/first screen lets you choose the data source/)).toBeInTheDocument();
  });
});
