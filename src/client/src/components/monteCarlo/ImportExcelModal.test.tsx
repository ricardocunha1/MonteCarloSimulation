import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ImportExcelModal } from "./ImportExcelModal";

function renderModal() {
  const onClose = vi.fn();
  const onFileSelected = vi.fn();
  render(<ImportExcelModal open onClose={onClose} onFileSelected={onFileSelected} />);
  return { onClose, onFileSelected };
}

const fileInput = () => screen.getByLabelText("Sprint history file");
const continueButton = () => screen.getByRole("button", { name: "Continue" });
const xlsx = (name = "history.xlsx") => new File(["xlsx"], name);

describe("ImportExcelModal", () => {
  it("is a labelled dialog with an .xlsx file input, focused on open", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Import an Excel file" })).toHaveAttribute("aria-modal", "true");
    expect(fileInput()).toHaveAttribute("accept", ".xlsx");
    expect(fileInput()).toHaveFocus();
    expect(screen.getByText("No file selected.")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(<ImportExcelModal open={false} onClose={vi.fn()} onFileSelected={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the inline error when Continue is pressed without a file and stays open", async () => {
    const user = userEvent.setup();
    const { onClose, onFileSelected } = renderModal();
    await user.click(continueButton());
    expect(screen.getByRole("alert")).toHaveTextContent("Select an .xlsx file.");
    expect(fileInput()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it("shows the inline error for a file without an .xlsx extension", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { onFileSelected } = renderModal();
    await user.upload(fileInput(), new File(["a,b"], "history.csv"));
    expect(screen.getByText("history.csv")).toBeInTheDocument();
    await user.click(continueButton());
    expect(screen.getByRole("alert")).toHaveTextContent("Select an .xlsx file.");
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it("clears the error when another file is chosen", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderModal();
    await user.click(continueButton());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.upload(fileInput(), xlsx());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("passes a valid .xlsx file (case-insensitive name) to onFileSelected", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { onFileSelected, onClose } = renderModal();
    const file = xlsx("HISTORY.XLSX");
    await user.upload(fileInput(), file);
    expect(screen.getByTestId("import-excel-file-name")).toHaveTextContent("Selected file: HISTORY.XLSX");
    await user.click(continueButton());
    expect(onFileSelected).toHaveBeenCalledExactlyOnceWith(file);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancel, Escape and the backdrop close", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("import-excel-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("resets the chosen file and error when reopened, and restores focus to the opener", async () => {
    const user = userEvent.setup({ applyAccept: false });
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <ImportExcelModal open={open} onClose={() => setOpen(false)} onFileSelected={vi.fn()} />
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });

    await user.click(opener);
    await user.upload(fileInput(), new File(["x"], "notes.txt"));
    await user.click(continueButton());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await user.click(opener);
    expect(screen.getByText("No file selected.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
