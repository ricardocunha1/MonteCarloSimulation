import calendar
import json
from collections import Counter
from datetime import date, datetime, timedelta

import numpy as np
from flask import Blueprint, render_template, request

from src.app.services.data_processing import (
    DataValidationError,
    build_sprint_summary,
    parse_sprint_history,
    summary_from_records,
    summary_to_records,
)
from src.app.services.simulation import (
    CONFIDENCE_LEVELS,
    MAX_SPRINT_WINDOW,
    compute_completion_date,
    compute_confidence_results,
    run_simulation,
)
from src.app.services.validation import validate_parameters

bp = Blueprint("main", __name__)

DEFAULT_FORM_VALUES = {
    "target_type": "Items Resolved",
    "target_value": "",
    "num_simulations": "1000",
    "skip_validation": False,
    "exclude_latest_sprints": "0",
    "sprint_start_date": "",
    "sprint_length": "10",
    "team_capacity_factor": "1.0",
}


def _rebuild_values(form):
    return {
        "target_type": form.get("target_type", DEFAULT_FORM_VALUES["target_type"]),
        "target_value": form.get("target_value", ""),
        "num_simulations": form.get("num_simulations", DEFAULT_FORM_VALUES["num_simulations"]),
        "skip_validation": "skip_validation" in form,
        "exclude_latest_sprints": form.get(
            "exclude_latest_sprints", DEFAULT_FORM_VALUES["exclude_latest_sprints"]
        ),
        "sprint_start_date": form.get("sprint_start_date", ""),
        "sprint_length": form.get("sprint_length", DEFAULT_FORM_VALUES["sprint_length"]),
        "team_capacity_factor": form.get(
            "team_capacity_factor", DEFAULT_FORM_VALUES["team_capacity_factor"]
        ),
    }


# Mirrors the CM palette CSS custom properties defined in base.html —
# duplicated here because Plotly's JS config needs literal color strings.
CONFIDENCE_COLORS = {
    50: "#60C5B5",  # --cm-teal
    70: "#EBC160",  # --cm-gold
    85: "#D8804B",  # --cm-orange
    95: "#B64234",  # --cm-red
}


def _build_chart_data(hit_sprints: np.ndarray, rows: list[dict]) -> dict:
    counts = Counter(int(v) for v in hit_sprints)
    labels = [str(i) for i in range(1, MAX_SPRINT_WINDOW + 1)] + [f">{MAX_SPRINT_WINDOW}"]
    bar_counts = [counts.get(i, 0) for i in range(1, MAX_SPRINT_WINDOW + 1)]
    bar_counts.append(counts.get(MAX_SPRINT_WINDOW + 1, 0))

    markers = [
        {
            "label": f"P{row['confidence']}",
            "x": f">{MAX_SPRINT_WINDOW}" if row["exceeds_window"] else str(row["sprints"]),
            "color": CONFIDENCE_COLORS[row["confidence"]],
        }
        for row in rows
    ]

    return {"labels": labels, "counts": bar_counts, "markers": markers}


def _build_calendar_data(start_date: date, rows: list[dict]) -> dict | None:
    """Month-grid calendar spanning start_date .. the furthest reached
    percentile's completion date. Each business day is colored with the
    lowest-confidence percentile whose completion date is on/after that day
    (lower percentiles win ties), matching CONFIDENCE_COLORS. Weekends are
    left uncolored (rendered muted). Rows whose target wasn't reached within
    the window (no completion_date) are excluded from the band boundaries.
    """
    dated_rows = [
        (row["confidence"], date.fromisoformat(row["completion_date"]))
        for row in rows
        if row["completion_date"]
    ]
    if not dated_rows:
        return None

    end_date = max(d for _, d in dated_rows)

    bands = []
    for level, completion_date in dated_rows:
        bands.append((CONFIDENCE_COLORS[level], completion_date))

    day_colors = {}
    band_index = 0
    current_day = start_date
    while current_day <= end_date:
        while band_index < len(bands) - 1 and current_day > bands[band_index][1]:
            band_index += 1
        if current_day.weekday() < 5:
            day_colors[current_day] = bands[band_index][0]
        current_day += timedelta(days=1)

    months = []
    month_cursor = date(start_date.year, start_date.month, 1)
    end_month_cursor = date(end_date.year, end_date.month, 1)
    cal = calendar.Calendar(firstweekday=0)
    while month_cursor <= end_month_cursor:
        weeks = []
        for week in cal.monthdatescalendar(month_cursor.year, month_cursor.month):
            week_cells = []
            for day in week:
                if day.month != month_cursor.month or day < start_date or day > end_date:
                    week_cells.append(None)
                else:
                    week_cells.append(
                        {
                            "day": day.day,
                            "color": day_colors.get(day),
                            "is_weekend": day.weekday() >= 5,
                        }
                    )
            weeks.append(week_cells)
        months.append({"label": month_cursor.strftime("%B %Y"), "weeks": weeks})

        if month_cursor.month == 12:
            month_cursor = date(month_cursor.year + 1, 1, 1)
        else:
            month_cursor = date(month_cursor.year, month_cursor.month + 1, 1)

    legend = [{"label": f"P{level}", "color": CONFIDENCE_COLORS[level]} for level, _ in dated_rows]

    return {"months": months, "legend": legend}


class SimulationError(Exception):
    pass


def _run_and_render(summary, params: dict):
    try:
        target_type = params.get("target_type", DEFAULT_FORM_VALUES["target_type"])
        target_value = int(params.get("target_value"))
        num_simulations = int(params.get("num_simulations"))
        sprint_start_date = datetime.strptime(params.get("sprint_start_date"), "%Y-%m-%d").date()
        sprint_length = int(float(params.get("sprint_length")))
        team_capacity_factor = float(params.get("team_capacity_factor") or 1.0)

        pool = summary[summary["In Sampling Pool"] == True]  # noqa: E712
        values = pool[target_type].to_numpy() * team_capacity_factor
        if values.size == 0:
            raise SimulationError(
                "No sprints are available in the sampling pool. Adjust 'Exclude "
                "Latest Sprints from Sampling' or upload more sprint history."
            )

        rng = np.random.default_rng()
        hit_sprints = run_simulation(values, target_value, num_simulations, rng)
        confidence_results = compute_confidence_results(hit_sprints, CONFIDENCE_LEVELS)

        rows = []
        for level in CONFIDENCE_LEVELS:
            required_sprints = confidence_results[level]
            completion_date = compute_completion_date(sprint_start_date, sprint_length, required_sprints)
            rows.append(
                {
                    "confidence": level,
                    "sprints": required_sprints,
                    "exceeds_window": required_sprints > MAX_SPRINT_WINDOW,
                    "completion_date": completion_date.isoformat() if completion_date else None,
                }
            )

        chart_data = _build_chart_data(hit_sprints, rows)
        calendar_data = _build_calendar_data(sprint_start_date, rows)
    except SimulationError as exc:
        return render_template("error.html", errors=[str(exc)], current_step=3)
    except (TypeError, ValueError, KeyError) as exc:
        return render_template(
            "error.html", errors=[f"Could not run simulation: {exc}"], current_step=3
        )

    return render_template(
        "results.html",
        target_type=target_type,
        target_value=target_value,
        rows=rows,
        chart_data=chart_data,
        calendar_data=calendar_data,
        current_step=3,
    )


@bp.get("/health")
def health():
    return render_template("health.html")


@bp.get("/")
def index():
    return render_template(
        "input.html", values=DEFAULT_FORM_VALUES, errors=[], current_step=1
    )


@bp.post("/validate")
def validate():
    file = request.files.get("sprint_history_file")
    errors = validate_parameters(request.form, file)

    df = None
    if not errors:
        try:
            df = parse_sprint_history(file)
        except DataValidationError as exc:
            errors = [str(exc)]

    if errors:
        return render_template(
            "input.html", values=_rebuild_values(request.form), errors=errors, current_step=1
        )

    exclude_latest_raw = request.form.get("exclude_latest_sprints", "").strip()
    exclude_latest = int(exclude_latest_raw) if exclude_latest_raw else 0
    summary = build_sprint_summary(df, exclude_latest)

    if "skip_validation" in request.form:
        return _run_and_render(summary, request.form.to_dict())

    payload_json = json.dumps(
        {"summary": summary_to_records(summary), "params": request.form.to_dict()}
    )
    return render_template(
        "confirm.html",
        summary=summary.to_dict(orient="records"),
        payload_json=payload_json,
        current_step=2,
    )


@bp.post("/execute")
def execute():
    payload = json.loads(request.form.get("payload", "{}"))
    summary = summary_from_records(payload.get("summary", []))
    params = payload.get("params", {})
    return _run_and_render(summary, params)
