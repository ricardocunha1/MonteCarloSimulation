# Migrate Monte Carlo app to Client (React SPA) + Server (FastAPI)

Split the Flask app (`src/app`) into two tiers under `src/`: `src/server` (FastAPI, same Pandas/NumPy logic) and `src/client` (Vite + TypeScript + Tailwind React SPA, same 3-step behavior). Each has its own Dockerfile; a root `docker-compose.yml` runs both; `deploy/build-docker-image.sh`, the `Deploy` GitHub workflow and the helm chart are updated to build/ship both images.

## Decisions (confirmed with the user)
- **API**: two stateless endpoints. `POST /api/validate` (multipart: form params + Excel file → param/file errors, or sprint summary). `POST /api/simulate` (JSON: `{summary, params}` → results). The SPA keeps the summary + params in memory between steps (replaces the hidden-field JSON blob). `GET /api/health` replaces `/health`.
- **View data**: the server returns only statistical results (percentile rows: confidence, label, sprints, `exceeds_window`, completion date; histogram counts incl. the `>50` bucket). React builds the chart (react-plotly.js) and the calendar month grids (port of `_build_calendar_data`) and owns the confidence colors/labels' presentation.
- **Client stack**: Vite + React + TypeScript + Tailwind (built, no CDN) + react-router (`/` input, `/confirm`, `/results`) + Vitest/Testing Library. Served by nginx in production, nginx proxies `/api` → server (same-origin, no CORS in prod). Dev: Vite proxy `/api` → `localhost:8000`.
- **Deployment**: two images with the same tag: `montecarlosim/montecarlosim-client` and `montecarlosim/montecarlosim-server`. Helm gets two deployments + services; ingress `/` → client, `/api` → server.
- **Legacy**: Flask app, templates, `run.py`, root `Dockerfile` are removed in the last phase, after parity is proven.
- **Unchanged business rules**: everything in `plans/monte-carlo-app.md` "Key decisions" (Sprint parsing, resolved states, `method="min"` ranking, sentinel 51 / `>50`, nearest-rank percentiles, `busday_offset`, 20000 simulation cap, `notebook/Sprint_History.xlsx` fixture: 24 sprints, 1 excluded, 23 in pool). Read it before touching simulation/validation logic.
- **Assumptions to correct if wrong**: server port 8000, ~~client container port 80 (compose publishes `8080:80`)~~ **corrected in Phase 3: client container port 8080** (`nginx-unprivileged`, non-root, for OpenShift's restricted SCC; compose publishes `8080:8080`); server served by `uvicorn` (no gunicorn); same-origin `/api` prefix on all server routes; UI text/theme/CM brand colors copied 1:1 from `base.html`/templates; Python 3.12 and Node 22 LTS base images; upload size limit raised in nginx (`client_max_body_size 20m`).

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
Status: Complete

- [x] Scaffold `src/client/` with Vite + React + TypeScript (`package.json`, `tsconfig`, `vite.config.ts` with `/api` dev proxy → `http://localhost:8000` and Vitest config), Tailwind + PostCSS config; define the CM brand colors as CSS custom properties / Tailwind theme extension copied from `src/app/templates/base.html`; copy `src/app/static/cmlogo.png` to `src/client/public/`.
- [x] Add `src/client/src/api.ts` (typed `validate(formData)` and `simulate(summary, params)` fetch wrappers; surface `{errors}` from 422 as thrown `ApiError`) and `src/client/src/types.ts` mirroring `schemas.py`.
- [x] App shell: `Layout` (header, logo, breadcrumb/step indicator ported from `_breadcrumb.html`), `ErrorList` (port of `_errors.html`), help modal + field help (ports of `_help_modal.html`, `_field_help.html`).
- [x] Step 1 `InputPage` (port of `input.html`): all fields + defaults from `DEFAULT_FORM_VALUES`, file picker, skip-validation checkbox; submit → `validate`; show server errors inline preserving entered values (file kept in state); on success store `{summary, params}` in a React context/store (in memory only) and navigate to `/confirm`, or — if skip is checked — call `simulate` directly and navigate to `/results`.
- [x] Step 2 `ConfirmPage` (port of `confirm.html`): sprint summary table (Sprint, Items Resolved, Story Points, Recency Rank, In Sampling Pool), "Run simulation" → `simulate` → `/results`; direct navigation without state redirects to `/`.
- [x] Step 3 `ResultsPage` (port of `results.html`): P50/P70/P85/P95 cards (`>50 sprints` + "Not reached within window" for sentinel rows), react-plotly.js histogram with `>50` bucket and percentile markers, calendar view; execution errors rendered like `error.html` (step 3) with a back link.
- [x] Port `_build_calendar_data` to `src/client/src/lib/calendar.ts` (Mon-first month grids, weekdays colored by lowest-confidence band whose completion date ≥ day, weekends muted, rows without a date excluded, month range start → furthest completion date); keep date math in UTC/local-date-safe form (parse `YYYY-MM-DD` manually, no timezone shifts).
- [x] Vitest tests: `calendar.test.ts` (band coloring, weekend handling, month spanning year-end, no-dated-rows → null), `InputPage` (error rendering, skip-validation path), `ConfirmPage` (redirect without state, table render), `ResultsPage` (sentinel rendering) with the API mocked.

### Verification Plan
- `cd src/client && npm ci && npm run build && npm test -- --run` → build succeeds with no TS errors; all tests pass.
- With server on :8000, `cd src/client && npm run dev`, then drive the flow with the `run` skill/browser: upload `notebook/Sprint_History.xlsx`, Exclude Latest=1 → confirm table shows 24 rows (Sprint 24 excluded) → run → 4 percentile cards, histogram, calendar render; skip-validation path goes straight to results; invalid parameters (e.g. 20001 simulations, missing file) show the same error messages as the Flask app.

### Phase Summary
**Done.** `src/client/` is a Vite 6 + React 18 + TypeScript + Tailwind 3
(PostCSS) SPA with react-router 7 (`react-router-dom`) and Vitest 4.
Verification: `cd src/client && npm ci && npm run build && npm test -- --run`
→ `tsc -b` clean, build OK, 4 files / 25 tests pass. Live check (uvicorn on
:8000 + `npm run dev`, driven with headless Chromium via Playwright):
fixture upload with Exclude Latest=1 → confirm table 24 rows, Sprint 24 "No",
23 "Yes" → results show 4 cards, 5-month calendar, 51-bar Plotly histogram
with 4 percentile marker lines; skip-validation lands directly on
`/results`; 20001 simulations → "Number of Simulations must not exceed
20000."; no file → "A Sprint History Excel file is required." (other fields
kept); direct load of `/results`, `/confirm` or an unknown path → `/`; help
modal opens and closes on Esc. Only browser console errors were the expected
422 responses. Dev proxy `/api` → :8000 and SPA fallback both work.

Key decisions / things to know:
- **Node isn't in the devcontainer yet** (Phase 5 adds it). For this phase
  Node 22.23.3 was unpacked to `~/.local/node` (`export
  PATH=~/.local/node/bin:$PATH`); Playwright + Chromium lived in the session
  scratchpad, not the repo.
- **Lockfile was generated with npm 11** (`npx npm@11 install`): npm 10.9
  (bundled with Node 22) crashes in arborist (`reading 'edgesOut'`) when
  *resolving* vitest 4's optional `jsdom: "*"` peer from scratch. `npm ci`
  with npm 10 works fine against the committed lockfile (verified), so the
  Phase 3 `node:22-alpine` build is unaffected. If you add/upgrade deps and
  hit that crash, use `npx npm@11 install`.
- Versions were bumped past audit advisories: react-router-dom 7.18.4
  (6.x had a moderate advisory), vitest 4.1.11 (tinypool/mocker advisories
  in 3.x), jsdom 28. `npm audit --omit=dev` → 0. Remaining dev-only
  findings are in Tailwind 3's build-time globbing (`braces`,
  `postcss-selector-parser`); they go away only with Tailwind 4.
- **Plotly**: `plotly.js-basic-dist-min` (bar/scatter only, 1.1 MB vs 4.4 MB
  full) via `react-plotly.js/factory`, in `components/HistogramChart.tsx`
  which `ResultsPage` `React.lazy`-loads — a separate chunk fetched only on
  `/results` (`build.chunkSizeWarningLimit: 1200` for it). The x axis is
  forced to `type: "category"` so `>50` is its own bar. Tests mock this
  component (Plotly needs a real browser).
- **State** (`store.tsx`): `ForecastProvider` holds `validation`
  (the `/api/validate` response) and `execution`
  (`{status:"ok", result, sprintStartDate} | {status:"error", errors}`), in
  memory only — a reload sends you back to `/`. `lib/runSimulation.ts` is
  the single simulate→`Execution` helper used by both the skip-validation
  branch of `InputPage` and `ConfirmPage` (same role as the old
  `_run_and_render`). An execution error renders the `error.html` port on
  `/results` (step 3, "Start Over" link).
- `InputPage` builds the `FormData` the way a native form submit would
  (every text field even if blank, `skip_validation=on` only when checked,
  an empty `File` when none chosen) so the server's messages are identical.
  HTML `required` attributes are kept as in the Flask form. Form values and
  the chosen file survive an error because the page stays mounted.
- Confidence colors live in `lib/confidence.ts` (literal hex mirroring the
  `--cm-*` vars in `src/index.css`; Tailwind also exposes them as `cm-*`).
- `lib/calendar.ts` turns `YYYY-MM-DD` into a UTC day number and does all
  arithmetic on integers, so no local-timezone shift is possible. It expects
  `rows` in ascending confidence (as the server returns them).
- Confirm table "Last Resolved Date" now shows the ISO date (`2025-01-10`)
  the API returns; Flask printed the pandas Timestamp (`2025-01-10
  00:00:00`). Intentional, cosmetic.
- The root `.gitignore` (Python template) ignores `lib/`;
  `src/client/.gitignore` re-includes `src/lib/`. Watch for that if you add
  other `lib`/`build`/`dist`-named folders.
- Test helpers: `src/test/render.tsx` (`renderAt(path, element, {validation,
  execution, routes})` with stub routes + a `location` probe),
  `src/test/fixtures.ts`.

## Phase 3: Client Dockerfile + docker-compose
Status: Complete

- [x] Add `src/client/Dockerfile` (multi-stage: `node:22-alpine` `npm ci && npm run build` → `nginx:alpine` serving `dist/`), `src/client/nginx.conf` (SPA fallback `try_files $uri /index.html`, `location /api/ { proxy_pass http://server:8000; client_max_body_size 20m; proxy_read_timeout 600s; }`, gzip), `src/client/.dockerignore` (node_modules, dist).
- [x] Make the nginx upstream configurable (`envsubst` template via `/etc/nginx/templates/default.conf.template` with `API_UPSTREAM`, default `http://server:8000`) so compose and helm (`monte-carlo-sim-server-service`) both work.
- [x] Add root `docker-compose.yml`: service `server` (build `./src/server`, healthcheck) and `client` (build `./src/client`, `ports: ["8080:80"]`, `depends_on: server: condition: service_healthy`, `API_UPSTREAM=http://server:8000`).
- [x] Update root `.dockerignore` for the new layout; update `README.md` and `CLAUDE.md` (Commands + Architecture sections) for the two-tier layout, docker-compose usage and the new test commands.

### Verification Plan
- `docker compose build` succeeds; `docker compose up -d` → `docker compose ps` shows both healthy/running.
- `curl -s localhost:8080/api/health` → `{"status":"ok"}` (proxied through nginx); `curl -s localhost:8080/` returns the SPA `index.html`; `curl -s localhost:8080/confirm` also returns `index.html` (SPA fallback).
- Upload `notebook/Sprint_History.xlsx` via `curl -F ... localhost:8080/api/validate` → 200 with 24 records. `docker compose down` cleans up.

### Phase Summary
**Done.** Verification: `docker compose build` OK; `docker compose up -d` →
both `(healthy)`. Through nginx: `/api/health` → `{"status":"ok"}`; `/`,
`/confirm`, `/results` → 200 with the SPA `index.html`; fixture
`/api/validate` → 200, 24 records, 23 in pool, Sprint 24 excluded; its
response POSTed to `/api/simulate` → 4 rows / 51 buckets. The Phase 2
Playwright flow (happy path, skip-validation, 20001 sims, missing file,
help modal) also passes against the compose stack. Extra checks: a 5 MB
upload reaches the server (422 bad Excel), 25 MB → nginx 413; JS assets
are gzipped with `Cache-Control: public, immutable` + 1y expiry,
`index.html` is `no-cache`; client runs as uid 101; `API_UPSTREAM=
http://monte-carlo-sim-server-service:80` renders into `proxy_pass` and
`nginx -t` passes. `docker compose down` removes everything. Legacy root
image still builds and its Flask `/health` returns 200.

Key decisions / things to know:
- **Client listens on 8080, not 80** (corrects the plan assumption). The
  helm cluster is OpenShift (`*.apps.rhos...`), whose restricted SCC runs
  pods as a random non-root UID; stock `nginx:alpine` can't bind 80 or
  write its cache dirs there. `nginxinc/nginx-unprivileged:1.28-alpine`
  handles both. Phase 4: client `containerPort: 8080`; its Service can
  still expose port 80 → targetPort 8080.
- One file, `src/client/nginx.conf.template`, is both "nginx.conf" and the
  envsubst template; the Dockerfile copies it to
  `/etc/nginx/templates/default.conf.template` and sets
  `ENV API_UPSTREAM=http://server:8000`. The entrypoint substitutes only
  *defined* env vars, so nginx's `$uri`/`$host` are untouched. nginx
  resolves the upstream hostname at startup, so the upstream must exist in
  DNS when the client starts (compose `depends_on: service_healthy`; a k8s
  Service name always resolves).
- Client healthcheck: busybox `wget` on `http://127.0.0.1:8080/`. Compose
  re-declares the server healthcheck (10s interval) so the client starts
  sooner than the image's 30s default allows.
- Compose tags the images `montecarlosim/montecarlosim-{server,client}:local`.
- With docker-outside-of-docker, published ports are on the Docker host:
  from inside the devcontainer use `172.17.0.1:8080`, not `localhost`.
- Root `.dockerignore` now also excludes `src/client`, `src/server/tests`
  and the server's Docker files, so the legacy root image (still needed
  until Phase 5) only gets `src/app` + the shared `src/server/app`.
- README gained Architecture / Docker Compose / local dev / test sections
  (legacy Flask instructions kept under "Legacy Flask app"); CLAUDE.md
  Commands + Architecture cover the two-tier layout.

## Phase 4: build-docker-image.sh, GitHub workflow, helm chart
Status: Not started

- [ ] Update `deploy/build-docker-image.sh`: replace the single `IMAGE` with `CLIENT_IMAGE="montecarlosim/montecarlosim-client"` and `SERVER_IMAGE="montecarlosim/montecarlosim-server"` (options `--client-image`/`--server-image`; keep `-t`, `-u`, `-p`, `-r`, `--no-push`, `-h`; update `help()`; drop/repurpose `-i`). Build with `docker build -t <registry>/<image>:<tag> src/client` and `src/server` (context = each folder), fail fast with the existing red/green messages, login once, push both. Keep it runnable from the repo root as the workflow does.
- [ ] Add an optional `--only client|server` flag (default both) for faster local iteration.
- [ ] Update `.github/workflows/deploy.yml`: keep GitVersion + tag steps; the "Run Deploy Script" step builds/pushes both images with the same `image_tag` (no input changes needed for secrets `CM_REPO_USERNAME`/`CM_REPO_PAT`); rename the step to "Build and push client and server images"; add a step before it to run server tests (`pip install -r src/server/requirements.txt && pytest src/server`) and client tests/build (`npm ci && npm test -- --run` in `src/client`) so a broken tier never gets published; use `actions/setup-python` and `actions/setup-node`.
- [ ] Update helm chart in `helm/chart/`: `values.yaml` → `registry`, `client_image`, `server_image`, single shared `tag`; split `monte-carlo-sim-deployment.yaml` and `monte-carlo-sim-service.yaml` into client (container port 8080 — see Phase 3) and server (port 8000, memory limits raised if profiling shows pandas needs >200Mi) variants; client container gets env `API_UPSTREAM=http://monte-carlo-sim-server-service:80`; update `monte-carlo-sim-ingress.yaml` to route `/api` → server service and `/` → client service (keep the OpenShift annotations and timeouts).
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
