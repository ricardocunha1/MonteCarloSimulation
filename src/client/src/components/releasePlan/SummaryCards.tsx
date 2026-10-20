import type { CSSProperties } from "react";
import { flagSummaryData, fmtDate, milestoneSummaryData } from "../../lib/releasePlan/selectors";
import type { Flag, ReleasePlan } from "../../lib/releasePlan/types";
import { FlagIcon } from "./FlagIcon";
import { SizeChips } from "./SizeChips";

function FlagBox({ plan, flag }: { plan: ReleasePlan; flag: Flag }) {
  const s = flagSummaryData(plan, flag);
  return (
    <div className="s flag" role="group" aria-label={`Flag ${flag.name}`}>
      <b>
        <FlagIcon />
        {flag.name}
      </b>
      <span>{`${fmtDate(flag.date) || "No date"} · after ${s.afterName}`}</span>
      <div>
        <span className="n">{s.features.length}</span>
        <span> Features (cumulative)</span>
      </div>
      <SizeChips features={s.features} />
      <span>{`Epics completed by this flag: ${s.epicCount}`}</span>
    </div>
  );
}

/** Summary boxes: one per milestone (followed by its flags), then Unplanned. */
export function SummaryCards({ plan }: { plan: ReleasePlan }) {
  return (
    <div className="summary" role="region" aria-label="Milestone summary">
      {milestoneSummaryData(plan).map(({ band, features, epicCount, flags }) => {
        const style = band.unplanned ? undefined : ({ "--msc": band.milestone.color } as CSSProperties);
        return [
          <div key={band.id ?? "unplanned"} className="s" style={style} role="group" aria-label={band.name}>
            <b>{band.name}</b>
            <span>{band.unplanned ? "No milestone" : fmtDate(band.milestone.date) || "No date"}</span>
            <div>
              <span className="n">{features.length}</span>
              <span> Features</span>
            </div>
            <SizeChips features={features} />
            <span>{band.unplanned ? `Epics with unplanned features: ${epicCount}` : `Epics completed: ${epicCount}`}</span>
          </div>,
          ...flags.map((flag) => <FlagBox key={flag.id} plan={plan} flag={flag} />),
        ];
      })}
    </div>
  );
}
