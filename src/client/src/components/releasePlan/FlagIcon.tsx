import { FLAG_PATH } from "../../lib/releasePlan/constants";

/** Milestone flag glyph (template `FLAG_SVG`), decorative. */
export function FlagIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path fill="currentColor" d={FLAG_PATH} />
    </svg>
  );
}
