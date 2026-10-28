# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

**Planning Hub** is a dashboard web app that hosts estimation and planning
tools for Critical Manufacturing (CM) projects. It has a FastAPI server
(`src/server`) and a React SPA (`src/client`), shipped as two Docker images
and deployed to OpenShift with a Helm chart. User-facing documentation is in
`README.md`.

## What this is

The hub groups its tools by category (sidebar + home page cards, registered
in `src/client/src/lib/tools.ts`):

- **Estimations → Monte Carlo** (`/monte-carlo`). Forecasts how many
  sprints a team needs to reach a target (Items Resolved or Story Points) by
  running thousands of simulations sampled from historical sprint
  throughput. It reports P50/P70/P85/P95 confidence levels with completion
  dates (business days) and a histogram. Flow: choose a data source (Excel
  upload or Azure DevOps) → Data Input → Data Validation (optional) →
  Results. The statistics run on the server.
- **Planning → Release Plan** (`/release-plan`). An interactive board for
  planning which Epics/Features land in which milestone or sprint
  (drag-and-drop, table view, pivoted view). Boards are created from a JSON
  file or from Azure DevOps, can be synced from Azure DevOps, saved/loaded
  as JSON and exported to PNG. The board logic is client-only and
  autosaves to localStorage; the server is only used as the Azure DevOps
  proxy.

## Architecture

```text
 Browser
    │  http(s)
    ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ client  (nginx, port 8080)   │ /api/* │ server  (uvicorn, port 8000) │
│ React SPA static files       ├───────►│ FastAPI "Planning Hub API"   │
│ SPA fallback (try_files)     │        │ stateless, no database       │
└──────────────────────────────┘        └──────────────┬───────────────┘
                                                       │ REST (PAT from the request,
                                                       ▼ never stored; host allowlist)
                                                 Azure DevOps
```

- The **client** serves the SPA and proxies `/api/` to the server
  (`API_UPSTREAM`, default `http://server:8000`).
- The **server** is stateless: the SPA keeps all state (validated sprint
  summary, simulation results, Release Plan board) and sends what each
  request needs. Every 422 response is `{errors: [str]}`.
- **Azure DevOps** is reached only through the server
  (`/api/ado/*`). The Personal Access Token travels with each request and
  is never persisted; `ADO_ALLOWED_HOSTS` limits which hosts may be called.
- A diagram is also available in `docs/architecture.png`.

### Production workload (Helm)

`helm/chart` deploys to OpenShift (namespace `cm-planning-hub`):

- `cm-planning-hub-client-deployment` / `-service` and
  `cm-planning-hub-server-deployment` / `-service` (Services expose port 80
  → 8080 / 8000).
- `cm-planning-hub-ingress` routes `/api` → server and `/` → client at
  `public_http_address`.
- `values.yaml`: registry `dev.criticalmanufacturing.io`, image names, one
  shared `tag` for both images, `adoAllowedHosts` (passed to the server as
  `ADO_ALLOWED_HOSTS`).

Both images run as non-root (OpenShift). Releases are built by the manual
**Deploy** GitHub workflow (`.github/workflows/deploy.yml`): GitVersion tag →
server and client tests + build → `deploy/build-docker-image.sh` (build and
push both images) → git tag.

### `specs/` and `plans/`

- **`specs/`** — the functional specification: *what* each tool must do. 
  This is the source of truth for behavior; read the relevant spec before changing a feature.
  `specs/templates/` is not committed — never import or read it.
- **`plans/`** — implementation plans, one per piece of work, with phases,
  checkboxes and *Phase Summaries*. They record *how* and *why* things were
  built (decisions agreed with the user, API contracts, edge cases) that
  cannot be re-derived from the code. Key ones:
  - `monte-carlo-app.md` — "Key decisions": simulation/validation business
    rules (ranking, percentiles, the `>50` sprints sentinel, business days).
  - `release-plan-board.md`, `release-plan-import-export.md`, `release-plan-ado.md` — Release Plan features reference.

  When working on a plan, follow its "For Future Agents" section (tick
  checkboxes, update phase status, write the Phase Summary). New multi-step
  work gets a new plan (see the `real-work` skill).

### Server — `src/server`

Python 3.12, FastAPI, pandas/NumPy, httpx.

| Path | Purpose |
| --- | --- |
| `app/main.py` | App factory: mounts routers under `/api` and `/api/ado`, converts validation errors to `{errors}`. |
| `app/config.py` | Settings from the environment (`ADO_ALLOWED_HOSTS`, `ADO_TIMEOUT_SECONDS`). |
| `app/schemas.py` | Pydantic request/response models — the API contract. |
| `app/api/routes.py` | Monte Carlo: `GET /health`, `POST /validate`, `POST /simulate`. |
| `app/api/ado_routes.py` | Azure DevOps proxy: `POST /ado/connect`, `/ado/backlog`, `/ado/sprint-history`. |
| `app/services/` | All business logic (routes stay thin): `validation` (form guardrails), `data_processing` (Excel parsing, sprint summary), `simulation` + `forecast` (vectorized NumPy Monte Carlo, percentiles, dates, histogram), `ado_*` (ADO client, URL rules, backlog and sprint-history reads). |
| `tests/` | pytest suite (unit, route, end-to-end incl. performance limits). |

### Client — `src/client`

Vite + React 18 + TypeScript + Tailwind 3, react-router, Vitest. Code is
organized **per tool** (`monteCarlo/`, `releasePlan/`, shared `ado/`), with
shared hub pieces at the top level.

| Path | Purpose |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | Entry point and routes. |
| `src/pages/` | One component per route (`monteCarlo/` subfolder for its wizard). |
| `src/components/` | Shared hub UI (layout, sidebar, toasts, dialogs, icons) plus per-tool folders `monteCarlo/`, `releasePlan/`, `ado/`. |
| `src/lib/` | Non-UI logic. `tools.ts` = tool registry (add a tool here + routes in `App.tsx`). Per tool: `types.ts` + `api.ts` mirror the server schemas; `releasePlan/` holds the pure board logic (validation, reducer, layout, storage, export). |
| `src/monteCarloStore.tsx`, `src/releasePlanStore.tsx` | Per-tool state (React context). Monte Carlo is in memory only; Release Plan autosaves to localStorage. |
| `src/test/` | Test helpers and fixtures (`render.tsx` → `renderAt`, DnD/canvas mocks). |
| `Dockerfile`, `nginx.conf.template` | Build → nginx-unprivileged image, `/api` proxy. |

## Development workflow and subagents

`.claude/agents/` defines three subagents. The **main session coordinates
them directly** (no orchestrator agent needed). For any feature or fix:

1. **Plan** — read the request, the relevant `specs/` and `plans/`. Split
   the work into a backend task and a frontend task. If the change crosses
   the API, write the API contract once (route, request/response, 422
   cases) and give the same contract to both developers. Record a baseline
   (`git status --short`, current test results).
2. **Develop** — launch in parallel:
   - `backend-developer` — `src/server` only; Python best practices; adds
     **unit tests** only.
   - `frontend-developer` — `src/client` only; strict TypeScript/React;
     adds **unit tests** only.

   Skip an agent only if its side clearly needs no change. Then re-run the
   verification commands yourself; don't advance on red builds/tests.
3. **QA** — launch `qa-engineer` with the goal, contract and changed files
   (`git diff --stat`). It reviews against specs and best practices, adds
   **integration / end-to-end tests**, never changes production code, and
   reports Blocker / Major / Minor findings.
4. **Fix loop** — send Blocker/Major findings back to the responsible
   developer, re-verify, re-run QA. At most 3 Develop ↔ QA cycles, then
   report to the user.
5. **Wrap up** — update the plan (checkboxes, Phase Summary). Summarize changes and tests; don't commit
   unless asked.

Verification commands (all must pass):

```bash
python3 -m compileall -q src/server/app
python3 -m pytest src/server -q
cd src/client && npm run build && npm test -- --run
```

## Commands

```bash
# Full stack (http://localhost:8080; from inside the devcontainer use http://172.17.0.1:8080)
docker compose up --build
docker compose -f docker-compose.yml -f docker-compose.debug.yml up --build   # server under debugpy (5678)

# Server
cd src/server && uvicorn app.main:app --reload --port 8000
cd src/server && pytest                                   # all tests
cd src/server && pytest tests/test_simulation.py          # one file
cd src/server && pytest tests/test_validate_route.py::<name>   # one test

# Client
cd src/client && npm ci && npm run dev    # http://localhost:5173, proxies /api -> :8000
cd src/client && npm test -- --run        # Vitest
cd src/client && npm run build            # tsc -b type-check + production build

# Docker images (normally done by the "Deploy" GitHub workflow; run from repo root)
./deploy/build-docker-image.sh -t <tag> --no-push            # build both images
./deploy/build-docker-image.sh -t <tag> -u <user> -p <pat>   # build + push both
```

Environment notes:

- The devcontainer provides Python 3.12 (`.venv`) and Node 22. If `node` is
  missing: `export PATH=~/.local/node/bin:$PATH`.
- Docker is docker-outside-of-docker: published ports are reachable at
  `172.17.0.1:<port>`, not `localhost`. If attached `docker run` drops
  stdout, use `docker run -d --name x ...; docker wait x; docker logs x`.
- `helm`, `actionlint`, `shellcheck` aren't installed; run them via the
  `alpine/helm`, `rhysd/actionlint`, `koalaman/shellcheck` images.
- No linter is configured; `npm run build` is the client type-check.
- Add npm dependencies with `npx npm@11 install` (npm 10 can't resolve
  vitest 4's peer deps from scratch; `npm ci` with npm 10 is fine).
- The root `.gitignore` ignores `lib/`; `src/client/.gitignore` re-includes
  `src/lib/`.
