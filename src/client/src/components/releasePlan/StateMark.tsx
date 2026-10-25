import { DEFAULT_STATE_COLOR, STATE_COLORS } from "../../lib/releasePlan/constants";
import { isDone } from "../../lib/releasePlan/selectors";

/** Green ✓ for Resolved/Done/Closed, otherwise a colored state dot. */
export function StateMark({ state }: { state: string }) {
  if (isDone({ state })) {
    return (
      <span className="okmark" title={state} aria-label={state} role="img">
        ✓
      </span>
    );
  }
  return <span className="state" title={state} aria-hidden="true" style={{ background: STATE_COLORS[state] ?? DEFAULT_STATE_COLOR }} />;
}
