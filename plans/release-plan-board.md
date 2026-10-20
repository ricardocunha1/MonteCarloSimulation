# Release Plan — Phases 0–2 (card selection, JSON import + board, drag-and-drop)

Add a second hub tool, **Release Plan**, implementing `specs/release_plan.md`
"Implementation Phases" **0, 1 and 2** (inclusive): a card-selection entry page,
board creation by importing a previously exported JSON plan, the full
interactive board (every non-drag feature of the template), and native HTML5
drag-and-drop. **Client-only** (`src/client`); no server, Docker or Helm
changes. Spec phases 3–5 (in-board JSON import/export + PNG, Azure DevOps
connection, ADO sync) are **out of scope** for this plan.

## Decisions (confirmed with the user, 2026-10-20)
- **Name / routes**: registry entry "Release Plan", `path: "/release-plan"`,
  inline SVG roadmap/flag icon in `components/icons/` (no icon library).
  Routes: `/release-plan` (card selection), `/release-plan/board` (board).
  Titles: "CM Estimations Hub – Release Plan" and "CM Estimations Hub –
  Release Plan – Board". `/release-plan/board` with no plan in the store →
  redirect to `/release-plan`.
- **Phase split**: Phase 1 = the full board with *every* non-drag-and-drop
  template feature (summary cards, milestone bands, frozen label column,
  milestone rename/date/▲▼/delete, "+" insert and gap menu, milestone flags,
  Releases/Sprints switch, Epic ◀▶, zoom/Fit, editable plan name, Table view
  with filters and a milestone select, work-item details modal). Phase 2 = only
  drag-and-drop (Epic reorder, Feature move/reorder, Ctrl/⌘+click
  multi-select, drag ghost, cell highlighting, auto-scroll).
- **Theme**: dark only, to match the hub. Use the template's `[data-theme=dark]`
  palette with no light/dark toggle. The template's own navy header bar and
  logo are dropped (the hub header already has them). The board toolbar sits
  inside the hub's main area.
- **Persistence**: localStorage autosave of the current plan under a single
  key `cmEstimationsHub.releasePlan.v1`, written on every change. Reloading
  `/release-plan/board` restores it, with an info toast "Restored your last
  session". Wrap every storage access in try/catch: when storage is
  unavailable, the app behaves as in-memory.
- **Card page with a saved plan**: show a "Continue last board" action above
  the two cards (plan name + `savedAt`/source info). Importing a new JSON while
  a plan exists asks "Replace the current board?" in a `ConfirmDialog` before
  overwriting.
- **Toolbar in Phases 1–2**: **omit** Load Plan / Save Plan / Export PNG
  (Phase 3 adds them). No dead controls.
- **Dialogs**: no `window.confirm/prompt/alert`. Add a reusable React
  `ConfirmDialog` (native `<dialog>` or an accessible `role="dialog"` modal).
  Informational messages use the hub toasts. `Toast.tsx` gains a
  `showInfo(message)` variant (neutral/navy style, `role="status"`, ~2.2s
  auto-dismiss like the template), and `showError` stays unchanged.
- **Azure DevOps card**: rendered but disabled, with a "Coming soon" badge,
  `aria-disabled="true"`, and no click action (spec Phase 4 enables it).
- **Phase 0 JSON card**: opens the JSON import modal shell (file picker for
  `.json,application/json`, Cancel, "Create board"). In Phase 0, "Create
  board" only checks that a `.json` file was picked (inline error otherwise).
  Phase 1 adds parsing, validation, storing and navigation.
- **JSON validation**: the template rules (see *Template reference → Import
  validation*). Errors show **inline in the modal**, and the modal stays open.
- **Drag-and-drop**: native HTML5 DnD (no new dependency), with behavior
  identical to the template.
- **Workflow**: each phase goes through the orchestrator's Develop → QA →
  Documentation flow (`frontend-developer` → `qa-engineer` →
  `documentation-writer`; at most 3 Develop↔QA cycles). Run it as the main
  session: `claude --agent orchestrator`.
- **Template files are NOT committed** (`specs/templates/features-release-board-example.html`
  and `specs/templates/feature_release_plan_2026-10-20.json`). Everything a
  future agent needs from them is captured in **Template reference** below.
  Tests use synthetic fixtures only and must never import or read from
  `specs/templates/`.

## Baseline (recorded 2026-10-20, before any change)
- Client: 11 test files, **61/61 Vitest tests pass**. `npx tsc -b` is clean.
- `npm run build` fails in this devcontainer with `EACCES ... dist/assets`
  because `src/client/dist/assets` is owned by root (left over from a
  container build). This is environmental, not a code problem. Either run
  `sudo chown -R $USER src/client/dist` (or delete `dist/`), or build with
  `npx tsc -b && npx vite build --outDir "$TMPDIR/rp-dist" --emptyOutDir`.
  Either one counts as "build OK".
- Server: untouched by this plan (sanity check only: `pytest src/server -q`).

## Target architecture (client)
```
src/client/src/
  lib/tools.ts                         + "release-plan" registry entry
  components/icons/RoadmapIcon.tsx     inline SVG
  components/ConfirmDialog.tsx         reusable confirmation modal (portal, uses useDialog)
  components/useDialog.ts              dialog stack (Esc → topmost only), focus trap/restore (Phase 1)
  components/Toast.tsx                 + showInfo
  lib/releasePlan/
    types.ts            ReleasePlan, Epic, Feature, Milestone, Flag, Mode, Iteration
    constants.ts        SCHEMA, VERSION, SIZES, SIZE_COLORS, MS_COLORS, STATE_COLORS,
                        DONE_STATES, ADO colors, OK_GREEN, layout constants L, STORAGE_KEY
    validate.ts         parsePlanFile(text) / normalizePlan(obj) → ReleasePlan | throws PlanValidationError
    selectors.ts        bands, msById/msIndex, allFeatures, isDone, sizeCounts, sizeSummary,
                        epicMilestone, epicMsLabel, iterationLeaf, flagsAfter, orderedFlags,
                        flagForMsIndex, fmtDate, flagSummaryData, milestoneSummaryData
    layout.ts           computeLayout(plan) — pure; shared by the DOM board and Phase 3 PNG export
    reducer.ts          planReducer + action types (all plan mutations, pure)
    sanitize.ts         safeHtml(html) → sanitized HTML string (DOMParser whitelist)
    storage.ts          loadSavedPlan() / savePlan(plan) / clearSavedPlan(), try/catch-wrapped;
                        PlanStorage interface + localPlanStorage
    modeSwitch.ts       modeSwitchRequest(plan, mode) → same | noSprints | confirm(text) (Phase 1)
    zoom.ts             clampZoom / zoomIn / zoomOut / fitZoom / zoomLabel (Phase 1)
    autoScroll.ts       edgeSpeed(y, top, bottom) (Phase 2)
  releasePlanStore.tsx  ReleasePlanProvider (useReducer + autosave effect), useReleasePlan()
  components/releasePlan/
    releasePlan.css     ported template CSS (dark palette), every selector scoped under .rp
    ReleasePlanLayout.tsx  wraps Layout: "Release Plan" heading, title per page
    ImportJsonModal.tsx
    BoardToolbar.tsx    plan name input, source info, Board/Table tabs, Releases/Sprints radio, zoom
    ModeSwitch.tsx      Releases/Sprints radio group + its ConfirmDialog (Phase 1)
    CommitInput.tsx     text input committing on blur/Enter, Esc reverts (Phase 1)
    SummaryCards.tsx    milestone + flag summary boxes
    SizeChips.tsx, SizeBadge.tsx, StateMark.tsx, MilestoneChip.tsx, FlagChip.tsx, FlagIcon.tsx
    Board.tsx           scroll container, frozen column, bands, epic backgrounds, cells, flags, gaps
    MilestoneLabel.tsx, FlagLabel.tsx, GapMenu.tsx
    EpicHeader.tsx, FeatureCell.tsx, FeatureCard.tsx
    TableView.tsx
    WorkItemModal.tsx
    useBoardDrag.ts     drag + selection state & handlers (Phase 2)
  pages/ReleasePlanHomePage.tsx        card selection (+ Continue last board)
  pages/ReleasePlanBoardPage.tsx       board/table page
  test/releasePlanFixtures.ts          synthetic plans (builders), never the template JSON
  test/renderBoard.tsx                 renders the real board page with a plan (Phase 1)
```
- `ReleasePlanProvider` is mounted in **`App.tsx`** around the routes (not in
  `main.tsx` as originally planned; Phase 1 deviation).
  Props: `initialPlan` (skips hydration) and `storage` (a `PlanStorage`,
  default `localPlanStorage`; `null` = in-memory). It lazily hydrates from
  `storage.load()` and persists after every reducer change (`useEffect` on
  `plan`). It exposes `plan`, `dispatch`, `replacePlan(plan)`,
  `restoredFromStorage` and `consumeRestoredNotice()` (true exactly once).
- `ImportJsonModal` takes `onPlanLoaded(plan)` (replacing Phase 0's
  `onFileSelected`); the home page owns the replace confirmation, store
  update and navigation.
- `test/render.tsx` `renderAt` gains an `initialPlan` option (wraps
  `ReleasePlanProvider` with storage disabled or mocked) and stubs for
  `/release-plan` and `/release-plan/board`.
- UI-only state (view board/table, zoom, open modal item, gap menu, table
  filters, Phase 2 drag + selection) stays local to the board page or its
  components, not in the store. This matches the template, where only `state`
  is saved.
- Port the CSS as plain CSS (not Tailwind) because the board is
  absolutely-positioned geometry. Prefix every selector with `.rp` (root
  wrapper class) so nothing leaks into the hub. Chrome outside the board (card
  page, modal frames) may use Tailwind like the rest of the hub.

## Template reference (captured — the template files are not in the repo)

### JSON plan schema (`schema: "release-planner-features"`, `version: 1`)
```jsonc
{
  "schema": "release-planner-features", "version": 1,
  "mode": "releases",                    // "releases" | "sprints"
  "name": "Project – Feature Release Plan",
  "source": { "system": "Azure DevOps", "project": "…", "scope": "Area Path: …", "fetchedAt": "2026-10-16T12:27:00Z" },
  "iterations": [ { "path": "Proj\\Sprint 1", "finishDate": "2026-09-18" } ],   // used by Sprints mode for dates
  "milestones": [ { "id": "ms_40uwnu8", "name": "MVP", "date": "", "color": "#4E98D1" } ], // ordered top→bottom
  "flags": [ { "id": "fl_x", "name": "Milestone", "date": "", "afterMsId": "ms_…" } ],     // Sprints mode only
  "epics": [ {                                                   // ordered left→right
      "id": 1, "title": "Wave 1 - MVP", "state": "New", "description": "<html>",
      "features": [ {                                            // ordered left→right (columns)
          "id": 3, "title": "…", "state": "New", "description": "",
          "size": "XL",                                          // "", XS, S, M, L, XL, XXL (or other upper-cased text)
          "iterationPath": "Project", "milestoneId": "ms_5ku1kkv" // null = Unplanned
      } ] } ],
  "savedAt": "2026-10-20T…Z"
}
```

### Constants
- `SIZES = ["XS","S","M","L","XL","XXL"]`. `SIZE_COLORS` (bg/ink): XS
  `#22A06B/#fff`, S `#8BC34A/#1d3008`, M `#EBC160/#3a2a05`, L `#D8804B/#fff`,
  XL `#B64234/#fff`, XXL `#7A1F16/#fff`, `"?"` `#98A2B3/#fff` (unknown sizes
  fall back to `"?"`).
- `DONE_STATES = ["Resolved","Done","Closed"]` (case-sensitive). These show a
  green ✓ `okmark` (`OK_GREEN #22A06B`).
- `STATE_COLORS`: New `#C7D2E0`, Active `#274B76`, Resolved/Done/Closed
  `#22A06B`. Any other state → `#C7D2E0`.
- `MS_COLORS` (milestone palette, in order): `#4E98D1 #60C5B5 #EBC160 #D8804B
  #B64234 #802D6C #0362A4 #274B76`.
- ADO colors: Epic `#FF7B00` (ink `#1a1206`), Feature `#773B93` (ink `#fff`).
  Drag ghost uses `#009CCC` (ink `#04212e`).
- Layout `L = { FLAG_H:34, LBL_W:180, LEFT:196, TOP:12, EPIC_H:48, GAP_H:14,
  COL_W:160, COL_GAP:8, EPIC_PAD:10, EPIC_GAP:18, CARD_H:84, BAND_PAD:10,
  BAND_MIN:158, RIGHT:24 }`.
- `uid(prefix) = prefix + Math.random().toString(36).slice(2, 9)`, with
  prefixes `ms_` and `fl_`.

### Dark palette (use these as the board's CSS variables, scoped under `.rp`)
`--navy:#274B76 --midblue:#0362A4 --sky:#4E98D1 --teal:#60C5B5 --gold:#EBC160
--orange:#D8804B --red:#B64234 --purple:#802D6C --epic:#FF7B00
--epic-ink:#1a1206 --feature:#773B93 --feature-ink:#fff --story:#009CCC
--story-ink:#04212e --bg:#0E1C30 --panel:#152A47 --panel2:#1B3457
--ink:#E9EFF7 --muted:#9FB3CC --line:#2A4A73 --band-a:#12243D
--band-b:#172C4A --band-line:#2F5180 --unplanned:#2A2617
--epicbg:rgba(255,255,255,.035) --accent:#4E98D1 --link:#4E98D1
--row-epic:rgba(255,123,0,.12) --row-feat:rgba(119,59,147,.16)
--hover:rgba(255,255,255,.06) --input:#0F2036 --shadow:0 1px 3px rgba(0,0,0,.45)`.
Font: `"Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif`, 14px/1.35.

### Key styling (port faithfully)
- **Toolbar**: tabs/radio groups are bordered segmented buttons, and the
  selected one is filled light with dark text. Zoom shows `− 100% + Fit`.
- **Summary** (`.summary`): flex-wrap boxes, min-width 170px, panel bg, 1px
  line border, **3px top border in the milestone color** (`--msc`; gold for
  Unplanned). Each box shows name (bold 13px), date or "No date" ("No
  milestone" for Unplanned), a big count (20px/650) + " Features", size chips,
  and "Epics completed: N" ("Epics with unplanned features: N" for
  Unplanned). Flag boxes use a gold top border with a gold gradient and show
  "Features (cumulative)" and "Epics completed by this flag: N".
- **Board scroll box**: `overflow:auto`, panel bg, 1px line border, radius 8,
  height `calc(100vh - 230px)` (template value), `min-height:380px`. The
  board is absolutely positioned inside a `transform: scale(zoom)` wrapper
  with `transform-origin:0 0`; set the wrapper's width/height to
  `layout × zoom`.
- **Frozen column**: `position:sticky; left:0` with width 0 and overflow
  visible, z-index 15. It holds a panel-colored column of width `LBL_W`, the
  milestone labels, the flag labels and the "+" gap buttons. While the box is
  scrolled horizontally (`scrollLeft > 0`) it gets a shadow:
  `4px 0 8px -2px rgba(0,0,0,.22)`.
- **Bands**: full width, 1px `--band-line` top border, alternating
  `--band-a`/`--band-b` by band index. Unplanned uses `--unplanned`.
  Milestone labels use the same background as their band.
- **Milestone label**: name text input (bold, transparent until hover/focus),
  a color dot + date input (12px muted), stats "`N Features`", size chips, and
  controls ▲ ▼ ✕ (24×22, ✕ turns red on hover; ▲ disabled on the first
  milestone, ▼ on the last), titled "Move milestone up", "Move milestone
  down" and "Delete milestone (features become unplanned)". The Unplanned label shows a bold "Unplanned",
  "`N Features · not assigned`" and size chips.
- **Epic background**: rounded 8, `--epicbg`, 1px dashed `--line`, from
  `bandY0-4` to `height-8`.
- **Epic header**: orange `--epic`, radius 6, height `EPIC_H`, with ◀ and ▶
  buttons (22×22, translucent white) on the sides. The center shows the title
  (bold 15px, ellipsis) and a meta line "`Epic #<id> · <epicMsLabel>`" (11px,
  .75 opacity). It shows `cursor:grab` (Phase 2 makes it draggable).
- **Feature card**: purple `--feature`, white ink, radius 4, height `CARD_H`,
  padding 6/7, shadow. Top row: state mark + "Feature #id" on the left and the
  size badge on the right. The badge is a white pill with `#4a1f60` text; an
  unestimated badge shows "?" on translucent white. Title is bold 12.5px,
  clamped to 2 lines. A done card shows the okmark. A selected card (Phase 2)
  gets a 3px gold outline and a gold ✓ circle bottom-right. A dragging card
  gets opacity .35–.4.
- **Cell states (Phase 2)**: `.valid` = `rgba(78,152,209,.10)` bg with a 2px
  dashed sky outline. `.over` = `rgba(78,152,209,.25)`. `.invalid` = opacity
  .4. `.dropL`/`.dropR` = 4px inset gold bar on the left/right. Epic drop
  indicator = 5px sky box-shadow on the left/right.
- **Flags**: the flag row is a dashed gold horizontal line (14px dash, 6px gap,
  3px thick). The flag label in the frozen column is gold with dark ink
  `#3a2a05` and shows a flag icon, the name input, a 📅 button, a hidden date
  input and ✕. A gold pill tag on the row shows "name · date". Flag SVG path:
  `M5 22V3h1.8v1H19l-2.6 4.5L19 13H6.8v9z` (viewBox 24).
  Geometry: the flag label box sits at `left 0, top y+4, width LBL_W-14,
  height h-8`; the row starts at `left LBL_W` and its tag at `left:
  LEFT-LBL_W+6` (relative to the row). The 📅 title is "Set flag date"
  plus " (<fmtDate>)" when a date is set.
- **"+" gap button**: 22px circle at `left: LBL_W-11, top: gap.y-11`, opacity
  .55, which goes to 1 and scale 1.15 with accent fill on hover/focus. Title
  "Add a sprint or a milestone flag here" (Sprints) / "Add a milestone here"
  (Releases); `aria-label` "Insert after <milestone name>".
- **Work-item modal**: max width 760px. The header has a 6px top border in the
  type color, a type pill ("EPIC" orange / "FEATURE" purple), `#id` and a ✕
  close button. The body has the title h2 (20px) and a crumb line ("Epic:
  <link>" for a Feature; "`N Features · <sizeSummary>`" for an Epic), a meta
  grid (`repeat(auto-fill,minmax(150px,1fr))`, uppercase 11px labels), a
  "Description" section and, for an Epic, a "Features" list. A missing meta
  value shows "–". The ✕ has `title="Close (Esc)"` and gets focus on open and
  on every Epic⇄Feature navigation (the body also scrolls back to the top).
- **Table**: header row is sticky, uppercase 12px muted. Epic rows have
  `--row-epic` bg and bold text. Feature rows have `--row-feat` bg and the
  title indented 24px. Type pills are "EPIC"/"FEATURE". The table has
  `min-width:900px`. Column widths: ID 90, State 120, Estimated size 150,
  Milestone 220, Milestone flag 150 (Title takes the rest). The Feature State
  cell is `white-space:nowrap`. Title links have `title="Show details"`.
- **Chips**: a milestone chip uses the milestone color for text and border
  with a `color+"2e"` background. The Unplanned chip is gold.

### Selectors / derived data
- `bands()` = milestones in order + a synthetic `{id:null, name:"Unplanned", unplanned:true}` last.
- `sizeCounts(feats)` counts `size || "?"`. Order: `SIZES`, then other sizes
  (sorted), then `"?"`. Zero counts are left out. `sizeSummary` =
  `"S×2 · M×3"`, or `"–"` when empty. `SizeChips` shows "No features" when
  empty; each chip shows `<b>K</b> N` and has the title "`N Feature(s) of size
  K`" or "not estimated".
- `epicMilestone(e)` = the latest milestone index among its Features, plus the
  `unplanned` count and the `total`. `epicMsLabel`: no features → "No
  features"; all unplanned → "Unplanned"; some unplanned → "`<ms> · N
  unplanned`"; otherwise "`Done in <ms>`".
- An epic is counted as "completed" in milestone X when it has no unplanned
  Features and its latest milestone is X. The Unplanned box counts epics with
  any unplanned Feature.
- Flag summary (cumulative): Features whose milestone index ≤ the flag's
  `afterMsId` index, plus completed epics whose milestone index ≤ that index.
- `iterationLeaf(f)` = the last `\`-separated term of `iterationPath`, but only
  when the path has more than one term (a project-root-only path gives no
  sprint).
- `flagsAfter(msId)`; `orderedFlags()` = flags in milestone order;
  `flagForMsIndex(i)` = the first ordered flag whose `afterMsId` index ≥ i
  (none when i < 0).
- `fmtDate("YYYY-MM-DD")` → `toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"})`
  of `new Date(d+"T00:00:00")`. Empty input → "". An invalid date returns the
  input unchanged.
- Source info line: `(source.system || "Manual") + (scope ? " · " + scope : "") + (fetchedAt ? " · fetched " + new Date(fetchedAt).toLocaleString() : "")`.

### Layout (`computeLayout`)
- `x` starts at `LEFT`. For each epic, `n = max(1, features.length)` and
  `w = 2*EPIC_PAD + n*COL_W + (n-1)*COL_GAP`. Feature column `i` sits at
  `x + EPIC_PAD + i*(COL_W+COL_GAP)`. The next epic starts at `x += w +
  EPIC_GAP`.
- `width = max(x - EPIC_GAP + RIGHT, 700)`. `bandY0 = TOP + EPIC_H + GAP_H`.
- Every band's height is `max(BAND_MIN, 2*BAND_PAD + CARD_H + 18)`. After each
  non-Unplanned band, add each of its flags as a row of height `FLAG_H`, then
  a gap `{idx: msIndex+1, y, afterMsId}` (so there is no "+" before the first
  milestone). `height = y + 12`.

### Behaviors (Phase 1)
- **Card click** → opens the work-item modal. **Epic title click** → opens the
  Epic modal. Accessibility (Phase 1 choice): the card is a `div
  role="button"` with `tabIndex=0` that also opens on Enter/Space; the Epic
  title is a `<button>`; milestone/flag labels and summary boxes are
  `role="group"`; the Releases/Sprints radio group is labelled "Milestones
  as". In the modal, the Epic crumb link and the Epic's feature list
  items navigate between items. Closing works through ✕, Esc and a backdrop
  click. Descriptions render through `safeHtml`; an empty one shows "No
  description in Azure DevOps." in italics.
- **safeHtml whitelist**: keep `P BR B STRONG I EM U S UL OL LI A DIV SPAN
  H1–H6 CODE PRE BLOCKQUOTE TABLE THEAD TBODY TR TD TH HR SUB SUP`. Drop the
  whole subtree of `SCRIPT STYLE IFRAME OBJECT EMBED LINK META IMG SVG FORM
  INPUT BUTTON TEXTAREA SELECT`, and drop comments. Unwrap any other tag.
  Strip every attribute, except that `A` keeps an `http(s)` href and gets
  `target=_blank rel="noopener noreferrer"`. Compare **upper-cased** tag names:
  SVG/MathML elements report a lower-case `tagName`, so the template's own
  `SVG` drop rule never matched them (fixed here). The HTML is parsed into
  `body`, so head-only content such as a leading `<title>` text is dropped.
- **Modal meta**: State (mark + text). For a Feature: Estimated size,
  Milestone chip, Milestone flag (only when flags exist), Iteration Path. For
  an Epic: Features count, Done features count, "Delivered in" (chip, or "N
  unplanned"), Milestone flag (only when flags exist).
- **Name inputs** (plan, milestone, flag) behave like the template's `change`
  listener: they commit on blur or Enter (`CommitInput`), and Esc reverts the
  draft, so trimming/defaults never fight typing.
- **Plan name** input: on change, trim; an empty name becomes "Feature Release
  Plan". Its width is `name.length + 3` ch.
- **Milestone label**: name change → trim, empty becomes "Milestone". Date
  change sets the date. ▲/▼ swap the milestone with its neighbor. ✕ asks
  through ConfirmDialog (title "Delete milestone", confirm "Delete") "`Delete
  milestone "<name>"? Its N features become unplanned.`"; on OK its features → `milestoneId:null`, its flags move to the
  previous milestone (or are removed if there is none), and the milestone is
  removed.
- **Epic ◀/▶**: move the epic one position left/right (a no-op at the ends).
- **"+" gap**: in Releases mode, insert a milestone at `idx` named
  "`Release <n>`", where n starts at `milestones.length` and increments until
  the name is unused. In Sprints mode, open the gap menu instead, with "**+**
  Add sprint here" (inserts "New Sprint") and "⚑ Add milestone flag here"
  (`{name:"Milestone", date: ms.date || "", afterMsId}`). The new milestone's
  color is the first `MS_COLORS` entry not in use, else `MS_COLORS[len %
  8]`. The new milestone/flag name input gets focus with its text selected and
  is scrolled into view. Toasts: "Milestone added" / "Sprint added" / "Milestone
  flag added after <ms>". The gap menu closes on an outside click (a click on
  any `.addgap` "+" button is ignored), on Esc, and on a board scroll more
  than 400ms after it opened. It is `position:fixed` at `left = min(rect.right
  + 6, innerWidth - w - 8)`, `top = min(rect.top - 4, innerHeight - h - 8)`
  (`rect` = the "+" button, `w`/`h` = the menu size), and its first item gets
  focus (↑/↓ move between items).
- **Flag label**: name change (trim, empty → "Milestone"); 📅 calls
  `showPicker()` on the hidden date input, and if that throws, reveals the date
  input inline instead (no `prompt`); ✕ removes the flag.
- **Releases/Sprints switch** (no-op when the mode is already selected). The
  switch to Sprints first collects the unique iteration leaves of all Features
  in natural sort order (`localeCompare(…, {numeric:true,
  sensitivity:"base"})`). If there are none, it shows the toast "No Iteration
  Paths below the project root were found" and aborts. Otherwise it confirms
  with the template text (keep it verbatim):
  - Sprints: "Switch milestones to Sprints?\n\nThe current milestones will be
    replaced by N sprints (a, b, …) and ALL Features will be reset to their
    initial milestone: the sprint of their Iteration Path (e.g. <first>)." +
    (if some have no sprint) "\nK Features without a sprint will go to
    Unplanned." + "\n\nAny manual planning (and milestone flags) will be lost.
    Save the plan first if you want to keep it."
  - Releases: "Switch milestones to Releases?\n\nThe current milestones will be
    replaced by a single "MVP" milestone and ALL Features will be reset to their
    initial milestone: MVP.\n\nAny manual planning (and milestone flags) will be
    lost. Save the plan first if you want to keep it."
  - The ConfirmDialog title is "Switch milestone type", confirm label
    "Switch".
  - On OK, Sprints mode creates one milestone per leaf. Its date is the
    `finishDate` of the iteration whose path leaf matches, and its color is
    `MS_COLORS[i%8]`. Each Feature goes to its leaf's milestone (or `null`).
    Releases mode creates a single `MVP` (`MS_COLORS[0]`) and puts every
    Feature in it. Both clear the flags, set the mode, and show the toast
    "Milestones switched to Sprints/Releases". `ConfirmDialog` must render the
    `\n` line breaks (`white-space: pre-line`).
- **Zoom**: −/+ change it in steps of 0.1, clamped to [0.3, 1.5] and rounded
  to 2 decimals. Fit = `min(1, (scrollBox.clientWidth - 4) / layout.width)`.
  The label shows `round(zoom*100)%`. Zoom controls are hidden in Table view.
- **Table view**: filters are a text search (title or ID, matched on the Epic
  or the Feature), an Epic select ("All Epics"), and a milestone select ("All
  milestones", each milestone, "Unplanned"). A filter keeps its value when it
  is still valid after a re-render. An Epic row is shown only if at least one
  of its Features matches. Epic row: `#id`, EPIC pill + title link, state,
  `sizeSummary`, a milestone chip (or Unplanned, with "(latest: X, N
  unplanned)"), and a flag cell. Feature row: `#id`, FEATURE pill + title link,
  state, size badge, a milestone `<select>` ("Unplanned" plus "name (date)"
  options; a change sets `milestoneId`), and a flag cell. The flag column is
  hidden when there are no flags. The count line reads "`N features shown`".
- **Hint** above the board (Phase 1 text, without the drag sentences): "Click
  any work item to see its description. Use the **+** between milestones to
  insert a new one (in Sprint mode, also a milestone flag). ✓ = Resolved / Done
  / Closed." Phase 2 prepends: "Drag Epics to reorder them. Drag a Feature card
  up or down to move it to another milestone, or onto another column of the
  same Epic to reorder it. **Ctrl+click** (⌘+click on Mac) selects several
  Features of the same Epic to move them together."
- **Card tooltip** (`title`): "`<title>\nState: <state|->\nEstimated size:
  <size|not estimated>\nIteration: <path|->\nClick to see the description`".
  Phase 2 appends " · Ctrl+click to select several features of this Epic".

### Import validation (`normalizePlan`)
1. The input must be an object with `schema === "release-planner-features"`.
   If `schema === "release-planner"`, throw "This is a User Story plan. Open
   it in the User Story board.". Otherwise throw "Not a Feature release plan
   file (schema missing).". Invalid JSON → "Could not read the file: it is not
   valid JSON.".
2. `milestones` and `epics` must be arrays, else "Missing milestones or epics.".
3. For each epic, `description ??= ""` and `features ||= []`. For each
   feature, `milestoneId` → `null` when it is not a known milestone id, and
   `iterationPath ??= ""`, `description ??= ""`, `size ??= ""` (upper-cased
   and trimmed).
4. Any milestone color not in `MS_COLORS` → `MS_COLORS[i % 8]`.
5. A `mode` other than `"sprints"` → `"releases"`.
6. `flags`: keep only the entries whose `afterMsId` is a known milestone, and
   fill defaults `{id || uid("fl_"), name || "Milestone", date || "",
   afterMsId}`. Outside Sprints mode, set `flags = []`.
7. `iterations ||= []`. `name ||= "Feature Release Plan"`. `source ||= {}`.
8. (Phase 1 addition) A milestone, epic or feature entry that is not an object
   throws "Invalid plan file: every milestone, epic and feature must be an
   object.". Non-string text fields are coerced to strings (`null`/missing →
   `""`), and a milestone without an id gets `uid("ms_")`.
- Replacing an existing board: ConfirmDialog title "Replace the current
  board?", message `The current board "<old>" will be replaced by "<new>".
  Changes to the current board will be lost.`, confirm "Replace".
- Template behavior that is **dropped**: back-filling from the embedded ADO
  response (`MCP_RESPONSE`), because there is none here.

### Drag-and-drop rules (Phase 2)
- **Epic drag**: the whole Epic header is `draggable`, except the ◀/▶ buttons,
  which are `draggable=false`. `dragstart` sets `drag={type:"epic",id}`,
  `effectAllowed="move"`, `setData("text/plain","epic:<id>")`, and (next tick)
  `.dragging`. `dragover` on another epic header calls `preventDefault` and
  shows `.dropR` when `clientX > rect.left + rect.width/2`, else `.dropL`.
  `drop` removes the dragged epic and inserts it before/after the target.
  `dragend`/`dragleave` clear the classes.
- **Feature drag**: `dragstart` first clears the selection unless the card is
  part of it. `ids` = the selected Features of that Epic in column order, or
  `[f.id]`. `drag={type:"feature",ids,epicId}`. For a multi-drag, use a
  `#dragGhost` element ("`N features`") with `setDragImage(g,10,10)`. On the
  next tick, add `.dragging` to the dragged cards, add `.valid` to every cell
  of the same Epic, and add `.invalid` to all others.
- **Cell dragover/drop**: accepted only for a feature drag with the same
  `epicId`. `reorder = ids.length === 1 && ids[0] !== cell's feature id`. On
  dragover: `preventDefault`, `dropEffect="move"`, `.over`, plus
  `.dropL`/`.dropR` when reordering (side by `clientX` vs the cell midpoint).
  On drop: if reordering, move the dragged feature before (L) or after (R) the
  target feature in `epic.features`. Then **every dragged id** gets
  `milestoneId = cell band's id` (null for Unplanned). Clear the selection and
  commit. `dragleave` clears only when `relatedTarget` is outside the cell.
  `dragend` clears every `.valid/.invalid/.over/.dropL/.dropR/.dragging`.
- **Selection**: Ctrl/⌘+click toggles a Feature in the selection. The
  selection is limited to one Epic: Ctrl+clicking in another Epic resets it.
  A plain click clears the selection and opens the modal. Esc clears it, and
  so does a click on the board background (not on a card, no modifier). The
  selection is not persisted.
- **Auto-scroll**: while a drag is active, a document `dragover` records
  `clientY` and starts a `requestAnimationFrame` loop. `edgeSpeed(y, top,
  bottom)` with `EDGE = min(70, (bottom-top)/4)` and `MAX = 24` returns a
  negative speed near the top and a positive one near the bottom, scaled
  linearly, else 0. The loop scrolls the board box first (bounded by
  `[max(rect.top,0), min(rect.bottom, innerHeight)]`, only if there is room in
  that direction), else the window. It stops on `dragend`/`drop` (capture
  phase) and on unmount.

## For Future Agents
As work proceeds: mark checkboxes `- [x]` as items complete. When a phase is
done, set its status to `Complete` and write its **Phase Summary** (what was
done, key decisions, anything needed to continue with zero context). Run the
phase's **Verification Plan** and record the result (test counts, build
result) before moving on. Each phase runs Develop (`frontend-developer`) → QA
(`qa-engineer`, at most 3 Develop↔QA cycles) → Docs (`documentation-writer`),
driven by `claude --agent orchestrator`. Do not start a phase before the
previous one is `Complete`. Never read or import `specs/templates/*` from
code or tests. The **Template reference** above is the behavioral source of
truth for the board. If the template files are still present locally, you may
use them to resolve an ambiguity, but record any new rule you derive here. When
all phases are done, fill in **Final Recap** and **Deployment Plan**. Later
spec phases (3–5) should be added as new phases in this file, following the
same format.

## Phase 0: Release Plan entry page (card selection)
Status: Complete   <!-- Not started | In progress | Complete -->

Develop (frontend-developer):
- [x] Add `components/icons/RoadmapIcon.tsx` (inline SVG, `className` prop, `aria-hidden`), following the `DiceIcon` pattern.
- [x] Add a `release-plan` entry to `ESTIMATION_TOOLS` in `lib/tools.ts` (name "Release Plan", path `/release-plan`, a one-line description such as "Plan Feature releases on an interactive drag-and-drop board.", and a goal such as "Decide which Features ship in which release or sprint, per Epic."). The sidebar and home card then pick it up automatically.
- [x] Add `components/releasePlan/ReleasePlanLayout.tsx`: wraps `Layout` with a "Release Plan" view heading and sets the page title ("CM Estimations Hub – Release Plan" / "… – Board").
- [x] Add `components/ConfirmDialog.tsx`: an accessible modal (`role="dialog"`, `aria-modal`, labelled title, message rendered with `white-space: pre-line`, Confirm/Cancel buttons, Esc = cancel, focus on the confirm button, closes on a backdrop click). Its API is `({open, title, message, confirmLabel, onConfirm, onCancel})` or a `useConfirm()` hook returning `confirm(opts): Promise<boolean>` (pick one and document it in the Phase Summary).
- [x] Add `showInfo(message: string)` to `components/Toast.tsx`: neutral/navy style, `role="status"`, auto-dismiss after about 2.2s. Leave the `showError` behavior and its tests unchanged.
- [x] Add `pages/ReleasePlanHomePage.tsx` at `/release-plan` with two cards: (1) "Create from Azure DevOps", disabled with a "Coming soon" badge, `aria-disabled="true"` and no handler; (2) "Import a JSON file", which opens `ImportJsonModal`.
- [x] Add `components/releasePlan/ImportJsonModal.tsx` (shell): a title, a file input (`accept=".json,application/json"`) showing the chosen file name, Cancel, and "Create board". In Phase 0, "Create board" with no file, or a non-`.json` name, shows an inline error "Select a .json file."; with a valid file it does nothing more yet (Phase 1 wires it).
- [x] Add a route `/release-plan` → `ReleasePlanHomePage` in `App.tsx`.
- [x] Add `/release-plan` and `/release-plan/board` stubs to `test/render.tsx`.
- [x] Unit tests:
  - Sidebar lists Monte Carlo and Release Plan, and Release Plan is active on `/release-plan/*`.
  - HubHomePage shows both tool cards.
  - ReleasePlanHomePage: the ADO card is disabled and clicking it does nothing; the JSON card opens the modal.
  - ImportJsonModal: Cancel closes; missing or wrong file shows the inline error.
  - ConfirmDialog: confirm/cancel/Esc behave as specified.
  - `showInfo` renders and auto-dismisses (fake timers).

QA (qa-engineer):
- [x] Review against `specs/release_plan.md` "Usability" and this plan's Decisions. Add an integration test in `App.integration.test.tsx`: home → Release Plan card → `/release-plan` → open the modal.

Docs (documentation-writer):
- [x] TSDoc on the new components/hooks. Mention the Release Plan tool in README's feature list.

### Verification Plan
- `cd src/client && npm test -- --run` → all pass (≥ 61 + the new tests, 0 failures).
- `cd src/client && npx tsc -b` → no errors. `npx vite build --outDir "$TMPDIR/rp-dist" --emptyOutDir` → "built" (see Baseline about `dist/` ownership).
- `grep -rnE "window\.(confirm|alert|prompt)|\balert\(" src/client/src --include=*.tsx --include=*.ts | grep -v test` → no output.
- `git diff --stat main...HEAD -- src/server helm deploy docker-compose.yml` → empty (client-only).

### Phase Summary
**Built (client-only, `src/client/src`):**
- `lib/tools.ts`: second registry entry `release-plan` ("Release Plan",
  `/release-plan`, `RoadmapIcon`); the sidebar and home cards pick it up.
- `App.tsx`: route `/release-plan` → `ReleasePlanHomePage`. `/release-plan/board`
  is not routed yet (unknown → `/`); `test/render.tsx` already stubs both
  `/release-plan` and `/release-plan/board`.
- `components/icons/RoadmapIcon.tsx`, plus two icons not in the original
  plan: `DatabaseIcon.tsx` (ADO card) and `FileJsonIcon.tsx` (JSON card). All
  follow the `DiceIcon` pattern (`className`, `aria-hidden`, `focusable=false`).
- `components/releasePlan/ReleasePlanLayout.tsx`: wraps `Layout` with a
  "Release Plan" `<h2>`; optional `page` prop → title
  "CM Estimations Hub – Release Plan[ – <page>]" (Phase 1 passes `"Board"`).
- `components/releasePlan/ImportJsonModal.tsx` (shell): `{open, onClose,
  onFileSelected?}`. "Create board" without a file whose name ends in `.json`
  (case-insensitive) shows the inline `role="alert"` "Select a .json file." and
  stays open; with one it calls `onFileSelected(file)`, which the home page does
  not pass yet. Reopening resets the file and error. Phase 1 wires parsing,
  validation, storing and navigation through `onFileSelected`.
- `pages/ReleasePlanHomePage.tsx`: disabled "Create from Azure DevOps" card
  (`role="button"`, `aria-disabled="true"`, `tabIndex=-1`, "Coming soon" badge,
  no handler) and an "Import a JSON file" `<button>` card opening the modal.
- `components/Toast.tsx`: toasts are now a union (`kind: "error" | "info"`).
  `showInfo(message)` renders a navy (`--cm-dark-blue`) `role="status"` toast
  auto-dismissed after 2.2s (no hover pause). `showError` is unchanged.
- `components/ConfirmDialog.tsx`: see below. Not used by any page yet (Phase 1
  uses it for "Replace the current board?").

**ConfirmDialog API choice:** the controlled props API
`({open, title, message, confirmLabel, cancelLabel?, onConfirm, onCancel})`,
not a `useConfirm()` hook. It matches the existing `HelpModal` pattern and
needs no provider. A call site keeps its own "pending" state (e.g. the parsed
plan waiting to replace the current one) and renders one `<ConfirmDialog>`,
closing it from `onConfirm`/`onCancel`. The message uses
`white-space: pre-line`; Esc and a backdrop click call `onCancel`; the confirm
button gets focus on open and the previous focus is restored on close.

**QA Minor findings Phase 1 must handle (deferred, not fixed in Phase 0):**
- Both `ImportJsonModal` and `ConfirmDialog` register their Esc listener on
  `document`. When Phase 1 opens `ConfirmDialog` on top of `ImportJsonModal`,
  one Esc would close **both**. Scope Esc to the topmost dialog (e.g. a
  listener on the dialog element, or `stopImmediatePropagation` plus a stack).
- Their open effects depend on the callback identity (`[open, onClose]` /
  `[open, onCancel]`). An inline (non-memoized) callback re-runs the effect on
  every parent render: focus jumps back to the input/confirm button, and
  `ImportJsonModal` also resets its chosen file and error. Keep callbacks
  stable (`useCallback`, as `ReleasePlanHomePage` does) or hold them in a ref.
- No focus trap in either dialog (Tab can leave the modal).
- The disabled ADO card's accessible name is verbose (it is the whole card
  text, badge included).
- Toasts are not in a persistent live region (each toast element carries its
  own role), so some screen readers may not announce them reliably.

**Flaky test:** the existing Monte Carlo flow tests in
`App.integration.test.tsx` (several renders, an upload, typing and two mocked
fetches) took 2.3–3.4s under a loaded full-suite run and occasionally exceeded
Vitest's 5s default test timeout; it was not an app bug. Fixed in the test
only: a 20s per-test timeout (`FLOW_TIMEOUT_MS`) on the flow tests and a 5s
timeout for their `findBy` waits (instead of the 1s default). QA also added the Release Plan flow (home → Release Plan card →
`/release-plan` → open the modal) and sidebar tool-switch tests.

**Verification (2026-10-20):** `npm test -- --run` → 94/94 tests in 16 files
pass; `npx tsc -b` clean; `npx vite build` to the scratchpad output dir →
built OK; `pytest src/server -q` → 42 passed. Diff is client-only (the
pre-existing `helm/` working-tree changes are unrelated to this plan).

## Phase 1: Board creation by importing a JSON file (full non-DnD board)
Status: Complete

Develop (frontend-developer) — pure logic first, then UI:
- [x] `lib/releasePlan/types.ts` and `constants.ts`: the types and every constant from *Template reference → Constants*, plus `STORAGE_KEY = "cmEstimationsHub.releasePlan.v1"`.
- [x] `lib/releasePlan/validate.ts`: `parsePlanFile(text)` (JSON.parse, mapping a syntax error to the "not valid JSON" message) and `normalizePlan(obj)` implementing *Import validation* exactly. It throws `PlanValidationError` (an `Error` subclass) with the listed messages and never mutates its input (it works on a structured clone).
- [x] `lib/releasePlan/selectors.ts`: every function listed in *Selectors / derived data*.
- [x] `lib/releasePlan/layout.ts`: `computeLayout(plan)` returning `{epics:[{epic,x,w,cols:[{feature,x}]}], bands:[{band,y,h}], flags:[{flag,y,h}], gaps:[{idx,y,afterMsId}], width, height, bandY0}`, exactly per *Layout*.
- [x] `lib/releasePlan/reducer.ts`: a pure `planReducer` with these actions: `replace`, `rename`, `setMode` (holds the reset logic described in *Releases/Sprints switch*; the confirmation stays in the UI), `insertMilestone(idx)`, `renameMilestone`, `setMilestoneDate`, `moveMilestone(from,to)`, `deleteMilestone(id)`, `addFlag(afterMsId)`, `renameFlag`, `setFlagDate`, `removeFlag`, `moveEpic(from,to)`, `setFeatureMilestone(featureId, msId|null)`. `uid` is injectable (or mockable) so tests are deterministic.
- [x] `lib/releasePlan/sanitize.ts`: `safeHtml(html): string` per the whitelist. It works in jsdom.
- [x] `lib/releasePlan/storage.ts`: `loadSavedPlan()` (parse + `normalizePlan`; returns `null` on any error), `savePlan(plan)`, `clearSavedPlan()`, all try/catch-wrapped.
- [x] `releasePlanStore.tsx`: `ReleasePlanProvider` (`useReducer`, lazy init from storage, saves after each change, `restoredFromStorage` flag, `initialPlan`/`storage` override props for tests) and `useReleasePlan()`. Mount it in `main.tsx` (done in `App.tsx` instead; see Phase Summary).
- [x] `ImportJsonModal` wiring: read the file with `File.text()`, then `parsePlanFile`. On error, show `error.message` inline and keep the modal open. On success, if a plan already exists, confirm "Replace the current board?" (ConfirmDialog); then `replacePlan`, close, navigate to `/release-plan/board`, and show the toast "Plan loaded: <name>".
- [x] `ReleasePlanHomePage`: when the store has a plan, show a "Continue last board" action (plan name + source info line) that links to `/release-plan/board`.
- [x] `pages/ReleasePlanBoardPage.tsx` at `/release-plan/board`: redirect to `/release-plan` when there is no plan. Show the toast "Restored your last session" once when `restoredFromStorage`. It renders the `.rp` root, `BoardToolbar`, `SummaryCards`, then Board or Table. Register the route in `App.tsx`.
- [x] `components/releasePlan/releasePlan.css`: port the template CSS with the dark palette, every selector scoped under `.rp`, light-theme rules dropped, toolbar restyled to sit in the hub main area (not a sticky navy header). Import it from the board page.
- [x] Small presentational components: `SizeChips`, `SizeBadge`, `StateMark`, `MilestoneChip`, `FlagChip`/`FlagIcon`.
- [x] `BoardToolbar`: plan name input, source info, Board/Table tabs (`role=tab`, `aria-selected`), Releases/Sprints radio group (`role=radio`, `aria-checked`, wired to ConfirmDialog + `setMode` + toasts), and zoom controls (hidden in Table view). No Load/Save/Export.
- [x] `SummaryCards`: milestone boxes, the Unplanned box and flag boxes per *Key styling* / *Selectors*.
- [x] `Board`: scroll box, frozen column (with the `scrolledX` shadow), zoom scaling, bands, `MilestoneLabel`, epic backgrounds, `EpicHeader` (◀▶, title click → modal), `FeatureCell`/`FeatureCard` (click → modal, tooltip), flag rows with `FlagLabel`, "+" gap buttons with `GapMenu`, and focus/select of a newly added milestone/flag name. Nothing is draggable yet. The hint uses the Phase 1 text.
- [x] `TableView` per *Behaviors → Table view*.
- [x] `WorkItemModal` per *Behaviors* (uses `safeHtml` via `dangerouslySetInnerHTML` of the sanitized string, and supports Epic⇄Feature navigation).
- [x] `test/releasePlanFixtures.ts`: synthetic builders, e.g. `makePlan({epics, milestones, flags, mode})`. They cover at least: 3 epics with mixed sizes (including "" and an unknown size), done and not-done states, unplanned Features, iteration paths with and without a sprint leaf, iterations with `finishDate`, a Sprints-mode plan with flags, and an HTML description containing `<script>`, `<img onerror>` and `javascript:` links. Never derived from the template JSON.
- [x] Unit tests:
  - `validate`: every error message, every normalization rule, input not mutated.
  - `selectors`: sizeCounts ordering, epicMsLabel's 4 cases, flagForMsIndex, iterationLeaf.
  - `layout`: exact coordinates for a small plan, width minimum 700, flags/gaps placement, no gap before the first milestone.
  - `reducer`: every action, including deleteMilestone flag re-homing, insertMilestone naming/color, and setMode for both modes, including the dates from iterations, natural sort and the no-sprint → null case.
  - `sanitize`: whitelist, dropped subtrees, href rules.
  - `storage`: round-trip, corrupt data → null, a throwing `localStorage`.
  - Component tests: import flow (success → board, error stays in modal, replace confirmation); Continue last board; board renders the bands, epics, cards and summary counts; milestone rename/date/▲▼/delete-with-confirm; "+" in both modes; flags add/rename/remove; mode switch confirm/cancel/no-iterations toast; zoom −/+/Fit clamps; Table filters and milestone select; modal content and navigation; redirect when there is no plan; restored toast.

QA (qa-engineer):
- [x] Review against `specs/release_plan.md` and every rule in *Template reference* (Phase 1 parts). Check that component structure is modular (no god component; logic in `lib/releasePlan`). Check that nothing reads `specs/templates`.
- [x] Integration test: home → `/release-plan` → import a synthetic JSON → board shows the expected summary → switch to Table → change a Feature's milestone → reload simulation (re-mount the provider with the same storage) restores the plan.

Docs (documentation-writer):
- [x] TSDoc for `lib/releasePlan/*`, the store and the components. Add a README section on the Release Plan tool (JSON import, the autosave key, the fact that Azure DevOps is coming).
- [x] Update `CLAUDE.md` "Architecture → src/client" with the Release Plan routes, store, `lib/releasePlan`, scoped CSS, and a pointer to this plan's *Template reference*.

### Verification Plan
- `cd src/client && npm test -- --run` → all pass, 0 failures (record the count).
- `cd src/client && npx tsc -b` → clean. Vite build to `$TMPDIR/rp-dist` succeeds.
- `grep -rn "specs/templates\|feature_release_plan" src/client/src` → no output.
- `grep -rnE "window\.(confirm|alert|prompt)" src/client/src | grep -v "\.test\."` → no output.
- `grep -rn "draggable" src/client/src/components/releasePlan` → no output (DnD belongs to Phase 2).
- `grep -rnE "^[^.@/ ]" src/client/src/components/releasePlan/releasePlan.css | grep -v "^\s*\.rp\|^\s*}\|^\s*/\*\|^\s*@"` → no unscoped top-level selectors (or review manually and record).
- `git diff --stat main...HEAD -- src/server helm deploy` → empty.

### Phase Summary
**Built (client-only, `src/client/src`; no server/Docker/Helm change):**
- `lib/releasePlan/` (pure, unit-tested): `types`, `constants`
  (`STORAGE_KEY = "cmEstimationsHub.releasePlan.v1"`, `uid`, `IdFactory`),
  `validate` (`parsePlanFile`/`normalizePlan` → `PlanValidationError`),
  `selectors`, `layout` (`computeLayout`), `reducer`
  (`createPlanReducer(makeId)` / `planReducer` with the 14 actions `replace`,
  `rename`, `setMode`, `insertMilestone`, `renameMilestone`,
  `setMilestoneDate`, `moveMilestone`, `deleteMilestone`, `addFlag`,
  `renameFlag`, `setFlagDate`, `removeFlag`, `moveEpic`,
  `setFeatureMilestone`; `insertMilestone`/`addFlag` accept an optional `id`
  so the UI can focus the new name input), `sanitize` (`safeHtml`), `storage`
  (`PlanStorage`, `localPlanStorage`, `loadSavedPlan`/`savePlan`/
  `clearSavedPlan`), plus two modules not in the original plan: `modeSwitch`
  (`modeSwitchRequest` → `same` / `noSprints` / `confirm` with the verbatim
  template text) and `zoom` (`clampZoom`, `zoomIn`, `zoomOut`, `fitZoom`,
  `zoomLabel`).
- `releasePlanStore.tsx`: `ReleasePlanProvider({initialPlan?, storage?})`,
  where `storage={null}` means in-memory, and `useReleasePlan()` →
  `{plan, dispatch, replacePlan, restoredFromStorage, consumeRestoredNotice}`.
  `consumeRestoredNotice()` returns true exactly once (StrictMode-safe), so
  "Restored your last session" toasts once.
- `components/useDialog.ts`: a shared modal hook with a module-level dialog
  stack (Esc and the Tab focus trap act only for the topmost dialog), focus
  of `initialFocusRef` on open, focus restore on close, and `onClose` held in
  a ref (a new callback identity does not re-run the open effect). It is used
  by `ConfirmDialog` (now rendered in a portal on `document.body`),
  `ImportJsonModal` and `WorkItemModal`.
- `components/releasePlan/`: `releasePlan.css` (dark palette, every selector
  under `.rp`), `BoardToolbar`, `ModeSwitch`, `SummaryCards`, `Board`,
  `MilestoneLabel`, `FlagLabel`, `GapMenu`, `EpicHeader`, `FeatureCell`,
  `FeatureCard`, `TableView`, `WorkItemModal`, `SizeChips`, `SizeBadge`,
  `StateMark`, `MilestoneChip`, `FlagChip`, `FlagIcon`, `CommitInput`.
- `pages/ReleasePlanBoardPage.tsx` at `/release-plan/board` (redirects to
  `/release-plan` without a plan). Its `BoardWorkspace` holds the UI-only
  state (view, zoom, open item).
- `pages/ReleasePlanHomePage.tsx`: import → (when a plan exists) "Replace the
  current board?" → `replacePlan` → navigate → "Plan loaded: <name>" toast;
  "Continue last board" section (plan name, source line, "saved <savedAt>").
- Tests: `test/releasePlanFixtures.ts` (synthetic builders `makePlan`,
  `samplePlan`, `sprintsPlan`, `sequentialIds`, `XSS_DESCRIPTION`, …) and
  `test/renderBoard.tsx`; `test/render.tsx` `renderAt` gained `initialPlan` /
  `planStorage`.

**Deviations from the plan (recorded here and in the Target architecture /
Template reference):**
1. `ReleasePlanProvider` is mounted in **`App.tsx`** around the routes, not in
   `main.tsx`.
2. `ImportJsonModal` now takes `onPlanLoaded(plan)` (Phase 0's
   `onFileSelected(file)` is gone); it parses and validates the file and shows
   errors inline. The caller does the confirmation, store and navigation.
3. Extra validation message "Invalid plan file: every milestone, epic and
   feature must be an object."; non-string fields are coerced to strings and
   a milestone without an id gets `uid("ms_")`.
4. `safeHtml` compares upper-cased tag names: the template's SVG drop rule
   never matched lower-case SVG `tagName`s.
5. Accessibility: the "+" `aria-label` is "Insert after <milestone>";
   milestone/flag labels and summary boxes are `role="group"`; the Feature
   card is a `div role="button"` (Enter/Space); the Epic title is a
   `<button>`.
6. Name inputs (plan, milestone, flag) commit on blur/Enter through
   `CommitInput`; Esc reverts the draft.
7. Confirmation titles: "Switch milestone type" (confirm "Switch"), "Delete
   milestone" (confirm "Delete"), "Replace the current board?" with
   `The current board "<old>" will be replaced by "<new>". Changes to the
   current board will be lost.` (confirm "Replace").
8. Rules taken from the template HTML (now in *Template reference*): gap
   button titles; gap menu position and first-item focus; milestone control
   titles; 📅 title; flag tag/label geometry; table column widths, nowrap
   State, "Show details" link title; modal "–" for missing meta and the ✕
   "Close (Esc)" title/focus; board box height `calc(100vh - 230px)`; radio
   group label "Milestones as"; an outside click ignores `.addgap`.
9. Feature selection and "Esc clears the selection" are deferred to Phase 2
   (with drag-and-drop).
10. Phase 0's QA Minor findings (one Esc closing both stacked dialogs, effects
    depending on callback identity, no focus trap) are resolved by
    `useDialog`.

**QA:** PASS, 0 Blocker / 0 Major. QA added `ReleasePlan.integration.test.tsx`
(4 tests: home → import → summary → Table milestone change → provider
re-mount restores the plan; Continue last board + replace confirmation with
one Esc closing only the confirmation; redirect with nothing saved; a corrupt
autosave is ignored) and `lib/releasePlan/sanitize.mxss.test.ts` (15
re-parse/mXSS cases).

**Open Minor findings (not fixed; candidates for Phase 2 or later):**
1. Table filters reset on a Board↔Table switch (`TableView` unmounts).
2. After a reload on `/release-plan`, the "Restored your last session" toast
   only appears later, when Continue is clicked.
3. "saved <date>" on Continue shows the file's original `savedAt`; autosave
   never updates it.
4. After deleting a milestone, focus falls to `body`.
5. The gap menu doesn't return focus to its "+" on Esc, and its Esc listener
   ignores the `useDialog` stack.
6. The radiogroup/tabs lack arrow-key navigation and
   `aria-controls`/`tabpanel`.
7. Duplicate epic/feature ids in a file cause React key collisions.
8. `safeHtml` parses into `body`, so a leading `<title>` text is dropped; the
   board hint lacks the template's `<b>` on "Click".

**Not testable in jsdom; check manually in a browser:** the sticky frozen
column, `showPicker()`, Fit with a real `clientWidth`, and CSS fidelity to
the template.

**Verification (2026-10-20, after QA):** `npm test -- --run` → 264/264 tests
in 34 files (245 from development + 19 from QA); `npx tsc -b` clean; `npx
vite build` to the scratchpad output dir → built OK; `pytest src/server -q`
→ 42 passed. The greps (`specs/templates`, `window.confirm/alert/prompt`,
`draggable`, unscoped CSS) are all clean.

## Phase 2: Drag-and-drop
Status: Not started

Develop (frontend-developer):
- [ ] Reducer actions (pure, unit-tested): `reorderEpic(dragId, targetId, after)` and `dropFeatures({epicId, ids, targetFeatureId, side, milestoneId})`, implementing *Drag-and-drop rules → Cell dragover/drop*. Reordering applies only when `ids.length===1 && ids[0]!==targetFeatureId`, and every id gets `milestoneId`. Both are no-ops for unknown ids or a mismatched epic.
- [ ] `lib/releasePlan/autoScroll.ts`: `edgeSpeed(y, top, bottom)` (pure) per *Auto-scroll*.
- [ ] `components/releasePlan/useBoardDrag.ts`: holds `drag` (in a ref, so dragover stays cheap) and the selection `{epicId, ids:Set}` (in state). It exposes handlers for epic headers, cards and cells, plus `clearSelection`. Global listeners: Esc clears the selection; a click on the board background clears it; document `dragover` drives the rAF auto-scroll; `dragend`/`drop` (capture) stop it. All listeners are cleaned up on unmount.
- [ ] `EpicHeader`: `draggable`, with ◀/▶ `draggable=false`, the dragstart/dragover/dragleave/drop/dragend wiring, and the `.dragging/.dropL/.dropR` classes.
- [ ] `FeatureCard`: `draggable`. Ctrl/⌘+click selection with `.selected` and the ✓ badge; a plain click clears the selection and opens the modal. On dragstart: the multi-drag ghost (`#dragGhost`, "N features"), `.dragging` on the dragged cards, and `.valid`/`.invalid` on the cells. Tooltip suffix per *Behaviors*.
- [ ] `FeatureCell`: dragover/dragleave/drop per the rules, with the `.over/.dropL/.dropR` classes. Use React state or class toggling; the result must be that classes are cleared on dragend/drop.
- [ ] Board hint: prepend the Phase 2 drag sentences.
- [ ] Unit tests:
  - Reducer: reorder before/after, multi-move keeping columns, move to Unplanned, cross-epic rejected.
  - `edgeSpeed`: top, bottom, middle, and the small-box EDGE clamp.
  - Component tests with `fireEvent.dragStart/dragOver/drop/dragEnd`, passing a mock `dataTransfer` (`setData`, `setDragImage`, `effectAllowed`, `dropEffect`) and stubbing `getBoundingClientRect` to choose the L/R side:
    - an epic is reordered;
    - a Feature moves to another band (summary counts update);
    - a Feature is reordered to the left/right of another column;
    - a drop on another Epic's cell is ignored;
    - Ctrl+click selecting 2 Features then dragging moves both;
    - Ctrl+click in another Epic resets the selection;
    - Esc clears it;
    - `.valid`/`.invalid` are applied during a drag and removed on dragend;
    - the change persists to storage.
  - Auto-scroll: with fake rAF/timers, a dragover near the bottom edge increases `scrollTop`.

QA (qa-engineer):
- [ ] Review against *Drag-and-drop rules*. Check that there are no leaked listeners or rAF loops after unmount (spy on add/removeEventListener and `cancelAnimationFrame`).
- [ ] Integration test: import → drag a Feature to the next milestone → Table view shows the new milestone → drag an Epic to first position → the order persists across a provider re-mount.

Docs (documentation-writer):
- [ ] TSDoc for `useBoardDrag`, `autoScroll` and the new reducer actions. Add a README note on the board interactions (drag, multi-select). Update `CLAUDE.md` if the architecture notes changed.

### Verification Plan
- `cd src/client && npm test -- --run` → all pass, 0 failures (record the count, which should exceed Phase 1's).
- `cd src/client && npx tsc -b` → clean. Vite build to `$TMPDIR/rp-dist` succeeds.
- `grep -rn "draggable" src/client/src/components/releasePlan` → matches in `EpicHeader` and `FeatureCard` only (plus `draggable={false}` on the ◀/▶ buttons).
- `grep -rn "specs/templates\|feature_release_plan" src/client/src` → no output.
- `cd src/client && npm ls --depth=0` → no new runtime dependency compared with `main` (native DnD).
- `git diff --stat main...HEAD -- src/server helm deploy` → empty.
- Optional smoke test (not blocking): `docker compose up --build -d`, then `curl -s -o /dev/null -w "%{http_code}" http://172.17.0.1:8080/release-plan` → `200` (SPA fallback). Then `docker compose down`.

### Phase Summary
_(write when phase completes)_

## Final Recap
_(write when all phases complete: summary of the entire piece of work)_

## Deployment Plan
_(write when all phases complete: step-by-step deployment instructions)_
