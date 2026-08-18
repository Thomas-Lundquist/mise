# 07 — Build Plan

Fourteen tickets. **One ticket per session.** Each ticket names the documents to read, the
files to produce, and how it will be judged. Later tickets assume earlier ones landed
unchanged; if you find an earlier file missing or wrong, say so and stop rather than
rebuilding it from scratch.

Tickets 1–7 are the engine and have no UI. Get them right before touching a screen — a
pretty app on a broken scheduler is worthless, and the scheduler is fully testable without
any interface.

---

### T1 — Skeleton and test harness
**Read:** 00, 02
**Produce:** the full directory structure from `02-conventions.md` with every file created
as a stub (each JS module exporting its named functions with `throw new Error('not
implemented')`), plus `tests/assert.js` and `tests/test.html`, plus an empty
`OPEN-QUESTIONS.md`.
`tests/assert.js` exports `test(name, fn)`, `eq(actual, expected, msg)` (deep equal),
`throws(fn, msg)`, and `report()` which prints pass/fail counts into the page and colours
failures with `--alert`. Under 60 lines, no dependencies.
**Done when:** `tests/test.html` loads in a browser and reports `0 tests, 0 failures` with
no console errors.

### T2 — model.js
**Read:** 03
**Produce:** `js/model.js`, `tests/model.test.js`
Constructors/defaults, `validatePack`, `validatePlan`, and helpers `resolveDeps(pack)`,
`derivedTag(step, tag)`, `blankPlan(pack)` (one bowl per ingredient, tags from the
teacher's suggestions, 4 cooks — so a student who agrees with everything can finish
instantly).
**Done when:** every error code in the `03` validation table has a test that triggers it and
a test that does not.

### T3 — codec.js
**Read:** 03
**Produce:** `js/codec.js`, `tests/codec.test.js`
**Done when:** round-trip deep-equality passes for the example pack; a truncated string, a
string with illegal base64, and an empty string all return `{ ok: false }` without throwing;
a pack over 6000 encoded characters reports oversize.

### T4 — Graph, tails, floor
**Read:** 04 (Stages 1–2), 09
**Produce:** the graph and tail portion of `js/scheduler.js` plus `tests/graph.test.js`
Export `buildGraph(pack, plan)` returning `{ order, deps, succ, tail, floorMin,
criticalStepIds }` so it can be tested independently of the simulation.
**Done when:** hand cases A–C in `09-test-plan.md` produce the stated floors, and a cycle
returns the `CYCLE` error rather than hanging.

### T5 — The simulation
**Read:** 04 (Stage 3), 09
**Produce:** the rest of `js/scheduler.js` (`buildSchedule`), `tests/scheduler.test.js`
**Done when:** hand cases A–F pass exactly, all five invariants in `09` pass on the example
fixture across cooks 1–5, and running `buildSchedule` twice on the same input gives
byte-identical JSON.
**This is the highest-risk ticket in the project.** If any part of Stage 3 reads ambiguously,
stop and ask in `OPEN-QUESTIONS.md` rather than guessing at a tie-break.

### T6 — fillers.js
**Read:** 04 (Stage 4), 03
**Produce:** `js/fillers.js`, `tests/fillers.test.js`
**Done when:** no filler overlaps a step or another filler for the same cook; no filler
extends past `makespanMin`; `makespanMin` is unchanged by filling; a `sink` with capacity 1
is never double-booked; on hand case B the 19 idle minutes receive at least three fillers.

### T7 — warnings.js
**Read:** 04 (Stage 5)
**Produce:** `js/warnings.js`, `tests/warnings.test.js`
**Done when:** each code has a triggering test; errors and warnings are correctly separated;
messages interpolate real numbers and step names.

---

### T8 — author.html
**Read:** 05 (teacher section), 03, 02
**Produce:** `author.html`, `js/ui-author.js`, styles appended to `css/app.css`
Includes the default equipment and filler lists, JSON download/load, and the Section 5
feasibility preview.
**Done when:** the teacher can build the example pack from scratch, download it, reload the
page, load it back, and get a working URL; the preview reports a makespan and floor.

### T9 — Student shell
**Read:** 05, 02, 03
**Produce:** `index.html`, `js/app.js`, `js/store.js`, `css/app.css` (tokens + shell)
Screen 0, the four-dot indicator, Back/Next, draft save and restore, damaged-link handling.
Screens 1–3 are empty placeholder sections.
**Done when:** a pack URL loads, cooks can be chosen, the flow advances through four empty
screens, and a reload restores the draft with `localStorage` disabled without crashing.

### T10 — Screen 1, bowls
**Read:** 05 (Screen 1), 02
**Produce:** `js/ui-bowls.js`, styles
**Done when:** tap-to-assign works with no mouse at all; drag works with a mouse; the
counter and the disabled-Next reason are correct; keyboard focus is visible and Tab reaches
every control.

### T11 — Screen 2, steps
**Read:** 05 (Screen 2), 03
**Produce:** `js/ui-steps.js`, styles
**Done when:** a student can accept every suggestion with zero taps; changing a chip or a
hands button updates the plan and the running total; the dependency override writes
`dependsOnOverride` correctly and stays collapsed by default.

### T12 — Screen 3, review
**Read:** 05 (Screen 3), 06, 04
**Produce:** `js/ui-review.js`, the on-screen timeline, styles
**Done when:** the two numbers are right, warnings render in severity order, errors disable
printing, and the on-screen lanes match the printed lanes structurally.

### T13 — Print view
**Read:** 06
**Produce:** `print.html`, `js/print.js`, `css/print.css`
**Done when:** a 50-minute four-cook plan prints on two pages at 100% scale with legible
9pt labels; gray fills survive Chrome's print preview; passive blocks visibly differ from
active ones in grayscale; the floor line lands at the right height.

### T14 — Manual mode (deferred; build only when explicitly called)
**Read:** 01 (deferred section), 04, 05
**Produce:** `js/ui-manual.js`, a mode flag in the pack, styles
Drag blocks into lanes; validate dependencies and equipment; show the student's makespan
beside the algorithm's. No auto-placement.
**Done when:** an invalid placement is flagged with the specific rule broken, and the print
view is unchanged.

### T16 — Auto/manual toggle
**Read:** 05 (Screen 3), OPEN-QUESTIONS.md (T14 mode flag + shell mount entries)
**Produce:** updated `js/app.js`, updated `js/ui-review.js`, updated `js/ui-manual.js`, styles
Remove the `pack.mode` routing. Both views are always available; a toggle control on Screen 3
lets the student switch between auto-review and manual placement at will. Switching FROM manual
TO auto requires a confirmation dialog (the manual arrangement will be discarded). The auto-review
view continues to show the scheduler's result; the manual view is the placement board.
**Done when:** a student can switch between views freely; switching back to auto from manual
triggers a confirmation; no pack.mode check remains in app.js.

### T17 — Manual mode to-scale timeline + sessionStorage
**Read:** 05 (Screen 3), 06 (timeline geometry), 02 (touch targets), OPEN-QUESTIONS.md (T14 placement model entry)
**Produce:** updated `js/ui-manual.js`, updated `css/app.css`
Replace the uniform-height block cards with to-scale bars that match the auto-review visual
language (height = duration × SCALE). The 44px minimum touch target constraint still applies.
Persist the board state in sessionStorage keyed to the pack id so the arrangement survives
screen navigation; lost on browser close is acceptable.
**Done when:** a 10-minute block is visually twice as tall as a 5-minute block; the board
survives a Screen 0 → Screen 3 round-trip; closing and reopening the browser clears the board.

### T18 — Manual mode print
**Read:** 06, OPEN-QUESTIONS.md (T14 printing entry, T18 print.js scope entry)
**Produce:** updated `js/ui-manual.js` AND `js/print.js`
Add a print button to the manual placement board. Two sides:
1. **ui-manual.js** — synthesize a Schedule-shaped object from the current lane stacks (no fillers —
   a manual plan has none; equipment strip from placed intervals only) and open
   `print.html#<pack-part>&sched=<encoded-JSON>`, reusing the current address-bar pack part verbatim
   (`p=`/`pf=`) exactly as ui-review does for `plan=`.
2. **print.js** — `parseHash` learns a `sched=` key; when present, `runBoot` decodes it and uses that
   Schedule directly (skip `buildSchedule`/`fillGaps`, plugs in at the js/print.js:320-326 block),
   feeding it to the existing `renderPage1`/`renderPage2`. When `sched=` is absent the `plan=` path is
   byte-for-byte unchanged.
**Done when:** clicking Print from a valid manual arrangement opens print.html and renders a
legible lane timeline; the auto print path (from ui-review, via `plan=`) is byte-for-byte unchanged.

### T19 — Manual mode board reset
**Read:** 05 (Screen 3), OPEN-QUESTIONS.md (T14 placement model, T16 follow-up, T17 sessionStorage entries)
**Produce:** updated `js/ui-manual.js`
Two related changes, both to the same closure:
1. **Auto-reset on navigation.** When the student confirms switching from manual to auto (the "Yes,
   switch to auto" button in the confirmation dialog), clear the sessionStorage board for this pack
   before calling `switchToAuto()`. On re-entry to manual mode, `loadBoard()` finds nothing and falls
   back to `seedPlacement()`, so the board always re-seeds from the current auto layout.
2. **"Reset to auto layout" button.** Add a secondary button beside "Clear board" that calls
   `seedPlacement(plan.kitchen.cooks)`, saves the result, and re-renders. This lets the student
   recover the auto starting point without navigating away. Label: **Reset to auto layout**.
**Done when:** (a) switching manual → auto (confirmed) → back to manual always shows the auto-seeded
board, not the previous manual state; (b) the "Reset to auto layout" button re-seeds from the current
auto schedule; (c) "Clear board" still empties the board completely (unchanged); (d) the existing
confirmation dialog is still shown before switching to auto.

### T20 — Screen 1 zero-bowl start + card layout
**Read:** 05 (Screen 1), 03 (Plan / blankPlan / bowl model), 02, OPEN-QUESTIONS.md ("UX review —
Screen 1 opens already done", V3, V4, and the T10 pruning entry)
**Produce:** updated `js/model.js` (blankPlan), `js/ui-bowls.js`, `css/app.css`,
`tests/model.test.js`, and doc updates to `docs/03-data-model.md` + `docs/05-ui-spec.md`
Overturns the ratified one-bowl-per-ingredient seed (teacher decision 2026-08-10) so the merging
lesson is active, not opt-in.
1. **`blankPlan` seeds zero bowls** (`bowls: []`); tags and cook count unchanged. This is a
   deliberate edit to the frozen T2 pure module, driven by the spec change — not a slip.
2. **Screen 1 opens empty:** every ingredient starts in "Not in a bowl yet"; the existing Next gate
   (js/ui-bowls.js:318, blocks while `unbowled.length > 0`, reason `${unbowled.length} left`) now
   fires — no gate-logic change.
3. **First-placement affordance (decide in-ticket):** with zero bowls there is no card to drop the
   first chip onto. Pick one — auto-provide a single empty starter bowl, or make "+ New bowl" the
   obvious first action / let a selected chip + "+ New bowl" create-and-fill. Keep the spec's
   existing select-chip-then-"Put here" merge gesture.
4. **Layout (V3):** render bowl cards as a wrap/grid instead of one vertical stack; collapse or
   de-emphasize the empty left column when nothing is unbowled.
5. **Tests:** update `model.test.js` "blankPlan: one bowl per ingredient" and "blankPlan produces a
   plan that validates clean" to the new contract — a zero-bowl blank plan is intentionally
   incomplete (UNBOWLED) until the student bowls. Confirm `validatePlan`'s UNBOWLED handling while
   rewriting. These flip because the spec changed (not fixing a test to match code).
**Blast radius:** golden scheduler fixtures are unaffected — `fixtures/plan.example.json` is an
authored student plan that already carries its bowls; only fresh blank plans start empty. codec must
round-trip `bowls: []` (verify; expected trivial).
**Done when:** a fresh plan opens with 0 bowls and Next disabled; bowling every ingredient enables
Next; the merge gesture still works; bowl cards no longer force a long single-column scroll; the
printed checklist reflects the real bowl count (closes V4); docs/03 and docs/05 match the new
behavior; the browser suite is green with the two rewritten model tests.

### T21 — Remove the equipment/oven-burner strip (temporary)
**Read:** OPEN-QUESTIONS.md ("UX decision — remove the equipment/oven-burner strip pending a redesign",
V1, "the Screen 3 equipment strip is unidentifiable on a touch Chromebook")
**Produce:** updated `js/ui-review.js`, updated `js/print.js`
Comment out (do not delete) the equipment strip in both places it renders: the on-screen Screen 3
"EQUIP" column (`renderEquipStrip` + its `tl-equip-head` header cell in `js/ui-review.js`) and the
printed "OVEN/BURNERS" strip + header in `js/print.js`. Leave a short comment at each site pointing at
the OPEN-QUESTIONS.md entry so the redesign is easy to resume. `capById`/equipment-capacity WARNINGS and
the manual board's own capacity validation (`js/ui-manual.js`) are untouched — this is a visual-only
change. `equipmentUse` continues to be computed wherever it already is.
**Done when:** neither the on-screen review nor the printed sheet shows an equipment/oven-burner strip
or its header; a plan that overbooks a capacity-limited resource still produces an OVER_CAPACITY-style
warning/error exactly as before; the rest of Screen 3 and the print layout reclaim the freed space
(no dangling empty column).

### T22 — Screen 3 side gutters
**Read:** OPEN-QUESTIONS.md ("Design direction — timeline: widen the vertical rail" follow-up,
2026-08-18)
**Produce:** updated `css/app.css`
Commit e6bb96d removed the 720px cap from `.shell-content` and made Screen 3 (both the auto-review
timeline and the manual placement board, which share `#screen-3`) run edge-to-edge minus the shared
16px shell padding. Add a fixed 160px side gutter on `#screen-3` only (160px extra each side on top
of the existing 16px, 176px total each side), so it stays a wide data view but is visibly off the
browser edges. Screens 0–2 keep their unchanged 720px centered column.
**Done when:** Screen 3 (both auto and manual views) has a clearly visible side margin instead of
running to the shell edge; Screens 0–2 are pixel-identical to before; no horizontal scroll is
introduced on a 1366px-wide viewport for the example fixture at 4-5 cooks.

---

## Session discipline

- Produce only the ticket's files. No refactors of prior tickets, no "while I was in there".
- Every ticket that touches a pure module ships its tests in the same session.
- End with: what you built, which tests you ran, what you could not verify.
- If you are more than ~400 lines into a single file, stop and flag it — the ticket was
  probably scoped wrong and the teacher needs to know before the next session.
