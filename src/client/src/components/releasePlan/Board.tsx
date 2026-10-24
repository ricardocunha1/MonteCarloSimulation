import { useEffect, useRef, useState, type RefObject } from "react";
import { L, uid } from "../../lib/releasePlan/constants";
import type { AnyBoardLayout, BoardLayout } from "../../lib/releasePlan/layout";
import { epicMsLabel, featuresInBand, fmtDate, msById } from "../../lib/releasePlan/selectors";
import type { ReleasePlan, WorkItemRef } from "../../lib/releasePlan/types";
import { useReleasePlan } from "../../releasePlanStore";
import { useToast } from "../Toast";
import { bandBackground } from "./boardGeometry";
import { EpicHeader } from "./EpicHeader";
import { FeatureCell, type CellDragState } from "./FeatureCell";
import { FlagIcon } from "./FlagIcon";
import { FlagLabel } from "./FlagLabel";
import { FlippedCanvas } from "./FlippedBoard";
import { GapButton } from "./GapButton";
import { GapMenu, type AnchorRect } from "./GapMenu";
import { MilestoneLabel } from "./MilestoneLabel";
import { cellKey, useBoardDrag, type BoardDrag } from "./useBoardDrag";

/** The gap menu closes on a board scroll only after this delay (opening it may scroll the board). */
const GAP_MENU_SCROLL_GRACE_MS = 400;

/** A "+" insertion point (either orientation): insert at `idx`, or add a flag after `afterMsId`. */
export interface GapTarget {
  idx: number;
  afterMsId: string;
}

interface OpenGapMenu {
  gap: GapTarget;
  anchor: AnchorRect;
  openedAt: number;
}

/**
 * The board: scroll box with a frozen milestone column (labels, flag labels, "+"
 * gap buttons) and the zoomed canvas (bands, epic backgrounds/headers, feature
 * cells, flag rows). Newly inserted milestones/flags get focus with their name
 * selected. Drag-and-drop and the Ctrl/⌘+click selection come from
 * `useBoardDrag`; this component only maps its state to classes.
 *
 * A flipped `layout` (`orientation: "flipped"`) renders {@link FlippedCanvas}
 * instead: milestone columns with a frozen header row (sticky to the top, with
 * a shadow while scrolled vertically) and Epic groups of Feature rows; the
 * insert/gap-menu/focus logic, the drag hook and the hint (with transposed
 * wording) are shared.
 */
export function Board({
  plan,
  layout,
  zoom,
  scrollRef,
  onOpenItem,
}: {
  plan: ReleasePlan;
  layout: AnyBoardLayout;
  zoom: number;
  /** The scroll box, also used by the toolbar's Fit. */
  scrollRef: RefObject<HTMLDivElement>;
  onOpenItem: (item: WorkItemRef) => void;
}) {
  const { dispatch } = useReleasePlan();
  const { showInfo } = useToast();
  const flipped = layout.orientation === "flipped";
  const [scrolledX, setScrolledX] = useState(false);
  const [scrolledY, setScrolledY] = useState(false);
  const [gapMenu, setGapMenu] = useState<OpenGapMenu | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const boardDrag = useBoardDrag({ dispatch, scrollRef, orientation: layout.orientation });

  useEffect(() => {
    if (!pendingFocus) {
      return;
    }
    const input = rootRef.current?.querySelector<HTMLInputElement>(`[data-focus="${pendingFocus}"]`);
    if (input) {
      input.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      input.focus();
      input.select();
      setPendingFocus(null);
    }
  }, [pendingFocus, plan]);

  const insertMilestone = (idx: number) => {
    const id = uid("ms_");
    dispatch({ type: "insertMilestone", idx, id });
    setPendingFocus(`ms:${id}`);
    showInfo(plan.mode === "sprints" ? "Sprint added" : "Milestone added");
  };

  const addFlag = (afterMsId: string) => {
    const ms = msById(plan, afterMsId);
    if (!ms) {
      return;
    }
    const id = uid("fl_");
    dispatch({ type: "addFlag", afterMsId, id });
    setPendingFocus(`fl:${id}`);
    showInfo(`Milestone flag added after ${ms.name}`);
  };

  const onGapClick = (gap: GapTarget, button: HTMLButtonElement) => {
    if (plan.mode !== "sprints") {
      insertMilestone(gap.idx);
      return;
    }
    const r = button.getBoundingClientRect();
    setGapMenu({ gap, anchor: { top: r.top, right: r.right }, openedAt: Date.now() });
  };

  const onScroll = () => {
    const box = scrollRef.current;
    if (box) {
      setScrolledX(box.scrollLeft > 0);
      setScrolledY(flipped && box.scrollTop > 0);
    }
    if (gapMenu && Date.now() - gapMenu.openedAt > GAP_MENU_SCROLL_GRACE_MS) {
      setGapMenu(null);
    }
  };

  const scrollClass = `boardScroll${scrolledX ? " scrolledX" : ""}${scrolledY ? " scrolledY" : ""}`;

  return (
    <section ref={rootRef} aria-label="Board">
      <p className="hint">
        {flipped ? (
          <>
            Drag Epics to reorder them. Drag a Feature card left or right to move it to another milestone, or onto another row of the same
            Epic to reorder it.
          </>
        ) : (
          <>
            Drag Epics to reorder them. Drag a Feature card up or down to move it to another milestone, or onto another column of the same
            Epic to reorder it.
          </>
        )}{" "}
        <b>Ctrl+click</b> (⌘+click on Mac) selects several Features of the same Epic to move them together. Click any work item to see its description. Use the <b>+</b> between milestones to insert a new one (in Sprint mode, also a
        milestone flag).{" "}
        <span className="okmark" aria-hidden="true">
          ✓
        </span>{" "}
        = Resolved / Done / Closed.
      </p>
      <div ref={scrollRef} className={scrollClass} data-testid="board-scroll" onScroll={onScroll} onClick={boardDrag.handlers.boardClick}>
        {layout.orientation === "flipped" ? (
          <FlippedCanvas plan={plan} layout={layout} zoom={zoom} boardDrag={boardDrag} onOpenItem={onOpenItem} onGapClick={onGapClick} />
        ) : (
          <StandardCanvas plan={plan} layout={layout} zoom={zoom} boardDrag={boardDrag} onOpenItem={onOpenItem} onGapClick={onGapClick} />
        )}
      </div>
      {gapMenu && (
        <GapMenu
          anchor={gapMenu.anchor}
          onClose={() => setGapMenu(null)}
          onAddSprint={() => insertMilestone(gapMenu.gap.idx)}
          onAddFlag={() => addFlag(gapMenu.gap.afterMsId)}
        />
      )}
    </section>
  );
}

/** Props shared by the standard and the flipped board canvases. */
export interface CanvasProps<T> {
  plan: ReleasePlan;
  layout: T;
  zoom: number;
  /** State and stable handlers of `useBoardDrag`. */
  boardDrag: BoardDrag;
  onOpenItem: (item: WorkItemRef) => void;
  onGapClick: (gap: GapTarget, button: HTMLButtonElement) => void;
}

/** Standard board content: frozen milestone column + bands, Epic columns, cells and flag rows. */
function StandardCanvas({ plan, layout, zoom, boardDrag, onOpenItem, onGapClick }: CanvasProps<BoardLayout>) {
  const { dispatch } = useReleasePlan();
  const { selection, activeDrag, dropTarget, handlers: drag } = boardDrag;
  const featureDrag = activeDrag?.type === "feature" ? activeDrag : null;
  const milestoneCount = plan.milestones.length;
  return (
    <div style={{ width: layout.width * zoom }}>
      <div className="frz">
        <div
          className="frzScale"
          data-testid="frozen-column"
          style={{ transform: `scale(${zoom})`, width: L.LBL_W, height: layout.height }}
        >
          <div className="abs frzcol" style={{ left: 0, top: 0, width: L.LBL_W, height: layout.height }} />
          {layout.bands.map((lb, i) => (
            <MilestoneLabel
              key={lb.band.id ?? "unplanned"}
              band={lb.band}
              rect={{ left: 0, top: lb.y, width: L.LBL_W, height: lb.h }}
              index={i}
              milestoneCount={milestoneCount}
              features={featuresInBand(plan, lb.band.id)}
              background={bandBackground(lb.band.unplanned, i)}
            />
          ))}
          {layout.flags.map((lf) => (
            <FlagLabel key={lf.flag.id} flag={lf.flag} rect={{ left: 0, top: lf.y + 4, width: L.LBL_W - 14, height: lf.h - 8 }} />
          ))}
          {layout.gaps.map((gap) => (
            <GapButton
              key={gap.afterMsId}
              milestoneName={msById(plan, gap.afterMsId)?.name ?? ""}
              mode={plan.mode}
              left={L.LBL_W - 11}
              top={gap.y - 11}
              onClick={(button) => onGapClick(gap, button)}
            />
          ))}
        </div>
      </div>
      <div
        className="boardScale"
        data-testid="board-scale"
        style={{ transform: `scale(${zoom})`, width: layout.width * zoom, height: layout.height * zoom }}
      >
        <div className="board" style={{ width: layout.width, height: layout.height }}>
          {layout.bands.map((lb, i) => (
            <div
              key={lb.band.id ?? "unplanned"}
              className={`abs band${lb.band.unplanned ? " unplanned" : ""}`}
              style={{ left: 0, top: lb.y, width: layout.width, height: lb.h, background: bandBackground(lb.band.unplanned, i) }}
            />
          ))}
          {layout.epics.map((le, ei) => (
            <div key={String(le.epic.id)}>
              <div
                className="abs epicbg"
                style={{ left: le.x, top: layout.bandY0 - 4, width: le.w, height: layout.height - layout.bandY0 - 8 }}
              />
              <EpicHeader
                epic={le.epic}
                rect={{ left: le.x, top: L.TOP, width: le.w, height: L.EPIC_H }}
                label={epicMsLabel(plan, le.epic)}
                onMovePrev={() => dispatch({ type: "moveEpic", from: ei, to: ei - 1 })}
                onMoveNext={() => dispatch({ type: "moveEpic", from: ei, to: ei + 1 })}
                onOpen={() => onOpenItem({ type: "epic", id: le.epic.id })}
                drag={drag}
                dragging={activeDrag?.type === "epic" && activeDrag.id === le.epic.id}
                dropSide={dropTarget?.kind === "epic" && dropTarget.epicId === le.epic.id ? dropTarget.side : null}
              />
              {le.cols.map((col) => {
                const fid = col.feature.id;
                const dragState: CellDragState = featureDrag ? (featureDrag.epicId === le.epic.id ? "valid" : "invalid") : null;
                const selected = selection?.epicId === le.epic.id && selection.ids.has(fid);
                const dragging = featureDrag?.epicId === le.epic.id && featureDrag.ids.includes(fid);
                return layout.bands.map((lb) => {
                  const over = dropTarget?.kind === "cell" && dropTarget.key === cellKey(le.epic.id, fid, lb.band.id) ? dropTarget : null;
                  return (
                    <FeatureCell
                      key={`${String(fid)}:${lb.band.id ?? "unplanned"}`}
                      epic={le.epic}
                      feature={col.feature}
                      bandId={lb.band.id}
                      left={col.x}
                      top={lb.y}
                      width={L.COL_W}
                      height={lb.h}
                      onOpenItem={onOpenItem}
                      drag={drag}
                      dragState={dragState}
                      over={over !== null}
                      dropSide={over?.side ?? null}
                      selected={selected}
                      dragging={dragging}
                    />
                  );
                });
              })}
            </div>
          ))}
          {layout.flags.map((lf) => (
            <div
              key={lf.flag.id}
              className="abs flagrow"
              style={{ left: L.LBL_W, top: lf.y, width: layout.width - L.LBL_W, height: lf.h }}
            >
              <span className="flagtag" style={{ left: L.LEFT - L.LBL_W + 6 }}>
                <FlagIcon />
                {lf.flag.name + (lf.flag.date ? ` · ${fmtDate(lf.flag.date)}` : "")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
