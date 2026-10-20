import { sizeColor } from "../../lib/releasePlan/constants";
import { sizeCounts } from "../../lib/releasePlan/selectors";
import type { Feature } from "../../lib/releasePlan/types";

/** Colored size count chips ("M 3"), or "No features". */
export function SizeChips({ features }: { features: readonly Feature[] }) {
  const counts = sizeCounts(features);
  return (
    <div className="szchips">
      {counts.length === 0 ? (
        <span className="muted">No features</span>
      ) : (
        counts.map(([key, n]) => {
          const color = sizeColor(key);
          return (
            <span
              key={key}
              className="szchip"
              title={`${n} Feature${n > 1 ? "s" : ""} of size ${key === "?" ? "not estimated" : key}`}
              style={{ background: color.bg, color: color.ink }}
            >
              <b>{key}</b>
              <span>{n}</span>
            </span>
          );
        })
      )}
    </div>
  );
}
