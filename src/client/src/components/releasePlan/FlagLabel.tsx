import { useEffect, useRef, useState } from "react";
import type { Flag } from "../../lib/releasePlan/types";
import { fmtDate } from "../../lib/releasePlan/selectors";
import { useReleasePlan } from "../../releasePlanStore";
import type { BoxRect } from "./boardGeometry";
import { CommitInput } from "./CommitInput";
import { FlagIcon } from "./FlagIcon";

/**
 * Frozen-column label of a milestone flag: icon, editable name (data-focus
 * `fl:<id>`), 📅 (opens the native date picker via `showPicker()`, or reveals the
 * date input inline when that is unavailable) and ✕ (removes the flag).
 *
 * `rect` is the unrotated box. On the flipped board (`flipped`) the same label
 * is rotated -90° around its center (`.flaglbl.flip`) so it fits the narrow
 * flag column of the header row.
 */
export function FlagLabel({ flag, rect, flipped = false }: { flag: Flag; rect: BoxRect; flipped?: boolean }) {
  const { dispatch } = useReleasePlan();
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
      className={`abs flaglbl${flipped ? " flip" : ""}`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
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
