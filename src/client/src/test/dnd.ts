// HTML5 drag-and-drop helpers for jsdom (which has no DragEvent/DataTransfer).
import { act, createEvent, fireEvent } from "@testing-library/react";
import { vi, type Mock } from "vitest";

/** A minimal `DataTransfer` stand-in with spies. */
export interface MockDataTransfer {
  effectAllowed: string;
  dropEffect: string;
  setData: Mock<(format: string, data: string) => void>;
  getData: Mock<(format: string) => string>;
  setDragImage: Mock<(image: Element, x: number, y: number) => void>;
}

/** A fresh {@link MockDataTransfer}; share one instance across the events of a single drag so `getData` sees what `setData` stored. */
export function mockDataTransfer(): MockDataTransfer {
  const data = new Map<string, string>();
  return {
    effectAllowed: "uninitialized",
    dropEffect: "none",
    setData: vi.fn((format: string, value: string) => {
      data.set(format, value);
    }),
    getData: vi.fn((format: string) => data.get(format) ?? ""),
    setDragImage: vi.fn(),
  };
}

type DndEventName = "dragStart" | "dragEnter" | "dragOver" | "dragLeave" | "drop" | "dragEnd";

/**
 * Fires a drag event with a shared `dataTransfer` and, since jsdom falls back to
 * a plain `Event`, defines `clientX`/`clientY`/`relatedTarget` on it. Returns the
 * event (check `defaultPrevented` to see whether the drop was accepted).
 */
export function fireDnd(
  name: DndEventName,
  target: Element | Document,
  { dataTransfer, clientX = 0, clientY = 0, relatedTarget = null }: { dataTransfer?: MockDataTransfer; clientX?: number; clientY?: number; relatedTarget?: EventTarget | null } = {},
): Event {
  const event = createEvent[name](target, dataTransfer ? { dataTransfer } : {});
  Object.defineProperty(event, "clientX", { value: clientX });
  Object.defineProperty(event, "clientY", { value: clientY });
  Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
  fireEvent(target, event);
  return event;
}

/** Lets the "next tick" (`setTimeout(…, 0)`) drag highlighting run. */
export async function flushDragTick(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Every element reports a `width`-wide box at `left` (so `clientX` picks the L/R side). */
export function stubRects(rect: Partial<DOMRect> = {}): void {
  const full = { left: 0, top: 0, width: 160, height: 84, right: 160, bottom: 84, x: 0, y: 0, ...rect };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ ...full, toJSON: () => full } as DOMRect);
}
