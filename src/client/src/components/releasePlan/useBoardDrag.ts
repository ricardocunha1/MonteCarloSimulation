import { useEffect, useMemo, useRef, useState, type Dispatch, type DragEvent, type MouseEvent, type RefObject } from "react";
import { edgeSpeed } from "../../lib/releasePlan/autoScroll";
import { ADO } from "../../lib/releasePlan/constants";
import type { BoardOrientation } from "../../lib/releasePlan/layout";
import type { DropSide, PlanAction } from "../../lib/releasePlan/reducer";
import type { Epic, WorkItemId } from "../../lib/releasePlan/types";
import { isDialogOpen } from "../useDialog";

/** What is being dragged: one Epic, or one or more Features of one Epic (in column order). */
export type ActiveDrag = { type: "epic"; id: WorkItemId } | { type: "feature"; epicId: WorkItemId; ids: readonly WorkItemId[] };

/** Ctrl/⌘+click selection: Features of a single Epic. Never persisted. */
export interface FeatureSelection {
  epicId: WorkItemId;
  ids: ReadonlySet<WorkItemId>;
}

/**
 * The element currently under a valid drag: another Epic header (with the side
 * of the drop indicator) or a Feature cell (`side` only when the drop reorders).
 */
export type DropTarget = { kind: "epic"; epicId: WorkItemId; side: DropSide } | { kind: "cell"; key: string; side: DropSide | null };

/** Stable event handlers wired by the board components (identity never changes). */
export interface BoardDragHandlers {
  epicDragStart: (event: DragEvent<HTMLElement>, epicId: WorkItemId) => void;
  epicDragOver: (event: DragEvent<HTMLElement>, epicId: WorkItemId) => void;
  epicDragLeave: (event: DragEvent<HTMLElement>, epicId: WorkItemId) => void;
  epicDrop: (event: DragEvent<HTMLElement>, epicId: WorkItemId) => void;
  /** Ctrl/⌘+click toggles the Feature in the selection; a plain click clears the selection and calls `open`. */
  cardClick: (event: MouseEvent<HTMLElement>, epicId: WorkItemId, featureId: WorkItemId, open: () => void) => void;
  cardDragStart: (event: DragEvent<HTMLElement>, epic: Epic, featureId: WorkItemId) => void;
  cellDragOver: (event: DragEvent<HTMLElement>, epicId: WorkItemId, featureId: WorkItemId, bandId: string | null) => void;
  cellDragLeave: (event: DragEvent<HTMLElement>, epicId: WorkItemId, featureId: WorkItemId, bandId: string | null) => void;
  cellDrop: (event: DragEvent<HTMLElement>, epicId: WorkItemId, featureId: WorkItemId, bandId: string | null) => void;
  /** Ends any drag and clears every drag highlight (also run by a document `dragend` listener). */
  dragEnd: () => void;
  /** Click on the board: clears the selection unless it hit a card or used Ctrl/⌘. */
  boardClick: (event: MouseEvent<HTMLElement>) => void;
  clearSelection: () => void;
}

/** Drag + selection state of the board (see {@link useBoardDrag}). */
export interface BoardDrag {
  selection: FeatureSelection | null;
  /** The drag shown on screen; set one tick after `dragstart` (like the template) so the drag image is the undimmed element. */
  activeDrag: ActiveDrag | null;
  dropTarget: DropTarget | null;
  handlers: BoardDragHandlers;
}

/** `id` of the multi-Feature drag image element. */
export const DRAG_GHOST_ID = "dragGhost";

/** Identifies a (feature column × band) cell in {@link DropTarget}. */
export function cellKey(epicId: WorkItemId, featureId: WorkItemId, bandId: string | null): string {
  return JSON.stringify([epicId, featureId, bandId]);
}

/**
 * `R` (after) when the pointer is right of the element's horizontal midpoint,
 * else `L` (before). On the flipped board (`vertical`) the vertical midpoint
 * decides instead: below = `R` (after), above = `L` (before).
 */
function sideOf(event: DragEvent<HTMLElement>, vertical: boolean): DropSide {
  const r = event.currentTarget.getBoundingClientRect();
  if (vertical) {
    return event.clientY > r.top + r.height / 2 ? "R" : "L";
  }
  return event.clientX > r.left + r.width / 2 ? "R" : "L";
}

/** Whether a `dragleave` only moved into a descendant of the element (then it is not a real leave). */
function leftIntoChild(event: DragEvent<HTMLElement>): boolean {
  const related = event.relatedTarget;
  return related instanceof Node && event.currentTarget.contains(related);
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.kind === "epic" && b.kind === "epic") {
    return a.epicId === b.epicId && a.side === b.side;
  }
  if (a.kind === "cell" && b.kind === "cell") {
    return a.key === b.key && a.side === b.side;
  }
  return false;
}

/** Builds the off-screen "N features" drag image (inline styles: it lives on `body`, outside `.rp`). */
function createDragGhost(count: number): HTMLElement {
  const ghost = document.createElement("div");
  ghost.id = DRAG_GHOST_ID;
  ghost.textContent = `${count} features`;
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    padding: "6px 12px",
    borderRadius: "4px",
    background: ADO.story.color,
    color: ADO.story.ink,
    font: '600 13px/1.35 "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif',
    boxShadow: "0 2px 6px rgba(0,0,0,.35)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  });
  return ghost;
}

/**
 * Drag-and-drop and Ctrl/⌘+click selection for the board (native HTML5 DnD).
 *
 * - The drag itself lives in a ref so `dragover` handlers stay cheap; the
 *   visible state (`activeDrag`, `dropTarget`) only re-renders when it changes.
 * - Epic drop → `reorderEpic`; Feature drop on a cell of the same Epic →
 *   `dropFeatures` (and the selection is cleared).
 * - Global listeners: Esc clears the selection (not while a dialog is open), a
 *   document `dragover` drives the `requestAnimationFrame` auto-scroll of
 *   `scrollRef` (else the page), and `drop`/`dragend` (capture) stop it;
 *   `dragend` also clears every drag highlight. All listeners, timers and the
 *   rAF loop are released on unmount.
 *
 * Rules: *Drag-and-drop rules* in `plans/release-plan-board.md`. On the
 * flipped board the same rules apply transposed: the before/after side is
 * decided by `clientY` (`L` = above, `R` = below).
 *
 * In both orientations the auto-scroll also scrolls the box horizontally near
 * its left/right edges; the left zone starts at the right edge of the frozen
 * column (`frozenLeft`), which covers the box's own left edge.
 *
 * @param dispatch - The plan store's dispatch (`reorderEpic` / `dropFeatures`).
 * @param scrollRef - The board's scroll box, auto-scrolled first during a drag.
 * @param orientation - Board orientation (default `standard`); read through a ref, so `handlers` stay stable.
 * @param frozenLeft - Width (scaled px, default 0) of the sticky column frozen at the box's left edge.
 * @returns The selection, the visible drag/drop-target state and the stable `handlers`.
 */
export function useBoardDrag({
  dispatch,
  scrollRef,
  orientation = "standard",
  frozenLeft = 0,
}: {
  dispatch: Dispatch<PlanAction>;
  scrollRef: RefObject<HTMLElement>;
  orientation?: BoardOrientation;
  frozenLeft?: number;
}): BoardDrag {
  const [selection, setSelection] = useState<FeatureSelection | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // Mutable drag machinery, shared by the stable handlers and the global listeners.
  const m = useRef({
    drag: null as ActiveDrag | null,
    selection: null as FeatureSelection | null,
    dropTarget: null as DropTarget | null,
    tick: null as number | null,
    raf: null as number | null,
    pointerX: 0,
    pointerY: 0,
    ghosts: new Set<{ el: HTMLElement; timer: number }>(),
  });
  const deps = useRef({ dispatch, scrollRef, orientation, frozenLeft });
  deps.current = { dispatch, scrollRef, orientation, frozenLeft };

  const handlers = useMemo<BoardDragHandlers>(() => {
    const s = m.current;
    const side = (event: DragEvent<HTMLElement>) => sideOf(event, deps.current.orientation === "flipped");

    const applySelection = (next: FeatureSelection | null) => {
      if (s.selection !== next) {
        s.selection = next;
        setSelection(next);
      }
    };
    const applyDropTarget = (next: DropTarget | null) => {
      if (!sameTarget(s.dropTarget, next)) {
        s.dropTarget = next;
        setDropTarget(next);
      }
    };
    const clearTick = () => {
      if (s.tick !== null) {
        window.clearTimeout(s.tick);
        s.tick = null;
      }
    };
    const beginDrag = (drag: ActiveDrag) => {
      s.drag = drag;
      clearTick();
      s.tick = window.setTimeout(() => {
        s.tick = null;
        if (s.drag === drag) {
          setActiveDrag(drag);
        }
      }, 0);
    };
    const stopAutoScroll = () => {
      if (s.raf !== null) {
        window.cancelAnimationFrame(s.raf);
        s.raf = null;
      }
    };
    const dragEnd = () => {
      clearTick();
      stopAutoScroll();
      s.drag = null;
      setActiveDrag(null);
      applyDropTarget(null);
    };

    return {
      epicDragStart: (event, epicId) => {
        const dt = event.dataTransfer;
        if (dt) {
          dt.effectAllowed = "move";
          dt.setData("text/plain", `epic:${epicId}`);
        }
        beginDrag({ type: "epic", id: epicId });
      },
      epicDragOver: (event, epicId) => {
        const d = s.drag;
        if (d?.type !== "epic" || d.id === epicId) {
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
        applyDropTarget({ kind: "epic", epicId, side: side(event) });
      },
      epicDragLeave: (event, epicId) => {
        const t = s.dropTarget;
        if (!leftIntoChild(event) && t?.kind === "epic" && t.epicId === epicId) {
          applyDropTarget(null);
        }
      },
      epicDrop: (event, epicId) => {
        const d = s.drag;
        if (d?.type !== "epic" || d.id === epicId) {
          return;
        }
        event.preventDefault();
        deps.current.dispatch({ type: "reorderEpic", dragId: d.id, targetId: epicId, after: side(event) === "R" });
        dragEnd();
      },
      cardClick: (event, epicId, featureId, open) => {
        if (!(event.ctrlKey || event.metaKey)) {
          applySelection(null);
          open();
          return;
        }
        event.preventDefault();
        const cur = s.selection;
        if (!cur || cur.epicId !== epicId) {
          applySelection({ epicId, ids: new Set([featureId]) });
          return;
        }
        const ids = new Set(cur.ids);
        if (ids.has(featureId)) {
          ids.delete(featureId);
        } else {
          ids.add(featureId);
        }
        applySelection(ids.size ? { epicId, ids } : null);
      },
      cardDragStart: (event, epic, featureId) => {
        let sel = s.selection;
        if (sel && !(sel.epicId === epic.id && sel.ids.has(featureId))) {
          applySelection(null);
          sel = null;
        }
        const selected = sel?.ids;
        const ids = selected ? epic.features.filter((f) => selected.has(f.id)).map((f) => f.id) : [featureId];
        const dt = event.dataTransfer;
        if (dt) {
          dt.effectAllowed = "move";
          dt.setData("text/plain", `feature:${ids.join(",")}`);
          if (ids.length > 1 && typeof dt.setDragImage === "function") {
            const el = createDragGhost(ids.length);
            document.body.appendChild(el);
            dt.setDragImage(el, 10, 10);
            const entry = { el, timer: 0 };
            entry.timer = window.setTimeout(() => {
              el.remove();
              s.ghosts.delete(entry);
            }, 0);
            s.ghosts.add(entry);
          }
        }
        beginDrag({ type: "feature", epicId: epic.id, ids });
      },
      cellDragOver: (event, epicId, featureId, bandId) => {
        const d = s.drag;
        if (d?.type !== "feature" || d.epicId !== epicId) {
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
        const reorder = d.ids.length === 1 && d.ids[0] !== featureId;
        applyDropTarget({ kind: "cell", key: cellKey(epicId, featureId, bandId), side: reorder ? side(event) : null });
      },
      cellDragLeave: (event, epicId, featureId, bandId) => {
        const t = s.dropTarget;
        if (!leftIntoChild(event) && t?.kind === "cell" && t.key === cellKey(epicId, featureId, bandId)) {
          applyDropTarget(null);
        }
      },
      cellDrop: (event, epicId, featureId, bandId) => {
        const d = s.drag;
        if (d?.type !== "feature" || d.epicId !== epicId) {
          return;
        }
        event.preventDefault();
        deps.current.dispatch({ type: "dropFeatures", epicId, ids: d.ids, targetFeatureId: featureId, side: side(event), milestoneId: bandId });
        applySelection(null);
        dragEnd();
      },
      dragEnd,
      boardClick: (event) => {
        if (event.ctrlKey || event.metaKey) {
          return;
        }
        if (event.target instanceof Element && event.target.closest(".fcard")) {
          return;
        }
        applySelection(null);
      },
      clearSelection: () => applySelection(null),
    };
  }, []);

  useEffect(() => {
    const s = m.current;

    const scrollStep = (x: number, y: number) => {
      const box = deps.current.scrollRef.current;
      if (box) {
        const r = box.getBoundingClientRect();
        const left = Math.min(Math.max(r.left, 0) + deps.current.frozenLeft, r.right);
        const speedX = edgeSpeed(x, left, Math.min(r.right, window.innerWidth));
        if ((speedX < 0 && box.scrollLeft > 0) || (speedX > 0 && box.scrollLeft + box.clientWidth < box.scrollWidth)) {
          box.scrollLeft += speedX;
        }
      }
      if (box) {
        const r = box.getBoundingClientRect();
        const speed = edgeSpeed(y, Math.max(r.top, 0), Math.min(r.bottom, window.innerHeight));
        if ((speed < 0 && box.scrollTop > 0) || (speed > 0 && box.scrollTop + box.clientHeight < box.scrollHeight)) {
          box.scrollTop += speed;
          return;
        }
      }
      // No room in the board box: scroll the page (scrollingElement; jsdom lacks window.scrollBy).
      const page = document.scrollingElement ?? document.documentElement;
      const speed = edgeSpeed(y, 0, window.innerHeight);
      if ((speed < 0 && page.scrollTop > 0) || (speed > 0 && page.scrollTop + window.innerHeight < page.scrollHeight)) {
        page.scrollTop += speed;
      }
    };
    const frame = () => {
      s.raf = null;
      if (!s.drag) {
        return;
      }
      scrollStep(s.pointerX, s.pointerY);
      s.raf = window.requestAnimationFrame(frame);
    };
    const onDragOver = (event: globalThis.DragEvent) => {
      if (!s.drag) {
        return;
      }
      s.pointerX = event.clientX;
      s.pointerY = event.clientY;
      if (s.raf === null) {
        s.raf = window.requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      if (s.raf !== null) {
        window.cancelAnimationFrame(s.raf);
        s.raf = null;
      }
    };
    const onDragEnd = () => handlers.dragEnd();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && s.selection && !isDialogOpen()) {
        handlers.clearSelection();
      }
    };

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", stop, true);
    document.addEventListener("dragend", onDragEnd, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", stop, true);
      document.removeEventListener("dragend", onDragEnd, true);
      document.removeEventListener("keydown", onKeyDown);
      stop();
      if (s.tick !== null) {
        window.clearTimeout(s.tick);
        s.tick = null;
      }
      for (const g of s.ghosts) {
        window.clearTimeout(g.timer);
        g.el.remove();
      }
      s.ghosts.clear();
      s.drag = null;
    };
  }, [handlers]);

  return { selection, activeDrag, dropTarget, handlers };
}
