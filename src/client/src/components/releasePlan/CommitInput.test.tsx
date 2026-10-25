import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommitInput } from "./CommitInput";

describe("CommitInput", () => {
  it("commits the draft on blur and on Enter, not while typing", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<CommitInput aria-label="Name" value="Old" onCommit={onCommit} />);
    const input = screen.getByLabelText("Name");
    await user.clear(input);
    await user.type(input, "New ");
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("New ");
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenLastCalledWith("New ");
    await user.type(input, "x");
    await user.tab();
    expect(onCommit).toHaveBeenLastCalledWith("Oldx");
  });

  it("reverts the draft on Escape and does not commit an untouched value", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<CommitInput aria-label="Name" value="Keep" onCommit={onCommit} />);
    const input = screen.getByLabelText("Name");
    await user.type(input, "zz");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("Keep");
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
