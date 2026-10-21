import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireDnd, mockDataTransfer } from "../../test/dnd";
import { samplePlan } from "../../test/releasePlanFixtures";
import { BOARD_TEST_TIMEOUT_MS, renderBoard } from "../../test/renderBoard";
import { cellKey } from "./useBoardDrag";

/** Board box: viewport 0..400, content 2000px tall. */
const BOX = { top: 0, bottom: 400, left: 0, right: 800, width: 800, height: 400, x: 0, y: 0 };

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

/** Runs the queued animation frames once (each frame may queue the next). */
function runFrames() {
  const queued = [...frames.entries()];
  frames.clear();
  queued.forEach(([, cb]) => cb(performance.now()));
}

function setupBox() {
  const box = screen.getByTestId("board-scroll");
  vi.spyOn(box, "getBoundingClientRect").mockReturnValue({ ...BOX, toJSON: () => BOX } as DOMRect);
  Object.defineProperty(box, "clientHeight", { configurable: true, value: 400 });
  Object.defineProperty(box, "scrollHeight", { configurable: true, value: 2000 });
  return box;
}

const card = (title: string) => within(screen.getByRole("region", { name: "Board" })).getByRole("button", { name: new RegExp(title) });

describe("useBoardDrag auto-scroll and cleanup", { timeout: BOARD_TEST_TIMEOUT_MS }, () => {
  beforeEach(() => {
    frames = new Map();
    nextFrame = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      const id = nextFrame++;
      frames.set(id, cb);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
  });
  afterEach(() => vi.restoreAllMocks());

  it("scrolls the board box down near its bottom edge and up near its top edge, then stops on dragend", () => {
    renderBoard(samplePlan());
    const box = setupBox();
    const dt = mockDataTransfer();
    fireDnd("dragStart", card("Reports"), { dataTransfer: dt });

    fireDnd("dragOver", document, { clientY: 395 });
    expect(frames.size).toBe(1);
    runFrames();
    const afterOne = box.scrollTop;
    expect(afterOne).toBeGreaterThan(0);
    // The loop keeps going while the pointer stays there; extra dragovers don't start a second loop.
    fireDnd("dragOver", document, { clientY: 395 });
    expect(frames.size).toBe(1);
    runFrames();
    expect(box.scrollTop).toBeGreaterThan(afterOne);

    fireDnd("dragOver", document, { clientY: 5 });
    const down = box.scrollTop;
    runFrames();
    expect(box.scrollTop).toBeLessThan(down);

    fireDnd("dragOver", document, { clientY: 200 });
    const still = box.scrollTop;
    runFrames();
    expect(box.scrollTop).toBe(still);

    fireDnd("dragEnd", card("Reports"), { dataTransfer: dt });
    expect(frames.size).toBe(0);
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("does nothing on a document dragover without an active board drag", () => {
    renderBoard(samplePlan());
    setupBox();
    fireDnd("dragOver", document, { clientY: 395 });
    expect(frames.size).toBe(0);
  });

  it("stops the loop on a drop (capture phase) anywhere", () => {
    renderBoard(samplePlan());
    setupBox();
    fireDnd("dragStart", card("Reports"), { dataTransfer: mockDataTransfer() });
    fireDnd("dragOver", document, { clientY: 395 });
    expect(frames.size).toBe(1);
    fireDnd("drop", document.body);
    expect(frames.size).toBe(0);
  });

  it("does not scroll the box past its end", () => {
    renderBoard(samplePlan());
    const box = setupBox();
    box.scrollTop = 1600; // 1600 + 400 = scrollHeight
    fireDnd("dragStart", card("Reports"), { dataTransfer: mockDataTransfer() });
    fireDnd("dragOver", document, { clientY: 395 });
    runFrames();
    expect(box.scrollTop).toBe(1600);
  });

  it("removes every document listener and cancels the rAF loop on unmount", () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderBoard(samplePlan());
    setupBox();
    const types = ["dragover", "drop", "dragend", "keydown"];
    const added = add.mock.calls.filter(([type]) => types.includes(type));
    expect(added.map(([type]) => type)).toEqual(expect.arrayContaining(types));

    fireDnd("dragStart", card("Reports"), { dataTransfer: mockDataTransfer() });
    fireDnd("dragOver", document, { clientY: 395 });
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    const capture = (options: boolean | EventListenerOptions | undefined) => (typeof options === "boolean" ? options : (options?.capture ?? false));
    for (const [type, listener, options] of added) {
      const removed = remove.mock.calls.some(([t, l, o]) => t === type && l === listener && capture(o) === capture(options));
      expect(removed, `${type} listener removed`).toBe(true);
    }
  });

  it("removes a pending drag ghost on unmount", () => {
    const { unmount } = renderBoard(samplePlan());
    // Ctrl+click two features of Epic 2, then drag them: the ghost is on body until the next tick.
    card("Reports").dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    card("Charts").dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    fireDnd("dragStart", card("Charts"), { dataTransfer: mockDataTransfer() });
    expect(document.getElementById("dragGhost")).not.toBeNull();
    unmount();
    expect(document.getElementById("dragGhost")).toBeNull();
  });
});

describe("cellKey", () => {
  it("distinguishes numeric and string ids and the Unplanned band", () => {
    expect(cellKey(1, 2, "ms_a")).not.toBe(cellKey("1", 2, "ms_a"));
    expect(cellKey(1, 2, null)).not.toBe(cellKey(1, 2, "null"));
  });
});
