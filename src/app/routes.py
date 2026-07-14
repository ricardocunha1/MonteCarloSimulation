import json
from collections import Counter
from datetime import datetime

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
