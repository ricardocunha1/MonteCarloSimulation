import { fmtDate } from "../../lib/releasePlan/selectors";
import type { Flag } from "../../lib/releasePlan/types";
import { FlagIcon } from "./FlagIcon";

/** Gold pill with the flag icon and name; the title adds the date. */
export function FlagChip({ flag }: { flag: Flag }) {
  return (
    <span className="flagchip" title={flag.name + (flag.date ? ` · ${fmtDate(flag.date)}` : "")}>
      <FlagIcon />
      {flag.name}
    </span>
  );
}
