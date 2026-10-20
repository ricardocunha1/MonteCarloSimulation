import { useEffect, useRef, useState, type RefObject } from "react";
import { L, uid } from "../../lib/releasePlan/constants";
import type { BoardLayout, LayoutGap } from "../../lib/releasePlan/layout";
import { epicMsLabel, featuresInBand, fmtDate, msById } from "../../lib/releasePlan/selectors";
import type { ReleasePlan, WorkItemRef } from "../../lib/releasePlan/types";
import { useReleasePlan } from "../../releasePlanStore";
import { useToast } from "../Toast";
import { EpicHeader } from "./EpicHeader";
import { FeatureCell } from "./FeatureCell";
import { FlagIcon } from "./FlagIcon";
import { FlagLabel } from "./FlagLabel";
import { GapMenu, type AnchorRect } from "./GapMenu";
import { MilestoneLabel } from "./MilestoneLabel";

/** The gap menu closes on a board scroll only after this delay (opening it may scroll the board). */
const GAP_MENU_SCROLL_GRACE_MS = 400;

interface OpenGapMenu {
  gap: LayoutGap;
  anchor: AnchorRect;
  openedAt: number;
}

/**
 * The board: scroll box with a frozen milestone column (labels, flag labels, "+"
 * gap buttons) and the zoomed canvas (bands, epic backgrounds/headers, feature
 * cells, flag rows). Newly inserted milestones/flags get focus with their name
 * selected. No drag-and-drop in Phase 1.
 */
export function Board({
  plan,
  layout,
  zoom,
  scrollRef,
  onOpenItem,
}: {
  plan: ReleasePlan;
  layout: BoardLayout;
  zoom: number;
  /** The scroll box, also used by the toolbar's Fit. */
  scrollRef: RefObject<HTMLDivElement>;
  onOpenItem: (item: WorkItemRef) => void;
}) {
  const { dispatch } = useReleasePlan();
  const { showInfo } = useToast();
  const [scrolledX, setScrolledX] = useState(false);
  const [gapMenu, setGapMenu] = useState<OpenGapMenu | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const onGapClick = (gap: LayoutGap, button: HTMLButtonElement) => {
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
    }
    if (gapMenu && Date.now() - gapMenu.openedAt > GAP_MENU_SCROLL_GRACE_MS) {
      setGapMenu(null);
    }
  };

  const milestoneCount = plan.milestones.length;
  const bandBackground = (unplanned: boolean, i: number) => (unplanned ? "var(--unplanned)" : i % 2 ? "var(--band-b)" : "var(--band-a)");

  return (
    <section ref={rootRef} aria-label="Board">
      <p className="hint">
        Click any work item to see its description. Use the <b>+</b> between milestones to insert a new one (in Sprint mode, also a
        milestone flag).{" "}
        <span className="okmark" aria-hidden="true">
          ✓
        </span>{" "}
        = Resolved / Done / Closed.
      </p>
      <div ref={scrollRef} className={`boardScroll${scrolledX ? " scrolledX" : ""}`} data-testid="board-scroll" onScroll={onScroll}>
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
                  layoutBand={lb}
                  index={i}
                  milestoneCount={milestoneCount}
                  features={featuresInBand(plan, lb.band.id)}
                  background={bandBackground(lb.band.unplanned, i)}
                />
              ))}
              {layout.flags.map((lf) => (
                <FlagLabel key={lf.flag.id} layoutFlag={lf} />
              ))}
              {layout.gaps.map((gap) => (
                <button
                  key={gap.afterMsId}
                  type="button"
                  className="abs addgap"
                  aria-label={`Insert after ${msById(plan, gap.afterMsId)?.name ?? ""}`}
                  title={plan.mode === "sprints" ? "Add a sprint or a milestone flag here" : "Add a milestone here"}
                  style={{ left: L.LBL_W - 11, top: gap.y - 11 }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onGapClick(gap, event.currentTarget);
                  }}
                >
                  +
                </button>
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
                    x={le.x}
                    w={le.w}
                    label={epicMsLabel(plan, le.epic)}
                    onMoveLeft={() => dispatch({ type: "moveEpic", from: ei, to: ei - 1 })}
                    onMoveRight={() => dispatch({ type: "moveEpic", from: ei, to: ei + 1 })}
                    onOpen={() => onOpenItem({ type: "epic", id: le.epic.id })}
                  />
                  {le.cols.map((col) =>
                    layout.bands.map((lb) => (
                      <FeatureCell
                        key={`${String(col.feature.id)}:${lb.band.id ?? "unplanned"}`}
                        epic={le.epic}
                        feature={col.feature}
                        x={col.x}
                        layoutBand={lb}
                        onOpen={() => onOpenItem({ type: "feature", id: col.feature.id })}
                      />
                    )),
                  )}
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
