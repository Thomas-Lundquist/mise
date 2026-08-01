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
Resolved: 2026-08-01 (teacher) — guard added in js/scheduler.js (equipFreeAt): a step naming
equipment the pack does not define now throws `scheduler: step <id> needs unknown equipment <eid>`
instead of a raw TypeError, matching the 02-conventions fail-loud form. New scheduler.test case
asserts the exact message. No behavior change on validated packs (the path is unreachable when
validatePack has passed) — suite 109/109.

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
Resolved: 2026-08-01 (teacher) — superseded by docs/10 (Station Affinity), which landed in T5-amend
commits b0990a5 / be5a920 AFTER this was filed and exists precisely to fix the "cook pulled off their
dish" hopping described here. The equity-vs-continuity conflict was a false dilemma: docs/10's Layer 1
(on-dish cook selection) delivers continuity FOR FREE — it only relabels who does a tied task, so
role-equity and byte-identical timing both survive; Layer 2 (the tunable affinityWeight) is the only
part allowed to trade speed for coherence. Default affinityWeight stays 0. Measured on the example
fixture (scratchpad sweep, 2026-08-01): at every realistic cook count (2–5) Layer 1 at weight 0 already
yields 0–1 recipe-switches at optimal makespan (makespan = floor = 45); raising the weight buys no
continuity there and costs +4 min at 1 cook (68→72). The per-pack `affinityWeight` override remains the
tuning path for a denser pack that hops at weight 0. No code change: docs/10 already shipped the
mechanism and the default. (See also the "T5/affinity — per-index cook-minute golden" entry below,
which this consolidates.)

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
Resolved: 2026-08-01 (teacher) — option (b), generalize. `js/fillers.js` no longer special-cases the
sink: `sinkBusy`/`sinkFree` are replaced by a per-equipment `equipBusy` Map keyed by equipment id and
seeded from `schedule.equipmentUse`, with `equipFree(eid, start, dur)` enforcing that id's capacity
(an id with no pack entry = unlimited, generalising the old "no sink entry ⇒ ignore sink" rule). The
`choose` guard now fires for ANY `c.equipmentId`, not just `'sink'`. Output-safe: every current filler
is equipment-free or a hardcoded-sink washable, so all fixtures stay byte-identical (suite 108/108).
Test blind spot closed by a new fillers.test case ("a capacity-1 non-sink filler equipment is never
double-booked across cooks") that exercises the previously-unreached path and would have failed under
the old sink-only guard. 04 Stage 4c's generic wording is now actually implemented, not narrowed.

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
Resolved: 2026-08-01 (teacher) — all three conservative reads accepted as shipped: SOLO_CROWD
overlap uses the full `[startMin, runsUntilMin)` window; LONG_ACTIVE names the step by `shortLabel`;
UNBOWLED carries the offending ingredient ids in `stepIds`. No code change.

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
Resolved: 2026-08-01 (teacher) — accepted as shipped. Deriving UNTAGGED/UNBOWLED/LONG_ACTIVE from
pack+plan, reading CYCLE back out of a `{ ok:false }` schedule, and gating the makespan-dependent
warns on `schedule.ok === true` is the right coupling. Errors-then-warns ordering stands.

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
Resolved: 2026-08-01 (teacher) — accepted as shipped. Both load paths, the single "damaged link"
collapse for every failure a student can't fix, and the `^[\w.-]+\.json$` filename guard stand.

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
Resolved: 2026-08-01 (teacher) — ratified. The `{ pack, plan, persist, setNextEnabled }` shell
contract and the minimal app.js mount/refresh/reset edit stand as shipped; it served Screens 2–3
unchanged, confirming the one-time-contract read.

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
Resolved: 2026-08-01 (teacher) — ratified as shipped, same as the T10 wiring entry above. Screen 2
never gating Next is correct.

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
Resolved: 2026-08-01 — DONE as its own scoped change. `model.resolveDeps` now takes an optional
`plan`; a plan-side `plan.stepTags[id].dependsOnOverride` array wins over the pack (an array — even
`[]` — is authoritative, matching pack `[]` semantics). `buildGraph` (scheduler.js) and ui-manual now
pass `plan`. Safe exactly as this entry hoped: `plan.example.json` carries no override, so every golden
fixture is byte-identical and the full suite passes 107/107 (3 new resolveDeps tests added, incl. the
"absent override == pack result" invariant that guards the no-movement property). `findCycle` inside
`validatePack` stays pack-only (authoring time, no student plan); a student-introduced cycle is still
caught by `buildGraph`'s own topo-sort → CYCLE. See the T12 twin entry below.

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
Resolved: 2026-08-01 (teacher) — ratified as shipped, same as the T10/T11 wiring entries. The read-only
last screen using neither `persist` nor `setNextEnabled` is correct.

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
Resolved: 2026-08-01 — DONE (see the T11 twin entry above). Implemented exactly as predicted here:
`resolveDeps(pack, plan)` prefers the plan-side override. No golden fixture needed refreshing — the
example plan has no override, so nothing moved (107/107 pass). The T14 note #3 came true too: manual
mode (ui-manual) passes `plan` and now honours student overrides "for free".

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

## T13 — 06 resolves the T5 `equipmentChecklist.count` ambiguity: the count is never displayed

Asked: 2026-07-31 (surfaced during T13)
Context: the T5 entry "equipmentChecklist `count` semantics are undefined" left `count` provisionally
equal to `capacity`, to be pinned by T8/T12/T13 (the tickets that read 05/06). T13 reads 06, and
06's EQUIPMENT section shows the checklist as bare names with NO per-item count
(`[ ] Chef knife  [ ] Oven  [ ] Saucepan`); the ONLY count that appears is on the bowls line,
`Mixing bowls x<bowlCount>`, and bowls are not equipment (03). So the printed checklist needs the
equipment `name`s (alphabetical, checklist:true, actually used) plus a synthesized bowls entry —
and never reads `equipmentChecklist.count` at all.
Assumption used to keep moving: print.js builds the checklist from `schedule.equipmentChecklist`
names + `Mixing bowls x${schedule.bowlCount}`, sorted alphabetically; `count` is ignored on the
print side. This does not require changing the scheduler — `count = capacity` stays as T5 set it,
it is simply unused by the only consumer that reads 06. The T5 question can be considered resolved
for display purposes: no view needs a per-equipment count. Revisit only if T14 (manual mode) does.

## T13 — the 06 "minimum height 5mm" block rule conflicts with the passive-time pattern (overlaps)

Asked: 2026-07-31 (surfaced during T13 verification)
Context: 06-print-spec.md "Block rendering" says `height = (endMin - startMin) * scale`, "minimum
height 5mm so a 1-minute step is still readable." At the spec's 3mm/min, a passive step's cook-hold
marker is 1 minute = 3mm, floored to 5mm. But the cook is released at `endMin` and typically picks
up the NEXT task at that same minute, whose block top is `endMin * 3mm` = only 3mm below the marker
top — so the 5mm marker overruns the following block by ~2mm. Measured on the example plan
(fixtures/plan.example.json, 45 min, 4 cooks): 7 such lane overlaps, all from passive cook-hold
markers immediately followed by another assignment. This is precisely the "start a simmer and move
on" pattern the whole app exists to teach, so it is common, not a corner case. 05/T12 hit the same
geometry on screen and REMOVED the on-screen min-height (see the "on-screen timeline scale" entry),
but 06 still mandates 5mm for print and does not reconcile it with adjacency.
Assumption used to keep moving: T13 implements 06 literally — `Math.max(5mm, span*scale)` — and does
NOT invent a fix, per the working agreement ("continue with the spec as written; never invent
behavior"). The overlap is therefore present in the printed output as shipped. Three options for a
later ticket / teacher decision: (a) drop the print min-height too (markers become 3mm — still a
visible start tick, no overlap), matching what T12 did on screen; (b) clamp each block's height so
it never exceeds the next block's top in the same lane (keeps 5mm for genuinely standalone short
steps); (c) keep 06 as-is and accept the overlap. This needs a teacher call because it trades
"1-minute steps are 5mm readable" against "blocks never overlap," and 06 asks for both.

## T13 (follow-up) — RESOLVED: docs/03 vs docs/06 conflict on the passive-step continuation

Asked/resolved: 2026-08-01 (surfaced when the teacher printed the first real PDF)
Context: the two "5mm block minimum" and passive-rendering notes above came to a head in the first
printed PDF (tests/print.test/): blocks visibly overlapped. Root cause is a direct conflict between
two source-of-truth docs on where a passive step's long cook-time is drawn:
  - 03-data-model.md (Assignment note): "The print view draws the cook lane from startMin to endMin
    and the equipment strip from startMin to runsUntilMin."  → lane = the ~1-min hold only.
  - 06-print-spec.md (Block rendering): draw a dashed empty box IN THE LANE from endMin to
    runsUntilMin ("a thin start marker and a long empty box ... is the whole lesson").
06's in-lane box assumes the cook idles during their own passive step (as in 06's ASCII, where
Cook B only simmers). But the scheduler (Stage 3, correctly) releases the cook at endMin and fills
that time with other tasks — so the box lands on top of real work. Measured on the example plan:
11 overlaps with the 5mm minimum, 4 of them structural (the dashed continuation vs. the cook's next
task) and unremovable while the continuation lives in the lane.
Decision (teacher, 2026-08-01): follow docs/03. The cook lane is drawn startMin→endMin only; the
passive cook-time is shown in the equipment strip (which already draws each equipmentUse interval
startMin→runsUntilMin, i.e. the full occupancy). 06's in-lane dashed continuation is dropped.
Changes made in T13 follow-up (js/print.js, css/print.css):
  1. renderBlock no longer emits the in-lane "↓ runs to :NN" continuation box (and its CSS is gone).
  2. The hard `Math.max(5mm, span*scale)` minimum is replaced by a clamp: a block grows toward 5mm
     for legibility but never past the next block's top, so back-to-back 1-min steps never overlap.
Result: 0 lane overlaps on the example plan (was 11); the equipment strip still shows the passive
cook-time (12 of 13 bars span >1 min).
Known limitation of this choice (revisit if it bites): a passive step whose only equipment has
capacity > 2 (or no equipment) has no bar in the strip AND no continuation in the lane, so its
cook-time is not visible anywhere. In the example pack this affects "Rest off heat" (rests on a
capacity-5 plate). If that matters, either widen the strip's inclusion rule or restore a thin in-lane
"still cooking" left-rail marker (the third option offered to the teacher). Left as docs/03 specifies.

## T13 (follow-up) — print timeline scale grows to fill the page (deviation from 06's fixed 3mm)

Asked/decided: 2026-08-01 (surfaced from the first printed PDF)
Context: 06-print-spec.md fixes "1 minute = 3mm" (2mm above 70 min). At 3mm a short plan fills only
part of the page — the example (45 min) is 135mm on a ~210mm usable area — so 1-minute passive holds
were only 3mm tall and their 9pt labels were clipped by the block edge (looked struck-through), while
half the page sat blank. 06's overriding goal is legibility ("read from three feet away").
Change made (js/print.js pickScale): 3mm is now the FLOOR, not a fixed value. When a plan is short
enough to leave room, the scale grows to fill the page (AVAIL_TIMELINE_MM = 210mm), capped at 6mm/min
so a tiny plan isn't absurd; it still drops to 2mm only when 3mm would overflow a page (makespan > 70)
or lanes would fall below 30mm. For the example this yields 4.67mm/min: timeline 210mm, smallest block
4.67mm (label fits), 0 overlaps, page-2 content ~235mm (fits one letter page). Also: the FLOOR label
now sits just above its rule (css) so it no longer overprints the footer when floorMin == makespanMin.
Trade-off: the printed scale is no longer a constant "ruler" across plans, so two students' sheets
may use different mm/min. Mitigated by the labelled minute spine (you read time off the spine, not a
ruler). Revert to fixed 3mm by returning MM_PER_MIN_NORMAL from pickScale if the teacher prefers the
constant scale. Left as an enhancement pending the teacher seeing the printed result.

## T14 — the pack "mode flag" has no definition in docs/03

Asked: 2026-08-01 (surfaced during T14)
Context: 07-build-plan.md T14 names "a mode flag in the pack" as a deliverable, but 03-data-model.md
defines the Pack field-by-field and never mentions a mode. So the field name, its allowed values,
its default, and whether validatePack must check it are all unspecified.
Assumption used to keep moving (teacher deferred both T14 open questions to me): the flag is an
OPTIONAL `pack.mode` string — `"manual"` selects manual mode; ABSENT or any other value ⇒ `"auto"`
(the existing auto-scheduler review). model.js is left UNTOUCHED: it is a frozen T2 pure module,
editing it for one optional field is the prior-ticket refactor the working agreement forbids, and
validatePack already ignores fields outside its checklist, so an unknown `mode` never fails
validation. app.js reads `pack.mode` to route Screen 3. Revisit if the teacher wants `mode`
formally validated (add an enum check to validatePack + a model.test case) or wants author.html to
expose a mode toggle (out of T14's named files — T14 ships ui-manual.js + styles + the flag only).

## T14 — manual mode reused the Screen-3 shell mount, so app.js was edited (same pattern as T10–T12)

Asked: 2026-08-01 (surfaced during T14)
Context: docs/01's deferred section says manual mode "replaces the auto-scheduler," and T14 ships only
`js/ui-manual.js` + styles + the mode flag — it does not name app.js/index.html. But the shell
(app.js) hardcodes SCREEN_COUNT = 4 and mounts ui-review on Screen 3; manual mode needs a mount
point. This is the identical "shell-wiring" situation T10/T11/T12 each hit and logged.
Change made (kept minimal, mirroring the prior three): app.js imports `ui-manual.mount` and, in the
Screen-3 branch, picks `mountManual` when `pack.mode === 'manual'` else `mountReview`; both return the
same `{ refresh }` handle held in `reviewCtl`, which is already reset to null on resume/start-over so
a replaced plan re-mounts either one. index.html is UNCHANGED (ui-manual clears the Screen-3
placeholder via textContent, exactly as ui-review does). So manual mode occupies Screen 3 ("Your
plan"); the four-dot flow, footer, and Screens 0–2 are untouched.
Assumption used to keep moving: replacing Screen 3 (not adding a fifth screen) is the right reading of
"replaces the auto-scheduler." Revisit if the teacher wants BOTH views reachable from one pack.

## T14 — manual placement model (serial lane stacks, uniform cards, in-memory) is under-specified

Asked: 2026-08-01 (surfaced during T14)
Context: docs/01's manual-mode spec is one paragraph ("drag blocks into lanes; validate dependencies
and equipment; show the student's makespan beside the algorithm's; no auto-placement"). Everything
concrete had to be derived. Decisions made (teacher deferred to me), all in js/ui-manual.js:
1. PLACEMENT: each cook lane is an ordered stack; a block starts when the previous block in that lane
   ends, so its window is [start, start + StepTag.durationMin]. A cook does one block at a time. A
   block's end therefore equals the step's runsUntilMin, which is exactly when dependencies clear
   (04 Stage 3a) — so dependency timing stays consistent with the scheduler with no endMin split.
   Known simplification: this omits within-cook passive release (the auto-scheduler frees a cook ~1
   min into a passive step; here the cook holds the full duration). Parallelism is therefore ACROSS
   cooks only, so a student's makespan is a naive upper bound they beat by distributing work — which
   is the lesson. A richer model (release the cook on passive steps, leaving an in-lane gap) is a
   future enhancement; it would change makespan arithmetic and the board's geometry.
2. BLOCKS are uniform-height tap-target CARDS with the duration printed on them, NOT to-scale bars
   like the review/print rail — a Chromebook needs a 44px target (docs/02) more than pixel-accurate
   height, and the makespan number carries the time. Deliberate visual difference from Screen 3-auto.
3. DEPENDENCIES are resolved with model.resolveDeps(pack) — pack-side, the same map the scheduler
   uses. This inherits the still-open T11/T12 issue that student-authored plan.stepTags[id].
   dependsOnOverride is not consumed anywhere; if that is ever wired into resolveDeps, manual mode
   picks it up for free. Cross-recipe and transitive chains are enforced (verified on the example).
4. STATE is in-memory in the mount closure; it is NOT written to the plan or the localStorage draft,
   because 03 defines no field for a manual arrangement. Consequences: the board is empty on every
   entry and a mid-plan cook-count change (Screen 0) resets it (lanes are rebuilt to match the new
   count, returning all steps to the tray). Revisit if the teacher wants a manual arrangement to
   persist across reloads — that needs a new plan field in 03 and codec coverage.

## T14 — printing a manual arrangement is deferred (done-when requires the print view unchanged)

Asked: 2026-08-01 (surfaced during T14)
Context: docs/01 says manual mode uses the "same print view," but T14's done-when is "the print view
is unchanged," and print.js recomputes a Schedule from the plan via buildSchedule — i.e. it prints
the ALGORITHM's arrangement, not the student's manual placement. Printing the manual board through
the unchanged print view would require synthesizing a Schedule object from the placement and feeding
it in, which changes the print path.
Assumption used to keep moving: manual mode ships WITHOUT a print button in v1. It is a placement +
validation + makespan-comparison board; the print view is left byte-for-byte unchanged, satisfying
the done-when literally. Making the manual arrangement printable (synthesize a Schedule from the
lane stacks → the existing print.html/print.js render it) is a real follow-up feature with its own
decisions (fillers? equipment strip from manual placement?), out of T14's named files.

## T5/affinity — the per-index cook-minute golden table is superseded by docs/10 Layer 1

Asked: 2026-08-01 (surfaced implementing docs/10-affinity-amendment.md into js/scheduler.js)
Context: docs/10's Layer 1 ("cook selection is free") is ON at every weight including 0, and it
deliberately changes WHICH cook does a step to keep stations coherent — the amendment states
"affinity at weight 0 changes who does what, never when." Measured on the example fixture at
`affinityWeight = 0`: floor (45) and makespans (68/47/45/45/45) are byte-identical to the baseline,
as the amendment guarantees, but the PER-INDEX cook-minute split moves — e.g. 2 cooks is now
[24, 33] where `fixtures/README.md`'s golden table (and the old scheduler.test.js assertion) had
[34, 23]. The TOTAL cook-minutes is conserved (57 at every cook count, both before and after),
because total busy time is fixed by the tags and independent of assignment.
The amendment re-states the surviving golden as "floor 45 and makespans 68/47/45/45/45" and pointedly
omits cook-minutes, so the per-index row is not one of the numbers it promises to hold.
Change made (not invented — driven by docs/10): the existing test
`fixture: cook-minutes for N cook(s) match the golden table` was changed to
`fixture: total cook-minutes for N cook(s) are conserved`, asserting the SUM against the same golden
row (so the golden data still anchors the test) rather than the per-index values. The floor/makespan
golden tests are UNCHANGED and still pass. This did not touch fixtures/README.md.
Teacher decision needed: either (a) refresh `fixtures/README.md`'s per-index cook-minute table to the
new affinity distribution (for the record it is: 1c [57], 2c [24,33], 3c [22,29,6], 4c [22,29,2,4],
5c [22,29,2,1,3]) and keep a per-index assertion, or (b) accept the conserved-total assertion as the
right invariant now that per-index is a Layer-1 relabeling with no timing meaning. I left it at (b).
Resolved: 2026-08-01 (teacher) — option (b). Keep the conserved-total assertion; the per-index split
is a Layer-1 relabeling with no timing meaning and, unlike the total/makespan, is NOT hand-derivable
from the spec, so baking it into the golden reference would invert the "golden values come from the
spec, not the code" principle. `fixtures/README.md`'s per-cook column is now annotated as the
pre-affinity baseline (floor + makespans there stay authoritative). No code change; the affinity
commit b0990a5 already ships assertion (b).

## Manual test log

(Dated results from `09-test-plan.md` Part 4 go here.)

### 2026-08-01 — T14 manual-mode validation (isolated Node ESM harness)
Ran the exported pure helpers of js/ui-manual.js (findViolations/computeBlocks/studentMakespan)
against fixtures/recipe-pack.example.json + plan.example.json. 7/7 checks passed:
- unmet dependency flagged ("Place X before Y — Y needs it done first");
- out-of-order dependency flagged ("Y starts before X finishes");
- correctly-ordered pair raises no flag for that pair (transitive upstream deps still flagged — correct);
- blocks stack serially with correct start/end; student makespan = last block end;
- equipment over-capacity flagged by name (Oven, capacity 1, used by "Preheat oven" + "Finish in oven");
- algorithm makespan computes for comparison (45 min on the example plan).
Not verifiable here: the drag/tap DOM interactions and the CSS board layout (need a browser on a
Chromebook); the app.js Screen-3 routing was code-reviewed, not run (no manual-mode fixture exists —
the example pack has no `mode` field, so it correctly routes to the auto review).
