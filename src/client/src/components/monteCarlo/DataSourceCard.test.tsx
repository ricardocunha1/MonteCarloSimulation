import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { adoSource, excelSource, makeSprintWorkItem } from "../../test/monteCarloFixtures";
import { renderAt } from "../../test/render";
import { DataSourceCard } from "./DataSourceCard";

const card = (kind: string) => screen.getByRole("region", { name: `Data source: ${kind}` });

describe("DataSourceCard", () => {
  it("shows the Excel file name", () => {
    renderAt("/card", <DataSourceCard dataSource={excelSource("history.xlsx")} />);
    const region = card("Excel file");
    expect(within(region).getByText("File")).toBeInTheDocument();
    expect(within(region).getByText("history.xlsx")).toBeInTheDocument();
    expect(within(region).queryByText("Project")).not.toBeInTheDocument();
  });

  it("shows the Azure DevOps project, iteration path and number of work items (no area path)", () => {
    renderAt("/card", <DataSourceCard dataSource={adoSource} />);
    const region = card("Azure DevOps");
    const terms = within(region).getAllByRole("term").map((term) => term.textContent);
    const details = within(region).getAllByRole("definition").map((detail) => detail.textContent);
    expect(terms).toEqual(["Project", "Iteration Path", "Work items"]);
    expect(details).toEqual(["MES Core", "MES Core\\Release 11", "3"]);
    expect(within(region).queryByText("Area Path")).not.toBeInTheDocument();
  });

  it("counts every loaded work item", () => {
    const workItems = Array.from({ length: 375 }, (_, i) => makeSprintWorkItem({ id: i + 1 }));
    renderAt("/card", <DataSourceCard dataSource={{ ...adoSource, workItems }} />);
    expect(within(card("Azure DevOps")).getByText("375")).toBeInTheDocument();
  });

  it("links back to the data source page", async () => {
    renderAt("/card", <DataSourceCard dataSource={excelSource()} />);
    const change = screen.getByRole("link", { name: "Change data source" });
    expect(change).toHaveAttribute("href", "/monte-carlo");
    expect(change).toHaveTextContent(/^Change/);

    await userEvent.click(change);

    expect(screen.getByTestId("location")).toHaveTextContent(/^\/monte-carlo$/);
  });
});
