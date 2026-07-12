# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Flask app that runs Monte Carlo simulations to forecast how many sprints
are needed to hit a target (Items Resolved or Story Points), based on
historical sprint data from Critical Manufacturing (CM) projects uploaded as
an Excel file. Three-step flow: Data Input → Data Validation (optional,
skippable) → Simulation Execution.

## Commands

```bash
source .venv/bin/activate            # venv already exists with deps installed
pip install -r requirements.txt      # flask, pandas, numpy, openpyxl, pytest

python run.py                        # run dev server (debug=True)
flask --app run run                  # alternative way to run it

pytest tests/                        # full test suite
pytest tests/test_data_processing.py # single file
pytest tests/test_input_route.py::test_missing_file  # single test
```

There is no lint/type-check tooling configured in this repo.

## Architecture

- **Source of truth for behavior is `specs/*.md` and `plans/monte-carlo-app.md`.**
  All six phases in the plan are `Status: Complete`; its "Key decisions"
  section (business rules, tie-breaking, edge-case handling) is not
  re-derivable from code alone — read it before changing simulation or
  validation logic. The per-phase "Phase Summary" entries explain *why*
  things ended up the way they did (e.g. the `method="min"` ranking
  correction, why `results.html` was built incrementally across phases 4-5).
  If you add a new phase of work, follow the plan's own "For Future Agents"
  instructions (checkboxes, phase status, Phase Summary on completion).
- **Layout**: app package lives under `src/app/`, not the repo root.
  `run.py` (repo root) does `from src.app import create_app`. Root-level
  `pytest.ini` sets `pythonpath = .` so `tests/` (also repo root) can import
  `src.app...` regardless of pytest's rootdir detection.
  - `src/app/__init__.py` — Flask app factory (`create_app()`), registers the
    `main` blueprint.
  - `src/app/routes.py` — all routes on one blueprint. Request flow:
    `GET /` (input form) → `POST /validate` (param validation, Excel parsing,
    sprint summary) → `confirm.html` (or straight to execution if "Skip
    Historical Sprint Validation" is checked) → `POST /execute` → `results.html`.
    Both the skip-validation branch of `/validate` and `/execute` itself
    funnel through one shared `_run_and_render(summary, params)` helper, so
    their behavior is identical by construction — don't duplicate simulation
    logic between them.
  - `src/app/services/validation.py` — `validate_parameters(form, file)`:
    pure parameter/form guardrails (file present, target type, positive
    numbers, simulation cap of 5000, valid date). Never touches file
    *content*.
  - `src/app/services/data_processing.py` — `parse_sprint_history` (reads
    the uploaded Excel, raises `DataValidationError` — never a raw
    pandas/openpyxl exception — for unreadable files or missing mandatory
    columns), `build_sprint_summary` (groups by Sprint, computes Items
    Resolved / Story Points / Recency Rank / In Sampling Pool), and the
    `summary_to_records` / `summary_from_records` pair that round-trips the
    summary DataFrame through the stateless JSON handoff (see below).
  - `src/app/services/simulation.py` — `run_simulation` (vectorized NumPy:
    `rng.choice` into a `(simulations, MAX_SPRINT_WINDOW)` matrix, `cumsum`,
    boolean-mask `argmax` for first-hit sprint), `compute_confidence_results`
    (nearest-rank/ceiling percentiles), `compute_completion_date`
    (`numpy.busday_offset`-based).
  - `src/app/templates/` — Jinja2 templates, Tailwind via CDN (no Node
    build), dark theme with CM brand colors as CSS custom properties
    (defined in `base.html`). `_errors.html` is a shared partial (`errors`
    list, optional `heading`) included by both `input.html` (param/file
    validation errors) and `error.html` (execution-time failures raised
    from `_run_and_render`, e.g. an empty sampling pool).
- **Statelessness**: there is no server-side session. The confirm page
  embeds the computed sprint summary and original form params as a JSON
  blob (`{"summary": [...], "params": {...}}`) in a hidden field, POSTed
  back to `/execute`. Every request is self-contained. That hidden field is
  built with `json.dumps` + Jinja's default HTML-attribute autoescaping
  (not `tojson`, which escapes for `<script>` contexts and would break
  attribute quoting) — but the histogram's chart data in `results.html` *is*
  embedded via `| tojson` inside a `<script>` block, which is the correct
  tool there. Don't swap these two approaches.
- **Notable business rules** (see `plans/monte-carlo-app.md` "Key decisions"
  for the full list — do not re-derive these from scratch):
  - `Sprint` is parsed as `Iteration Path.split('\\')[-1]`.
  - A row counts toward its sprint only if `State` is one of `Resolved`,
    `Done`, `Closed` (case-sensitive).
  - `Recency Rank` = `Last Resolved Date.rank(ascending=False,
    method="min")` (competition ranking, ties share lowest rank). `In
    Sampling Pool = Recency Rank > Exclude Latest Sprints from Sampling`.
  - Non-convergence sentinel: a simulated run that never reaches the target
    within the 50-sprint window (`MAX_SPRINT_WINDOW`) is recorded as sprint
    `51`, rendered in the UI as `>50 sprints` with no completion date. The
    histogram in `results.html` reserves a dedicated `">50"` bucket for this
    rather than relying on Plotly's automatic numeric binning.
  - Percentiles use nearest-rank (ceiling): for confidence `c` and `N`
    simulations, `rank = ceil(c/100 * N)`, 1-indexed into the sorted
    ascending distribution.
  - Business days only (Mon–Fri, no holiday calendar) via
    `numpy.busday_offset` / `numpy.is_busday`.
  - `notebook/Sprint_History.xlsx` is the canonical regression fixture: with
    `Exclude Latest Sprints from Sampling = 1`, there are 24 sprints total,
    Sprint 24 excluded, 23 remain in the sampling pool. Used throughout
    `tests/` (including the full end-to-end scenario in
    `tests/test_end_to_end.py`, which also asserts `/execute` stays under
    2s at 1000 simulations and 5s at 5000).
- **`notebook/sprints.ipynb`** is the original exploratory analysis the
  simulation/summary logic was ported from — treat it as a reference
  implementation when in doubt about grouping/ranking behavior.
