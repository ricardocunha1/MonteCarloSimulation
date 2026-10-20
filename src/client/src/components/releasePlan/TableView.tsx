import { useState } from "react";
import { epicMilestone, flagForMsIndex, fmtDate, msById, msIndex, sizeSummary } from "../../lib/releasePlan/selectors";
import type { Epic, Feature, ReleasePlan, WorkItemRef } from "../../lib/releasePlan/types";
import { useReleasePlan } from "../../releasePlanStore";
import { FlagChip } from "./FlagChip";
import { MilestoneChip } from "./MilestoneChip";
import { SizeBadge } from "./SizeBadge";
import { StateMark } from "./StateMark";

const UNPLANNED_FILTER = "__none";

function matchesQuery(item: { title: string; id: Epic["id"] }, q: string): boolean {
  return !q || item.title.toLowerCase().includes(q) || String(item.id).includes(q);
}

/**
 * Table view: filters (search on Epic or Feature title/ID, Epic, milestone),
 * Epic rows (shown when at least one Feature matches) and Feature rows with a
 * milestone select that reassigns the Feature. The flag column only shows when
 * the plan has flags.
 */
export function TableView({ plan, onOpenItem }: { plan: ReleasePlan; onOpenItem: (item: WorkItemRef) => void }) {
  const { dispatch } = useReleasePlan();
  const [text, setText] = useState("");
  const [epicFilter, setEpicFilter] = useState("");
  const [msFilter, setMsFilter] = useState("");

  // A filter keeps its value only while it is still valid.
  const fEpic = plan.epics.some((e) => String(e.id) === epicFilter) ? epicFilter : "";
  const fMs = msFilter === UNPLANNED_FILTER || plan.milestones.some((m) => m.id === msFilter) ? msFilter : "";
  const q = text.trim().toLowerCase();
  const hasFlags = plan.flags.length > 0;

  const matchMs = (f: Feature) => !fMs || (fMs === UNPLANNED_FILTER ? !msById(plan, f.milestoneId) : f.milestoneId === fMs);
  const rows = plan.epics
    .filter((e) => !fEpic || String(e.id) === fEpic)
    .map((e) => ({ epic: e, features: e.features.filter((f) => matchMs(f) && (matchesQuery(f, q) || matchesQuery(e, q))) }))
    .filter((r) => r.features.length > 0);
  const shown = rows.reduce((n, r) => n + r.features.length, 0);

  const flagCell = (msId: string | null) => {
    if (!hasFlags) {
      return null;
    }
    const flag = flagForMsIndex(plan, msIndex(plan, msId));
    return <td>{flag ? <FlagChip flag={flag} /> : <span className="muted">–</span>}</td>;
  };

  return (
    <section aria-label="Table">
      <div className="filters">
        <input placeholder="Search title or ID" aria-label="Search" value={text} onChange={(e) => setText(e.target.value)} />
        <select aria-label="Filter by Epic" value={fEpic} onChange={(e) => setEpicFilter(e.target.value)}>
          <option value="">All Epics</option>
          {plan.epics.map((e) => (
            <option key={String(e.id)} value={String(e.id)}>
              {e.title}
            </option>
          ))}
        </select>
        <select aria-label="Filter by milestone" value={fMs} onChange={(e) => setMsFilter(e.target.value)}>
          <option value="">All milestones</option>
          {plan.milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value={UNPLANNED_FILTER}>Unplanned</option>
        </select>
        <span className="muted" role="status">{`${shown} features shown`}</span>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>ID</th>
              <th>Title</th>
              <th style={{ width: 120 }}>State</th>
              <th style={{ width: 150 }}>Estimated size</th>
              <th style={{ width: 220 }}>Milestone</th>
              {hasFlags && <th style={{ width: 150 }}>Milestone flag</th>}
            </tr>
          </thead>
          <tbody>
            {rows.flatMap(({ epic, features }) => {
              const r = epicMilestone(plan, epic);
              return [
                <tr key={`e:${String(epic.id)}`} className="epicrow">
                  <td>{`#${epic.id}`}</td>
                  <td>
                    <span className="typ e">EPIC</span>
                    <button type="button" className="wi-link" title="Show details" onClick={() => onOpenItem({ type: "epic", id: epic.id })}>
                      {epic.title}
                    </button>
                  </td>
                  <td>{epic.state}</td>
                  <td>{sizeSummary(epic.features)}</td>
                  <td>
                    <MilestoneChip milestone={r.unplanned ? null : r.ms} />
                    {r.unplanned > 0 && r.ms && <span className="muted">{` (latest: ${r.ms.name}, ${r.unplanned} unplanned)`}</span>}
                  </td>
                  {flagCell(r.unplanned ? null : (r.ms?.id ?? null))}
                </tr>,
                ...features.map((f) => (
                  <tr key={`f:${String(f.id)}`} className="featrow">
                    <td>{`#${f.id}`}</td>
                    <td className="ttl">
                      <span className="typ f">FEATURE</span>
                      <button type="button" className="wi-link" title="Show details" onClick={() => onOpenItem({ type: "feature", id: f.id })}>
                        {f.title}
                      </button>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <StateMark state={f.state} /> {f.state}
                    </td>
                    <td>
                      <SizeBadge size={f.size} />
                    </td>
                    <td>
                      <select
                        aria-label={`Milestone for ${f.title}`}
                        value={msById(plan, f.milestoneId) ? (f.milestoneId ?? "") : ""}
                        onChange={(e) => dispatch({ type: "setFeatureMilestone", featureId: f.id, milestoneId: e.target.value || null })}
                      >
                        <option value="">Unplanned</option>
                        {plan.milestones.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name + (m.date ? ` (${fmtDate(m.date)})` : "")}
                          </option>
                        ))}
                      </select>
                    </td>
                    {flagCell(f.milestoneId)}
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
