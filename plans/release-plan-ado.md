# Release Plan — Azure DevOps: board creation (spec phase 4) and sync (spec phase 5)

Implement `specs/release_plan.md` "Implementation Phases" **4** (create a
board by connecting to Azure DevOps: source, project URL, PAT, then an Area
or Iteration path) and **5** (synchronize an open board from Azure DevOps:
add new items, update changed ones, optionally remove vanished ones). This
plan adds a **server** part (`/api/ado/*`, an ADO proxy) to a tool that was
client-only until now. It continues `plans/release-plan-board.md` (spec
phases 0–2) and `plans/release-plan-import-export.md` (spec phase 3). Neither
of those files is edited by this work. Their *Template reference* still
governs every board behavior not restated here.

## Decisions (confirmed with the user, 2026-10-23)
- **ADO calls go through the server.** New FastAPI routes under `/api/ado/*`
  call Azure DevOps with `httpx` (already in `requirements.txt`; no new
  dependency). Browsers can't call on-prem TFS / dev.azure.com directly with
  a PAT (CORS).
- **The PAT is stateless and never persisted.** The client sends it in the
  JSON **body** of each `/api/ado/*` POST (never in a URL or query string).
  The server uses it for that request only. It never logs, stores or echoes
  it. The client keeps it **in memory only** (component state of the
  modal), so a reload forgets it, and Sync asks for it again.
- **Host allowlist (SSRF guard).** The server only calls hosts that match
  `ADO_ALLOWED_HOSTS` (an env var and a Helm value; comma-separated, where a
  leading `*.` matches any subdomain). Default:
  `dev.azure.com,*.visualstudio.com,tfs-projects.cmf.criticalmanufacturing.com`.
  Any other host gets a 422 before any network call. HTTPS only.
- **TLS**: the on-prem TFS uses a public CA. Use the default trust store, with
  no CA-bundle option.
- **ADO REST `api-version=7.0`** for every call (Azure DevOps Server 2022+ and
  cloud).
- **Work item types**: **Epics and Features only**. This is the existing
  Feature board and the `release-planner-features` schema. User Stories are
  never fetched.
- **Size field**: fixed `Custom.EstimatedSize`. If the project's process
  doesn't define it, every size is `""` (shown as "?"), and the fetch does
  **not** fail.
- **Source + URL** (spec): the modal asks for the source, **On-Prem** or
  **Collaboration Hub**. The URL **shape is validated for the selected
  source** (inline error, no network call). The client and the server apply
  the same rules:
  - Collaboration Hub: `https://dev.azure.com/<org>/<project>` or
    `https://<org>.visualstudio.com/<project>`.
  - On-Prem: `https://<allowed host>/<collection>/<project>` (e.g.
    `https://tfs-projects.cmf.criticalmanufacturing.com/ImplementationProjects/<PROJECT>`).
  - A trailing `/`, a trailing `/_apis…`, `/_backlogs…`, `/_workitems…`,
    `/_boards…` or any other `/_…` segment, a query string and a fragment are
    tolerated and stripped. Percent-encoded project names (spaces) are
    decoded for display and re-encoded for calls.
- **Connect → pick a path.** After the URL + PAT are validated ("Connect"),
  the server returns the project's **Area** and **Iteration** classification
  trees. The user picks exactly one node from a **searchable tree** (an
  "Area path" / "Iteration path" toggle; exactly one of the two). The project
  root node is selectable.
- **Scope query includes children** (WIQL `UNDER`), and items in the
  `Removed` state are excluded.
- **Features without a parent Epic** (no parent, or a parent that is not an
  Epic) are **not dropped**. They are collected under a synthetic Epic
  "Features without an Epic" (see *Implementation choices* for its id),
  created only when such Features exist.
- **Initial board** = the template default (`fromMcp`): Releases mode, one
  `MVP` milestone (`MS_COLORS[0]`, no date) holding every Feature, no flags,
  name `"<project> – Feature Release Plan"`.
- **Remember the connection (not the PAT).** After a successful Connect, the
  modal saves `{source, projectUrl}` under the localStorage key
  `cmPlanningHub.releasePlan.adoConnection.v1` (try/catch-wrapped, like
  `storage.ts`) and pre-fills the next time.
- **Replacing a board** uses the existing shared `ReplaceBoardDialog`
  (unchanged text), exactly like the JSON import, then the toast
  "Plan loaded: <name>" and navigation to `/release-plan/board`.
- **Sync (spec phase 5) is ADO → board only.** Nothing is ever written to
  Azure DevOps. A toolbar button **"Sync from ADO"** reopens the connection
  form. It is pre-filled from `plan.source` when the plan holds connection
  info (written by this plan's Phase 3); otherwise (old/template plans) the
  user enters it. The PAT is always entered. The path picker pre-selects the
  plan's scope when present.
- **Sync matches items by work item id** and computes a diff:
  - **New** Epics are appended at the right. **New** Features go to
    **Unplanned** (`milestoneId: null`), appended at the end of their Epic's
    columns. Existing planning (milestones, flags, order, mode, name) is
    untouched.
  - **Updated** items: Epic `title`/`state`/`description`. Feature
    `title`/`state`/`description`/`size`/`iterationPath`, and its **parent
    Epic** (a Feature whose parent changed moves to the end of the new
    Epic's columns and **keeps its `milestoneId`**).
  - **Gone** items (on the board but not in the fetched scope): listed in the
    preview. They are removed **only if** the user ticks "Remove items no
    longer in scope" (unticked by default).
  - `iterations` are replaced by the fetched list, and `source` is updated
    (connection info, `scope`, `fetchedAt`).
- **The sync preview is required.** A dialog shows the counts and lists of
  new / updated / gone items, plus the "Remove…" checkbox. **Apply** is a single
  reducer action (one autosave), and **Cancel** changes nothing. When there
  are no differences, the dialog says so ("The board is up to date with
  Azure DevOps.") and Apply only refreshes `iterations`/`source`.
- **Tests**: every automated test mocks Azure DevOps (`httpx.MockTransport`
  on the server, a mocked `fetch` on the client). An **opt-in live smoke
  test** (`@pytest.mark.ado_live`) runs only when `ADO_TEST_URL`,
  `ADO_TEST_PAT` and `ADO_TEST_AREA` are set, and is skipped otherwise.
- **Workflow**: every phase runs the orchestrator's Develop
  (`backend-developer` and/or `frontend-developer`) → QA (`qa-engineer`, at
  most 3 Develop↔QA cycles), driven by `claude --agent orchestrator`. The
  docs items of a phase (CLAUDE.md / README) are done by the main session
  after QA passes (the orchestrator and its agents don't edit docs).

### Implementation choices (derived, not asked; change them here if needed)
- **The server returns flat, normalized work items. The client builds the
  plan.** All planning logic (grouping, the synthetic Epic, `planFromBacklog`,
  the sync diff) is pure TypeScript in `lib/releasePlan/`, next to
  `normalizePlan`, and is unit-tested there. The server only fetches and
  normalizes.
- **Order**: WIQL `ORDER BY [System.Id]`, and the server returns items in
  ascending id order. Epics (left → right) and each Epic's Features follow
  that order. This is deterministic. ADO backlog rank (`StackRank` /
  `BacklogPriority`) is process-dependent and not used.
- **Synthetic Epic**: `id: "no-epic"` (a string, so it can't collide with a
  numeric ADO id), `title: "Features without an Epic"`, `state: ""`,
  `description: ""`, always placed **last** (rightmost) when created.
  Sync never reports it as new/updated/gone. It is created when orphan
  Features appear and removed when it becomes empty. `WorkItemModal` shows
  it like any Epic (its description shows the existing "No description in
  Azure DevOps." text).
- **`PlanSource` gains optional connection fields**: `kind: "onprem" |
  "cloud"`, `projectUrl` (the canonical URL returned by Connect),
  `scopeType: "area" | "iteration"`, `scopePath` (the normalized path).
  `system` = `"Azure DevOps"`, `project` = the canonical project name,
  `scope` = `"Area Path: <path>"` / `"Iteration Path: <path>"` (the
  template's display text), `fetchedAt` = the server's UTC ISO time.
  `normalizePlan` keeps these fields when valid (strings, and `kind` /
  `scopeType` in their enums) and drops them otherwise. Save Plan JSON
  carries them (never the PAT). Old files without them still load.
- **Path format**: classification node paths (`\Proj\Area\Team A`,
  `\Proj\Iteration\Phase 1\Sprint 01`) are normalized to the
  `System.AreaPath` / `System.IterationPath` format by removing the leading
  `\` and the second segment (`Area` / `Iteration`): `Proj\Team A`,
  `Proj\Phase 1\Sprint 01`. Root nodes become `Proj`. Iteration
  `finishDate` → `YYYY-MM-DD` (first 10 chars) or `""`.
- **Iterations sent with the backlog** = every node of the Iteration tree
  (flattened, root excluded) as `{path, finishDate}`. This is the existing
  `Iteration` type, used by the Sprints mode switch.
- **Server modules**: `app/config.py` (`Settings` read from env once:
  `ADO_ALLOWED_HOSTS`, `ADO_TIMEOUT_SECONDS` default 30), `app/services/ado_url.py`
  (`parse_project_url(source, url, allowed_hosts) → AdoProject` or raises
  `AdoUrlError`), `app/services/ado_client.py` (`AdoClient`: async httpx
  wrapper, Basic auth `base64(":" + pat)`, `follow_redirects=False`, error
  mapping), `app/services/ado_backlog.py` (`connect(...)`, `fetch_backlog(...)`),
  `app/api/ado_routes.py` (router mounted at `/api/ado`). Schemas go in
  `app/schemas.py`. The httpx client comes from a FastAPI dependency
  (`get_ado_http_client`), so tests override it with an
  `httpx.AsyncClient(transport=httpx.MockTransport(handler))`.
- **PAT hygiene on the server**: the request schemas use `pat: SecretStr`,
  and nothing logs request bodies or headers. Error messages never include
  the PAT. The `RequestValidationError` handler already prints only
  `loc`/`msg` (no input values). Keep it that way.
- **ADO error mapping** (all as 422 `{errors:[msg]}`, in the app's existing
  shape; the client's `ApiError` handles it):
  - URL shape / host not allowed → the URL messages in the API contract.
  - 401, 403, or a **203** / non-JSON / redirect (3xx) response (cloud
    returns a 203 HTML sign-in page for a bad PAT) → "Azure DevOps rejected
    the Personal Access Token (invalid, expired or missing the Work Items
    (Read) scope)."
  - 404 on the project → "Project not found: <project>. Check the URL."
  - Timeout / connection error → "Could not reach Azure DevOps at <host>."
  - Any other non-2xx → "Azure DevOps returned an error (HTTP <code>)."
    plus ADO's `message` field when the body is JSON.
  - A scope path that isn't in the project's tree (backlog route) →
    "Unknown <Area|Iteration> path: <path>."
- **Limits**: WIQL `$top=20000`. If exactly 20000 ids come back, add the
  warning "Only the first 20000 work items were loaded; narrow the scope."
  Batches of at most 200 ids to `workitemsbatch` (`errorPolicy: "omit"`).
  Parent completion loops at most 3 levels.
- **Client modal**: one component, `AdoConnectModal`, used by both the
  home card (`purpose="create"`: title "Create from Azure DevOps", submit
  "Create board") and the board toolbar (`purpose="sync"`: title "Sync from
  Azure DevOps", submit "Preview changes"). Steps: (1) source radio + URL +
  PAT + **Connect**; (2) after Connect, the path picker. Editing the source,
  URL or PAT after a Connect clears the trees and the selection (you must
  Connect again). Submit is enabled only with a selected path. Errors show
  **inline in the modal**, the modal stays open, and the PAT is kept.
  Built on `useDialog` (Esc / focus trap / restore), like `ImportJsonModal`.
- **Busy states**: the Connect and Submit buttons show "Connecting…" /
  "Loading work items…", are disabled while a request runs, and an
  in-flight request is aborted (`AbortController`) when the modal closes.
- **Warnings** returned by the backlog route (e.g. the 20000 cap, the size
  field missing) are shown as info toasts after the board opens or the
  preview applies.

## API contract (shared by backend and frontend)
All routes are `POST`, JSON in/out, and every failure is **422 `{errors: [str]}`**.

```jsonc
// common request part
{ "source": "onprem" | "cloud", "projectUrl": "https://…", "pat": "…" }

// POST /api/ado/connect  — validates URL + PAT, returns the project and both trees
// request: common part
// 200:
{
  "project": { "id": "guid", "name": "Canonical Project Name" },
  "projectUrl": "https://dev.azure.com/org/Canonical%20Project%20Name",  // canonical, no trailing slash
  "areas":      { "name": "Proj", "path": "Proj", "children": [ { "name": "Team A", "path": "Proj\\Team A", "children": [] } ] },
  "iterations": { "name": "Proj", "path": "Proj", "finishDate": "", "children": [
                  { "name": "Sprint 01", "path": "Proj\\Phase 1\\Sprint 01", "finishDate": "2026-10-30", "children": [] } ] }
}

// POST /api/ado/backlog  — fetches Epics + Features in scope (+ missing parent Epics)
// request: common part + { "scopeType": "area" | "iteration", "scopePath": "Proj\\Team A" }
// 200:
{
  "project": { "id": "guid", "name": "Canonical Project Name" },
  "projectUrl": "https://…",
  "scope": "Area Path: Proj\\Team A",            // display text (template format)
  "fetchedAt": "2026-10-23T10:00:00Z",           // server UTC, ISO, "Z"
  "workItems": [                                 // ascending id; Epics and Features only
    { "id": 101, "type": "Epic",    "title": "…", "state": "Active", "description": "<p>…</p>",
      "size": "", "iterationPath": "Proj", "parentId": null },
    { "id": 102, "type": "Feature", "title": "…", "state": "New", "description": "",
      "size": "M", "iterationPath": "Proj\\Phase 1\\Sprint 02", "parentId": 101 }
  ],
  "iterations": [ { "path": "Proj\\Phase 1\\Sprint 01", "finishDate": "2026-10-30" } ],
  "warnings": [ "The field Custom.EstimatedSize does not exist in this project; sizes are empty." ]
}
```
- `size` = `Custom.EstimatedSize` trimmed and upper-cased, `""` when missing.
  `description` = `System.Description` or `""` (raw HTML; the client
  sanitizes it on display with `safeHtml`). `parentId` = `System.Parent` or
  `null`. Parent Epics fetched outside the scope are included (`type: "Epic"`).
  A parent of another type is not included, so its Features become orphans.
- 422 messages (exact text):
  - "Choose the Azure DevOps source (On-Prem or Collaboration Hub)."
  - "Enter the Azure DevOps project URL."
  - "Enter a Personal Access Token."
  - "The URL must start with https://."
  - "Collaboration Hub URLs look like https://dev.azure.com/<organization>/<project>."
  - "On-Prem URLs look like https://<server>/<collection>/<project>."
  - "This Azure DevOps host is not allowed: <host>."
  - "Choose an Area path or an Iteration path." (backlog only)
  - plus the ADO error mapping in *Implementation choices*.

### ADO REST calls used (api-version=7.0; `<base>` = `https://host/<org|collection>`)
- Connect: `GET <base>/_apis/projects/<project>` (validates PAT + project,
  gives the canonical name and id), then
  `GET <base>/<project>/_apis/wit/classificationnodes?$depth=50` (`value[]`
  holds the `structureType: "area"` and `"iteration"` roots;
  iteration nodes carry `attributes.finishDate`).
- Backlog: the Connect calls above (to validate the scope path and get the
  iterations), then `GET <base>/_apis/wit/fields/Custom.EstimatedSize` (404 →
  no size field + warning), then `POST <base>/<project>/_apis/wit/wiql?$top=20000`:
  ```sql
  SELECT [System.Id] FROM WorkItems
  WHERE [System.TeamProject] = @project
    AND [System.WorkItemType] IN ('Epic','Feature')
    AND [System.State] <> 'Removed'
    AND [System.AreaPath] UNDER '<path>'      -- or [System.IterationPath]
  ORDER BY [System.Id]
  ```
  (single quotes in `<path>` doubled), then
  `POST <base>/<project>/_apis/wit/workitemsbatch` with `{ids (≤200),
  fields: [System.Id, System.WorkItemType, System.Title, System.State,
  System.Parent, System.IterationPath, System.Description,
  (Custom.EstimatedSize)], errorPolicy: "omit"}`. Then the same batch call
  for every missing `System.Parent` id, repeated up to 3 levels, keeping
  only Epics.

## Baseline
_(record before any change, in Phase 1: server and client test counts,
`npx tsc -b` / build result. Note: `plans/release-plan-import-export.md`
Phase 2 (Export PNG) is still marked "Not started" there, but commit
`5be3e4f` implemented it. Check the board toolbar has Export PNG before
starting.)_

## Target architecture
```
src/server/app/
  config.py                  Settings (ADO_ALLOWED_HOSTS, ADO_TIMEOUT_SECONDS), read from env
  schemas.py                 + AdoConnectRequest/Response, AdoBacklogRequest/Response, AdoTreeNode, AdoWorkItem
  services/ado_url.py        parse_project_url, host_allowed, AdoUrlError
  services/ado_client.py     AdoClient (async httpx, auth, error mapping → AdoError)
  services/ado_backlog.py    connect(), fetch_backlog(), normalize_node_path(), tree conversion
  api/ado_routes.py          POST /api/ado/connect, POST /api/ado/backlog; get_ado_http_client dependency
  main.py                    + include ado router at /api/ado
src/server/tests/
  ado_fakes.py               MockTransport handler factory with canned ADO responses (synthetic)
  test_ado_url.py, test_ado_client.py, test_ado_connect_route.py, test_ado_backlog_route.py
  test_ado_live.py           @pytest.mark.ado_live, skipped unless ADO_TEST_* env vars are set
src/client/src/
  lib/releasePlan/
    adoTypes.ts              AdoSource, AdoTreeNode, AdoConnectResponse, AdoBacklog, AdoWorkItem (mirror schemas)
    adoApi.ts                adoConnect(req, signal), adoBacklog(req, signal) (ApiError on 422, like lib/monteCarlo/api.ts)
    adoUrl.ts                validateProjectUrl(source, url) → error message | null (same rules as the server)
    adoConnectionStorage.ts  load/save {source, projectUrl} (key cmPlanningHub.releasePlan.adoConnection.v1)
    fromBacklog.ts           groupBacklog(items) → {epics (with features), orphans}; planFromBacklog(backlog, makeId)
    syncDiff.ts              diffBacklog(plan, backlog) → SyncDiff; applySync(plan, diff, {removeGone}) (pure)
    types.ts                 + PlanSource connection fields; NO_EPIC_ID
    validate.ts              + keep/validate the new PlanSource fields
    reducer.ts               + "applySync" action (Phase 4)
  components/releasePlan/
    AdoConnectModal.tsx      source radio, URL, PAT, Connect, path picker, submit (purpose create|sync)
    PathTree.tsx             searchable, expandable single-select tree (Area/Iteration toggle lives in the modal)
    SyncPreviewDialog.tsx    counts + lists, "Remove items no longer in scope", Apply/Cancel (Phase 4)
    BoardToolbar.tsx         + "Sync from ADO" button (Phase 4)
  pages/ReleasePlanHomePage.tsx   ADO card enabled → AdoConnectModal (create)
  pages/ReleasePlanBoardPage.tsx  Sync button → AdoConnectModal (sync) → SyncPreviewDialog (Phase 4)
  test/adoFixtures.ts        synthetic AdoBacklog / tree builders (never real data)
helm/chart/                  server Deployment env ADO_ALLOWED_HOSTS (+ values.yaml key adoAllowedHosts)
docker-compose.yml           server environment ADO_ALLOWED_HOSTS (default value)
```

## For Future Agents
As work proceeds: mark checkboxes `- [x]` as items complete. When a phase is
done, set its status to `Complete` and write its **Phase Summary** (what was
done, key decisions, anything needed to continue with zero context). Run the
phase's **Verification Plan** and record the result (test counts, build
result) before moving on. Each phase runs Develop → QA (at most 3
Develop↔QA cycles) via `claude --agent orchestrator`. Pass the **API
contract** above verbatim to both developers. Do not start a phase before
the previous one is `Complete`. Never read or import `specs/templates/*` or
the `ado-release-planning-board` skill's files from code or tests. Tests use
synthetic fixtures only, and **no test may call a real Azure DevOps** except
`test_ado_live.py` (opt-in). Never put a real PAT in the repo, a test, a
log or this file. Record any new rule you settle in *Decisions →
Implementation choices*. Do **not** edit `plans/release-plan-board.md` or
`plans/release-plan-import-export.md`. When all phases are done, fill in
**Final Recap** and **Deployment Plan**.

## Phase 1: Server — ADO URL rules, client wrapper and `POST /api/ado/connect`
Status: Not started   <!-- Not started | In progress | Complete -->

Develop (backend-developer; frontend-developer confirms no client change):
- [ ] Record the **Baseline** section above (server + client test counts, `tsc -b`/build result).
- [ ] Add `app/config.py`: `Settings` dataclass with `ado_allowed_hosts: tuple[str, ...]` (from `ADO_ALLOWED_HOSTS`, comma-separated, trimmed, lower-cased, empty entries dropped; default `dev.azure.com,*.visualstudio.com,tfs-projects.cmf.criticalmanufacturing.com`) and `ado_timeout_seconds: float` (`ADO_TIMEOUT_SECONDS`, default 30). Add `get_settings()` (cached), overridable in tests through FastAPI `dependency_overrides`.
- [ ] Add `app/services/ado_url.py`: `AdoProject(kind, base_url, project, project_url)` and `parse_project_url(source, url, allowed_hosts)` implementing the URL rules in *Decisions* (https only; cloud = `dev.azure.com/<org>/<project>` or `<org>.visualstudio.com/<project>`; on-prem = `<host>/<collection>/<project>`; strip trailing `/`, `/_…` segments, query and fragment; decode the project name). It raises `AdoUrlError` with the exact contract messages. Add `host_allowed(host, patterns)` (`*.x` matches subdomains of `x` only, not `x` itself; exact match otherwise; case-insensitive).
- [ ] Add `app/services/ado_client.py`: `AdoClient(http: httpx.AsyncClient, base_url, pat, timeout)` with `get_json(path, params)` / `post_json(path, params, body)`. Every request adds `api-version=7.0`, `Authorization: Basic base64(":"+pat)`, `Accept: application/json`, and `follow_redirects=False`. Map errors to `AdoError(message)` per *ADO error mapping* (401/403/203/3xx/non-JSON → the PAT message; timeouts/`httpx.TransportError` → "Could not reach Azure DevOps at <host>."; other non-2xx → the HTTP message + ADO `message`). Never include the PAT or headers in a message.
- [ ] Add `app/services/ado_backlog.py` `connect(client, ado_project)`: call `_apis/projects/<project>` (404 → "Project not found: <project>. Check the URL.") and `classificationnodes?$depth=50`, then convert both roots to `AdoTreeNode` (`name`, normalized `path`, `finishDate` for iterations, `children` sorted as returned). Add a `normalize_node_path(path)` helper (drop the leading `\` and the 2nd segment).
- [ ] Add the schemas to `app/schemas.py`: `AdoSource = Literal["onprem","cloud"]`, `AdoConnectRequest(source, projectUrl, pat: SecretStr)`, `AdoTreeNode` (recursive), `AdoProjectInfo`, `AdoConnectResponse`. Validate missing/blank fields in the route with the contract messages (not Pydantic's own), reading the JSON body leniently like `/api/validate` does with its form.
- [ ] Add `app/api/ado_routes.py` with `POST /api/ado/connect` and the `get_ado_http_client` dependency (yields one `httpx.AsyncClient(timeout=settings.ado_timeout_seconds)` per request), and mount it in `main.py` (`prefix="/api/ado"`).
- [ ] Add `tests/ado_fakes.py`: a `MockTransport` handler factory that serves synthetic `projects`, `classificationnodes`, and error responses (401, 203 HTML, 404, timeout), and records the requests (for asserting the auth header, `api-version`, and that the PAT never appears in URLs).
- [ ] Tests: `test_ado_url.py` (every URL rule and message, allowlist wildcard semantics, encoded names, stripped suffixes); `test_ado_client.py` (auth header, api-version, error mapping incl. 203/302/non-JSON/timeout, PAT absent from every error message); `test_ado_connect_route.py` (200 shape with normalized paths and finish dates; each 422 message; disallowed host makes **no** HTTP request; the PAT never appears in any response body).

### Verification Plan
- `python3 -m pytest src/server -q` → all pass (baseline count + the new tests), 0 failures.
- `python3 -m compileall -q src/server/app` → no output, exit 0.
- `cd src/client && npm test -- --run && npx tsc -b` → unchanged from the baseline (no client changes).
- `grep -rn "pat" src/server/app --include=*.py | grep -i "log"` → no line logs the PAT.

### Phase Summary
_(write when phase completes)_

## Phase 2: Server — `POST /api/ado/backlog`, live smoke test, deployment config
Status: Not started

Develop (backend-developer; frontend-developer confirms no client change):
- [ ] Add the schemas `AdoBacklogRequest` (common part + `scopeType: Literal["area","iteration"]`, `scopePath`), `AdoWorkItem`, `AdoIteration`, `AdoBacklogResponse` (the contract shape).
- [ ] `ado_backlog.fetch_backlog(client, ado_project, scope_type, scope_path)`: reuse `connect` to get the trees; reject a `scopePath` that isn't a node of the chosen tree ("Unknown Area path: …" / "Unknown Iteration path: …"); check `Custom.EstimatedSize` via `_apis/wit/fields/…` (404 → omit the field and add the warning); run the WIQL in *ADO REST calls used* (escape `'` → `''`; `$top=20000`; 20000 hits → warning); fetch the fields with `workitemsbatch` in chunks of ≤200; fetch missing parents up to 3 levels, keeping only Epics; normalize to `AdoWorkItem` (size trimmed/upper-cased, description `""` when missing, `parentId` null when missing); sort by id; flatten the Iteration tree (root excluded) into `iterations`; `scope` = `"Area Path: <path>"` / `"Iteration Path: <path>"`; `fetchedAt` = UTC now, ISO with `Z`.
- [ ] `POST /api/ado/backlog` in `ado_routes.py`, with the same blank-field validation as connect plus "Choose an Area path or an Iteration path.".
- [ ] Extend `tests/ado_fakes.py` with WIQL, `workitemsbatch` (honoring the requested ids/fields) and `fields` endpoints over a synthetic backlog (Epics in and out of scope, a Feature without a parent, a Feature whose parent is a User Story, a missing size field variant, more than 200 ids for chunking).
- [ ] `tests/test_ado_backlog_route.py`: response shape and ordering; `UNDER` + `Removed` filter + `@project` present in the WIQL text; quote escaping; chunking (≤200 ids per batch call); parent completion (out-of-scope Epic included, non-Epic parent excluded); size normalization; missing size field → `""` sizes + warning and the field absent from the batch request; 20000 cap warning; unknown scope path 422; iteration flattening and date truncation; every 422 message; PAT never in a response.
- [ ] `tests/test_ado_live.py`: one `@pytest.mark.ado_live` test, `skipif` unless `ADO_TEST_URL`, `ADO_TEST_PAT`, `ADO_TEST_AREA` are set (`ADO_TEST_SOURCE` default `onprem`), that calls connect + backlog through `TestClient` against real ADO and asserts a 200 with ≥1 work item. Register the `ado_live` marker in `pytest.ini`.
- [ ] Deployment config: `docker-compose.yml` server `environment: ADO_ALLOWED_HOSTS` (the default list); `helm/chart/values.yaml` `adoAllowedHosts:` (same default) wired into the server Deployment's `env`. Check the server Deployment template already has (or gains) an `env:` block. Check the nginx `/api/` proxy timeout (600s) covers large backlogs (no change expected).
- [ ] Render the chart to check it: `docker run --rm -v "$PWD/helm/chart:/chart" alpine/helm template /chart`.

### Verification Plan
- `python3 -m pytest src/server -q` → all pass, `ado_live` reported as skipped (no env vars).
- `python3 -m compileall -q src/server/app` → exit 0.
- `docker run --rm -v "$PWD/helm/chart:/chart" alpine/helm template /chart | grep -A1 ADO_ALLOWED_HOSTS` → shows the env var with the default value.
- `docker compose config | grep ADO_ALLOWED_HOSTS` → present.
- (Optional, needs a real PAT, run by a human or with the env vars exported) `ADO_TEST_URL=… ADO_TEST_PAT=… ADO_TEST_AREA=… python3 -m pytest src/server -m ado_live -q` → 1 passed.

### Phase Summary
_(write when phase completes)_

## Phase 3: Client — create a board from Azure DevOps
Status: Not started

Develop (frontend-developer; backend-developer confirms no server change):
- [ ] `lib/releasePlan/adoTypes.ts` and `adoApi.ts` mirroring the contract (`POST` JSON, `ApiError` with `errors` on 422, generic message otherwise, `AbortSignal` support), following `lib/monteCarlo/api.ts`.
- [ ] `lib/releasePlan/adoUrl.ts`: `validateProjectUrl(source, url)` with the same shape rules and messages as the server (the host allowlist stays server-only). Add a `PLACEHOLDER` per source (`https://tfs-projects.cmf.criticalmanufacturing.com/ImplementationProjects/<PROJECT_NAME>` / `https://dev.azure.com/<ORGANIZATION>/<PROJECT_NAME>`).
- [ ] `lib/releasePlan/adoConnectionStorage.ts`: `loadAdoConnection()` / `saveAdoConnection({source, projectUrl})` (key `cmPlanningHub.releasePlan.adoConnection.v1`, try/catch, validates shape on load). It never accepts or stores a PAT (the type has no such field).
- [ ] `types.ts`: add the optional `PlanSource` fields (`kind`, `projectUrl`, `scopeType`, `scopePath`) and `NO_EPIC_ID = "no-epic"` (+ its title constant). `validate.ts` `normalizeSource`: keep them when valid, drop them otherwise. Existing validate tests still pass, plus new ones.
- [ ] `lib/releasePlan/fromBacklog.ts`: `groupBacklog(items)` → Epics in id order, each with its Features (id order) and the orphan Features (no parent, or a parent that isn't a returned Epic) under the synthetic Epic placed last (only when non-empty); `planFromBacklog(backlog, connection, makeId)` → a `ReleasePlan` (Releases mode, one `MVP` milestone `MS_COLORS[0]`, every Feature in it, no flags, name `"<project> – Feature Release Plan"`, `source` with every connection field, `iterations` from the backlog) that passes `normalizePlan` unchanged.
- [ ] `components/releasePlan/PathTree.tsx`: an accessible single-select tree (`role="tree"`/`treeitem`, `aria-expanded`, `aria-selected`; ↑/↓/←/→/Enter keys), expandable nodes (root expanded), a search box that filters to the matching nodes plus their ancestors (case-insensitive on the name/path) and auto-expands them. Selecting a node calls `onSelect(path)`.
- [ ] `components/releasePlan/AdoConnectModal.tsx` (see *Implementation choices → Client modal*): source radio group ("On-Prem" / "Collaboration Hub"), project URL input (placeholder per source, pre-filled from `loadAdoConnection()` or from the `initial` prop), PAT `type="password"` input (`autoComplete="off"`), **Connect** (client-side URL check first, then `adoConnect`; on success `saveAdoConnection`), then the "Area path" / "Iteration path" toggle + `PathTree`, then submit → `adoBacklog` → `onBacklog(backlog, connection)`. Inline errors, busy labels, abort on close, edits after Connect reset the trees. Props: `open`, `purpose: "create" | "sync"`, `initial?: {source, projectUrl, scopeType, scopePath}`, `onClose`, `onBacklog`.
- [ ] `ReleasePlanHomePage`: enable the ADO card (remove "Coming soon"/`aria-disabled`, make it a `<button>` like the JSON card) → `AdoConnectModal` (`purpose="create"`). `onBacklog` → `planFromBacklog` → the existing replace-confirmation flow (`ReplaceBoardDialog`) → `openBoard`. Backlog `warnings` → `showInfo` toasts.
- [ ] `test/adoFixtures.ts`: synthetic trees, backlogs and connect responses (builders).
- [ ] Tests: `adoUrl.test.ts` (every rule, parity with the server messages), `adoConnectionStorage.test.ts` (round-trip, corrupted/absent storage, never a PAT), `fromBacklog.test.ts` (grouping, order, orphans → synthetic Epic last, no synthetic Epic without orphans, plan shape, `normalizePlan(plan)` deep-equals `plan`), `validate.test.ts` additions (new source fields kept/dropped), `PathTree.test.tsx` (expand, select, search filter, keyboard), `AdoConnectModal.test.tsx` (mocked `fetch`: URL error without a request, Connect success shows the tree, 422 errors inline, edits reset, submit disabled until a path is picked, PAT sent in the body only and never written to `localStorage`, abort on close), `ReleasePlanHomePage` tests (card enabled; full create flow lands on the board with the "Plan loaded" toast; replace confirmation when a plan exists).
- [ ] Docs (main session, after QA): CLAUDE.md (Release Plan now has a server part; `/api/ado/*`; new lib/component files; `ADO_ALLOWED_HOSTS`) and README (how to create a board from ADO; required PAT scope "Work Items (Read)"; the PAT is never stored).

### Verification Plan
- `cd src/client && npm test -- --run` → all pass (baseline + new), 0 failures.
- `cd src/client && npm run build` → `tsc -b` + vite build succeed (or the `$TMPDIR/rp-dist` fallback from the Baseline note).
- `python3 -m pytest src/server -q` → unchanged pass count from Phase 2.
- `grep -rn "localStorage" src/client/src/lib/releasePlan/adoConnectionStorage.ts` shows only the connection key, and `grep -rni "pat" src/client/src/lib/releasePlan/adoConnectionStorage.ts` → no PAT field.
- End-to-end with mocks: `docker compose up --build -d`, then `curl -s -X POST http://172.17.0.1:8080/api/ado/connect -H 'Content-Type: application/json' -d '{"source":"cloud","projectUrl":"https://evil.example.com/a/b","pat":"x"}'` → `{"errors":["This Azure DevOps host is not allowed: evil.example.com."]}` (proves the client→nginx→server routing and the allowlist); `docker compose down`.

### Phase Summary
_(write when phase completes)_

## Phase 4: Client — sync an open board from Azure DevOps (spec phase 5)
Status: Not started

Develop (frontend-developer; backend-developer confirms no server change, since sync reuses `/api/ado/backlog`):
- [ ] `lib/releasePlan/syncDiff.ts`: `diffBacklog(plan, backlog)` → `SyncDiff` `{ newEpics, newFeatures (with target epicId), updatedEpics: [{id, title, changes: field[]}], updatedFeatures: [{id, title, changes: field[] (incl. "epic" for a parent change)}], goneEpics, goneFeatures, iterationsChanged }`, matching by id (`String(id)` comparison, since old JSON plans may hold string ids); the synthetic Epic is never reported; orphans resolve to the synthetic Epic as in `groupBacklog`. `applySync(plan, backlog, connection, {removeGone})` → a new plan per *Decisions → Sync* (new Features Unplanned at the end of their Epic, new Epics appended (the synthetic Epic stays last), moved Features to the end of the new Epic keeping `milestoneId`, field updates, gone items removed only when `removeGone`, an emptied synthetic Epic removed, `iterations` replaced, `source` updated). Milestones, flags, mode, name and the order of unchanged items stay as they are.
- [ ] `reducer.ts`: an `applySync` action wrapping the pure function (one state change, so one autosave). It returns the same reference only when nothing at all changes (including `source`/`iterations`).
- [ ] `components/releasePlan/SyncPreviewDialog.tsx` (`useDialog`): the title "Sync from Azure DevOps", count lines ("N new Features", "N new Epics", "N updated", "N no longer in scope"), collapsible lists (`#id title` + the changed fields), the checkbox "Remove items no longer in scope" (shown only when there are gone items, unticked by default), **Apply** / **Cancel**, and the up-to-date message when the diff is empty.
- [ ] `BoardToolbar`: a "Sync from ADO" button (decorative inline-SVG refresh icon `SyncIcon` in `components/icons/`, `aria-hidden`), next to Load/Save, in both views.
- [ ] `ReleasePlanBoardPage`: Sync → `AdoConnectModal` (`purpose="sync"`, `initial` from `plan.source` when it has `kind`/`projectUrl`/`scopeType`/`scopePath`) → `diffBacklog` → `SyncPreviewDialog` → `dispatch(applySync)`, then close the work-item modal, bump the `Board` key (like Load), and `showInfo("Board synchronized with Azure DevOps")` plus any backlog `warnings`. Cancel leaves the plan untouched.
- [ ] Tests: `syncDiff.test.ts` (each new/updated/moved/gone case, string vs number ids, the synthetic Epic created/removed, `removeGone` on/off, planning preserved, no-diff case, the result passes `normalizePlan`), `reducer.test.ts` additions, `SyncPreviewDialog.test.tsx`, and board-page tests (toolbar button; prefill from `plan.source`; old plan without connection info shows an empty form; Apply updates the board + toast; Cancel changes nothing; autosave called once).
- [ ] Docs (main session, after QA): CLAUDE.md + README (Sync from ADO: pull-only, preview, removal opt-in, where new items go). Update the `specs/release_plan.md`-related status line in CLAUDE.md ("spec phases 4–5 complete").

### Verification Plan
- `cd src/client && npm test -- --run` → all pass, 0 failures.
- `cd src/client && npm run build` → succeeds (or the `$TMPDIR/rp-dist` fallback).
- `python3 -m pytest src/server -q` → unchanged from Phase 2.
- (Optional, human with a real PAT) `docker compose up --build`, open `http://localhost:8080/release-plan`, create a board from ADO, move a Feature, change that Feature's title in ADO, Sync → the preview lists 1 updated Feature; Apply keeps its milestone and shows the new title.

### Phase Summary
_(write when phase completes)_

## Final Recap
_(write when all phases complete: summary of the entire piece of work)_

## Deployment Plan
_(write when all phases complete: step-by-step deployment instructions —
expected to include setting `adoAllowedHosts` in Helm values if the default
host list must change, checking that the OpenShift server pods can reach
`tfs-projects.cmf.criticalmanufacturing.com` and `dev.azure.com` (egress),
releasing both images with the same tag via the Deploy workflow, and bumping
`tag` in `helm/chart/values.yaml`.)_
