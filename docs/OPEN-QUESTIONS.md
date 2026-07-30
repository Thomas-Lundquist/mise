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

## Manual test log

(Dated results from `09-test-plan.md` Part 4 go here.)
