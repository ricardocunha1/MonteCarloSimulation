# Release Plan — Phase 3: in-board JSON Load/Save and PNG export

Implement `specs/release_plan.md` "Implementation Phases" **Phase 3**: the
board toolbar gets **Load Plan** (import JSON into the open board), **Save
Plan** (download the plan as JSON) and **Export PNG** (download an image of
just the board, drawn on a canvas). **Client-only** (`src/client`); no server,
Docker, Helm or dependency changes. Spec phases 4–5 (Azure DevOps connection
and sync) are **out of scope**. This plan continues
`plans/release-plan-board.md` (Phases 0–2, Complete), which is **not** edited
by this work; its *Template reference* still governs every board behavior not
restated here.

## Decisions (confirmed with the user, 2026-10-21)
- **Plan file**: this new file. `plans/release-plan-board.md` is not updated.
- **Load Plan** reuses `ImportJsonModal` (inline errors, the modal stays open
  on an invalid file). A valid file then goes through the **same** "Replace
  the current board?" `ConfirmDialog` as the home page (title, message and
  "Replace" label unchanged), then `replacePlan`, the toast "Plan loaded:
  <name>", and the user **stays** on `/release-plan/board`. The template's
  direct file picker + `alert` is not used.
- **Save Plan** downloads the JSON exactly like the template (see *Template
  reference*), with a fresh `savedAt` in the **file only**. The store and the
  localStorage autosave are **not** changed (no new reducer action).
- **Export PNG** is a **canvas port** of the template's `exportPng`, drawn
  from `computeLayout(plan)` (no new dependency, no DOM snapshot). It works
  from both the Board and the Table views.
- **PNG header**: the template's 64px navy (`#274B76`) strip with the plan
  name and `Exported <date> · <source system>` (middle dot), plus the CM logo
  **`specs/assets/cmlogo.svg`** drawn in its original colors on a **white
  rounded plate** at the top right (the logo is `#00558C`, invisible on
  navy). If the logo fails to load, the PNG is drawn without it (no error).
- **Big boards**: draw at scale 2, **lowered automatically** so the canvas
  fits a safe size; if even scale 1 doesn't fit, show the error toast "The
  board is too large to export as PNG." and download nothing.
- **Workflow**: 2 phases. Each runs Develop (`frontend-developer`) → QA
  (`qa-engineer`, at most 3 Develop↔QA cycles) → Docs
  (`documentation-writer`), driven by `claude --agent orchestrator`.

### Implementation choices (derived, not asked; change them here if needed)
- The logo is **copied** to `src/client/src/assets/cmlogo.svg` and imported
  through Vite (`import logoUrl from "../../assets/cmlogo.svg"`, a URL), because
  the client Docker build context is `src/client` and cannot reach `specs/`.
  The SVG has `width="178" height="44"`, so `drawImage` gets a natural size in
  every browser.
- Empty `source.system` prints `Manual` (same fallback as `sourceInfo`), not
  the template's trailing `· `.
- The "PNG exported" toast is shown **after** the blob is downloaded (the
  template toasts before `toBlob` finishes). A `null` blob or a missing 2D
  context shows the error toast "Could not export the PNG."
- In the board, the import modal shows the title "Load a plan" and the
  confirm button "Load" (new optional `title`/`submitLabel` props on
  `ImportJsonModal`; the home page keeps "Import a JSON file"/"Create board").
- After a Load, the board page closes the work-item modal and remounts
  `Board` (a `key` that increments on each load) so the Ctrl/⌘ selection,
  gap menu and drag state reset. View (Board/Table) and zoom are kept.
- Canvas limits: `MAX_SIDE = 16384` px per side and `MAX_AREA = 16_777_216`
  px (Safari's limit), applied to the **scaled** size.
- The replace confirmation lives in one shared component,
  `components/releasePlan/ReplaceBoardDialog.tsx`, used by the home page and
  the board page; change its text there only.
- `.btn.primary` is ported to `releasePlan.css` only with its first user
  (`Export PNG`, Phase 2), to avoid unused CSS.
- Load Plan / Save Plan show decorative upload/download (tray + arrow) icons,
  `UploadIcon`/`DownloadIcon` in `components/icons/` (inline SVG, no icon
  library, `aria-hidden`). A folder-open icon for Load was considered as an
  alternative metaphor.

## Baseline (recorded 2026-10-21, before any change)
- Client: 38 test files, **307/307 Vitest tests pass**; `npx tsc -b` clean
  (`export PATH=~/.local/node/bin:$PATH` if `node` is missing).
- `npm run build` may fail with `EACCES ... dist/assets` when
  `src/client/dist` is root-owned (environmental). Then build with
  `npx tsc -b && npx vite build --outDir "$TMPDIR/rp-dist" --emptyOutDir`;
  either counts as "build OK".
- Server: untouched (sanity only: `pytest src/server -q`).

## Target architecture (client additions)
```
src/client/src/
  assets/cmlogo.svg                        copy of specs/assets/cmlogo.svg (Phase 2)
  lib/releasePlan/
    exportFile.ts     fileBase(name, now), planToJson(plan, now), downloadBlob(blob, name)   (Phase 1)
    png.ts            pngScale(w, h), drawBoardPng(ctx, plan, layout, opts) — pure drawing  (Phase 2)
  components/releasePlan/
    BoardToolbar.tsx  + spacer, "Load Plan", "Save Plan", "Export PNG" (primary)
    ImportJsonModal.tsx  + optional title / submitLabel props
    useExportPng.ts   loads the logo, creates the canvas, calls drawBoardPng, toBlob → download (Phase 2)
  pages/ReleasePlanBoardPage.tsx  owns the Load modal, replace confirm, toasts, Board key
```
- `drawBoardPng` takes a `CanvasRenderingContext2D` (only the subset it uses)
  so it is unit-tested in jsdom with a **recording mock context** (jsdom has
  no canvas: `getContext` returns `null`). Tests assert on recorded calls
  (`fillText` strings, `fillRect`/`drawImage` geometry, fill colors), never
  on pixels.
- jsdom has no `URL.createObjectURL`/`revokeObjectURL`: tests stub them
  (`vi.stubGlobal` or assign on `URL`) and spy on the anchor `click`.
- Reuse `computeLayout`, `bands`, `allFeatures`, `sizeCounts`, `isDone`,
  `epicMsLabel`, `fmtDate`, `SIZE_COLORS`, `STATE_COLORS`, `OK_GREEN`, `L`
  and the palette constants; do not duplicate them. If a palette value the
  PNG needs only exists in `releasePlan.css`, add it to `constants.ts` and
  keep the CSS variable in sync.

## Template reference (Phase 3 additions)
Captured from `references/template-features.html` of the local
`ado-release-planning-board` skill. Its PNG export and save/load section was
checked against the user's local copy of the spec template
(`/mnt/c/tmp/features-release-board-example.html`, the uncommitted
`specs/templates/features-release-board-example.html`) and is identical. Never
import or read either file from code or tests.

### Toolbar
After the zoom group: a flex spacer, then `Load Plan` (`.btn`), `Save Plan`
(`.btn`), `Export PNG` (`.btn.primary`). They are shown in both views. (The
template's theme button is not ported: the hub is dark only.)

### Save Plan (`saveJson`)
- `fileBase() = (name || "feature-plan").replace(/[^\w\-]+/g, "_") + "_" +
  new Date().toISOString().slice(0,10)` (UTC date).
- File: `{ ...plan, schema: "release-planner-features", version: 1, savedAt:
  new Date().toISOString() }`, `JSON.stringify(out, null, 2)`, `Blob` type
  `application/json`, name `fileBase() + ".json"`.
- `download(blob, name)`: an `<a download=name href=URL.createObjectURL(blob)>`
  appended to `body`, `click()`ed, then after 500 ms `revokeObjectURL` and
  removed.
- Toast: "Plan saved".
- A saved file must round-trip: `parsePlanFile(planToJson(plan))` deep-equals
  the plan apart from `savedAt`.

### Load Plan
Template: file input → `validate` → replace state, clear the selection,
toast "Plan loaded: <name>", `alert("Could not load file: " + msg)` on error.
Here: see *Decisions* (modal + confirm + same toast; errors inline).

### Export PNG (`exportPng`)
All coordinates are unscaled layout px; `ctx.scale(scale, scale)` first,
`textBaseline = "top"`, font family `F = '"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif'`.
- `HEAD = 64`. Canvas = `width × (height + HEAD)` times `scale`.
- Colors (dark palette): bg `--panel #152A47`, ink `--ink #E9EFF7`, muted
  `--muted #9FB3CC`, line `--line #2A4A73`, bandA `#12243D`, bandB
  `#172C4A`, bandLine `#2F5180`, unplanned `#2A2617`, epicbg
  `rgba(255,255,255,.035)`, gold `#EBC160`.
- Background: fill all with bg. Header: fill `#274B76` `0,0,width,HEAD`;
  name `#fff` `600 20px` at `(18,12)`; subtitle `rgba(255,255,255,.75)` `12px`
  at `(18,38)`: `Exported <toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"})> · <source.system || "Manual">`.
- Logo (this plan): height 40 (`lw = naturalWidth*40/naturalHeight`), at
  `x = width - lw - 18 - PAD`, vertically centered in `HEAD`, on a white
  (`#fff`) rounded rect (radius 6) padded `PAD = 6` on each side. Skipped
  when the image didn't load.
- Then `translate(0, HEAD)`.
- **Bands** (index `i`): fill `unplanned` or `i % 2 ? bandB : bandA` over
  `0,y,width,h`; a 1px `bandLine` top line; a 1px `line` vertical line at
  `x = LBL_W`. Color bar: `rr(10, y+12, 4, 40, 2)` gold (Unplanned) or the
  milestone color. Name: ink, `700 15px`, `wrap(name, 22, y+12, LBL_W-30, 18,
  2)`. Muted `12px`: at `(22, y+50)` "Not assigned" (Unplanned) or
  `fmtDate(date) || "No date"`; at `(22, y+66)` "`N Features`". Size chips
  from `(22, y+84)`: text `"K N"`, `700 11px`, width `measure + 14`, height 17,
  radius 8.5, `SIZE_COLORS` bg/ink, text at `(cx+7, cy+3)`, gap 4, wrap to
  `cx = 22, cy += 20` when `cx + w > LBL_W - 8`.
- **Epics**: background `rr(x, bandY0-4, w, height-bandY0-8, 8)` epicbg.
  Header: shadow card (`shadowColor rgba(0,0,0,.18)`, blur 3, offsetY 1)
  `#FF7B00` radius 6 at `(x, TOP, w, EPIC_H)`. Centered (`textAlign
  center`), ink `#1a1206`: title `700 15px` `wrap(title, x+w/2, TOP+8, w-20,
  18, 1)`; meta `11px` at alpha .75 `"Epic #<id> · <epicMsLabel>"` at
  `(x+w/2, TOP+28)`. Reset `textAlign left`.
- **Feature cards** (in the band of `milestoneId`, `y = band.y + BAND_PAD`):
  shadow card `#773B93` radius 4 `COL_W × CARD_H`. Done: `OK_GREEN` circle
  r7 at `(x+12, y+12)` + white 2px check `(x+8.5,y+12)→(x+11,y+14.5)→(x+15.5,y+9.5)`.
  Else: `rgba(255,255,255,.9)` circle r5.5 at `(x+11,y+12)` + state-color
  circle r4. "Feature #id" white alpha .85 `10.5px` at `(x+22, y+6)`. Size
  badge: text `size || "?"` `700 11px`, `sw = measure + 12`, pill
  `rr(x+COL_W-sw-6, y+4, sw, 16, 8)` `#fff` (estimated) or
  `rgba(255,255,255,.35)`, text `#4a1f60` or `#fff` at `(x+COL_W-sw, y+6)`.
  Title white `600 12.5px` `wrap(title, x+7, y+25, COL_W-14, 15.5, 3)`.
- **Flags** (`cy = y + h/2`, label `name + (date ? " · " + fmtDate(date) : "")`):
  gold dashes `fillRect(x, cy-1.5, 14, 3)` for `x = LBL_W; x < width; x += 20`;
  gold `rr(0, y+4, LBL_W-14, h-8, 6)`; flag icon `#3a2a05` at `(10, cy-7)`;
  name `#3a2a05` `700 12px` `wrap(name, 28, cy-7, LBL_W-46, 14, 1)`; tag pill
  `700 11px`, `tw = measure(label) + 30`, gold `rr(LEFT+6, cy-10, tw, 20, 10)`,
  icon at `(LEFT+14, cy-6)`, label at `(LEFT+30, cy-6)`.
- Flag icon: `fillRect(x, y, 1.8, 14)` + polygon `(x+1.8,y+1) (x+12,y+1)
  (x+9.5,y+5) (x+12,y+9) (x+1.8,y+9)`.
- Helpers: `rr` = rounded rect via `arcTo`; `wrap(text, x, y, maxW, lineH,
  maxLines)` splits on whitespace, greedy-fills by `measureText`, and when
  there are more lines than `maxLines` truncates the last kept line with "…"
  until it fits.
- Not drawn (same as the template): the selection, drag highlights, "+" gap
  buttons, Unplanned/milestone stats chips beyond the above, zoom.
- Output: `toBlob(..., "image/png")`, name `fileBase() + ".png"`, then the
  toast "PNG exported".

## For Future Agents
As work proceeds: mark checkboxes `- [x]` as items complete. When a phase is
done, set its status to `Complete` and write its **Phase Summary** (what was
done, key decisions, anything needed to continue with zero context). Run the
phase's **Verification Plan** and record the result (test counts, build
result) before moving on. Each phase runs Develop (`frontend-developer`) → QA
(`qa-engineer`, at most 3 Develop↔QA cycles) → Docs (`documentation-writer`),
driven by `claude --agent orchestrator`. Do not start a phase before the
previous one is `Complete`. Never read or import `specs/templates/*` (or the
skill's template) from code or tests; tests use the synthetic builders in
`test/releasePlanFixtures.ts` / `test/renderBoard.tsx`. Record any new rule
you settle in *Decisions → Implementation choices*. Do **not** edit
`plans/release-plan-board.md`. When all phases are done, fill in **Final
Recap** and **Deployment Plan**.

## Phase 1: Load Plan and Save Plan (JSON)
Status: Complete   <!-- Not started | In progress | Complete -->

Develop (frontend-developer):
- [x] Add `lib/releasePlan/exportFile.ts`: `fileBase(name: string, now: Date)` (template rule, UTC date), `planToJson(plan, now)` (the file content string with `schema`, `version`, `savedAt = now.toISOString()`, 2-space indent; does not mutate `plan`), `downloadBlob(blob, name)` (anchor + `createObjectURL`, click, revoke/remove after 500 ms).
- [x] `ImportJsonModal`: add optional `title` (default "Import a JSON file") and `submitLabel` (default "Create board") props; no other behavior change.
- [x] `BoardToolbar`: add a spacer and the `Load Plan`, `Save Plan` buttons (props `onLoad`, `onSave`), visible in both views; add the `Export PNG` button only in Phase 2 (no dead control). Port the template's `.spacer` and `.btn.primary` styles into `releasePlan.css` under `.rp` if missing.
- [x] `ReleasePlanBoardPage`: Save → `downloadBlob(new Blob([planToJson(plan, new Date())], {type: "application/json"}), fileBase(plan.name, now) + ".json")` and `showInfo("Plan saved")`; the store is not touched.
- [x] `ReleasePlanBoardPage`: Load → opens `ImportJsonModal` (`title="Load a plan"`, `submitLabel="Load"`); a valid plan opens the "Replace the current board?" `ConfirmDialog` (same title/message/"Replace" as `ReleasePlanHomePage`); on confirm `replacePlan`, close both, close the work-item modal, bump the `Board` `key`, `showInfo("Plan loaded: <name>")`; cancel keeps the current board and closes the confirmation only.
- [x] Factor the replace-confirmation message into one shared place (e.g. a `replaceBoardMessage(oldName, newName)` helper or a small `ReplaceBoardDialog` component) used by both pages, so the text can't drift.
- [x] Unit tests: `exportFile` (`fileBase` sanitizing/empty name → `feature-plan`/UTC date; `planToJson` content, indent, no mutation, round-trip through `parsePlanFile`; `downloadBlob` with stubbed `URL.createObjectURL`/`revokeObjectURL` and fake timers); `ImportJsonModal` custom labels; toolbar buttons in both views; board page Save (blob content + file name + toast, store unchanged) and Load (invalid file → inline error, valid → confirm → board replaced + toast; cancel keeps the board; selection cleared after load).

QA (qa-engineer):
- [x] Review against this plan and the *Template reference*; integration test: board → Save Plan (capture the blob) → change a milestone → Load Plan with the captured file → confirm → the board shows the saved state, persists across a provider re-mount.

Docs (documentation-writer):
- [x] TSDoc for the new/changed modules; README Release Plan section: Load/Save Plan.

### Verification Plan
- `cd src/client && npx vitest --run` → all tests pass, count ≥ 307 + the new ones, 0 failures.
- `cd src/client && npx tsc -b` → exit 0; `npm run build` (or the `$TMPDIR` fallback from *Baseline*) → succeeds.
- `grep -rn "specs/templates\|template-features\|window\.\(confirm\|alert\|prompt\)" src/client/src` → no matches.
- `git diff --stat main...HEAD -- src/server helm deploy src/client/package.json src/client/package-lock.json plans/release-plan-board.md` shows no change from this phase.

### Phase Summary
**Done.** The board toolbar has a spacer (`.rp .spacer { flex: 1 }`) and
**Load Plan** / **Save Plan** (`.btn`) in both views (`BoardToolbar` props
`onLoad`/`onSave`). New `lib/releasePlan/exportFile.ts`: `fileBase(name, now)`
(template rule, empty name → `feature-plan`, UTC `YYYY-MM-DD`),
`planToJson(plan, now)` (adds `schema`/`version`/`savedAt`, 2-space indent,
no mutation; round-trips through `parsePlanFile`), `downloadBlob(blob, name)`
and `DOWNLOAD_REVOKE_MS = 500`. `ImportJsonModal` got optional `title` /
`submitLabel` (defaults "Import a JSON file" / "Create board"). In
`ReleasePlanBoardPage`'s `BoardWorkspace`: Save downloads
`<fileBase>.json` and toasts "Plan saved" (store and autosave untouched);
Load opens the modal as "Load a plan"/"Load", a valid plan becomes
`pendingPlan` → `ReplaceBoardDialog` → `replacePlan`, both dialogs and the
work-item modal close, `boardKey` is bumped (remounts `Board`), toast "Plan
loaded: <name>"; view and zoom are kept, cancel just clears `pendingPlan`.

**Key decisions.**
- The replace confirmation is one shared component,
  `components/releasePlan/ReplaceBoardDialog.tsx` (`REPLACE_BOARD_TITLE`,
  `replaceBoardMessage(currentName, nextName)`, `ReplaceBoardDialog`, open
  while `nextName !== null`), used by both `ReleasePlanHomePage` and the
  board page, so title, message and "Replace" can't drift.
- `.btn.primary` was **not** ported yet: nothing uses it until `Export PNG`
  in Phase 2 (port it there, under `.rp`).
- A pre-existing flaky zoom test in `ReleasePlanBoardPage.test.tsx` (20s
  timeout under load) was fixed by using `fireEvent` and looking the zoom
  buttons up once; no behavior change.
- QA's minor findings, left open (acceptable): the "Load a plan" modal still
  shows the intro "…to create a board from it."; `TableView` is not keyed by
  `boardKey`, so its search text survives a Load; download anchors stay in
  `body` for 500 ms in tests.

**Tests.** The developer added 19 unit tests (`exportFile.test.ts`,
`ReplaceBoardDialog.test.tsx`, `ImportJsonModal` labels, toolbar and board
page Save/Load); QA added 8 integration tests in
`pages/ReleasePlanSaveLoad.integration.test.tsx` (Save → edit → Load the
captured file → confirm → saved state shown and persisted across a provider
re-mount).

**Verification (2026-10-21).** Client: 41 files, **334/334** Vitest tests
pass (baseline 307); `npx tsc -b` clean; production build OK via the
`$TMPDIR` fallback (`npm run build` hits EACCES on the root-owned `dist`).
Server unchanged, 42 passed. The template/`window.confirm` grep has no
matches. `git diff --stat HEAD --` on the guarded paths is empty (the
`main...HEAD` diff lists only earlier branch commits, not this phase). Docs: TSDoc on the new/changed modules,
README "The board" (Save Plan / Load Plan) and "Autosave"; `CLAUDE.md`
gets only a minimal update (`exportFile`, `ReplaceBoardDialog`), the full
one is Phase 2's.

**Follow-up (2026-10-21).** At the user's request, **Load Plan** / **Save
Plan** got decorative inline-SVG icons: `components/icons/UploadIcon.tsx`
(arrow rising out of a tray) and `DownloadIcon.tsx` (arrow dropping into a
tray), `aria-hidden` + `focusable=false` so the buttons' accessible names are
unchanged; `BoardToolbar` renders them as `<Icon className="btnIcon" />` in
`btn withIcon` buttons (`.rp .btn.withIcon`, `.rp .btn.withIcon .btnIcon` 15px
in `releasePlan.css`). The user also confirmed the autosave key rename
`STORAGE_KEY = "cmPlanningHub.releasePlan.v1"` (was
`cmEstimationsHub.releasePlan.v1`) with **no migration**: a plan under the old
key is ignored (pinned by a test in `storage.test.ts`). Tests: 4 unit tests in
`components/icons/TransferIcons.test.tsx`, +1 in
`pages/ReleasePlanBoardPage.test.tsx`, 3 QA integration tests in
`src/ReleasePlanToolbar.integration.test.tsx`. QA: PASS, no Blocker/Major;
minor, left open: `svgProps` is duplicated across `UploadIcon`,
`DownloadIcon` and `FileJsonIcon`, and the default `h-4 w-4` class is unused
on the board. Verification: client 43 files, **342/342** Vitest tests pass;
`npx tsc -b` clean; build OK via the `$TMPDIR` fallback; server unchanged, 42
passed.

## Phase 2: Export PNG
Status: Not started

Develop (frontend-developer):
- [ ] Copy `specs/assets/cmlogo.svg` to `src/client/src/assets/cmlogo.svg` (byte-identical) and import it as a URL in the PNG hook.
- [ ] Add `lib/releasePlan/png.ts`: `PNG_HEAD = 64`, `pngScale(width, height)` → the largest scale ≤ 2 such that `w*s ≤ 16384`, `h*s ≤ 16384` and `w*h*s² ≤ 16_777_216`, or `null` when that scale is < 1 (`height` includes the header); helpers `rr`, `wrap`, `drawFlagIcon`; `drawBoardPng(ctx, plan, layout, {scale, now, logo})` implementing *Template reference → Export PNG* exactly (header, logo plate, bands, epics, cards, flags). Pure apart from the `ctx` calls.
- [ ] Add `components/releasePlan/useExportPng.ts` (or a plain async function): load the logo `Image` (resolve `null` on error), compute the layout and scale (too large → `showError(["The board is too large to export as PNG."])`), create the canvas, `getContext("2d")` (`null` → `showError(["Could not export the PNG."])`), draw, `toBlob` (`null` → same error), `downloadBlob(blob, fileBase(name, now) + ".png")`, then `showInfo("PNG exported")`. Guard against double clicks while an export is running (button `disabled`).
- [ ] `BoardToolbar`: add `Export PNG` (`.btn.primary`, prop `onExportPng`, `disabled` while exporting), visible in both views.
- [ ] Unit tests with a recording mock 2D context: `pngScale` (small board → 2, wide/tall/area-bound boards → reduced, too large → `null`); `wrap` (fits, wraps, truncates with "…"); `drawBoardPng` (header name/subtitle text incl. `Manual` fallback, logo plate + `drawImage` only when a logo is given, one band fill per band with alternating colors and the Unplanned color, epic title/meta text, one card per Feature in its band's y, done check vs state dot, "?" badge, flag label text with date). Hook tests: success path downloads `<base>.png` + toast; too-large, `getContext` null and `toBlob` null show the error toast and download nothing; logo load failure still exports.

QA (qa-engineer):
- [ ] Review against the *Template reference*; integration test: board (and Table view) → Export PNG with stubbed canvas/`toBlob`/`createObjectURL` → a `.png` download named from the plan name and today's date and the "PNG exported" toast.

Docs (documentation-writer):
- [ ] TSDoc for `png.ts` and the hook; README: Export PNG. Update `CLAUDE.md` (Release Plan: spec Phase 3 complete; `exportFile`/`png` in the `lib/releasePlan/` list; the logo asset copy).

### Verification Plan
- `cd src/client && npx vitest --run` → all tests pass, 0 failures, count above the Phase 1 total.
- `cd src/client && npx tsc -b` → exit 0; production build succeeds (or the `$TMPDIR` fallback).
- `cmp specs/assets/cmlogo.svg src/client/src/assets/cmlogo.svg` → no output (identical).
- Build output contains the logo: `ls "$OUT"/assets | grep -i cmlogo` (or it's inlined as a data URI — check `grep -l "svg" "$OUT"/assets/*.js`).
- Same `grep` for template/`window.confirm` references and the same `git diff --stat` check as Phase 1 → clean.
- Optional manual smoke (not required to pass the phase): `npm run dev`, import a synthetic plan, Export PNG, open the file and check the header, logo plate, bands, cards and flags.

### Phase Summary
_(write when phase completes)_

## Final Recap
_(write when all phases complete: summary of the entire piece of work)_

## Deployment Plan
_(write when all phases complete: step-by-step deployment instructions)_
