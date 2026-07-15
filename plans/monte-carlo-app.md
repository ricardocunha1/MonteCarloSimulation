# Monte Carlo Simulator — Full Application

Build the full three-step Flask application (Data Input → Data Validation →
Simulation Execution) described in `specs/montecarlosimulation.md`,
`specs/data_input.md`, `specs/data_validation.md`, and
`specs/simulation_execution.md`. No application code exists yet — this plan
covers everything from project scaffolding through a working, tested,
browser-usable app that satisfies the README's acceptance checklist.

## Key decisions (do not re-litigate without user input)

- **Scope**: full app, all three spec sections — not just the simulation
  engine.
- **Non-convergence**: if a simulated run's cumulative total never reaches
  the target within the 50-sprint window, its "sprint reached" value is
  recorded as `51` (i.e. `MAX_SPRINT_WINDOW + 1`), a sentinel meaning
  "more than 50 sprints" — it still counts in the percentile distribution
  and the UI must render it as `>50 sprints` with no completion date (target
  not realistically achievable at that confidence level within the window).
- **Business days**: Mon–Fri only, no holiday calendar. Use
  `numpy.busday_offset` / `numpy.is_busday`.
- **Percentiles**: nearest-rank (ceiling) method on the sorted distribution
  of per-simulation "sprint where target was reached" values — always
  produces an integer sprint count. For confidence level `c` (e.g. 85) and
  `N` simulations: `rank = ceil(c/100 * N)`, 1-indexed into the ascending
  sorted array.
- **Completed work filter**: a row counts toward its sprint's totals if
  `State` is one of `Resolved`, `Done`, `Closed` (case-sensitive match,
  matching `notebook/sprints.ipynb`).
- **Charts**: Plotly (plotly.js via CDN, driven by JSON from Flask).
- **State handling across steps**: no server-side session store. The
  Data-Validation confirmation page embeds the already-computed sprint
  summary table (small, ≤ a few hundred rows) plus original params as a
  JSON blob in a hidden form field; the confirm button POSTs that plus
  params to `/execute`. Every request is self-contained and stateless.
- **Target type in results**: only the single Target Type selected by the
  user in Data Input is computed and displayed — not both metrics.
- **"Skip Historical Sprint Validation"**: skips the confirmation/summary
  screen only. Core parameter guardrails (file parses with mandatory
  columns, simulations ≤ 5000, target value > 0, sprint length > 0, valid
  start date) always run regardless of this flag.
- **Excel parsing**: read whichever single worksheet is present in the
  uploaded file — do not hardcode a sheet name like `"Raw Data"`.
- **Max sprint window**: fixed constant `50`, not user-configurable.
- **Sprint parsing**: `Sprint = Iteration Path.split('\\')[-1]` (last path
  segment), matching the notebook.
- **Items Resolved count**: count of rows per sprint (`groupby(...).size()`),
  not a count of the optional `ID` column.
- **Recency Rank / Sampling Pool**: `Recency Rank` =
  `Last Resolved Date.rank(ascending=False, method="min")` (plain
  competition ranking — ties share the lowest rank, the next distinct rank
  skips ahead; most recent = rank 1), matching `notebook/sprints.ipynb`
  exactly. `In Sampling Pool = Recency Rank > Exclude Latest Sprints from
  Sampling`.
- **Verified fixture**: with `notebook/Sprint_History.xlsx` and
  `Exclude Latest Sprints from Sampling = 1`, there are 24 sprints total,
  Sprint 24 is excluded, leaving 23 in the sampling pool. Use this as a
  hardcoded regression-test fixture (see Phase 3).
- **Tech stack**: Flask + Jinja2 templates, Tailwind CSS via CDN `<script>`
  (no Node build pipeline), Plotly.js via CDN, pandas + numpy + openpyxl for
  data, pytest for tests.
- **Source layout**: the application package lives under `src/app/`
  (`src/app/__init__.py`, `src/app/routes.py`, `src/app/services/`,
  `src/app/templates/`, `src/app/static/`), not at the repo root. `run.py`
  stays at the repo root and imports `from src.app import create_app`. A
  root-level `pytest.ini` sets `pythonpath = .` so `tests/` (also at repo
  root) can `from src.app... import ...` regardless of pytest's rootdir
  detection.
- **Calendar view band assignment** (Phase 7): the calendar's end date is
  the completion date of the *highest confidence level that has one* — not
  hardcoded to P95 — since a level beyond the 50-sprint window has no
  completion date at all. Each day's band color is resolved by walking the
  confidence levels ascending and taking the first one whose completion
  date is on/after that day; this means when two levels share a completion
  date, the lower one's color wins (matches the spec's tie-breaking rule).
  Confidence levels with no completion date are excluded from both the
  bands and the legend, but do not stop the calendar being drawn as long as
  at least one level was reached. Weekends are computed but deliberately
  left uncolored (`date.weekday() >= 5`), independent of which band they'd
  otherwise fall in.

## For Future Agents
As work proceeds: mark checkboxes `- [x]` as items complete; when a phase is
done, set its status to `Complete` and write its **Phase Summary** (what was
done, key decisions, anything needed to continue with zero context); run the
phase's **Verification Plan** and record the result before moving on. When
all phases are done, fill in **Final Recap** and **Deployment Plan**.

## Phase 1: Project Scaffolding & App Shell
Status: Complete

- [x] Populate `requirements.txt`: `flask`, `pandas`, `numpy`, `openpyxl`,
      `pytest`.
- [x] Create app package: `src/app/__init__.py` (Flask app factory
      `create_app()`), `src/app/routes.py`, `src/app/services/__init__.py`,
      `src/app/templates/`, `src/app/static/`.
- [x] Copy `specs/assets/cmlogo.svg` into `src/app/static/cmlogo.svg`.
- [x] Create `src/app/templates/base.html`: dark background / light text theme,
      CM color palette as CSS custom properties (`--cm-dark-blue: #274B76`,
      `--cm-light-blue: #4E98D1`, `--cm-teal: #60C5B5`, `--cm-gold: #EBC160`,
      `--cm-orange: #D8804B`, `--cm-red: #B64234`, `--cm-purple: #802D6C`),
      Tailwind CDN `<script src="https://cdn.tailwindcss.com">` in `<head>`,
      header bar showing the CM logo, and a `{% block content %}`.
- [x] Create `run.py` (or `wsgi.py`) at repo root: `from src.app import
      create_app; app = create_app()`, runnable via `flask --app run run`
      or `python run.py`.
- [x] Add a trivial `GET /health` route (or reuse `/`) returning 200 with
      the base template rendered, so the shell is verifiable before any
      feature logic exists.

### Verification Plan
- `source .venv/bin/activate && pip install -r requirements.txt` completes
  without error.
- `source .venv/bin/activate && flask --app run run &` then
  `curl -s http://127.0.0.1:5000/health | grep -q cmlogo.svg` succeeds;
  kill the background server after.

### Phase Summary
Scaffolded the app under `src/app/` (Flask factory in `__init__.py`,
blueprint `main` in `routes.py`, empty `services/` package for later
phases). `base.html` establishes the dark theme (Tailwind CDN + CM color
palette as CSS custom properties) with a header showing `cmlogo.svg`;
`health.html` extends it for a trivial smoke-test page. `run.py` at the
repo root wires `create_app()` for both `python run.py` and
`flask --app run run`. Added root-level `pytest.ini` with `pythonpath = .`
so future tests under `tests/` can `from src.app...` import regardless of
pytest's rootdir detection (no tests written yet — that starts in Phase 2).
`src/__init__.py` added explicitly (not relying on implicit namespace
packages) for clarity.

Verified: `pip install -r requirements.txt` succeeded cleanly (flask
3.1.3, pytest 9.1.1, pandas/numpy/openpyxl already present in the venv).
Booted via `flask --app run run` on port 5050 (chose a non-default port
since I couldn't confirm 5000 was free) — `GET /health` returned 200 with
`cmlogo.svg` present in the body, and `GET /static/cmlogo.svg` returned
200 directly. Server stopped cleanly after verification.

## Phase 2: Data Input
Status: Complete

- [x] `src/app/services/validation.py`: `validate_parameters(form, file) ->
      list[str]` checking: file present, Target Type in
      `{"Items Resolved", "Story Points"}`, Target Value is a positive
      number, Number of Simulations is a positive integer ≤ 5000, Sprint
      Start Date parses as a valid date, Sprint Length is a positive
      number. Returns a list of human-readable error strings (empty list =
      valid). Excel-content validation (columns, worksheet) is Phase 3's
      responsibility, not this function's.
- [x] `src/app/templates/input.html`: form with file upload, Target Type
      dropdown (default "Items Resolved"), Target Value, Number of
      Simulations (default 1000), Skip Historical Sprint Validation
      checkbox (default unchecked), Exclude Latest Sprints from Sampling
      (default 0), Sprint Start Date, Sprint Length (default 10). On
      re-render after a validation error, preserve previously submitted
      non-file values and show each error message inline.
- [x] `GET /` route renders `input.html` with defaults from
      `specs/data_input.md`.
- [x] `POST /validate` route (implemented fully in Phase 3, but wire the
      route here calling `validate_parameters` first): on parameter
      errors, re-render `input.html` with errors and submitted values;
      on success, hand off to Phase 3 logic (stub: pass through for now).

### Verification Plan
- `pytest tests/test_input_route.py`:
  - POSTing with `Number of Simulations = 6000` returns 200 and the
    response body contains an error message referencing the 5000 limit.
  - POSTing with `Target Value = -1` returns an error message.
  - POSTing with no file attached returns an error message.
  - POSTing valid params without a file-content check does not crash (may
    still error at Phase 3's Excel-parsing stage — acceptable at this
    point).

### Phase Summary
Added `src/app/services/validation.py::validate_parameters(form, file)`,
covering every guardrail from `specs/data_validation.md`'s "Validations"
section except Excel-content checks (deferred to Phase 3's
`parse_sprint_history`, since that needs to actually read the file).
Numeric/date fields use small private parsing helpers
(`_parse_positive_number`, `_parse_positive_int`, `_parse_non_negative_int`,
`_is_valid_date`) that return `None`/`False` on malformed input rather than
raising, so a garbage submission produces a validation error instead of a
500.

Form field names chosen: `sprint_history_file`, `target_type`,
`target_value`, `num_simulations`, `skip_validation`, `exclude_latest_sprints`,
`sprint_start_date` (HTML `type="date"`, `%Y-%m-%d`), `sprint_length` — these
names are now the contract the rest of the app (Phase 3+) reads from
`request.form` / `request.files`.

Routes added to `src/app/routes.py`: `GET /` renders `input.html` with
spec-defined defaults; `POST /validate` validates and either re-renders
`input.html` with inline errors (submitted values preserved via a `values`
dict rebuilt from `request.form`, per-field, not a raw passthrough) or — on
success — renders a temporary `validate_stub.html` placeholder showing the
uploaded filename. That stub is intentionally throwaway: Phase 3 replaces
the success branch of `/validate` with real Excel parsing, the sprint
summary table, and the confirm screen.

`tests/test_input_route.py` (8 tests, all passing) covers: index renders
the form, missing file, too many simulations, negative target value,
negative sprint length, invalid date, valid params not crashing, and that
re-rendering after an error preserves previously submitted values. Run via
`pytest tests/test_input_route.py`.

Deviation from the plan text: no manual `curl`/browser check was done this
phase (Phase 1's server-boot check already covers that the app serves
pages; Phase 2's own verification plan only calls for the pytest file,
which passes in full).

## Phase 3: Data Validation & Sprint Summary
Status: Complete

- [x] `src/app/services/data_processing.py`:
  - `parse_sprint_history(file_storage) -> pandas.DataFrame`: read the
    single worksheet via `pandas.read_excel(file, sheet_name=0)`; raise a
    `DataValidationError` (custom exception) listing missing mandatory
    columns (`State`, `Iteration Path`, `Resolved Date`, `Story Points`) if
    any are absent; fill missing `Story Points` values with `0`.
  - `build_sprint_summary(df, exclude_latest: int) -> pandas.DataFrame`
    with columns `Sprint`, `Items Resolved`, `Story Points`,
    `Last Resolved Date`, `Recency Rank`, `In Sampling Pool`, computed per
    the rules in "Key decisions" above.
- [x] Wire `POST /validate`: parse file via `parse_sprint_history`,
  catch `DataValidationError` and re-render `input.html` with the message;
  on success call `build_sprint_summary`.
  - If `Skip Historical Sprint Validation` is checked: proceed directly by
    internally forwarding to the Phase 4 execution logic (no intermediate
    page).
  - Otherwise: render `src/app/templates/confirm.html` showing the sprint
    summary as a table, with a hidden field containing the summary
    DataFrame serialized to JSON (`orient="records"`, dates as ISO
    strings) plus original params, and a "Confirm and Run Simulation"
    button POSTing to `/execute`.
- [x] `src/app/templates/confirm.html`: render the sprint summary table
  (Sprint, Items Resolved, Story Points, Last Resolved Date, Recency Rank,
  In Sampling Pool?) matching the example in `specs/data_validation.md`.

### Verification Plan
- `pytest tests/test_data_processing.py`:
  - `build_sprint_summary` on `notebook/Sprint_History.xlsx` with
    `exclude_latest=1` returns exactly 24 rows, with `Sprint 24` having
    `In Sampling Pool == False` and all other 23 rows `True` (matches the
    fixture verified during planning).
  - A DataFrame missing the `State` column raises `DataValidationError`.
- `pytest tests/test_validate_route.py`: POSTing
  `notebook/Sprint_History.xlsx` with valid params and
  `Skip Historical Sprint Validation` unchecked returns a page containing
  "Sprint 24" and a form targeting `/execute`; with it checked, the
  response instead contains simulation results markers from Phase 4 (or a
  clear placeholder until Phase 4 lands).

### Phase Summary
Added `src/app/services/data_processing.py` with `DataValidationError`,
`parse_sprint_history(file_storage)`, `build_sprint_summary(df,
exclude_latest)`, and `summary_to_records(summary)` (JSON-serializable rows
for the confirm-page hidden field, dates converted to ISO strings).
`parse_sprint_history` never lets a raw pandas/openpyxl exception escape —
both a totally unreadable file and missing mandatory columns
(`State`, `Iteration Path`, `Resolved Date`, `Story Points`) surface as
`DataValidationError`, which the route turns into a normal validation
error message on `input.html`. `Story Points` is filled with `0` and cast
to `int`, matching the notebook.

`build_sprint_summary` filters to `State in {Resolved, Done, Closed}`,
derives `Sprint` from `Iteration Path.split('\\')[-1]`, groups by `Sprint`
(relies on pandas' default alphabetical `groupby` sort, which matches
numeric sprint order only because all sprint numbers in the source data
are zero-padded to two digits — e.g. "Sprint 01".."Sprint 24"), and
computes `Items Resolved` via `grouped.size()` (per the "Key decisions"
note — deliberately not `['ID'].count()`, since `ID` is optional).
`Recency Rank` uses `Last Resolved Date.rank(ascending=False,
method="min")` — this is a plain competition rank (ties share the lowest
rank, next rank skips ahead), matching `notebook/sprints.ipynb` exactly;
the plan's earlier "dense-min rank" wording was inaccurate and is
superseded by this implementation. `In Sampling Pool` = `Recency Rank >
exclude_latest`.

`POST /validate` in `src/app/routes.py` now: runs `validate_parameters`
first (unchanged from Phase 2); if those pass, calls
`parse_sprint_history` and treats a `DataValidationError` as one more item
in the same `errors` list (so file-content problems render on
`input.html` exactly like parameter problems); on full success, computes
`build_sprint_summary`, then branches on `Skip Historical Sprint
Validation`: if checked, renders `execute_stub.html` (a placeholder —
Phase 4 will replace this branch with an actual in-process simulation run,
per the "no intermediate page" decision); otherwise renders
`confirm.html` with the summary table and a hidden `payload` field
containing `{"summary": [...], "params": {...}}` as a JSON string built
with `json.dumps` in the route (not Jinja's `tojson`, which escapes for
`<script>` contexts, not HTML attributes). `confirm.html`'s form posts to
the literal path `/execute` (not `url_for`, since that route doesn't
exist until Phase 4).

Removed `src/app/templates/validate_stub.html` (Phase 2's throwaway
placeholder, now fully superseded).

Updated `tests/test_input_route.py::test_valid_params_does_not_crash`: it
previously posted a fake `b"dummy"` file and asserted on the now-deleted
stub page; it now posts the real `notebook/Sprint_History.xlsx` fixture
and asserts `"Sprint 24"` appears in the (now real) confirm page. No other
Phase 2 test needed changes — they all trigger a parameter-validation
error before the file is ever parsed.

New `tests/test_data_processing.py` (2 tests): confirms the previously
verified fixture (24 sprints, `Sprint 24` excluded, 23 in pool with
`exclude_latest=1`) end-to-end through `parse_sprint_history` +
`build_sprint_summary`; and that a DataFrame missing a mandatory column
raises `DataValidationError` (via `monkeypatch` on `pandas.read_excel`).

New `tests/test_validate_route.py` (3 tests): confirm screen shows
`"Sprint 24"` and a form `action="/execute"`; the skip-validation path
shows the placeholder page and does *not* show `"Sprint 24"`; a
non-Excel upload surfaces `"Could not read Excel file"` as a validation
error rather than a 500.

Full suite: `pytest tests/` → 13 passed (8 from Phase 2 + 2 + 3 new).

## Phase 4: Monte Carlo Simulation Engine
Status: Complete

- [x] `src/app/services/simulation.py`:
  - `MAX_SPRINT_WINDOW = 50`
  - `run_simulation(values: np.ndarray, target: float, simulations: int,
    rng: np.random.Generator) -> np.ndarray`: vectorized — draw
    `rng.choice(values, size=(simulations, MAX_SPRINT_WINDOW))`, cumulative
    sum along axis 1, find first column index (1-based) where the
    cumulative sum ≥ target per row via `argmax` on a boolean mask,
    substituting `MAX_SPRINT_WINDOW + 1` (51) for rows that never cross the
    target (mask never `True`). Returns an `int` array of length
    `simulations`.
  - `compute_confidence_results(hit_sprints: np.ndarray,
    confidence_levels=(50, 70, 85, 95)) -> dict[int, int]`: nearest-rank
    (ceiling) percentile per "Key decisions" above.
  - `compute_completion_date(start_date: date, sprint_length_days: int,
    required_sprints: int) -> date | None`: returns `None` if
    `required_sprints > MAX_SPRINT_WINDOW` (the `>50` sentinel), otherwise
    `numpy.busday_offset(start_date, required_sprints * sprint_length_days
    - 1, roll="forward")` converted back to a `datetime.date`.
- [x] Wire `POST /execute`: read sprint summary (from hidden JSON field, or
  freshly computed if arriving via the skip-validation path), filter to
  `In Sampling Pool == True` rows, extract the selected Target Type's
  column as the sampling values array, run `run_simulation` +
  `compute_confidence_results` + `compute_completion_date` per confidence
  level, pass results to `src/app/templates/results.html`.

### Verification Plan
- `pytest tests/test_simulation.py`:
  - Using `rng = np.random.default_rng(42)` and a small fixed `values`
    array with a low target, results are reproducible across two calls
    with the same seed.
  - `compute_confidence_results` output is monotonically non-decreasing
    across P50 → P70 → P85 → P95.
  - A `values` array that can never reach an extreme target within 50
    draws yields `51` for all confidence levels, and
    `compute_completion_date` returns `None` for those.
  - `compute_completion_date(date(2026, 7, 13), 10, 1)` (a Monday sprint
    start, per README's `2026-07-11` being a Saturday — confirm actual
    date math against a hand-checked business-day count) returns the
    expected weekday-only date.

### Phase Summary
Added `src/app/services/simulation.py`: `MAX_SPRINT_WINDOW = 50`,
`NOT_REACHED_SENTINEL = 51`, `CONFIDENCE_LEVELS = (50, 70, 85, 95)`,
`run_simulation`, `compute_confidence_results`, `compute_completion_date`
— implemented exactly as specced (vectorized `rng.choice` + `cumsum` +
boolean-mask `argmax`, nearest-rank/ceiling percentiles,
`numpy.busday_offset(..., roll="forward")` for date math). Hand-verified
in a scratch script that `2026-07-13` (a Monday) + a 10-business-day
sprint (`offset = required_sprints * sprint_length - 1 = 9`) lands on
Friday `2026-07-24` — this is the fixture used in the test.

Added `summary_from_records(records) -> DataFrame` to
`data_processing.py`, the inverse of Phase 3's `summary_to_records`, to
reconstruct the sprint summary from the confirm page's hidden JSON field.

Rewired `src/app/routes.py` around a new private helper,
`_run_and_render(summary, params)`, shared by both execution entry
points: it filters `summary` to `In Sampling Pool == True`, pulls the
selected Target Type's column as the sampling values array, runs the full
simulation pipeline, and renders `results.html`. `POST /validate`'s
`skip_validation` branch now calls this helper directly (no intermediate
page, per the Phase 3 "Key decisions" note) instead of rendering the old
`execute_stub.html` placeholder, which is deleted. The new `POST
/execute` route parses the `payload` hidden field from `confirm.html`
(`json.loads` → `summary_from_records` + `params` dict) and calls the
same helper — so `/validate` (skip path) and `/execute` (confirm path)
are two thin entry points into one execution function, keeping the two
routes' behavior identical by construction.

`results.html` is intentionally minimal for this phase: a plain table of
confidence level → sprints required (or `>50 sprints`) → completion date
(or "Not reached within window"), styled consistently with the dark
theme but with **no chart yet** — Phase 5's checklist item to build out
this template (prominent styling + Plotly histogram) is still open and
should edit this file in place, not replace it.

Test updates: `tests/test_validate_route.py`'s skip-validation test was
rewritten to assert the real results page (`"Simulation Results"`, `P50`,
`P95`) now that the placeholder is gone. New `tests/test_simulation.py`
(4 tests, matching all four verification-plan bullets exactly) and new
`tests/test_execute_route.py` (1 test, round-tripping a confirm-page-style
JSON payload through the real `/execute` route end-to-end) were added.

Full suite: `pytest tests/` → 18 passed (13 from Phases 1–3 + 4 simulation
+ 1 execute-route).

## Phase 5: Results Page & Charts
Status: Complete

- [x] `src/app/templates/results.html`: prominent summary table/cards — one row
  per confidence level (P50/P70/P85/P95) showing required sprints (or
  `>50 sprints`) and completion date (or "not reached within window"),
  for the selected Target Type. This textual data must be visible without
  interacting with any chart.
- [x] Add a Plotly histogram of the `hit_sprints` distribution (sprint
  index on x-axis, simulation count on y-axis), with vertical marker lines
  at the P50/P70/P85/P95 sprint values, rendered via `plotly.js` (CDN) fed
  a JSON trace built server-side.
- [x] Style `results.html` consistently with the dark theme / CM palette
  established in Phase 1.

### Verification Plan
- Manual browser check (see Phase 6's end-to-end walkthrough — this phase's
  chart rendering is folded into that check since it requires the full
  request chain).

### Phase Summary
Rebuilt `results.html` in place (per Phase 4's note not to replace it):
above the existing table, added a row of confidence-level cards
(P50/P70/P85/P95, each with a colored top border/value matching its
marker color) so the sprint-count / completion-date data is immediately
visible without any chart interaction — satisfying the "must be visible
without interacting with any chart" requirement together with the
existing table underneath.

Added a Plotly bar-chart histogram (`plotly-2.35.2` via CDN in
`{% block head %}`) of the `hit_sprints` distribution: 51 fixed x-axis
buckets (`"1"`..`"50"`, plus a `">50"` bucket for the non-convergence
sentinel) rather than Plotly's automatic binning, so the `>50` bucket
reads unambiguously instead of blending into a numeric axis. Vertical
dashed marker lines + labels at each confidence level's sprint value are
drawn via Plotly `shapes`/`annotations` (not a second trace), colored
with a `CONFIDENCE_COLORS` dict in `routes.py` that mirrors the CM
palette CSS variables from `base.html` (duplicated deliberately — Plotly
JS config needs literal color strings, not CSS custom properties).

New `src/app/routes.py::_build_chart_data(hit_sprints, rows)` computes
the bucketed counts and marker positions server-side from the same
`hit_sprints` array `_run_and_render` already produces, and passes them
to the template as `chart_data`, serialized client-side with Jinja's
`| tojson` filter (safe here since it's embedded in a `<script>` block,
unlike the `payload` hidden-field case in Phase 3 which needed
`json.dumps` + attribute-escaping instead).

Extended `tests/test_execute_route.py` with
`test_execute_renders_histogram_chart_data`: regex-extracts the embedded
`chartData` JS object from the rendered HTML and asserts on its shape —
51 labels/counts, counts summing to `num_simulations` (1000), and all
four `P50`/`P70`/`P85`/`P95` markers present. No live-browser check was
done this phase; Flask's test client renders the same Jinja templates a
real server would, and the full manual walkthrough (upload → confirm →
execute → visually inspect the chart) is explicitly deferred to Phase 6
per this phase's Verification Plan.

Full suite: `pytest tests/` → 19 passed (18 from Phases 1–4 + 1 new chart
assertion test).

## Phase 6: End-to-End Wiring, Error Polish, Performance
Status: Complete

- [x] Confirm the full route chain: `/` → `/validate` → (`confirm.html` →)
  `/execute` → `results.html`, including the `Skip Historical Sprint
  Validation` shortcut path.
- [x] Add a consistent error-banner partial (`src/app/templates/_errors.html`)
  used by both `input.html` (parameter/file errors) and any execution-time
  failure.
- [x] `pytest tests/test_end_to_end.py`: using Flask's test client, run the
  exact README acceptance scenario — `notebook/Sprint_History.xlsx`,
  Target Type = Items Resolved, Target Value = 5, Number of Simulations =
  1000, Skip Historical Sprint Validation = False, Exclude Latest Sprints
  from Sampling = 1, Sprint Start Date = 2026-07-11, Sprint Length = 10 —
  through `/validate` then `/execute`, asserting: no error banners, the
  confirm page shows "Sprint 24" excluded, and the results page contains
  four confidence-level rows with non-decreasing sprint counts and valid
  (or `>50`) completion dates.
- [x] Performance test: time the `/execute` call in the above scenario for
  `simulations=1000` (assert < 2s) and `simulations=5000` (assert < 5s),
  per the README's acceptance checklist.

### Verification Plan
- `pytest tests/` — full suite passes.
- Manual walkthrough: `flask --app run run`, open in a browser, upload
  `notebook/Sprint_History.xlsx` with the README's exact parameters,
  confirm the summary table, run the simulation, and visually confirm the
  results table + histogram render with sensible values and the CM dark
  theme / logo are applied throughout.

### Phase Summary
Extracted the error-banner markup that previously lived inline in
`input.html` into `src/app/templates/_errors.html` (a small partial taking
an `errors` list and optional `heading`), and switched `input.html` to
`{% include "_errors.html" %}`. Added `src/app/templates/error.html` (a
minimal `base.html` page with the same partial plus a "Start Over" link
back to `/`) for **execution-time** failures — a category that didn't
exist before this phase, since `_run_and_render` previously assumed its
inputs were always well-formed.

`_run_and_render` in `routes.py` now wraps its body in try/except: a new
`SimulationError` is raised explicitly when the sampling pool is empty
(e.g. `Exclude Latest Sprints from Sampling` excludes every sprint), with
a message telling the user what to adjust; a broader `except (TypeError,
ValueError, KeyError)` catches malformed params (bad numbers/dates —
realistically only reachable via a tampered `/execute` payload, since
`/validate`'s own params are already guarded by `validate_parameters`).
Both cases render `error.html` instead of crashing with a 500. Verified
the empty-pool path directly against the test client (POSTing an
`/execute` payload with `"summary": []` produces a 200 with the friendly
message, not a stack trace) before writing it into the test suite.

New `tests/test_end_to_end.py` (3 tests):
`test_readme_acceptance_scenario_end_to_end` drives the real route chain
exactly as a browser would — POSTs the README's exact parameter set to
`/validate`, regex-extracts the confirm page's Sprint 24 row to assert
`In Sampling Pool? = No`, regex-extracts the hidden `payload` field
(un-escaping it the same way a browser's form submission would), POSTs it
to `/execute`, and asserts no error banner, four confidence rows in
P50/P70/P85/P95 order with non-decreasing sprint counts, and each row's
completion date is either a valid `YYYY-MM-DD` string or "Not reached
within window" when its sprint count exceeds the 50-sprint window.
`test_execute_performance_1000_simulations` /
`test_execute_performance_5000_simulations` time `/execute` via
`time.perf_counter()` around the same `_confirm_payload` pattern used in
`tests/test_execute_route.py`, asserting < 2s and < 5s respectively — both
comfortably pass (well under 100ms each on this machine, so the limits
have plenty of headroom).

Full suite: `pytest tests/` → 22 passed (19 from Phases 1–5 + 3 new
end-to-end/performance tests).

Beyond the automated suite, did a real-HTTP walkthrough against a live
`flask --app run run` server (not just Flask's test client) using `curl`
and a small `urllib`-based script: confirmed `GET /` renders the CM logo
and file-upload field; `POST /validate` with the README's exact params
renders the confirm page with `Sprint 24` present and `In Sampling
Pool? = No`, zero error banners; extracting and re-POSTing the hidden
payload to `/execute` renders `results.html` with `Simulation Results`,
all four `P50`/`P70`/`P85`/`P95` labels, `Plotly.newPlot`, and the CM logo
present, zero error banners; the `skip_validation=on` path goes straight
from `/validate` to a real results page without ever rendering the
confirm table; and POSTing a non-Excel file renders the new error banner
with "Could not read Excel file". This confirms the full route chain and
error-banner wiring work over real HTTP, not just through Flask's test
client — but no actual browser/visual rendering (CSS layout, Plotly chart
appearance) was checked, since this environment has no browser available;
that visual-only piece of the phase's Verification Plan is the one part
not literally executed.

## Phase 7: Results Page — Calendar View
Status: Complete

- [x] Add a "Calendar View" section to `results.html`, between the
  percentile summary cards and the "Distribution of Simulated Outcomes"
  heading, per `specs/simulation_execution.md`'s "Calendar view" section.
- [x] `_build_calendar_data(start_date, rows)` in `routes.py`: computes
  per-day band colors from Sprint Start Date through the furthest *reached*
  confidence level's completion date, groups them into month-grid
  structures (`calendar.Calendar(firstweekday=0).monthdatescalendar`), and
  returns `None` when no confidence level was reached (calendar omitted).
- [x] Render month grids in `results.html` (Monday–Sunday columns), coloring
  business-day cells with their band's `CONFIDENCE_COLORS` value, muting
  weekend cells, and leaving in-month-but-out-of-range days (before Sprint
  Start Date or after the end date) as blank padding — plus a legend of
  `P{level}` swatches for every reached confidence level.

### Verification Plan
- `pytest tests/` — full suite still passes unmodified (calendar data is
  additive; no existing route/template contract changed).
- Standalone check of `_build_calendar_data`: constructed rows with a tied
  completion date between P50/P70 and a P95 with `completion_date=None`,
  confirmed the tied day colors as P50 (lower-confidence precedence), P95
  is absent from the legend, and the calendar's end date falls back to the
  highest reached level (P85 in that scenario).
- Manual visual check: rendered a real `/execute` response via Flask's test
  client to a static HTML file (logo `<img>` swapped for a placeholder,
  since `/static` isn't served outside the app) and opened it in Chrome —
  confirmed month grids, muted weekends, band coloring, and the tie-break
  rule all render as intended against the `notebook/Sprint_History.xlsx`
  fixture.

### Phase Summary
Added `_build_calendar_data` to `routes.py`: it derives band boundaries
directly from the already-computed `rows` list (`confidence` +
`completion_date` pairs) rather than re-deriving anything from raw
simulation output, and reuses the existing `CONFIDENCE_COLORS` mapping so
the calendar bands and the percentile cards/histogram markers always agree
on color. `_run_and_render` now also passes `calendar_data` to
`results.html`; the confirm-page/hidden-JSON handoff and `/execute`'s
shared code path were untouched, so both routes still render identically
by construction.

`results.html` wraps the new section in `{% if calendar_data %}` so the
(rare) case of zero confidence levels reaching the target within 50 sprints
degrades gracefully — the section simply doesn't render, no error path
needed.

No new automated tests were added (the existing end-to-end/route tests
don't assert on the calendar markup); verification instead relied on a
direct unit-level check of `_build_calendar_data`'s band/tie-break logic
plus a real-browser visual pass, per the Verification Plan above.

## Final Recap
Built the full three-step Monte Carlo Simulator (Data Input → Data
Validation → Simulation Execution) described in
`specs/montecarlosimulation.md` and friends, across seven phases:

1. **Scaffolding**: Flask app factory under `src/app/`, dark CM-branded
   `base.html` shell, `run.py` entry point.
2. **Data Input**: `validate_parameters` guardrails (file present, target
   type, positive numbers, 5000-simulation cap, valid date) and
   `input.html`, preserving submitted values across validation errors.
3. **Data Validation**: `parse_sprint_history` (Excel → DataFrame, never
   leaking a raw pandas exception) and `build_sprint_summary` (grouping,
   `Items Resolved`/`Story Points` totals, `Recency Rank` via plain
   competition ranking, `In Sampling Pool`), rendered as a confirm-page
   table with a stateless hidden-field JSON handoff to `/execute`.
4. **Simulation Engine**: vectorized NumPy Monte Carlo (`rng.choice` +
   `cumsum` + boolean-mask `argmax`), a 50-sprint non-convergence sentinel
   (`51`, rendered as `>50 sprints`), nearest-rank/ceiling percentiles at
   P50/P70/P85/P95, and business-day completion-date math via
   `numpy.busday_offset`. `/validate`'s skip-validation branch and
   `/execute` both funnel through one shared `_run_and_render` helper, so
   their behavior is identical by construction.
5. **Results Page & Charts**: confidence-level summary cards (data visible
   without any chart interaction) plus a Plotly bar-chart histogram over
   51 fixed buckets (`1`..`50`, `>50`) with dashed marker lines/labels at
   each confidence level, all colored from the CM palette.
6. **End-to-End Wiring & Error Polish**: a shared `_errors.html` partial
   used by both parameter/file validation errors (`input.html`) and a new
   execution-time error path (`error.html`, reached when the sampling pool
   is empty or params are otherwise malformed), plus an end-to-end test
   suite exercising the real route chain and confirming `/execute`
   comfortably meets the README's performance targets (well under 2s/5s
   for 1000/5000 simulations).
7. **Calendar View**: a month-grid calendar on the results page, between the
   percentile cards and the histogram, coloring each business day with its
   percentile band's color (lower confidence wins on tied completion
   dates), gracefully omitted when no confidence level reaches the target
   within the 50-sprint window.

Final state: 25 passing tests across 6 test files (`pytest tests/`), the
full route chain (`/` → `/validate` → `confirm.html` → `/execute` →
`results.html`, plus the skip-validation shortcut and the error-banner
path) verified both via Flask's test client and a live-server `curl`/
`urllib` walkthrough. No lint/type-check tooling is configured in this
repo, per `CLAUDE.md`.

Known gap: no actual browser/visual check was ever performed (this
environment has no browser) — CSS layout and the Plotly chart's visual
appearance have only been confirmed structurally (correct HTML, correct
embedded JSON, `Plotly.newPlot` present), not visually. A human should do
one real-browser pass before considering this production-ready.

## Deployment Plan
This is a Flask app with no database, no external services, and no
authentication — deployment is just "run the WSGI app somewhere."

1. **Environment**: Python 3.11+ (whatever the existing `.venv` was built
   with), `pip install -r requirements.txt` (`flask`, `pandas`, `numpy`,
   `openpyxl`, `pytest`).
2. **Config**: none required — there are no environment variables, secrets,
   or config files; `create_app()` takes no arguments.
3. **Run in production**: do not use `python run.py` / `flask run`
   (Flask's built-in dev server, single-threaded and unsuitable for
   production per its own startup warning). Instead run behind a
   production WSGI server, e.g.:
   ```bash
   pip install gunicorn
   gunicorn -w 4 -b 0.0.0.0:8000 "run:app"
   ```
   (`gunicorn` is not currently in `requirements.txt` — add it if this
   deployment path is taken.)
4. **Static files**: `src/app/static/cmlogo.svg` is served directly by
   Flask's static handler; for higher-traffic deployments, front the app
   with nginx (or similar) and serve `/static/` from disk directly instead
   of proxying it through Flask.
5. **Statelessness**: every request is self-contained (no server-side
   session, no database) — the app can be scaled horizontally behind a
   load balancer with zero session-affinity configuration.
6. **Resource sizing**: the heaviest operation is `/execute` with up to
   5000 simulations, measured at well under the README's 2s/5s targets on
   a dev machine; no special CPU/memory provisioning should be needed for
   typical CM sprint-history file sizes (a few hundred sprints at most).
7. **Pre-deploy check**: `pytest tests/` (22 tests) must pass, and a
   real-browser smoke test (upload `notebook/Sprint_History.xlsx`,
   confirm the summary, run a simulation, visually confirm the results
   page/chart) should be done at least once before any production
   rollout, since no automated visual/CSS check exists in this repo.
