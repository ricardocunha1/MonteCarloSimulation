import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ESTIMATION_TOOLS } from "../lib/tools";
import { renderAt } from "../test/render";
import { HubHomePage } from "./HubHomePage";

describe("HubHomePage", () => {
  it("shows the hub title and sets the document title", () => {
    renderAt("/", <HubHomePage />);
    expect(screen.getByRole("heading", { level: 1, name: "CM Estimations Hub" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CM Estimations Hub home" })).toHaveAttribute("href", "/");
    expect(document.title).toBe("CM Estimations Hub");
  });

  it("lists the Monte Carlo tool with its description and goal", () => {
    renderAt("/", <HubHomePage />);
    const monteCarlo = ESTIMATION_TOOLS.find((tool) => tool.id === "monte-carlo");
    expect(monteCarlo).toBeDefined();
    const card = screen.getByRole("link", { name: "Open Monte Carlo" });
    expect(card).toHaveAttribute("href", "/monte-carlo");
    expect(within(card).getByText(monteCarlo?.description ?? "")).toBeInTheDocument();
    expect(within(card).getByText(monteCarlo?.goal ?? "")).toBeInTheDocument();
  });

  it("does not show the Monte Carlo Help button", () => {
    renderAt("/", <HubHomePage />);
    expect(screen.queryByRole("button", { name: "How to Use" })).not.toBeInTheDocument();
  });

  it("navigates to Monte Carlo from the card", async () => {
    const user = userEvent.setup();
    renderAt("/", <HubHomePage />);
    await user.click(screen.getByRole("link", { name: "Open Monte Carlo" }));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/monte-carlo$/);
    expect(screen.getByText("input page")).toBeInTheDocument();
  });

  it("navigates to Monte Carlo from the sidebar", async () => {
    const user = userEvent.setup();
    renderAt("/", <HubHomePage />);
    await user.click(screen.getByRole("link", { name: "Monte Carlo" }));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/monte-carlo$/);
  });

  it("shows a card for both tools", () => {
    renderAt("/", <HubHomePage />);
    const section = screen.getByRole("region", { name: "Estimations" });
    const cards = within(section).getAllByRole("link");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(["Open Monte Carlo", "Open Release Plan"]);
  });

  it("lists the Release Plan tool with its description and goal", () => {
    renderAt("/", <HubHomePage />);
    const card = screen.getByRole("link", { name: "Open Release Plan" });
    expect(card).toHaveAttribute("href", "/release-plan");
    expect(within(card).getByText("Plan Feature releases on an interactive drag-and-drop board.")).toBeInTheDocument();
    expect(within(card).getByText("Decide which Features ship in which release or sprint, per Epic.")).toBeInTheDocument();
  });

  it("navigates to Release Plan from the card", async () => {
    const user = userEvent.setup();
    renderAt("/", <HubHomePage />);
    await user.click(screen.getByRole("link", { name: "Open Release Plan" }));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/release-plan$/);
    expect(screen.getByText("release plan home page")).toBeInTheDocument();
  });
});
