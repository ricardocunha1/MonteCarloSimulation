# CM Estimations Hub — dashboard refactor

Rename every "Monte Carlo Simulator" reference to **"CM Estimations Hub"** and visually refactor the SPA (`src/client`) into a dashboard-style app that can host several estimation sub-applications. Monte Carlo is the first sub-app. The API's behavior does not change.

## Decisions (confirmed with the user)
- **Name**: "CM Estimations Hub" (plural, confirmed by the user) is used everywhere: header, `index.html` `<title>`, page titles, FastAPI title, README, Helm chart description.
- **Routes** move under `/monte-carlo`: `/` = hub home page (list of sub-apps), `/monte-carlo` = Data Input, `/monte-carlo/confirm`, `/monte-carlo/results`. Unknown paths → `/`. When data is missing, Confirm and Results redirect to `/monte-carlo`.
- **Left sidebar**: a group labeled "Estimations", with the word centered between two horizontal lines that fill the panel width. Inside it, a "Monte Carlo" nav item with a dice/casino inline SVG icon (no new dependency). The item is active on any `/monte-carlo/*` route.
- **Home page**: a card list driven by a small tool registry (`src/client/src/lib/tools.ts`). For now it has one Monte Carlo card with a very short description, its goal, and a link to `/monte-carlo`.
- **"How to Use" (Help) button** moves out of the global header into the Monte Carlo main view. A Monte Carlo view header holds the heading, the Help button (opens the existing `HelpModal`) and the existing `Breadcrumb`.
- Text that describes the *method* ("Monte Carlo simulation") in `HelpModal`/`InfoIcon` stays as it is.

## API contract
No change: `POST /api/validate`, `POST /api/simulate`, `GET /api/health`, and every 422 is `{errors: [str]}`. The only server change is the FastAPI OpenAPI title, which becomes "CM Estimations Hub API".

## Baseline (recorded 2026-10-20)
- **Client**: build OK, 35/35 Vitest tests pass.
- **Server**: 5 tests fail in this environment (Python 3.10):
  - 4 fail with `'SpooledTemporaryFile' object has no attribute 'seekable'` when pandas reads the uploaded Excel: `test_end_to_end::test_readme_acceptance_scenario_end_to_end`, `test_validate_route::test_blank_team_capacity_factor_does_not_error`, `::test_valid_params_return_fixture_summary_and_params`, `::test_skip_validation_is_echoed_in_params`.
  - 1 has a stale assertion: `test_error_handling::test_unhandled_exception_returns_generic_500` expects "Please try again later.", but `main.py` now says "Please review your input historical data."
  - These are assigned to backend-developer in Phase 1. The suite must end fully green.

## For Future Agents
As work proceeds: mark checkboxes `- [x]` as items are completed. When a phase is done, set its status to `Complete` and write its **Phase Summary** (what was done, key decisions, anything needed to continue with zero context). Run the phase's **Verification Plan** and record the result before moving on. The workflow is Develop → QA (at most 3 Develop↔QA cycles) → Documentation. When all phases are done, fill in **Final Recap**.

## Phase 1: Development
Status: Complete   <!-- Not started | In progress | Complete -->

Backend (backend-developer, `src/server`):
- [x] Rename the FastAPI title to "CM Estimations Hub API", with a unit test.
- [x] Fix the `seekable` baseline failures: read the upload into an in-memory buffer so parsing works on Python < 3.11.
- [x] Align the stale `test_unhandled_exception_returns_generic_500` with the current intended message.

Frontend (frontend-developer, `src/client`):
- [x] `App.tsx` routes: `/` hub home, `/monte-carlo`, `/monte-carlo/confirm`, `/monte-carlo/results`, unknown → `/`.
- [x] Rework `Layout` into a dashboard shell: header (logo + "CM Estimations Hub"), Sidebar, main area.
- [x] New `components/Sidebar.tsx` ("Estimations" group divider, "Monte Carlo" item with an inline dice SVG, active on `/monte-carlo/*`).
- [x] New `pages/HubHomePage.tsx` and the `lib/tools.ts` registry.
- [x] Monte Carlo view header (heading + Help button opening `HelpModal` + `Breadcrumb`), used by the 3 Monte Carlo pages. Remove Help from the global header.
- [x] Update `navigate` targets and missing-data redirects to `/monte-carlo/...`.
- [x] `index.html` title; page titles like "CM Estimations Hub – Monte Carlo – Data Input".
- [x] Update the `test/render.tsx` stubs and existing tests for the new routes.
- [x] New unit tests for Sidebar, HubHomePage, and Layout/Help.

### Verification Plan
- `python3 -m pytest src/server -q` → all pass (baseline failures fixed).
- `python3 -m compileall -q src/server/app` → no errors.
- `cd src/client && npm run build` → `tsc -b` clean, build OK.
- `cd src/client && npm test -- --run` → all pass.
- `git diff --stat` per area: backend changes only under `src/server`, frontend only under `src/client`.

### Phase Summary
Done (backend-developer + frontend-developer):
- **Server**: `app/main.py` FastAPI title → "CM Estimations Hub API" (unit test in `tests/test_error_handling.py`). `app/services/data_processing.py` gained `_buffer_upload`, which copies the upload into an `io.BytesIO` before `pd.read_excel` — this fixes the 4 `seekable` failures on Python < 3.11 (Starlette's `SpooledTemporaryFile` lacks `seekable()`); inputs without `read()` (e.g. a path) pass through unchanged. New tests in `tests/test_data_processing.py`: upload without `seekable`, re-read from the start of the stream, unreadable bytes → `DataValidationError`. The stale `test_unhandled_exception_returns_generic_500` now asserts the current "Please review your input historical data." message. Server suite: 35 passed, 0 failed.
- **Client**: routes `/` (`HubHomePage`), `/monte-carlo`, `/monte-carlo/confirm`, `/monte-carlo/results`, `*` → `/`; Confirm/Results redirect to `/monte-carlo` without data. `Layout` is now the dashboard shell (header logo + `HUB_NAME`, `Sidebar`, main; sets `document.title`). New `Sidebar` ("Estimations" divider group, `NavLink` per tool, active on `/monte-carlo/*`), `components/icons/DiceIcon.tsx` (inline SVG), `lib/tools.ts` registry (`HubTool`, `ESTIMATION_TOOLS`, `HUB_NAME`) feeding both the sidebar and the home cards, and `MonteCarloLayout` (Monte Carlo heading + "How to Use" Help button + `Breadcrumb`, titles "CM Estimations Hub – Monte Carlo – <step>"); Help was removed from the global header. `index.html` title updated. `test/render.tsx` stubs and existing page tests moved to the new routes; new unit tests for Sidebar, HubHomePage, MonteCarloLayout. Client suite: 35 → 51 tests, build clean.
- Key decision: adding a tool = one `ESTIMATION_TOOLS` entry + its routes in `App.tsx`.


## Phase 2: QA
Status: Complete

- [x] (qa-engineer) Review against the specs (dark theme, CM logo in the header, CM palette) and best practices; send findings back to Phase 1 if needed (at most 3 Develop↔QA cycles).
- [x] Add client integration tests of full `App` routing with a mocked API: `/` → sidebar → `/monte-carlo` → confirm → results; Help opened from the Monte Carlo view.

### Verification Plan
- The four Phase 1 commands are all green, including the new integration tests.

### Phase Summary
Result: **PASS**, no Blocker/Major findings, within the first Develop↔QA cycle.
- Added `src/server/tests/test_hub_integration.py` (+7 server integration tests: OpenAPI title, unchanged API paths, fixture validate → simulate round trip, non-Excel / empty uploads → 422 `{errors}`, uploads above Starlette's 1 MB spool threshold (rolled to disk) parse correctly, and a corrupt one is a 422). Server: 42 passed.
- Added `src/client/src/App.test.tsx` and `src/client/src/App.integration.test.tsx` (+10 client tests: `App` routing/redirects, and full-flow integration with a mocked API — home → sidebar → input → confirm → results, skip-validation, validate/simulate failures as toasts, Help from every Monte Carlo step, back home via the logo and unknown paths). Client: 61 passed, build clean.
- Docker full-stack smoke (`docker compose up --build`, via `172.17.0.1:8080`) OK.
- Minor findings (not fixed in code): README/Helm chart/specs titles still said "Monte Carlo Simulator" (handled in Phase 3); `_buffer_upload` has no type hints; `Layout` remounts per page (could be lifted into a route layout); the HubHomePage card `aria-label="Open <name>"` hides the card description from screen readers; `HelpModal` has no focus trap (pre-existing).


## Phase 3: Documentation
Status: Complete

- [x] (documentation-writer) README title/intro → "CM Estimations Hub", plus the new routes and layout.
- [x] `helm/chart/Chart.yaml` description.
- [x] `CLAUDE.md` client routes/layout description.
- [x] TSDoc/docstrings on new code (Sidebar, HubHomePage, `lib/tools.ts`, the Monte Carlo view header, the server title change if relevant).
- [x] Mark this plan's checkboxes, statuses and Phase Summaries; fill in Final Recap.

### Verification Plan
- `git diff --stat` → docs, docstrings and comments only.
- The four Phase 1 commands are still green.

### Phase Summary
Done (documentation-writer), docs/docstrings/comments only:
- `README.md`: title/intro → "CM Estimations Hub" (hub of estimation tools, Monte Carlo first); new "Navigation" section (header, sidebar "Estimations" group, home page cards, `/monte-carlo/*` routes, Help in the Monte Carlo view, reload → `/monte-carlo`); "How it works" → "How the Monte Carlo tool works"; client architecture bullet mentions the `lib/tools.ts` registry.
- `helm/chart/Chart.yaml`: `description` mentions the CM Estimations Hub (name/version unchanged).
- `CLAUDE.md`: "What this is" (hub + Monte Carlo tool, link to this plan), server API title, `_buffer_upload`/BytesIO note in `data_processing.py`, client routes, dashboard shell (`Layout`, `Sidebar`, `MonteCarloLayout`, Help location), `lib/tools.ts` registry, `components/icons/`, `renderAt` route stubs, reload → `/monte-carlo`.
- `specs/*.md`: headings renamed to "CM Estimations Hub — Monte Carlo …"; `specs/montecarlosimulation.md` has a note that the specs describe the Monte Carlo sub-application. No business rules changed.
- TSDoc added to `HubTool` fields and `HUB_NAME` (`lib/tools.ts`), `MonteCarloLayout`'s `currentStep`, and `App`. `_buffer_upload`, `Layout`, `Sidebar`, `HubHomePage`, `DiceIcon` already had docstrings/TSDoc.
- Verification: `python3 -m pytest src/server -q` 42 passed; `python3 -m compileall -q src/server/app` clean; `npm run build` clean; `npm test -- --run` 61 passed.


## Verification (end to end)
- `python3 -m pytest src/server -q`, `python3 -m compileall -q src/server/app`, `cd src/client && npm run build`, `cd src/client && npm test -- --run` → all green.
- Optional manual check: `docker compose up --build`, then open `172.17.0.1:8080` (docker-outside-of-docker). Hub home → sidebar "Monte Carlo" → full 3-step flow → Help from the Monte Carlo view.

## Final Recap
All three phases are complete (Develop → QA in one cycle → Documentation).
- The SPA is now the **CM Estimations Hub** dashboard: header + sidebar ("Estimations" → "Monte Carlo" with a dice icon) + main area; `/` lists tools from `lib/tools.ts`; the Monte Carlo 3-step flow lives under `/monte-carlo`, `/monte-carlo/confirm`, `/monte-carlo/results` with its own Help button. Unknown paths → `/`; missing data → `/monte-carlo`.
- API contract unchanged; only the FastAPI title changed ("CM Estimations Hub API"). Upload parsing now buffers into `io.BytesIO`, so the server suite is green on Python 3.10 as well as 3.12.
- Final counts: server 42 passed (baseline had 5 failures), client 61 passed (baseline 35), `tsc -b` build clean.
- Open follow-ups (minor, from QA): type hints on `_buffer_upload`; lift `Layout` into a shared route layout to avoid remounting the shell per page; expose the HubHomePage card description to screen readers (e.g. `aria-describedby` instead of an overriding `aria-label`); focus trap in `HelpModal`. The Helm chart `name` and image names (`monte-carlo-sim`, `montecarlosim-*`) were intentionally left unchanged.
