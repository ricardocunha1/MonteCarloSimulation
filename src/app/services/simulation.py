import math
from datetime import date

import numpy as np

MAX_SPRINT_WINDOW = 50
NOT_REACHED_SENTINEL = MAX_SPRINT_WINDOW + 1
CONFIDENCE_LEVELS = (50, 70, 85, 95)


def run_simulation(
    values: np.ndarray,
    target: float,
    simulations: int,
    rng: np.random.Generator,
) -> np.ndarray:
    draws = rng.choice(values, size=(simulations, MAX_SPRINT_WINDOW))
    cumulative = draws.cumsum(axis=1)
    reached = cumulative >= target

    hit_sprint = reached.argmax(axis=1) + 1
    hit_sprint[~reached.any(axis=1)] = NOT_REACHED_SENTINEL
    return hit_sprint.astype(int)


def compute_confidence_results(
    hit_sprints: np.ndarray,
    confidence_levels: tuple[int, ...] = CONFIDENCE_LEVELS,
) -> dict[int, int]:
    sorted_hits = np.sort(hit_sprints)
    n = len(sorted_hits)

    results = {}
    for level in confidence_levels:
        rank = math.ceil(level / 100 * n)
        rank = min(max(rank, 1), n)
        results[level] = int(sorted_hits[rank - 1])
    return results


def compute_completion_date(
    start_date: date, sprint_length_days: int, required_sprints: int
) -> date | None:
    if required_sprints > MAX_SPRINT_WINDOW:
        return None

    offset_days = required_sprints * sprint_length_days - 1
    result = np.busday_offset(start_date, offset_days, roll="forward")
    return result.astype("datetime64[D]").astype(date)
