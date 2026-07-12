from datetime import date

import numpy as np

from src.app.services.simulation import (
    MAX_SPRINT_WINDOW,
    compute_completion_date,
    compute_confidence_results,
    run_simulation,
)


def test_run_simulation_is_reproducible_with_same_seed():
    values = np.array([1, 2, 3, 4, 5])

    hits_a = run_simulation(values, target=20, simulations=200, rng=np.random.default_rng(42))
    hits_b = run_simulation(values, target=20, simulations=200, rng=np.random.default_rng(42))

    assert np.array_equal(hits_a, hits_b)


def test_confidence_results_are_monotonically_non_decreasing():
    values = np.array([1, 2, 3, 4, 5])
    hits = run_simulation(values, target=50, simulations=500, rng=np.random.default_rng(1))

    results = compute_confidence_results(hits)

    assert results[50] <= results[70] <= results[85] <= results[95]


def test_unreachable_target_yields_sentinel_and_no_completion_date():
    values = np.array([1, 1, 1])
    hits = run_simulation(values, target=10_000, simulations=100, rng=np.random.default_rng(7))

    results = compute_confidence_results(hits)

    assert all(sprints == MAX_SPRINT_WINDOW + 1 for sprints in results.values())
    for sprints in results.values():
        assert compute_completion_date(date(2026, 7, 13), 10, sprints) is None


def test_compute_completion_date_hand_checked_business_days():
    # 2026-07-13 is a Monday; a 10-business-day sprint completes on its
    # 10th business day, which is Friday 2026-07-24.
    result = compute_completion_date(date(2026, 7, 13), 10, 1)
    assert result == date(2026, 7, 24)
