import { L, LF } from "../../lib/releasePlan/constants";
import type { FlippedFlag, FlippedLayout } from "../../lib/releasePlan/layout";
import { epicMsLabel, featuresInBand, fmtDate, msById } from "../../lib/releasePlan/selectors";
import { useReleasePlan } from "../../releasePlanStore";
import type { CanvasProps } from "./Board";
import { bandBackground, type BoxRect } from "./boardGeometry";
import { EpicHeader } from "./EpicHeader";
import { FeatureCell, type CellDragState } from "./FeatureCell";
import { FlagIcon } from "./FlagIcon";
import { FlagLabel } from "./FlagLabel";
import { GapButton } from "./GapButton";
import { MilestoneLabel } from "./MilestoneLabel";
import { cellKey } from "./useBoardDrag";

/**
 * Unrotated box of a flag label in the header row: the standard label's size
 * transposed (`headH - 14` × `FLAG_H - 8`), centered so that, once rotated -90°,
 * it hangs from the top of its flag column.
 */
function flagLabelRect(ff: FlippedFlag, headH: number): BoxRect {
  const width = headH - 14;
  const height = L.FLAG_H - 8;
  return { left: ff.x + ff.w / 2 - width / 2, top: width / 2 - height / 2, width, height };
}

/**
 * Flipped board content (milestones as columns, Epic groups of Feature rows):
 * a frozen header row (`.frzTop`, sticky to the top of the scroll box and
 * scaled with the zoom) with the milestone labels, the rotated flag labels and
 * the "+" gap buttons, then the zoomed canvas with the milestone columns, the
 * Epic backgrounds/headers, one cell per (Feature row × column) and the dashed
 * flag columns. Same actions, drag handlers and memoized cells as the standard
 * board.
 */
export function FlippedCanvas({ plan, layout, zoom, boardDrag, onOpenItem, onGapClick }: CanvasProps<FlippedLayout>) {
  const { dispatch } = useReleasePlan();
  const { selection, activeDrag, dropTarget, handlers: drag } = boardDrag;
  const featureDrag = activeDrag?.type === "feature" ? activeDrag : null;
  const milestoneCount = plan.milestones.length;
  const { headH, colX0 } = layout;
  return (
    <div style={{ width: layout.width * zoom }}>
      <div className="frzTop">
        <div className="frzScale" data-testid="frozen-header" style={{ transform: `scale(${zoom})`, width: layout.width, height: headH }}>
          <div className="abs frzrow" style={{ left: 0, top: 0, width: layout.width, height: headH }} />
          {layout.columns.map((c, i) => (
            <MilestoneLabel
              key={c.band.id ?? "unplanned"}
              band={c.band}
              rect={{ left: c.x, top: 0, width: c.w, height: headH }}
              index={i}
              milestoneCount={milestoneCount}
              features={featuresInBand(plan, c.band.id)}
              background={bandBackground(c.band.unplanned, i)}
              flipped
            />
          ))}
          {layout.flags.map((ff) => (
            <FlagLabel key={ff.flag.id} flag={ff.flag} rect={flagLabelRect(ff, headH)} flipped />
          ))}
          {layout.gaps.map((gap) => (
            <GapButton
              key={gap.afterMsId}
              milestoneName={msById(plan, gap.afterMsId)?.name ?? ""}
              mode={plan.mode}
              left={gap.x - 11}
              top={headH - 11}
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
          {layout.columns.map((c, i) => (
            <div
              key={c.band.id ?? "unplanned"}
              className={`abs band col${c.band.unplanned ? " unplanned" : ""}`}
              style={{ left: c.x, top: 0, width: c.w, height: layout.height, background: bandBackground(c.band.unplanned, i) }}
            />
          ))}
          {layout.epics.map((fe, ei) => (
            <div key={String(fe.epic.id)}>
              <div className="abs epicbg" style={{ left: colX0 - 4, top: fe.y, width: layout.width - colX0 - 8, height: fe.h }} />
              <EpicHeader
                epic={fe.epic}
                rect={{ left: LF.LEFT, top: fe.y, width: LF.EPIC_W, height: fe.h }}
                label={epicMsLabel(plan, fe.epic)}
                onMovePrev={() => dispatch({ type: "moveEpic", from: ei, to: ei - 1 })}
                onMoveNext={() => dispatch({ type: "moveEpic", from: ei, to: ei + 1 })}
                onOpen={() => onOpenItem({ type: "epic", id: fe.epic.id })}
                drag={drag}
                dragging={activeDrag?.type === "epic" && activeDrag.id === fe.epic.id}
                dropSide={dropTarget?.kind === "epic" && dropTarget.epicId === fe.epic.id ? dropTarget.side : null}
                flipped
              />
              {fe.rows.map((row) => {
                const fid = row.feature.id;
                const dragState: CellDragState = featureDrag ? (featureDrag.epicId === fe.epic.id ? "valid" : "invalid") : null;
                const selected = selection?.epicId === fe.epic.id && selection.ids.has(fid);
                const dragging = featureDrag?.epicId === fe.epic.id && featureDrag.ids.includes(fid);
                return layout.columns.map((c) => {
                  const over = dropTarget?.kind === "cell" && dropTarget.key === cellKey(fe.epic.id, fid, c.band.id) ? dropTarget : null;
                  return (
                    <FeatureCell
                      key={`${String(fid)}:${c.band.id ?? "unplanned"}`}
                      epic={fe.epic}
                      feature={row.feature}
                      bandId={c.band.id}
                      left={c.x}
                      top={row.y}
                      width={c.w}
                      height={L.CARD_H}
                      flipped
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
          {layout.flags.map((ff) => (
            <div key={ff.flag.id} className="abs flagcol" style={{ left: ff.x, top: headH, width: ff.w, height: layout.height - headH }}>
              <span className="flagtag vert" style={{ top: LF.TOP - headH + 6 }}>
                <FlagIcon />
                {ff.flag.name + (ff.flag.date ? ` · ${fmtDate(ff.flag.date)}` : "")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
