# Migrate Monte Carlo app to Client (React SPA) + Server (FastAPI)

Split the Flask app (`src/app`) into two tiers under `src/`: `src/server` (FastAPI, same Pandas/NumPy logic) and `src/client` (Vite + TypeScript + Tailwind React SPA, same 3-step behavior). Each has its own Dockerfile; a root `docker-compose.yml` runs both; `deploy/build-docker-image.sh`, the `Deploy` GitHub workflow and the helm chart are updated to build/ship both images.

## Decisions (confirmed with the user)
- **API**: two stateless endpoints. `POST /api/validate` (multipart: form params + Excel file → param/file errors, or sprint summary). `POST /api/simulate` (JSON: `{summary, params}` → results). The SPA keeps the summary + params in memory between steps (replaces the hidden-field JSON blob). `GET /api/health` replaces `/health`.
- **View data**: the server returns only statistical results (percentile rows: confidence, label, sprints, `exceeds_window`, completion date; histogram counts incl. the `>50` bucket). React builds the chart (react-plotly.js) and the calendar month grids (port of `_build_calendar_data`) and owns the confidence colors/labels' presentation.
- **Client stack**: Vite + React + TypeScript + Tailwind (built, no CDN) + react-router (`/` input, `/confirm`, `/results`) + Vitest/Testing Library. Served by nginx in production, nginx proxies `/api` → server (same-origin, no CORS in prod). Dev: Vite proxy `/api` → `localhost:8000`.
- **Deployment**: two images with the same tag: `montecarlosim/montecarlosim-client` and `montecarlosim/montecarlosim-server`. Helm gets two deployments + services; ingress `/` → client, `/api` → server.
- **Legacy**: Flask app, templates, `run.py`, root `Dockerfile` are removed in the last phase, after parity is proven.
- **Unchanged business rules**: everything in `plans/monte-carlo-app.md` "Key decisions" (Sprint parsing, resolved states, `method="min"` ranking, sentinel 51 / `>50`, nearest-rank percentiles, `busday_offset`, 20000 simulation cap, `notebook/Sprint_History.xlsx` fixture: 24 sprints, 1 excluded, 23 in pool). Read it before touching simulation/validation logic.
- **Assumptions to correct if wrong**: server port 8000, client container port 80 (compose publishes `8080:80`); server served by `uvicorn` (no gunicorn); same-origin `/api` prefix on all server routes; UI text/theme/CM brand colors copied 1:1 from `base.html`/templates; Python 3.12 and Node 22 LTS base images; upload size limit raised in nginx (`client_max_body_size 20m`).

## For Future Agents
As work proceeds: mark checkboxes `- [x]` as items complete; when a phase is done,
set its status to `Complete` and write its **Phase Summary** (what was done, key
decisions, anything needed to continue with zero context); run the phase's
**Verification Plan** and record the result before moving on. When all phases are
done, fill in **Final Recap** and **Deployment Plan**.

## Phase 1: FastAPI server (port the statistical logic)
Status: Complete   <!-- Not started | In progress | Complete -->

- [x] Create `src/server/` with `app/__init__.py`, `app/main.py` (FastAPI app, `/api` router), `app/api/routes.py`, `app/schemas.py` (Pydantic request/response models), `requirements.txt` (fastapi, uvicorn[standard], python-multipart, pandas, numpy, openpyxl, pytest, httpx).
- [x] Move (`git mv`) `services/validation.py`, `data_processing.py`, `simulation.py` from `src/app/services/` to `src/server/app/services/` unchanged except imports; `validate_parameters` must accept plain values/UploadFile instead of Flask `form`/`file`.
- [x] Implement `POST /api/validate`: multipart fields identical to current form (`target_type`, `target_value`, `num_simulations`, `skip_validation`, `exclude_latest_sprints`, `sprint_start_date`, `sprint_length`, `team_capacity_factor`, `sprint_history_file`). Success → 200 `{summary: [...], params: {...}}`; param/file errors → 422 `{errors: [str]}` using the exact current error messages.
- [x] Implement `POST /api/simulate` taking `{summary, params}`; reuse the former `_run_and_render` logic minus rendering (empty sampling pool → 422 `{errors: [...]}`; `TypeError/ValueError/KeyError` → 422 "Could not run simulation: …"). Response: `{target_type, target_value, rows:[{confidence,label,sprints,exceeds_window,completion_date}], histogram:{labels,counts}}` (histogram built with the `Counter` logic from `_build_chart_data`, `>50` bucket included). Drop calendar/color data from the server.
- [x] Implement `GET /api/health` (200 `{"status":"ok"}`).
- [x] Add `src/server/Dockerfile` (python:3.12-slim, non-root user, `pip install -r requirements.txt`, copy `app/`, `EXPOSE 8000`, HEALTHCHECK on `/api/health`, `CMD uvicorn app.main:app --host 0.0.0.0 --port 8000`) and `src/server/.dockerignore`.
- [x] Port tests to `src/server/tests/` (`pytest.ini` there): `test_data_processing`, `test_simulation` as-is; route tests (`input`/`validate`/`execute`/`end_to_end`) rewritten against FastAPI `TestClient`, keeping the fixture assertions (24 sprints / 23 pool) and the timing assertions (<2s @1000 sims, <5s @5000). Fixture path: `notebook/Sprint_History.xlsx` (repo root) — reference it relatively; if the Docker build context must stay `src/server`, tests simply aren't copied into the image.

### Verification Plan
- `cd src/server && pip install -r requirements.txt && pytest` → all tests pass.
- `cd src/server && uvicorn app.main:app --port 8000 &` then `curl -s localhost:8000/api/health` → `{"status":"ok"}`; `curl -F sprint_history_file=@../../notebook/Sprint_History.xlsx -F target_type="Items Resolved" -F target_value=100 -F num_simulations=1000 -F exclude_latest_sprints=1 -F sprint_start_date=2026-01-05 -F sprint_length=10 -F team_capacity_factor=1.0 localhost:8000/api/validate` → 24 summary records, Sprint 24 `In Sampling Pool=false`.
- `docker build -t mcs-server src/server` succeeds and container reports healthy.

### Phase Summary
**Done.** `src/server/` is a standalone FastAPI app (`app.main:app`, all routes
under `/api`). Verification: `cd src/server && pytest` → 30 passed (run in a
`python:3.12-slim` container, since the repo `.venv` only works inside the
devcontainer); `docker build -t mcs-server src/server` → container reports
`healthy`, runs as user `app`; curl `/api/health` → `{"status":"ok"}`; curl
`/api/validate` with the fixture → 24 records, Sprint 24
`In Sampling Pool=false`, 23 in pool; feeding that response to
`/api/simulate` → 4 rows + 51-bucket histogram. Legacy suite (`pytest` at
repo root) still passes 25/25.

Key decisions / things to know:
- **Services are shared, not copied.** The three modules were `git mv`'d to
  `src/server/app/services/`. The legacy Flask app (`src/app/routes.py`) and
  root `tests/` now import them as `src.server.app.services...` so Flask
  keeps working until Phase 5 (`src/server/` has no `__init__.py`; it works
  as a namespace package). Inside `src/server` code imports them as
  `app.services...`; services import each other relatively (`.simulation`)
  so both import roots work.
- `validate_parameters(form: Mapping[str, str], file)` — no werkzeug import;
  `file` is anything with `.filename` (Flask `FileStorage` or Starlette
  `UploadFile`) or `None`. Error messages unchanged.
- **New `app/services/forecast.py`** holds what was `_run_and_render` minus
  rendering: `run_forecast(summary, params)` (raises `SimulationError` for an
  empty pool; malformed params raise `TypeError/ValueError/KeyError`),
  `build_histogram` (the `Counter` logic, `>50` bucket last) and
  `CONFIDENCE_LABELS`. Colors/markers/calendar are not on the server.
- **`/api/validate` reads `await request.form()` manually** instead of
  FastAPI `Form()`/`File()` params so missing/blank fields and an empty file
  input (`filename=""`) produce the original messages rather than FastAPI's
  own 422. Note `request.form()` yields `starlette.datastructures.UploadFile`
  — `fastapi.UploadFile` is a *subclass*, so `isinstance` must use the
  Starlette class. Excel parsing runs in `run_in_threadpool`.
- **Response shapes** (for the Phase 2 `types.ts`):
  - validate 200: `{summary: [{"Sprint", "Items Resolved", "Story Points",
    "Last Resolved Date" (ISO str), "Recency Rank", "In Sampling Pool"}],
    params: {target_type, target_value, num_simulations,
    exclude_latest_sprints, sprint_start_date, sprint_length,
    team_capacity_factor (all raw strings, only those submitted),
    skip_validation: bool}}`. Summary keys keep the DataFrame column names
    (Pydantic aliases in `schemas.py`).
  - The validate response can be POSTed verbatim to `/api/simulate`.
    `SimulationParams` coerces numbers to strings, so the client may send
    either.
  - simulate 200: `{target_type, target_value: int, rows: [{confidence,
    label, sprints, exceeds_window, completion_date: str|null}],
    histogram: {labels: ["1".."50", ">50"], counts: [51 ints]}}`.
  - **Every** 422 is `{errors: [str]}` — including FastAPI body-validation
    failures, which a `RequestValidationError` handler in `main.py` converts
    to `"Invalid request: <loc>: <msg>"`.
- `src/server/pytest.ini` sets `pythonpath = .`, `testpaths = tests`; tests
  locate the fixture via `Path(__file__).parents[3] / "notebook"`. Shared
  `client` / `fixture_summary_records` fixtures live in `tests/conftest.py`.
  Root `pytest.ini` gained `testpaths = tests` so a bare `pytest` at the
  repo root doesn't also collect the server suite (duplicate test module
  basenames would clash). `pytest src/server` from the root picks up
  `src/server/pytest.ini`.
- `.dockerignore` excludes `tests/` so the image is only `app/` + deps.
- Unpinned deps (as in the root `requirements.txt`); resolved to fastapi
  0.143 / starlette 1.7 / pydantic 2.14. The TestClient emits a harmless
  deprecation warning recommending `httpx2`.

## Phase 2: React SPA (feature parity)
Status: Not started

- [ ] Scaffold `src/client/` with Vite + React + TypeScript (`package.json`, `tsconfig`, `vite.config.ts` with `/api` dev proxy → `http://localhost:8000` and Vitest config), Tailwind + PostCSS config; define the CM brand colors as CSS custom properties / Tailwind theme extension copied from `src/app/templates/base.html`; copy `src/app/static/cmlogo.png` to `src/client/public/`.
- [ ] Add `src/client/src/api.ts` (typed `validate(formData)` and `simulate(summary, params)` fetch wrappers; surface `{errors}` from 422 as thrown `ApiError`) and `src/client/src/types.ts` mirroring `schemas.py`.
- [ ] App shell: `Layout` (header, logo, breadcrumb/step indicator ported from `_breadcrumb.html`), `ErrorList` (port of `_errors.html`), help modal + field help (ports of `_help_modal.html`, `_field_help.html`).
- [ ] Step 1 `InputPage` (port of `input.html`): all fields + defaults from `DEFAULT_FORM_VALUES`, file picker, skip-validation checkbox; submit → `validate`; show server errors inline preserving entered values (file kept in state); on success store `{summary, params}` in a React context/store (in memory only) and navigate to `/confirm`, or — if skip is checked — call `simulate` directly and navigate to `/results`.
- [ ] Step 2 `ConfirmPage` (port of `confirm.html`): sprint summary table (Sprint, Items Resolved, Story Points, Recency Rank, In Sampling Pool), "Run simulation" → `simulate` → `/results`; direct navigation without state redirects to `/`.
- [ ] Step 3 `ResultsPage` (port of `results.html`): P50/P70/P85/P95 cards (`>50 sprints` + "Not reached within window" for sentinel rows), react-plotly.js histogram with `>50` bucket and percentile markers, calendar view; execution errors rendered like `error.html` (step 3) with a back link.
- [ ] Port `_build_calendar_data` to `src/client/src/lib/calendar.ts` (Mon-first month grids, weekdays colored by lowest-confidence band whose completion date ≥ day, weekends muted, rows without a date excluded, month range start → furthest completion date); keep date math in UTC/local-date-safe form (parse `YYYY-MM-DD` manually, no timezone shifts).
- [ ] Vitest tests: `calendar.test.ts` (band coloring, weekend handling, month spanning year-end, no-dated-rows → null), `InputPage` (error rendering, skip-validation path), `ConfirmPage` (redirect without state, table render), `ResultsPage` (sentinel rendering) with the API mocked.

### Verification Plan
- `cd src/client && npm ci && npm run build && npm test -- --run` → build succeeds with no TS errors; all tests pass.
- With server on :8000, `cd src/client && npm run dev`, then drive the flow with the `run` skill/browser: upload `notebook/Sprint_History.xlsx`, Exclude Latest=1 → confirm table shows 24 rows (Sprint 24 excluded) → run → 4 percentile cards, histogram, calendar render; skip-validation path goes straight to results; invalid parameters (e.g. 20001 simulations, missing file) show the same error messages as the Flask app.

### Phase Summary
_(write when phase completes)_

## Phase 3: Client Dockerfile + docker-compose
Status: Not started

- [ ] Add `src/client/Dockerfile` (multi-stage: `node:22-alpine` `npm ci && npm run build` → `nginx:alpine` serving `dist/`), `src/client/nginx.conf` (SPA fallback `try_files $uri /index.html`, `location /api/ { proxy_pass http://server:8000; client_max_body_size 20m; proxy_read_timeout 600s; }`, gzip), `src/client/.dockerignore` (node_modules, dist).
- [ ] Make the nginx upstream configurable (`envsubst` template via `/etc/nginx/templates/default.conf.template` with `API_UPSTREAM`, default `http://server:8000`) so compose and helm (`monte-carlo-sim-server-service`) both work.
- [ ] Add root `docker-compose.yml`: service `server` (build `./src/server`, healthcheck) and `client` (build `./src/client`, `ports: ["8080:80"]`, `depends_on: server: condition: service_healthy`, `API_UPSTREAM=http://server:8000`).
- [ ] Update root `.dockerignore` for the new layout; update `README.md` and `CLAUDE.md` (Commands + Architecture sections) for the two-tier layout, docker-compose usage and the new test commands.

### Verification Plan
- `docker compose build` succeeds; `docker compose up -d` → `docker compose ps` shows both healthy/running.
- `curl -s localhost:8080/api/health` → `{"status":"ok"}` (proxied through nginx); `curl -s localhost:8080/` returns the SPA `index.html`; `curl -s localhost:8080/confirm` also returns `index.html` (SPA fallback).
- Upload `notebook/Sprint_History.xlsx` via `curl -F ... localhost:8080/api/validate` → 200 with 24 records. `docker compose down` cleans up.

### Phase Summary
_(write when phase completes)_

## Phase 4: build-docker-image.sh, GitHub workflow, helm chart
Status: Not started

- [ ] Update `deploy/build-docker-image.sh`: replace the single `IMAGE` with `CLIENT_IMAGE="montecarlosim/montecarlosim-client"` and `SERVER_IMAGE="montecarlosim/montecarlosim-server"` (options `--client-image`/`--server-image`; keep `-t`, `-u`, `-p`, `-r`, `--no-push`, `-h`; update `help()`; drop/repurpose `-i`). Build with `docker build -t <registry>/<image>:<tag> src/client` and `src/server` (context = each folder), fail fast with the existing red/green messages, login once, push both. Keep it runnable from the repo root as the workflow does.
- [ ] Add an optional `--only client|server` flag (default both) for faster local iteration.
- [ ] Update `.github/workflows/deploy.yml`: keep GitVersion + tag steps; the "Run Deploy Script" step builds/pushes both images with the same `image_tag` (no input changes needed for secrets `CM_REPO_USERNAME`/`CM_REPO_PAT`); rename the step to "Build and push client and server images"; add a step before it to run server tests (`pip install -r src/server/requirements.txt && pytest src/server`) and client tests/build (`npm ci && npm test -- --run` in `src/client`) so a broken tier never gets published; use `actions/setup-python` and `actions/setup-node`.
- [ ] Update helm chart in `helm/chart/`: `values.yaml` → `registry`, `client_image`, `server_image`, single shared `tag`; split `monte-carlo-sim-deployment.yaml` and `monte-carlo-sim-service.yaml` into client (port 80) and server (port 8000, memory limits raised if profiling shows pandas needs >200Mi) variants; client container gets env `API_UPSTREAM=http://monte-carlo-sim-server-service:80`; update `monte-carlo-sim-ingress.yaml` to route `/api` → server service and `/` → client service (keep the OpenShift annotations and timeouts).
- [ ] Bump `Chart.yaml` version/appVersion per repo convention if one exists (check `GitVersion.yml`/existing tag history first).

### Verification Plan
- `bash -n deploy/build-docker-image.sh` → no syntax errors; `./deploy/build-docker-image.sh -h` → shows new usage; `./deploy/build-docker-image.sh -t test --no-push` → builds both images; `docker images | grep montecarlosim` lists `-client:test` and `-server:test`.
- `./deploy/build-docker-image.sh -t test` (no creds) → exits 1 with the "USERNAME and PAT are required" error after building.
- `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml'))"` parses; `actionlint` if available.
- `helm template helm/chart` renders two Deployments, two Services and an Ingress with both paths, no errors (`helm lint helm/chart`).
- Workflow itself can only be fully verified by a manual `workflow_dispatch` run — record that as a manual post-merge check in the Deployment Plan.

### Phase Summary
_(write when phase completes)_

## Phase 5: Remove legacy Flask app
Status: Not started

- [ ] Confirm parity checklist from Phase 2 verification passes against the compose stack.
- [ ] `git rm -r src/app run.py Dockerfile pytest.ini tests/` (tests already ported to `src/server/tests`), root `requirements.txt` (superseded by `src/server/requirements.txt`); keep `src/__init__.py` only if still referenced, otherwise remove it. Keep `notebook/`, `specs/`, `plans/`.
- [ ] Update `.devcontainer/post-create.sh` and `.vscode/settings.json` if they reference the old paths or root `requirements.txt` (add Node install for the client); update `CLAUDE.md` so it no longer documents Flask/Jinja and points at `src/server` and `src/client`.
- [ ] Add a short "Phase 7: Client/server split" pointer in `plans/monte-carlo-app.md` referring to this plan (it says business rules live there).

### Verification Plan
- `grep -rn "flask\|src.app" --include=* . --exclude-dir={.git,node_modules,.venv,notebook,plans}` → no remaining references.
- `pytest src/server` and `cd src/client && npm test -- --run` pass; `docker compose up --build` still works end to end.

### Phase Summary
_(write when phase completes)_

## Final Recap
_(write when all phases complete: summary of the entire piece of work)_

## Deployment Plan
_(write when all phases complete: step-by-step deployment instructions)_
