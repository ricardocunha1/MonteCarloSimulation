# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Planning Hub** — a dashboard web app hosting estimation and planning tools for
Critical Manufacturing (CM) projects (formerly "Monte Carlo Simulator";
`plans/cm-estimations-hub-dashboard.md` records the rename/refactor). Its
first tool, **Monte Carlo**, runs Monte Carlo
simulations to forecast how many sprints are needed to hit a target (Items
Resolved or Story Points), based on historical sprint data uploaded as an
Excel file. Three-step flow: Data Input → Data Validation (optional,
skippable) → Simulation Execution. A second, client-only tool, **Release
Plan** (`/release-plan`), is being built per `plans/release-plan-board.md`:
JSON import and the full board without drag-and-drop are done (Phases 0–1);
drag-and-drop is Phase 2.

Two tiers: a FastAPI server (`src/server`) and a React SPA (`src/client`).
It used to be a single Flask app; `plans/client-server-migration.md`
records that migration (the Flask app was removed in its Phase 5).

## Commands

```bash
docker compose up --build            # full stack, http://localhost:8080
cd src/server && pytest              # server tests (or `pytest src/server` from root)
cd src/server && pytest tests/test_simulation.py              # single file
cd src/server && pytest tests/test_validate_route.py::<name>  # single test
cd src/server && uvicorn app.main:app --reload --port 8000
cd src/client && npm ci && npm run dev   # http://localhost:5173, proxies /api -> :8000
cd src/client && npm test -- --run   # client tests (Vitest)
cd src/client && npm run build       # tsc -b type-check + production build
```

The devcontainer provides Python 3.12 (`.venv` with
`src/server/requirements.txt`) and Node 22 (devcontainer `node` feature;
`post-create.sh` runs `npm ci` in `src/client`). In a container created
before Node was added, `node` may be missing; a Node 22 may be unpacked in
`~/.local/node` (`export PATH=~/.local/node/bin:$PATH`). Docker is
docker-outside-of-docker: ports published by `docker compose` are reachable
from inside the devcontainer at `172.17.0.1:<port>`, not `localhost`; bind
mounts of `$PWD` do work. Attached `docker run` occasionally drops stdout
here — use `docker run -d --name x ...; docker wait x; docker logs x` when
output matters. `helm`, `actionlint`, `shellcheck` aren't installed; run
them via `alpine/helm`, `rhysd/actionlint`, `koalaman/shellcheck` images.

```bash
# Release (normally done by the manual "Deploy" GitHub workflow)
./deploy/build-docker-image.sh -t <tag> --no-push          # build both images
./deploy/build-docker-image.sh -t <tag> -u <user> -p <pat> # build + push both
```

There is no lint tooling configured; `npm run build` (`tsc -b`) is the
client's type-check.

## Architecture

- **Source of truth for behavior is `specs/*.md` and `plans/monte-carlo-app.md`.**
  Its "Key decisions" section (business rules, tie-breaking, edge-case
  handling) is not re-derivable from code alone — read it before changing
  simulation or validation logic. Its file paths/route names (Flask
  templates, `/execute`, `routes.py`) are historical; the per-phase "Phase
  Summary" entries still explain *why* things ended up the way they did
  (e.g. the `method="min"` ranking correction).
  `plans/client-server-migration.md` explains the current two-tier design
  decisions. If you add a new phase of work to a plan, follow that plan's
  own "For Future Agents" instructions (checkboxes, phase status, Phase
  Summary on completion).
- **`src/server/`** — FastAPI app `app.main:app` (OpenAPI title "Planning
  Hub API"), all routes under `/api`
  (`app/api/routes.py`, Pydantic models in `app/schemas.py`):
  - `POST /api/validate` (multipart, same field names as the original
    form) → `{summary, params}`. It reads `await request.form()` manually
    rather than FastAPI `Form()`/`File()` params so missing/blank fields
    produce the app's own messages.
  - `POST /api/simulate` (JSON `{summary, params}` — the validate response
    can be posted verbatim) → `{target_type, target_value, rows,
    histogram}`.
  - `GET /api/health`.
  - **Every** 422 is `{errors: [str]}`, including FastAPI body-validation
    failures (converted by a handler in `main.py`).
  - Own `Dockerfile` (python:3.12-slim, non-root, uvicorn, port 8000).
    `pytest.ini` sets `pythonpath = .`; tests find the fixture via
    `Path(__file__).parents[3] / "notebook"` and aren't copied into the
    image.
- **Services** (`src/server/app/services/`, import each other relatively):
  - `validation.py` — `validate_parameters(form, file)`: pure
    parameter/form guardrails (file present, target type, positive numbers,
    simulation cap of 20000, valid date). Never touches file *content*.
  - `data_processing.py` — `parse_sprint_history` (reads the uploaded
    Excel, raises `DataValidationError` — never a raw pandas/openpyxl
    exception — for unreadable files or missing mandatory columns; the
    upload is first copied into an `io.BytesIO` by `_buffer_upload`
    because on Python < 3.11 Starlette's `SpooledTemporaryFile` lacks
    `seekable()`, which pandas/openpyxl need),
    `build_sprint_summary` (groups by Sprint, computes Items Resolved /
    Story Points / Recency Rank / In Sampling Pool), and the
    `summary_to_records` / `summary_from_records` pair that round-trips the
    summary DataFrame through the JSON API.
  - `simulation.py` — `run_simulation` (vectorized NumPy: `rng.choice` into
    a `(simulations, MAX_SPRINT_WINDOW)` matrix, `cumsum`, boolean-mask
    `argmax` for first-hit sprint), `compute_confidence_results`
    (nearest-rank/ceiling percentiles), `compute_completion_date`
    (`numpy.busday_offset`-based).
  - `forecast.py` — `run_forecast(summary, params)` (the single
    summary+params → results path; raises `SimulationError` for an empty
    sampling pool), `build_histogram` (`1..50` + `>50` buckets),
    `CONFIDENCE_LABELS`.
- **`src/client/`** — Vite + React 18 + TypeScript + Tailwind 3 SPA,
  react-router: `/` hub home (`HubHomePage`), `/monte-carlo` (Data
  Input), `/monte-carlo/confirm`, `/monte-carlo/results`, `/release-plan`
  (`ReleasePlanHomePage`), `/release-plan/board` (`ReleasePlanBoardPage`);
  unknown paths → `/`. Confirm/Results redirect to `/monte-carlo` when the
  store has no data; the board redirects to `/release-plan` when there is
  no plan.
  - Dashboard shell: `components/Layout.tsx` (header with CM logo + hub
    name, left `Sidebar`, main area; sets `document.title`).
    `components/Sidebar.tsx` renders one group per `TOOL_GROUPS` entry
    (label centered between two lines) of `NavLink`s, active on any route
    below the tool's path. `components/MonteCarloLayout.tsx` wraps `Layout` for
    the three Monte Carlo pages with one header row (step `Breadcrumb`
    centered, "How to Use" button opening `HelpModal` on the right; no
    tool heading — the sidebar shows where you are) and titles
    like "Planning Hub – Monte Carlo – Data Input". Help lives only
    there, not in the global header.
  - `lib/tools.ts` is the tool registry (`HubTool`, `HubToolGroup`,
    `TOOL_GROUPS` = "Estimations" (`ESTIMATION_TOOLS`: Monte Carlo) then
    "Planning" (`PLANNING_TOOLS`: Release Plan), `HUB_NAME`) feeding both
    the sidebar groups and the home page sections; adding a tool = one
    entry in a group's list + its routes in `App.tsx`. Icons are inline
    SVG components in `components/icons/` (e.g. `DiceIcon`), no icon
    library.
  - `api.ts` / `types.ts` mirror the server schemas; a 422 becomes a
    thrown `ApiError` carrying `errors`.
  - `store.tsx` holds the validate response and the execution result in
    memory only — a reload sends you back to `/monte-carlo`.
  - `lib/runSimulation.ts` is the one simulate → execution helper used by
    both the skip-validation branch of `InputPage` and `ConfirmPage`, so
    their behavior is identical by construction — don't duplicate it.
  - API failures are shown as toasts (`components/Toast.tsx`:
    `ToastProvider` in `main.tsx` and the test `renderAt` helper
    (`test/render.tsx`, which also stubs `/`, the `/monte-carlo/*` and the
    `/release-plan/*` routes),
    `useToast().showError`, `errorMessages(exc)`); the page stays where it
    is, so `store.tsx`'s `Execution` only represents success. `api.ts`
    pulls the server's own message out of `{errors}`, FastAPI `{detail}`,
    `{message}` or a short plain-text body, else a generic HTTP message.
  - The client owns presentation: confidence colors (`lib/confidence.ts`,
    mirroring the `--cm-*` CSS vars in `index.css`), calendar month grids
    (`lib/calendar.ts`, integer UTC day arithmetic — no timezone shifts),
    the Plotly histogram (`components/HistogramChart.tsx`, lazy-loaded
    `plotly.js-basic-dist-min`, x axis forced to `category` so `>50` is its
    own bar; mocked in tests).
  - **Release Plan** (client-only, no API calls). The behavioral source
    of truth is the *Template reference* in `plans/release-plan-board.md`
    (the template HTML/JSON under `specs/templates/` are not committed —
    never import or read them; tests use the synthetic builders in
    `test/releasePlanFixtures.ts` and `test/renderBoard.tsx`).
    - `lib/releasePlan/` is pure logic: `types`, `constants`, `validate`
      (`parsePlanFile`/`normalizePlan`, throws `PlanValidationError`),
      `selectors`, `layout` (`computeLayout`, shared with the future PNG
      export), `reducer` (`createPlanReducer(makeId)`/`planReducer`, every
      plan mutation; confirmations and toasts stay in the UI), `sanitize`
      (`safeHtml` whitelist for ADO descriptions), `storage`
      (`PlanStorage`, `localPlanStorage`), `modeSwitch`, `zoom`.
    - `releasePlanStore.tsx`: `ReleasePlanProvider` is mounted in
      **`App.tsx`** around the routes (not in `main.tsx`); it hydrates from
      localStorage key `cmEstimationsHub.releasePlan.v1` and autosaves after
      every change (`storage={null}` = in-memory). `useReleasePlan()` gives
      `plan`, `dispatch`, `replacePlan`, `restoredFromStorage`,
      `consumeRestoredNotice()`. `renderAt` takes `initialPlan` /
      `planStorage`. UI-only state (view, zoom, open item, gap menu, table
      filters) stays in the components.
    - Dialogs: `components/useDialog.ts` (dialog stack so Esc closes only
      the topmost dialog, focus trap, focus restore, callbacks via refs)
      backs `ConfirmDialog` (controlled props, portal to `body`),
      `ImportJsonModal` and `WorkItemModal`. No `window.confirm/alert/
      prompt`; info messages use `useToast().showInfo`.
    - `components/releasePlan/` holds the board components;
      `releasePlan.css` is plain CSS (absolute geometry, dark palette) with
      **every selector scoped under `.rp`** (the board page's root class),
      imported by `ReleasePlanBoardPage`. Chrome outside the board uses
      Tailwind.
  - `InputPage` builds `FormData` exactly as a native form submit would
    (blank fields included, `skip_validation=on` only when checked, empty
    `File` when none chosen) so server messages match.
  - `Dockerfile`: `node:22-alpine` build → `nginxinc/nginx-unprivileged`
    on **port 8080** (non-root, for OpenShift). `nginx.conf.template` is
    rendered by the image entrypoint with `API_UPSTREAM` (default
    `http://server:8000`) and proxies `/api/` there (20m uploads, 600s
    timeout) with an SPA `try_files` fallback.
- **Root `docker-compose.yml`**: `server` (healthcheck) + `client`
  (`8080:8080`, waits for server healthy).
- **Deployment**: `deploy/build-docker-image.sh` (run from the repo root)
  builds `estimationshub/estimationshub-{client,server}` (same tag, contexts
  `src/client` / `src/server`, always both) and pushes to
  `dev.criticalmanufacturing.io`. `.github/workflows/deploy.yml` (manual
  dispatch) computes the tag with GitVersion, runs server pytest + client
  Vitest/build, then the script, then pushes a git tag. Helm chart
  `helm/chart` (OpenShift): client + server Deployments/Services (Services
  expose port 80 → 8080 / 8000), ingress routes `/api` → server and `/` →
  client; `values.yaml` has one shared `tag`.
- **Gotchas**: `package-lock.json` was generated with npm 11 because npm 10
  crashes resolving vitest 4's peer deps from scratch (`npm ci` with npm
  10 is fine; use `npx npm@11 install` when adding deps). The root
  `.gitignore` ignores `lib/`; `src/client/.gitignore` re-includes
  `src/lib/`.
- **Statelessness**: there is no server-side session. The SPA keeps the
  sprint summary + params from `/api/validate` in memory and posts them
  back to `/api/simulate`; every request is self-contained.
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
    `51`, returned with `exceeds_window: true` and no completion date, and
    rendered as `>50 sprints`. The histogram has a dedicated `">50"` bucket
    rather than relying on Plotly's automatic numeric binning.
  - Percentiles use nearest-rank (ceiling): for confidence `c` and `N`
    simulations, `rank = ceil(c/100 * N)`, 1-indexed into the sorted
    ascending distribution.
  - Business days only (Mon–Fri, no holiday calendar) via
    `numpy.busday_offset` / `numpy.is_busday`.
  - `notebook/Sprint_History.xlsx` is the canonical regression fixture: with
    `Exclude Latest Sprints from Sampling = 1`, there are 24 sprints total,
    Sprint 24 excluded, 23 remain in the sampling pool. Used throughout
    `src/server/tests/` (including `test_end_to_end.py`, which also asserts
    `/api/simulate` stays under 2s at 1000 simulations and 5s at 5000).
- **`notebook/sprints.ipynb`** is the original exploratory analysis the
  simulation/summary logic was ported from — treat it as a reference
  implementation when in doubt about grouping/ranking behavior.
