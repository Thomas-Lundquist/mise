# Open Questions

Anything a spec leaves genuinely ambiguous goes here instead of being guessed at. Format:

```
## T5 — tie-break when two passive steps have equal tails
Asked: 2026-07-29
Context: 04-scheduler-spec.md Stage 3b rules 2 and 3 both tie.
Assumption used to keep moving: fell through to rule 4 (stepId ascending).
Resolved: <teacher fills this in>
```

Do not delete resolved entries. They are the changelog for design decisions.

## T8 — the example pack is too big for an inline URL
Asked: 2026-07-30 (surfaced during T3)
Context: 03-data-model.md says a pack over 6000 encoded characters cannot ride in the URL and
author.html must fall back to `#pf=<filename>.json` hosted next to the app. Measured during
T3: `fixtures/recipe-pack.example.json` encodes to ~11,667 characters — nearly 2x the limit.
So a normal two-recipe lab day never fits the inline `#p=` path; the hosted-file fallback is
the *primary* path for any realistic pack, not the exception the spec frames it as.
Assumption used to keep moving: T3 codec is correct as specified (encode returns the string,
oversize is length > 6000). No behavior invented. This only affects how T8 presents the two
paths — the fallback should probably be the default, and the inline link the special case.
Resolved: <teacher fills this in>

## T5 — equipmentChecklist `count` semantics are undefined
Asked: 2026-07-30 (surfaced during T5)
Context: 03-data-model.md gives the Schedule field `equipmentChecklist: [{ id, name, count }]`
but never defines `count`, and 04 (Stage 3) — the doc T5 was told to read — does not mention
the checklist at all. 01 says the checklist is "derived from the steps plus the number of
bowls", yet 03 also says bowls are counted separately (via `bowlCount`). The only worked
example is `{ id:"oven", name:"Oven", count:1 }`, and oven has `capacity:1`, so `count` could be
capacity, the number of steps using it, or something 05/06 defines. No T5 acceptance criterion
tests it.
Assumption used to keep moving: buildSchedule emits the deduplicated `checklist:true` equipment
actually used by steps, sorted by id, with `count = capacity` (the only value consistent with
03's single example). `bowlCount = plan.bowls.length`, kept separate as 03 directs. Revisit when
T8/T12/T13 (which read 05/06) pin the intended meaning.
Resolved: <teacher fills this in>

## Known limitation — scheduler crashes bare on an unvalidated pack
Asked: 2026-07-30 (surfaced during T5 verification)
Context: `js/scheduler.js:187` reads `equipById.get(eid).capacity` while checking equipment
capacity. If a step names an equipment id that isn't in `pack.equipment` (the `MISSING_EQUIP`
case), `.get` returns `undefined` and the scheduler throws a raw `TypeError` instead of the
`02-conventions.md` fail-loud form `throw new Error('scheduler: ...')`. `model.validatePack`
already reports `MISSING_EQUIP`, and the UI is meant to gate scheduling behind validation, so
this only bites if `buildSchedule` is ever called on an unvalidated pack.
Assumption used to keep moving: left as-is for T5 — fixing it edits T5 code outside a ticket,
and the path is unreachable with validated input. A one-line guard
(`throw new Error('scheduler: step ' + id + ' needs unknown equipment ' + eid)`) would restore
the convention if a later ticket wants belt-and-suspenders.
Resolved: <teacher fills this in>

## T6 — filler Assignment field shape and post-fill idleMin / utilizationPct
Asked: 2026-07-30 (surfaced during T6)
Context: 04-scheduler-spec.md Stage 4c says only "assign at cursor as kind 'filler'", and
03-data-model.md gives the Assignment schema (`kind, stepId, recipeId, label, startMin, endMin,
runsUntilMin, hands, isCritical, equipmentIds`) with no filler-specific values. It also defines
`cook.idleMin` as "minutes with nothing assigned" and `utilizationPct` as busy/makespan, without
saying whether fillers count once placed.
Assumption used to keep moving: a filler occupies the cook fully, so `runsUntilMin = endMin`,
`hands = "busy"`, `isCritical = false`, and `equipmentIds = [equipmentId]` (or `[]`); it belongs to
no step or recipe, so `stepId = null` and `recipeId = null`. `idleMin` is RECOMPUTED after filling
so its literal definition stays true (fillers are now "assigned"). `utilizationPct` is left as
buildSchedule set it — the cooking-load number IDLE_HEAVY (T7) cares about — since recomputing it
to include busywork is genuinely ambiguous. No makespan is touched (invariant 7 holds). Revisit if
T12/T13 (which render fillers) or T7 (which reads utilizationPct) need different field values.
Resolved: <teacher fills this in>

## T5/scheduler — cook continuity vs. interchangeable cooks (spec conflict)
Asked: 2026-07-30 (raised by the teacher during T6)
Context: 04-scheduler-spec.md Stage 3c assigns each ready step to "the lowest-index cook with
cookFreeAt[i] <= t" (js/scheduler.js:177-179), and the spec's "Known limitations" states as a
deliberate choice: "No cook preferences or skill levels. Cooks are interchangeable by design;
that is what solves the role-equity problem in the kitchen." The scheduler therefore keeps NO
state about what a cook was previously doing and has no tie-break rewarding continuity, so a cook
who started the rice can be handed the chicken sear while another inherits the rice simmer. The
teacher reports this exact discontinuity was a primary failure of the archived build: jobs felt
near-random, with no sense of a student staying on the item they started.
Conflict: role-equity (everyone touches everything) vs. task/recipe continuity (finish what you
start). The current spec picked equity; the lab experience wants continuity. Passive steps release
the cook after ~1 minute, so many handoffs are of unattended pots rather than active work, which
softens but does not remove the symptom.
Not changed under T6: adding a continuity tie-break rewrites Stage 3c's assignment rule — out of
T6's scope, and it directly contradicts the "interchangeable cooks" line, so it must not be slipped
in silently. It would also shift the golden makespan / cook-minute fixtures in
tests/scheduler.test.js. Belongs in its own scheduler ticket once the teacher decides.
Resolved: <teacher fills this in>

## T6 — filler equipment capacity is enforced only for the sink, and filler intervals are invisible to the capacity invariant
Asked: 2026-07-30 (surfaced during T6 review against 04)
Context: 04-scheduler-spec.md Stage 4c requires a candidate filler to have "no equipmentId, or
that equipment has free capacity across [cursor, cursor + durationMin) counting other fillers
too" — i.e. ANY equipment id, generically. `js/fillers.js:158` (`choose`) only enforces this for
the sink (`if (c.equipmentId === 'sink' && !sinkFree(...)) continue;`), yet generic filler tasks
may carry a non-sink `equipmentId` (03-data-model.md line 57; read at js/fillers.js:79). Such a
filler is placed with NO capacity check, so it can exceed that equipment's capacity — a direct
divergence from the spec. Cooking steps (js/scheduler.js:182-189) and the sink across cooks
(js/fillers.js:90-95) are correct; only non-sink filler equipment is unguarded.
Second, related, blind spot: `fillGaps` returns `{ ...schedule, cooks }` and never adds filler
intervals to `equipmentUse` (js/fillers.js:128). 09-test-plan.md Part 1 invariant 3 ("equipment
capacity never exceeded") iterates over the schedule's intervals; if the test reads
`schedule.equipmentUse`, filler equipment use is not present, so the invariant cannot catch the
divergence above — it is unguarded by BOTH construction and test.
Assumption used to keep moving: unchanged for T6. In every current fixture fillers are sink-only
(derived washables) or equipment-free, so the path is unreached. Two options for a later ticket:
(a) if fillers are sink-only by design, add that to 04's "Known limitations" and drop the generic
clause from 4c; (b) otherwise generalize `choose`/`sinkFree` to any equipment id AND have the
invariant-3 test synthesize filler intervals (not just cooking ones), or it will stay blind.
Resolved: <teacher fills this in>

## T7 — three under-specified points in the Stage 5 warning table
Asked: 2026-07-30 (surfaced during T7)
Context: 04-scheduler-spec.md Stage 5 gives the eight warning codes and messages, but leaves
three details unstated. `js/warnings.js` (`checkPlan`) resolved each conservatively rather than
inventing behaviour; none changes an existing test or module.
1. SOLO_CROWD "fewer than 2 steps ever run at the same time" — the spec never says which window a
   step occupies for the overlap test. A passive step releases its cook after ~1 min (`endMin`) but
   keeps cooking until `runsUntilMin`. Assumption used: overlap uses the full elapsed window
   `[startMin, runsUntilMin)`, so a simmer running while a cook chops counts as two steps running at
   once — that IS the parallelism the lesson teaches. Using the cook-hold window `[startMin, endMin)`
   instead would make almost every passive-heavy plan trip SOLO_CROWD, which reads wrong.
2. Step name in messages (LONG_ACTIVE) — the table writes "on '<step>'" without saying label vs
   shortLabel. Assumption used: `shortLabel`, the name the student sees in the timeline block.
3. UNBOWLED offending ids — the Warning schema (03-data-model.md) only has a `stepIds` field, but the
   offending items here are ingredients, not steps. Assumption used: put the ingredient ids in
   `stepIds` (the sole id-carrier) so a later UI can highlight them; the alternative is an empty array
   and no way to point at the problem.
Resolved: <teacher fills this in>

## T7 — checkPlan must tolerate a missing / non-ok schedule
Asked: 2026-07-30 (surfaced during T7)
Context: the signature is `checkPlan(pack, plan, schedule)`, but a schedule is not always available:
`buildSchedule` THROWS on an untagged step (js/scheduler.js:139) and RETURNS `{ ok:false, warnings:[CYCLE] }`
on a cycle (js/scheduler.js:125). So the caller may hold no usable schedule exactly when the two
structural errors it must report are present. Stage 5 does not spell out this coupling.
Assumption used to keep moving: UNTAGGED and UNBOWLED are derived straight from pack+plan (so they hold
with `schedule` undefined); CYCLE is read back out of a `{ ok:false }` schedule's `warnings`; LONG_ACTIVE
is tag-only so it also needs no schedule; and the four makespan-dependent warns (OVER_PERIOD, IDLE_HEAVY,
FAR_FROM_FLOOR, SOLO_CROWD) run only when `schedule.ok === true`. Output order is all errors then all warns,
each group in the Stage-5 table order, matching T12's "warnings render in severity order".
Resolved: <teacher fills this in>

## T9 — student shell handles both #p= and #pf=, and sanitizes the hosted filename
Asked: 2026-07-30 (surfaced during T9)
Context: docs/05 frames T9's damaged-link handling around a hash that carries the pack, and the
T8 entry above establishes that the only realistic pack (the example fixture) encodes to ~11,667
chars — nearly 2x the 6000 limit — so `#pf=<filename>.json` hosted under /fixtures/ is the
*primary* load path, not the exception. So `index.html` (`loadPackFromHash`) implements BOTH
`#p=<encoded>` (via codec.decodePack) and `#pf=<filename>.json` (via a relative `fetch`), which is
what makes "a pack URL loads" verifiable with the real fixture. Non-relative fetch stays forbidden;
this fetch is relative.
Assumption used to keep moving: (1) any of missing hash / unknown key / decode failure / fetch or
JSON-parse failure / `validatePack` failure collapses to the single "This link is damaged" screen —
docs/05 only specifies the message for a missing/damaged hash, so an invalid-but-decodable pack is
folded in since the student can't fix it either. (2) The `#pf=` filename is restricted to
`^[\w.-]+\.json$` with no `..`, and always resolved as `fixtures/<name>` — the spec names the
`/fixtures/` directory but not a guard against a crafted filename escaping it. Revisit if a later
ticket needs invalid packs distinguished from damaged links, or a different hosted-file location.
Resolved: <teacher fills this in>

## T10 — Screen 1 needed a wiring contract the T9 shell did not define, so app.js was edited
Asked: 2026-07-30 (surfaced during T10)
Context: T10 ships `js/ui-bowls.js` + styles, but the T9 shell (`js/app.js`, `index.html`) never
imports or calls a Screen-1 mount, and `#screen-1` held static placeholder markup. The stub's
`mount(root, ctx)` signature existed but no `ctx` shape, no call site, and no way for a screen to
gate the shell's footer Next (which app.js owns). T10's acceptance ("tap-to-assign works... the
disabled-Next reason is correct") is only verifiable if app.js reaches ui-bowls, so a minimal
wiring edit to a prior ticket's file was unavoidable. Teacher approved the minimal edit + this log.
Change made (kept as small as possible): (1) app.js imports `ui-bowls.mount`, calls it when Screen 1
is first shown and `.refresh()`es it on return, holding the controller in `bowlsCtl`; (2) app.js adds
`setNextEnabled(ok, reason)` and creates the reason node in the footer via createElement — `index.html`
is UNCHANGED; (3) `bowlsCtl` is reset to null on resume/start-over so a replaced `plan` re-mounts.
The `ctx` contract now is `{ pack, plan, persist, setNextEnabled }`; the same shape should serve
Screens 2–3 (T11/T12), so this is a one-time shell contract, not a Screen-1 special case.
Assumption used to keep moving: the contract above. Revisit if T11/T12 need a richer ctx (e.g. a way
to advance programmatically or read sibling-screen state).
Resolved: <teacher fills this in>

## T10 — empty-bowl pruning timing and the "different times" note trigger are unspecified
Asked: 2026-07-30 (surfaced during T10)
Context: two points 05/03 leave open. (a) blankPlan seeds one bowl per ingredient, so merging leaves
source bowls empty; 03 only says empty bowls are "dropped at validation and renumbered," not when the
UI should drop them. (b) 05's optional teacher-answer-key note ("These two go in at different times.
Sure?") says to show it when `consumesBowlOf` "implies two ingredients are added at different moments"
but never defines the exact trigger.
Assumption used to keep moving: (a) a bowl emptied by a MOVE (assign/take-out) is pruned immediately
and bowls renumber 1..n; a bowl made by "+ New bowl" persists until the next move leaves it empty, and
carries an explicit "Remove bowl" button meanwhile — so the student never accumulates the ~10 empty
per-ingredient bowls a literal "drop only at validation" reading would show. (b) the note fires for a
bowl holding two consumed ingredients whose consuming-step sets are disjoint (no single step empties
both) — i.e. they enter the pan at different steps. Ingredients consumed by no step give no evidence
and are ignored. The note is advisory and never blocks, per 05. Revisit if a later ticket pins either.
Related follow-up the note surfaced (raised by the teacher during T10 testing): for a bowl with 3+
consumed ingredients the note shows the verbatim two-ingredient copy once, naming no chip, so the
teacher/student can't tell WHICH ingredients conflict or that there may be several pairs. 05 only
specifies the two-ingredient wording. A future ticket should decide: keep the vague advisory as-is,
or make it precise (highlight the specific conflicting chips, reword for N>2) — the latter turns a
soft nudge into something that reads like a hard rule, so it is a real design choice, not a tweak.

## Future ticket idea — AI-assisted pack authoring (authoring-time only, NOT student runtime)
Asked: 2026-07-30 (raised by the teacher during T10 testing)
Context: today the teacher hand-tags every step in author.html — minutes, busy/free, equipment, and
especially `consumesBowlOf` (the tags that drive Screen 1's "different times" note and the whole
schedule). docs/01 sizes this as "~20 minutes once per recipe." The teacher asked whether a recipe
could be uploaded/pasted and the tagging generated for them. Proposal: a Claude skill (or other
authoring-time AI helper) that ingests a plain recipe and PRE-FILLS the pack draft — ingredient
shortLabels, suggested minutes/hands, equipment, and `consumesBowlOf` — for the teacher to review and
correct before publishing.
Scope boundary that keeps this legal under the specs: docs/01's non-goal forbids "anything that calls
a language model at RUNTIME" because the student's schedule must be deterministic and comparable. This
proposal runs only in author.html, before publish; the teacher reviews and edits every field, and the
published pack is still plain deterministic JSON. So it does not touch the student flow, codec, or
scheduler, and the determinism guarantee is preserved. Belongs in its own ticket (post-T14), with its
own doc, and must ship as suggestions-for-review, never auto-publish.
Resolved: <teacher fills this in>

## T11 — "Total hands-on time" is not defined against the data model

Asked: 2026-07-30 (surfaced during T11)
Context: 05-ui-spec.md Screen 2 requires a sticky running total labelled "Total hands-on time:
34 min" that "changes as they tag", but never says which minutes it sums. 03-data-model.md gives
two candidate quantities per step: `durationMin` (the whole step) and `attentionMin` (cook time —
`durationMin` for a busy step, `Math.min(1, durationMin)` for a free one). So "hands-on time" could
be (A) the sum of `durationMin` over steps tagged `hands === "busy"` only — passive steps contribute
0 — or (B) the sum of `attentionMin` over all steps — passive steps contribute their 1 starting
minute. No T11 acceptance criterion pins the number.
Assumption used to keep moving (teacher-approved): reading (A). The visible label "hands-**on**"
mirrors the "Hands **busy**" button, so a student reads the total as "how long am I actually working
with my hands"; a passive step is the case where they walk away, so it should read 0, not 1. Flipping
a step busy↔free then moves the total by that step's full duration, which is the loud, legible
response 05 wants ("the first place they feel the model responding to them"). Note this total is a
student-facing teaching number only — it is NOT the scheduler's cook-load and feeds nothing
downstream, so choosing (A) over (B) cannot change any schedule. Revisit if T12/T13 surface a place
that needs per-cook attention minutes instead.
Resolved: <teacher fills this in>

## T11 — Screen 2 reused the T10 shell wiring contract, so app.js was edited again

Asked: 2026-07-30 (surfaced during T11)
Context: like T10 (see the "Screen 1 needed a wiring contract" entry above), T11 ships only
`js/ui-steps.js` + styles, but the shell never mounts Screen 2 — `#screen-2` held static placeholder
markup and app.js had no call site. T11's acceptance ("changing a chip or a hands button updates the
plan and the running total") is only verifiable in the flow if app.js reaches ui-steps, so the same
minimal wiring edit was applied. Teacher approved the small change + this log.
Change made (kept minimal, mirroring T10): app.js imports `ui-steps.mount`, calls it when Screen 2 is
first shown and `.refresh()`es it on return, holding the controller in `stepsCtl`; `stepsCtl` is reset
to null on resume/start-over alongside `bowlsCtl` so a replaced `plan` re-mounts. The `ctx` shape is
the existing `{ pack, plan, persist, setNextEnabled }` — Screen 2 never gates Next (05: "enabled
always"), so it does not call `setNextEnabled`; the shell already leaves Next enabled for screens
other than Screen 1. `index.html` is UNCHANGED (ui-steps.mount clears the placeholder via textContent).
Assumption used to keep moving: the existing contract serves Screen 2 as predicted in the T10 entry.
Revisit if T12 needs a richer ctx.
Resolved: <teacher fills this in>

## T11 — student `dependsOnOverride` is written into the plan but the scheduler reads the pack

Asked: 2026-07-30 (surfaced during T11)
Context: 05-ui-spec.md Screen 2 point 5 says the disclosure writes `dependsOnOverride`, but
03-data-model.md places `dependsOnOverride` on the authored **Step** (in the pack), while the
student-owned **StepTag** (in the plan) has no dependency field. The pack is "read-only to students"
and is re-decoded fresh on every load, whereas store.js persists only the **plan** — so writing the
override onto the in-memory pack step would silently lose it on a draft reload while durations/hands
survived. Separately, `buildGraph(pack, plan)` resolves dependencies via `model.resolveDeps(pack)`
(js/scheduler.js:19) — it reads the **pack only** and ignores the plan entirely.
Assumption used to keep moving: T11 stores the override where it can survive a draft and stay
student-owned — `plan.stepTags[stepId].dependsOnOverride`, using the pack's exact semantics (an
array of step ids = "needs exactly these"; the field ABSENT = the default "follow the previous step
in the recipe"). The student UI intentionally cannot produce `[]` ("explicitly independent"), which
stays an authoring-only state, because 05 forbids asking a student to build a dependency graph. This
satisfies T11's acceptance ("writes `dependsOnOverride` correctly and stays collapsed by default").
BUT it is written and not yet CONSUMED: because `resolveDeps` reads pack-side deps, a student override
currently has no effect on the schedule. A later ticket (T12, which runs the scheduler) must reconcile
plan-side overrides into `buildGraph` — e.g. `resolveDeps(pack, plan)` preferring
`plan.stepTags[id].dependsOnOverride` when present — for the override to change anything. That edit
touches the pure scheduler/model (done in T4/T5) and its golden fixtures, so it must be its own
scoped change, not slipped into T11.
Resolved: <teacher fills this in>

## T12 — Screen 3 reused the T10/T11 shell wiring contract, so app.js was edited again

Asked: 2026-07-31 (surfaced during T12)
Context: exactly like T10 and T11 (see the two "shell wiring" entries above), T12 ships only
`js/ui-review.js` + styles, but the shell never mounts Screen 3 — `#screen-3` held static
placeholder markup and app.js had no call site. T12's acceptance ("the two numbers are right,
warnings render in severity order, errors disable printing, and the on-screen lanes match the
printed lanes structurally") is only verifiable in the flow if app.js reaches ui-review, so the
same minimal wiring edit was applied. Teacher pre-approved (decision ① of the T12 session).
Change made (kept minimal, mirroring T11): app.js imports `ui-review.mount`, calls it when Screen 3
is first shown and `.refresh()`es it on return, holding the controller in `reviewCtl`; `reviewCtl`
is reset to null on resume/start-over alongside `bowlsCtl`/`stepsCtl` so a replaced `plan` re-mounts.
The `ctx` shape is the existing `{ pack, plan, persist, setNextEnabled }` — Screen 3 is the last
screen (the shell hides Next), and it is read-only, so it uses neither `persist` nor `setNextEnabled`.
`index.html` is UNCHANGED (ui-review.mount clears the placeholder via textContent).
Assumption used to keep moving: the existing contract serves Screen 3 as the T10 entry predicted.

## T12 — the print URL hash format is a contract T13 must match

Asked: 2026-07-31 (surfaced during T12)
Context: 05-ui-spec.md Screen 3 item 5 says Print "opens print.html in a new tab with the plan in
the hash", and 06-print-spec.md says print.html "reads the plan and pack from the URL hash", but
neither pins the hash key names, and print.js is built in T13. ui-review must construct that hash
now to open the tab. The pack is large (the example fixture encodes to ~11,667 chars — see the T8
entry), so re-encoding it into the print URL is wrong; the plan is small by design (03: "small
enough to fit in a Canvas text submission").
Assumption used to keep moving (teacher-approved, decision ② of the T12 session): ui-review reuses
the pack portion of the CURRENT address-bar hash verbatim — `p=<encoded>` inline or
`pf=<filename>.json` hosted, whichever this student loaded — and appends `&plan=<encodePlan(plan)>`.
So the print URL is `print.html#<pack-part>&plan=<encoded-plan>`. This never re-encodes the pack and
works for both load paths. T13's print.js MUST read this shape: split the hash on `&`, take the
pack part exactly as index.html's `loadPackFromHash` does (reuse that logic), and `decodePlan` the
`plan=` part. If T13 prefers a different layout, change it in BOTH places at once.

## T12 — student `dependsOnOverride` is STILL not consumed by the scheduler (not fixed in T12)

Asked: 2026-07-31 (surfaced during T12)
Context: the T11 entry "student `dependsOnOverride` is written into the plan but the scheduler reads
the pack" flagged that `buildGraph`/`resolveDeps` read pack-side dependencies only and ignore
`plan.stepTags[id].dependsOnOverride`, and named T12 ("which runs the scheduler") as the place that
might reconcile them. T12 does run the scheduler (in ui-review) but did NOT change it: reconciling
plan-side overrides edits the pure scheduler/model (built and frozen in T4/T5) and would shift the
golden fixtures in tests/scheduler.test.js — out of T12's named files (`ui-review.js` + styles) and
against the working agreement's "no refactors of prior tickets". Teacher confirmed leaving it
(decision ③ of the T12 session).
Assumption used to keep moving: Screen 3 renders whatever schedule the pack-dependency scheduler
produces; a student's override currently changes nothing downstream. This remains its own scoped
scheduler ticket — e.g. `resolveDeps(pack, plan)` preferring the plan override when present, plus
refreshed golden fixtures — and must not be slipped into a UI ticket.

## T12 — on-screen timeline scale raised from 2px/min to 10px/min (spec value changed)

Asked: 2026-07-31 (surfaced during T12 visual testing)
Context: 05-ui-spec.md Screen 3 item 3 specified the on-screen timeline at "2px per minute instead
of 3mm". At 2px/min the example plan (45 min) was only 90px tall, so blocks were unreadable and,
compounded by a `min-height: 14px` on each block, short steps (<7 min) were force-grown past their
true height and OVERLAPPED. The teacher confirmed the rail was "not working at all" visually.
Resolution (teacher-approved during the T12 session): (1) removed the block `min-height` so height
is exactly `span * SCALE` and blocks can never overlap; (2) raised the scale to 10px/min. The value
is the single `SCALE` const at the top of `js/ui-review.js`, documented as the knob so the teacher
can retune it later; everything (blocks, spine ticks, gridlines, floor line, equipment bars) derives
from it. 05-ui-spec.md item 3 was updated from 2px to 10px to keep the spec and code in sync.
Note: the PRINT view (06-print-spec.md, 3mm/min) is UNCHANGED — this only affects the screen preview.

## Manual test log

(Dated results from `09-test-plan.md` Part 4 go here.)
