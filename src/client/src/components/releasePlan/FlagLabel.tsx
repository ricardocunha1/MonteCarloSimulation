import { useEffect, useRef, useState } from "react";
import { L } from "../../lib/releasePlan/constants";
import type { LayoutFlag } from "../../lib/releasePlan/layout";
import { fmtDate } from "../../lib/releasePlan/selectors";
import { useReleasePlan } from "../../releasePlanStore";
import { CommitInput } from "./CommitInput";
import { FlagIcon } from "./FlagIcon";

/**
 * Frozen-column label of a milestone flag: icon, editable name (data-focus
 * `fl:<id>`), 📅 (opens the native date picker via `showPicker()`, or reveals the
 * date input inline when that is unavailable) and ✕ (removes the flag).
 */
export function FlagLabel({ layoutFlag }: { layoutFlag: LayoutFlag }) {
  const { dispatch } = useReleasePlan();
  const { flag, y, h } = layoutFlag;
  const dateRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (revealed) {
      dateRef.current?.focus();
    }
  }, [revealed]);

  const openPicker = () => {
    const input = dateRef.current;
    if (!input) {
      return;
    }
    try {
      if (typeof input.showPicker !== "function") {
        throw new Error("showPicker unavailable");
      }
      input.showPicker();
    } catch {
      setRevealed(true);
    }
  };

  return (
    <div
      className="abs flaglbl"
      style={{ left: 0, top: y + 4, width: L.LBL_W - 14, height: h - 8 }}
      role="group"
      aria-label={`Milestone flag ${flag.name}`}
    >
      <span>
        <FlagIcon />
      </span>
      <CommitInput
        aria-label="Flag name"
        title="Milestone flag name"
        data-focus={`fl:${flag.id}`}
        value={flag.name}
        onCommit={(name) => dispatch({ type: "renameFlag", id: flag.id, name })}
      />
      <button
        type="button"
        className="cal"
        title={`Set flag date${flag.date ? ` (${fmtDate(flag.date)})` : ""}`}
        aria-label="Set flag date"
        onClick={openPicker}
      >
        📅
      </button>
      <input
        ref={dateRef}
        type="date"
        aria-label="Flag date"
        className={revealed ? "revealed" : undefined}
        tabIndex={revealed ? 0 : -1}
        value={flag.date}
        onChange={(event) => dispatch({ type: "setFlagDate", id: flag.id, date: event.target.value })}
        onBlur={() => setRevealed(false)}
      />
      <button type="button" title="Remove flag" aria-label="Remove flag" onClick={() => dispatch({ type: "removeFlag", id: flag.id })}>
        ✕
      </button>
    </div>
  );
}
