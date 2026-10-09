// Mirrors the CM palette CSS custom properties in index.css — duplicated as
// literals because Plotly's config needs real color strings.
export const CONFIDENCE_COLORS: Record<number, string> = {
  50: "#60C5B5", // --cm-teal
  70: "#EBC160", // --cm-gold
  85: "#D8804B", // --cm-orange
  95: "#B64234", // --cm-red
};

export const MAX_SPRINT_WINDOW = 50;
export const OVERFLOW_LABEL = `>${MAX_SPRINT_WINDOW}`;

export function confidenceColor(level: number): string {
  return CONFIDENCE_COLORS[level] ?? "#4E98D1";
}
