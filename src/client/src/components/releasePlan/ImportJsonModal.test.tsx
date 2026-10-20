import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReleasePlan } from "../../lib/releasePlan/types";
import { samplePlan } from "../../test/releasePlanFixtures";
import { ConfirmDialog } from "../ConfirmDialog";
import { ImportJsonModal } from "./ImportJsonModal";

function renderModal(onPlanLoaded?: (plan: ReleasePlan) => void) {
  const onClose = vi.fn();
  render(<ImportJsonModal open onClose={onClose} onPlanLoaded={onPlanLoaded} />);
  return { onClose };
}

const fileInput = () => screen.getByLabelText("Release plan file");
const jsonFile = (content: string, name = "plan.json") => new File([content], name, { type: "application/json" });

describe("ImportJsonModal", () => {
  it("is a labelled dialog with a JSON file input, focused on open", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Import a JSON file" })).toHaveAttribute("aria-modal", "true");
    expect(fileInput()).toHaveAttribute("accept", ".json,application/json");
    expect(fileInput()).toHaveFocus();
    expect(screen.getByText("No file selected.")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(<ImportJsonModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Cancel, Escape and the backdrop close", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("import-json-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("shows the inline error when no file is chosen and stays open", async () => {
    const user = userEvent.setup();
    const onPlanLoaded = vi.fn();
    const { onClose } = renderModal(onPlanLoaded);
    await user.click(screen.getByRole("button", { name: "Create board" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Select a .json file.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onPlanLoaded).not.toHaveBeenCalled();
  });

  it("shows the inline error for a file without a .json extension", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onPlanLoaded = vi.fn();
    renderModal(onPlanLoaded);
    await user.upload(fileInput(), new File(["x"], "plan.xlsx", { type: "application/octet-stream" }));
    expect(screen.getByText("plan.xlsx")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create board" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Select a .json file.");
    expect(onPlanLoaded).not.toHaveBeenCalled();
  });

  it("passes the normalized plan of a valid .json file (case-insensitive name)", async () => {
    const user = userEvent.setup();
    const onPlanLoaded = vi.fn();
    renderModal(onPlanLoaded);
    await user.upload(fileInput(), jsonFile(JSON.stringify(samplePlan()), "Release.JSON"));
    expect(screen.getByText("Release.JSON")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create board" }));
    await vi.waitFor(() => expect(onPlanLoaded).toHaveBeenCalledTimes(1));
    expect(onPlanLoaded.mock.calls[0][0]).toEqual(samplePlan());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["{oops", "Could not read the file: it is not valid JSON."],
    [JSON.stringify({ schema: "release-planner" }), "This is a User Story plan. Open it in the User Story board."],
    [JSON.stringify({ hello: 1 }), "Not a Feature release plan file (schema missing)."],
    [JSON.stringify({ schema: "release-planner-features", epics: [] }), "Missing milestones or epics."],
  ])("shows validation errors inline and stays open (%s)", async (content, message) => {
    const user = userEvent.setup();
    const onPlanLoaded = vi.fn();
    const { onClose } = renderModal(onPlanLoaded);
    await user.upload(fileInput(), jsonFile(content));
    await user.click(screen.getByRole("button", { name: "Create board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onPlanLoaded).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the chosen file and focus when re-rendered with a new onClose (no reset on parent re-render)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ImportJsonModal open onClose={() => undefined} />);
    await user.upload(fileInput(), jsonFile("{}"));
    screen.getByRole("button", { name: "Cancel" }).focus();
    const latest = vi.fn();
    rerender(<ImportJsonModal open onClose={latest} />);
    expect(screen.getByText("plan.json")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("resets the file and error when reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ImportJsonModal open onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Create board" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(<ImportJsonModal open={false} onClose={vi.fn()} />);
    rerender(<ImportJsonModal open onClose={vi.fn()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("No file selected.")).toBeInTheDocument();
  });

  it("with a ConfirmDialog stacked on top, one Escape closes only the confirmation", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <>
        <ImportJsonModal open onClose={onClose} />
        <ConfirmDialog open title="Replace the current board?" message="m" confirmLabel="Replace" onConfirm={vi.fn()} onCancel={onCancel} />
      </>,
    );
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <>
        <ImportJsonModal open onClose={onClose} />
        <ConfirmDialog open={false} title="Replace the current board?" message="m" confirmLabel="Replace" onConfirm={vi.fn()} onCancel={onCancel} />
      </>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
