import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { ADO } from "../../lib/releasePlan/constants";
import { safeHtml } from "../../lib/releasePlan/sanitize";
import { epicMilestone, findEpic, findFeature, flagForMsIndex, isDone, msById, msIndex, sizeSummary } from "../../lib/releasePlan/selectors";
import type { Epic, Feature, ReleasePlan, WorkItemRef } from "../../lib/releasePlan/types";
import { useDialog } from "../useDialog";
import { FlagChip } from "./FlagChip";
import { MilestoneChip } from "./MilestoneChip";
import { SizeBadge } from "./SizeBadge";
import { StateMark } from "./StateMark";

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span>{label}</span>
      <b>{children}</b>
    </div>
  );
}

function StateValue({ state }: { state: string }) {
  return (
    <span>
      <StateMark state={state} /> {state || "–"}
    </span>
  );
}

type Resolved = { type: "feature"; item: Feature; epic: Epic } | { type: "epic"; item: Epic; epic: null };

function resolve(plan: ReleasePlan, ref: WorkItemRef | null): Resolved | null {
  if (!ref) {
    return null;
  }
  if (ref.type === "feature") {
    const found = findFeature(plan, ref.id);
    return found ? { type: "feature", item: found.feature, epic: found.epic } : null;
  }
  const epic = findEpic(plan, ref.id);
  return epic ? { type: "epic", item: epic, epic: null } : null;
}

/**
 * Work item details modal (Epic or Feature): type pill, `#id`, title, crumb
 * (Epic link for a Feature; feature count and size summary for an Epic), meta
 * grid, sanitized description and, for an Epic, its Features list. The Epic
 * link and the Features list navigate between items. Closes on ✕, Esc and a
 * backdrop click.
 */
export function WorkItemModal({
  plan,
  item,
  onNavigate,
  onClose,
}: {
  plan: ReleasePlan;
  item: WorkItemRef | null;
  onNavigate: (item: WorkItemRef) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const resolved = resolve(plan, item);
  const open = resolved !== null;
  useDialog({ open, onClose, dialogRef, initialFocusRef: closeRef });

  const itemKey = item ? `${item.type}:${String(item.id)}` : "";
  useEffect(() => {
    if (itemKey) {
      bodyRef.current?.scrollTo?.(0, 0);
      closeRef.current?.focus();
    }
  }, [itemKey]);

  if (!resolved) {
    return null;
  }

  const def = resolved.type === "epic" ? { label: "EPIC", ...ADO.epic } : { label: "FEATURE", ...ADO.feature };
  const style = { "--wic": def.color, "--wink": def.ink } as CSSProperties;
  const hasFlags = plan.flags.length > 0;
  const { item: wi } = resolved;

  return (
    <div className="wi-overlay">
      <div className="wi-backdrop" data-testid="work-item-backdrop" onClick={onClose} />
      <div ref={dialogRef} className="wi-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} style={style}>
        <div className="wi-head">
          <span className="wi-type">{def.label}</span>
          <span className="wi-id">{`#${wi.id}`}</span>
          <button ref={closeRef} type="button" className="x" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            ✕
          </button>
        </div>
        <div ref={bodyRef} className="wi-body">
          <h2 id={titleId}>{wi.title}</h2>
          <div className="wi-crumb">
            {resolved.type === "feature" ? (
              <>
                Epic:{" "}
                <button type="button" onClick={() => onNavigate({ type: "epic", id: resolved.epic.id })}>
                  {resolved.epic.title}
                </button>
              </>
            ) : (
              `${resolved.item.features.length} Features · ${sizeSummary(resolved.item.features)}`
            )}
          </div>
          <div className="wi-meta">
            <Meta label="State">
              <StateValue state={wi.state} />
            </Meta>
            {resolved.type === "feature" ? (
              <>
                <Meta label="Estimated size">
                  <SizeBadge size={resolved.item.size} />
                </Meta>
                <Meta label="Milestone">
                  <MilestoneChip milestone={msById(plan, resolved.item.milestoneId)} />
                </Meta>
                {hasFlags && <FlagMeta plan={plan} msId={resolved.item.milestoneId} />}
                <Meta label="Iteration Path">{resolved.item.iterationPath || "–"}</Meta>
              </>
            ) : (
              <EpicMeta plan={plan} epic={resolved.item} hasFlags={hasFlags} />
            )}
          </div>
          <div className="wi-sec">
            <h3>Description</h3>
            {wi.description.trim() ? (
              <div className="wi-html" data-testid="work-item-description" dangerouslySetInnerHTML={{ __html: safeHtml(wi.description) }} />
            ) : (
              <div className="wi-html">
                <p className="wi-empty">No description in Azure DevOps.</p>
              </div>
            )}
          </div>
          {resolved.type === "epic" && resolved.item.features.length > 0 && (
            <div className="wi-sec">
              <h3>Features</h3>
              <ul className="wi-children">
                {resolved.item.features.map((f) => (
                  <li key={String(f.id)}>
                    <StateMark state={f.state} />
                    <span className="muted">{`#${f.id}`}</span>
                    <button type="button" onClick={() => onNavigate({ type: "feature", id: f.id })}>
                      {f.title}
                    </button>
                    <SizeBadge size={f.size} />
                    <MilestoneChip milestone={msById(plan, f.milestoneId)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FlagMeta({ plan, msId }: { plan: ReleasePlan; msId: string | null }) {
  const flag = msId === null ? null : flagForMsIndex(plan, msIndex(plan, msId));
  return <Meta label="Milestone flag">{flag ? <FlagChip flag={flag} /> : "–"}</Meta>;
}

function EpicMeta({ plan, epic, hasFlags }: { plan: ReleasePlan; epic: Epic; hasFlags: boolean }) {
  const r = epicMilestone(plan, epic);
  return (
    <>
      <Meta label="Features">{String(epic.features.length)}</Meta>
      <Meta label="Done features">{String(epic.features.filter(isDone).length)}</Meta>
      <Meta label="Delivered in">
        {r.unplanned ? <MilestoneChip milestone={null} label={`${r.unplanned} unplanned`} /> : <MilestoneChip milestone={r.ms} />}
      </Meta>
      {hasFlags && <FlagMeta plan={plan} msId={r.unplanned ? null : (r.ms?.id ?? null)} />}
    </>
  );
}
