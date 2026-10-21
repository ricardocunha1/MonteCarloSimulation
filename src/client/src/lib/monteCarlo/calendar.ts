import { confidenceColor } from "./confidence";

// Port of the legacy Flask `_build_calendar_data`. Dates are plain
// calendar days: `YYYY-MM-DD` strings are parsed by hand into a UTC-based
// day count, so no local-timezone shift can move a day.

export interface CalendarRow {
  confidence: number;
  completion_date: string | null;
}

export interface CalendarCell {
  day: number;
  color: string | null;
  isWeekend: boolean;
}

export interface CalendarMonth {
  label: string;
  /** Monday-first weeks; `null` = padding or outside start..end. */
  weeks: (CalendarCell | null)[][];
}

export interface CalendarData {
  months: CalendarMonth[];
  legend: { label: string; color: string }[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 for a `YYYY-MM-DD` string. */
export function parseIsoDay(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid date: ${value}`);
  }
  const [, y, m, d] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d)) / MS_PER_DAY;
}

function toParts(dayNumber: number) {
  const date = new Date(dayNumber * MS_PER_DAY);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    // 0 = Monday … 6 = Sunday, like Python's date.weekday().
    weekday: (date.getUTCDay() + 6) % 7,
  };
}

function monthStart(year: number, month: number): number {
  return Date.UTC(year, month, 1) / MS_PER_DAY;
}

function monthEnd(year: number, month: number): number {
  return Date.UTC(year, month + 1, 0) / MS_PER_DAY;
}

/** Month-grid calendar spanning `startDate` .. the furthest reached
 * percentile's completion date. Each business day is colored with the
 * lowest-confidence percentile whose completion date is on/after that day
 * (lower percentiles win ties). Weekends stay uncolored (rendered muted).
 * Rows without a completion date (target not reached within the window) are
 * excluded from the band boundaries. Returns null when no row has a date.
 * `rows` must be ordered by ascending confidence, as the server returns them.
 */
export function buildCalendarData(startDate: string, rows: CalendarRow[]): CalendarData | null {
  const datedRows = rows
    .filter((row): row is CalendarRow & { completion_date: string } => Boolean(row.completion_date))
    .map((row) => ({ confidence: row.confidence, day: parseIsoDay(row.completion_date) }));
  if (datedRows.length === 0) {
    return null;
  }

  const start = parseIsoDay(startDate);
  const end = Math.max(...datedRows.map((row) => row.day));
  const bands = datedRows.map((row) => ({ color: confidenceColor(row.confidence), day: row.day }));

  const dayColors = new Map<number, string>();
  let bandIndex = 0;
  for (let current = start; current <= end; current++) {
    while (bandIndex < bands.length - 1 && current > bands[bandIndex].day) {
      bandIndex++;
    }
    if (toParts(current).weekday < 5) {
      dayColors.set(current, bands[bandIndex].color);
    }
  }

  const months: CalendarMonth[] = [];
  const startParts = toParts(start);
  const endParts = toParts(end);
  let year = startParts.year;
  let month = startParts.month;
  while (year < endParts.year || (year === endParts.year && month <= endParts.month)) {
    const first = monthStart(year, month);
    const last = monthEnd(year, month);
    // Pad back to the Monday on/before the 1st and forward to the Sunday
    // on/after the last day (calendar.monthdatescalendar, firstweekday=0).
    const gridStart = first - toParts(first).weekday;
    const gridEnd = last + (6 - toParts(last).weekday);

    const weeks: (CalendarCell | null)[][] = [];
    for (let weekStart = gridStart; weekStart <= gridEnd; weekStart += 7) {
      const week: (CalendarCell | null)[] = [];
      for (let current = weekStart; current < weekStart + 7; current++) {
        if (current < first || current > last || current < start || current > end) {
          week.push(null);
        } else {
          const parts = toParts(current);
          week.push({
            day: parts.day,
            color: dayColors.get(current) ?? null,
            isWeekend: parts.weekday >= 5,
          });
        }
      }
      weeks.push(week);
    }
    months.push({ label: `${MONTH_NAMES[month]} ${year}`, weeks });

    month++;
    if (month === 12) {
      month = 0;
      year++;
    }
  }

  const legend = datedRows.map((row) => ({
    label: `P${row.confidence}`,
    color: confidenceColor(row.confidence),
  }));

  return { months, legend };
}
