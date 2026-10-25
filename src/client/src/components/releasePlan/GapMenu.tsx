import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { FlagIcon } from "./FlagIcon";

/** Viewport rect of the "+" button the menu opens from. */
export interface AnchorRect {
  top: number;
  right: number;
}

/**
 * Sprints-mode menu of a "+" gap button: "Add sprint here" and, when the gap
 * follows a milestone, "Add milestone flag here". Fixed-positioned next to the
 * button (kept inside the viewport); closes on an outside click (except on a "+"
 * button) and on Esc. The board closes it on scroll.
 */
export function GapMenu({
  anchor,
  onAddSprint,
  onAddFlag,
  onClose,
}: {
  anchor: AnchorRect;
  onAddSprint: () => void;
  onAddFlag?: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [pos, setPos] = useState({ left: anchor.right + 6, top: anchor.top - 4 });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const width = menu?.offsetWidth ?? 0;
    const height = menu?.offsetHeight ?? 0;
    setPos({
      left: Math.min(anchor.right + 6, window.innerWidth - width - 8),
      top: Math.min(anchor.top - 4, window.innerHeight - height - 8),
    });
    menu?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [anchor]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && (target.closest("[data-gap-menu]") || target.closest(".addgap"))) {
        return;
      }
      onCloseRef.current();
    };
    const onDocKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onDocKey);
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = items.findIndex((b) => b === document.activeElement);
    const next = event.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div ref={menuRef} className="gapMenu" role="menu" aria-label="Insert" data-gap-menu="" style={pos} onKeyDown={onKeyDown}>
      <button type="button" role="menuitem" onClick={run(onAddSprint)}>
        <b>+</b> Add sprint here
      </button>
      {onAddFlag && (
        <button type="button" role="menuitem" onClick={run(onAddFlag)}>
          <FlagIcon /> Add milestone flag here
        </button>
      )}
    </div>
  );
}
