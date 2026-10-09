from collections import Counter
from datetime import datetime

import numpy as np
import pandas as pd

from .simulation import (
    CONFIDENCE_LEVELS,
    MAX_SPRINT_WINDOW,
    compute_completion_date,
    compute_confidence_results,
    run_simulation,
)

DEFAULT_TARGET_TYPE = "Items Resolved"

CONFIDENCE_LABELS = {
    50: "Optimistic",
    70: "Likely",
    85: "Confident",
    95: "Safe Target",
}


class SimulationError(Exception):
    pass


def build_histogram(hit_sprints: np.ndarray) -> dict:
    """Counts per sprint 1..MAX_SPRINT_WINDOW plus a dedicated ">50" bucket
    for the non-convergence sentinel, so clients never rely on automatic
    numeric binning."""
    counts = Counter(int(v) for v in hit_sprints)
    labels = [str(i) for i in range(1, MAX_SPRINT_WINDOW + 1)] + [f">{MAX_SPRINT_WINDOW}"]
    bar_counts = [counts.get(i, 0) for i in range(1, MAX_SPRINT_WINDOW + 2)]
    return {"labels": labels, "counts": bar_counts}


def run_forecast(summary: pd.DataFrame, params: dict) -> dict:
    """Run the simulation for a sprint summary + the original form params.

    Raises SimulationError for an empty sampling pool; malformed params
    surface as the TypeError/ValueError/KeyError raised while parsing them.
    """
    target_type = params.get("target_type") or DEFAULT_TARGET_TYPE
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
                "label": CONFIDENCE_LABELS[level],
                "sprints": required_sprints,
                "exceeds_window": required_sprints > MAX_SPRINT_WINDOW,
                "completion_date": completion_date.isoformat() if completion_date else None,
            }
        )

    return {
        "target_type": target_type,
        "target_value": target_value,
        "rows": rows,
        "histogram": build_histogram(hit_sprints),
    }
