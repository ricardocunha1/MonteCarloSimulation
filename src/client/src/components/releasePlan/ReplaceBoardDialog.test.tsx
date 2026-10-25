import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { REPLACE_BOARD_TITLE, ReplaceBoardDialog, replaceBoardMessage } from "./ReplaceBoardDialog";

describe("ReplaceBoardDialog", () => {
  it("builds the replace message from both plan names", () => {
    expect(replaceBoardMessage("Old", "New")).toBe('The current board "Old" will be replaced by "New". Changes to the current board will be lost.');
  });

  it("is closed while nextName is null", () => {
    render(<ReplaceBoardDialog currentName="Old" nextName={null} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the title, message and Replace/Cancel buttons", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ReplaceBoardDialog currentName="Old" nextName="New" onConfirm={onConfirm} onCancel={onCancel} />);
    const dialog = screen.getByRole("dialog", { name: REPLACE_BOARD_TITLE });
    expect(REPLACE_BOARD_TITLE).toBe("Replace the current board?");
    expect(dialog).toHaveTextContent(replaceBoardMessage("Old", "New"));
    await user.click(screen.getByRole("button", { name: "Replace" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
