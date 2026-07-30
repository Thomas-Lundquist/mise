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

## Manual test log

(Dated results from `09-test-plan.md` Part 4 go here.)
