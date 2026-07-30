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

---

## Session discipline

- Produce only the ticket's files. No refactors of prior tickets, no "while I was in there".
- Every ticket that touches a pure module ships its tests in the same session.
- End with: what you built, which tests you ran, what you could not verify.
- If you are more than ~400 lines into a single file, stop and flag it — the ticket was
  probably scoped wrong and the teacher needs to know before the next session.
