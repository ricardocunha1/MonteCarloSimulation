import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog(open = true) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <ConfirmDialog
      open={open}
      title="Replace the current board?"
      message={"Line one\nLine two"}
      confirmLabel="Replace"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel, ...result };
}

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    renderDialog(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a labelled modal dialog with a pre-line message", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Replace the current board?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const message = screen.getByText(/Line one/);
    expect(message).toHaveStyle({ whiteSpace: "pre-line" });
    expect(message.textContent).toBe("Line one\nLine two");
    expect(dialog).toHaveAccessibleDescription(/Line one\s+Line two/);
  });

  it("focuses the confirm button on open", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Replace" })).toHaveFocus();
  });

  it("calls onConfirm when confirmed", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Replace" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel from the Cancel button (default label)", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses a custom cancel label", () => {
    render(<ConfirmDialog open title="T" message="M" confirmLabel="Delete" cancelLabel="Keep" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
  });

  it("calls onCancel on Escape", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel on a backdrop click but not on a click inside the dialog", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.click(screen.getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("confirm-dialog-backdrop"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("ConfirmDialog dialog behavior (stacking, stable callbacks, focus trap)", () => {
  it("only the topmost dialog reacts to Escape", async () => {
    const user = userEvent.setup();
    const lowerCancel = vi.fn();
    const upperCancel = vi.fn();
    const { rerender } = render(
      <>
        <ConfirmDialog open title="Lower" message="m" confirmLabel="OK lower" onConfirm={vi.fn()} onCancel={lowerCancel} />
        <ConfirmDialog open title="Upper" message="m" confirmLabel="OK upper" onConfirm={vi.fn()} onCancel={upperCancel} />
      </>,
    );
    await user.keyboard("{Escape}");
    expect(upperCancel).toHaveBeenCalledTimes(1);
    expect(lowerCancel).not.toHaveBeenCalled();

    rerender(
      <>
        <ConfirmDialog open title="Lower" message="m" confirmLabel="OK lower" onConfirm={vi.fn()} onCancel={lowerCancel} />
        <ConfirmDialog open={false} title="Upper" message="m" confirmLabel="OK upper" onConfirm={vi.fn()} onCancel={upperCancel} />
      </>,
    );
    await user.keyboard("{Escape}");
    expect(lowerCancel).toHaveBeenCalledTimes(1);
    expect(upperCancel).toHaveBeenCalledTimes(1);
  });

  it("does not steal focus when re-rendered with a new onCancel, and calls the latest one", async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    const props = { open: true, title: "T", message: "M", confirmLabel: "OK", onConfirm: vi.fn() };
    const { rerender } = render(<ConfirmDialog {...props} onCancel={first} />);
    screen.getByRole("button", { name: "Cancel" }).focus();
    rerender(<ConfirmDialog {...props} onCancel={second} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("traps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">outside</button>
        <ConfirmDialog open title="T" message="M" confirmLabel="OK" onConfirm={vi.fn()} onCancel={vi.fn()} />
      </>,
    );
    expect(screen.getByRole("button", { name: "OK" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "OK" })).toHaveFocus();
  });

  it("restores the previous focus on close", () => {
    const props = { title: "T", message: "M", confirmLabel: "OK", onConfirm: vi.fn(), onCancel: vi.fn() };
    const { rerender } = render(
      <>
        <button type="button">opener</button>
        <ConfirmDialog open={false} {...props} />
      </>,
    );
    screen.getByRole("button", { name: "opener" }).focus();
    rerender(
      <>
        <button type="button">opener</button>
        <ConfirmDialog open {...props} />
      </>,
    );
    expect(screen.getByRole("button", { name: "OK" })).toHaveFocus();
    rerender(
      <>
        <button type="button">opener</button>
        <ConfirmDialog open={false} {...props} />
      </>,
    );
    expect(screen.getByRole("button", { name: "opener" })).toHaveFocus();
  });
});
