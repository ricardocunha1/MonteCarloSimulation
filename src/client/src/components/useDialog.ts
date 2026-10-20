import { useEffect, useRef, type RefObject } from "react";

/** Open dialogs, bottom → top. Only the topmost one reacts to Esc/Tab. */
const dialogStack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("hidden"));
}

/**
 * Shared modal behavior for `role="dialog"` components:
 * - Esc calls `onClose`, but only for the topmost open dialog (stacked dialogs
 *   don't all close on one Esc);
 * - Tab/Shift+Tab are trapped inside `dialogRef` while it is topmost;
 * - on open (false → true only) focuses `initialFocusRef` (or the first focusable)
 *   and on close restores the previously focused element.
 * `onClose` is read through a ref, so a new callback identity on re-render does
 * not re-run the open effect (no focus jumps).
 */
export function useDialog({
  open,
  onClose,
  dialogRef,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
}): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Refs are stable objects; read them through a ref too so the effect depends on `open` only.
  const refs = useRef({ dialogRef, initialFocusRef });
  refs.current = { dialogRef, initialFocusRef };

  useEffect(() => {
    if (!open) {
      return;
    }
    const token = Symbol("dialog");
    dialogStack.push(token);
    const isTopmost = () => dialogStack[dialogStack.length - 1] === token;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { dialogRef: dlg, initialFocusRef: initial } = refs.current;
    const first = initial?.current ?? (dlg.current ? focusables(dlg.current)[0] : undefined);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost() || event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      const container = refs.current.dialogRef.current;
      if (event.key !== "Tab" || !container) {
        return;
      }
      const items = focusables(container);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!(active instanceof Node) || !container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? lastItem : firstItem).focus();
      } else if (event.shiftKey && active === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const i = dialogStack.indexOf(token);
      if (i >= 0) {
        dialogStack.splice(i, 1);
      }
      previouslyFocused?.focus();
    };
  }, [open]);
}
