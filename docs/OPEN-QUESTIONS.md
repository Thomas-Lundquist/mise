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

## Manual test log

(Dated results from `09-test-plan.md` Part 4 go here.)
