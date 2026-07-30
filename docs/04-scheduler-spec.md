# 04 — Scheduler Spec

This is the heart of the app. Implement it **exactly** as written. Every tie-break exists
for a reason and changing one changes the output for every student.

Module: `js/scheduler.js`. Pure, deterministic, no DOM, integer minutes only.

```js
export function buildSchedule(pack, plan) -> Schedule
```

## Why this algorithm and not another

The problem is job-shop scheduling with shared machines, which is NP-hard in general. But
the instances here are tiny: at most ~40 steps, at most 5 cooks, at most ~10 equipment
entries. At that size, **critical-path list scheduling** — the greedy method below — lands
within a few percent of optimal, runs in under a millisecond, and is explainable step by
step. That last property is the deciding one. A student must be able to ask "why does the
rice start first?" and get the answer "because it has the longest chain of work after it."
An exact solver would need WASM or a server, take seconds, and produce a timeline nobody in
the room can justify. A language model would be nondeterministic and would quietly paper
over a student's mis-tagging instead of letting the schedule visibly bloat, which is the
feedback the assignment depends on.

Accept that greedy is occasionally 1–3 minutes worse than optimal. That is the correct
trade.

## Stage 1 — Build the graph

1. For every step in every recipe, resolve its dependencies:
   - `dependsOnOverride === null` → the step with `order - 1` in the same recipe, or no
     dependency if `order === 1`.
   - `dependsOnOverride === []` → no dependencies.
   - otherwise → exactly the listed step ids.
2. Topologically sort. If a cycle exists, return
   `{ ok: false, warnings: [{ code: "CYCLE", severity: "error", ... }] }`.
3. For each step, read its `StepTag` from the plan. Derive:
   - `dur = tag.durationMin`
   - `cookHold = tag.hands === "busy" ? dur : Math.min(1, dur)`

## Stage 2 — Tails and the floor

Walk the topological order in reverse:

```
tail[s] = dur[s] + max(0, max over successors t of tail[t])
floorMin = max over all steps s of tail[s]
```

`tail` is the longest remaining elapsed time from the start of `s` to the end of the whole
lab. `floorMin` is the critical path: no number of cooks can beat it, because it is a chain
of things that must happen one after another.

Mark `criticalStepIds`: start from the step whose `tail === floorMin` (lowest id wins ties)
and repeatedly walk to whichever successor has the largest `tail` (lowest id wins ties)
until there are no successors.

**Note that `dur` is used here even for passive steps.** Twenty minutes of simmering is
twenty minutes of elapsed time whether or not a cook is standing there. This is exactly why
starting the rice early is correct, and the algorithm discovers that on its own.

## Stage 3 — The simulation

State:

```
t          = 0                       // current minute
cookFreeAt = [0,0,...]               // length kitchen.cooks
stepEnd    = {}                      // stepId -> runsUntilMin, once scheduled
scheduled  = new Set()
assigned   = []                      // Assignment records
equipBusy  = []                      // { equipmentId, startMin, endMin, stepId }
```

Loop until every step is scheduled:

**3a. Ready set.** A step is *ready at t* if it is not scheduled and, for every dependency
`d`, `d` is scheduled and `stepEnd[d] <= t`. Note: dependencies clear at `runsUntilMin`,
not when the cook was released — food is not done just because someone walked away.

**3b. Sort the ready set** by these keys, in this order:

1. `tail` **descending** — longest remaining chain first. This is the critical-path rule.
2. `hands === "free"` **first** — on a tie, start the unattended thing, because it buys
   parallel time for free.
3. `dur` **descending**.
4. `stepId` ascending, as a string compare. This exists purely to guarantee determinism.

**3c. Assign greedily.** Walk the sorted ready list in order. For each candidate:

- Find the lowest-index cook with `cookFreeAt[i] <= t`. If there is none, stop assigning
  for this minute.
- Check equipment. For each `equipmentId` on the step, count how many entries in
  `equipBusy` satisfy `startMin <= t && endMin > t`. If that count is `>= capacity` for
  any of them, **skip this candidate** and continue to the next one. Do not stall the
  whole minute on a blocked step.
  - Because the simulation never schedules anything in the future, checking capacity at
    the single instant `t` is sufficient — every busy interval that overlaps
    `[t, t + dur)` must already be open at `t`.
- Otherwise schedule it:
  ```
  startMin     = t
  runsUntilMin = t + dur
  endMin       = t + cookHold
  cookFreeAt[cook] = endMin
  stepEnd[stepId]  = runsUntilMin
  push equipBusy entries with startMin = t, endMin = runsUntilMin
  push an Assignment with kind "step"
  ```
- Continue walking the list; more than one step may start in the same minute.

**3d. Advance the clock.** Set `t` to the smallest value strictly greater than the current
`t` among: every `cookFreeAt[i]`, every `equipBusy[j].endMin`, and every `stepEnd` value.
If no such value exists but steps remain unscheduled, throw
`Error('scheduler: deadlock at minute ' + t)` — that is a bug in the graph, not a valid
outcome. Guard the loop at 600 minutes and throw if exceeded.

`makespanMin = max over scheduled steps of runsUntilMin`.

## Stage 4 — Fillers (`js/fillers.js`)

Runs **after** the cooking schedule is fixed. Fillers never move, delay, or displace a
cooking step. This is the property that makes the feature safe: worst case a student has
idle time, best case the kitchen is clean when the food is done.

```js
export function fillGaps(schedule, pack, plan) -> Schedule   // returns a new object
```

**4a. Derive washables** (these come first in priority because they are real and specific):

- **Bowls.** For each bowl, find every step whose `consumesBowlOf` contains any ingredient
  id in that bowl. The bowl becomes available at the **latest** `runsUntilMin` among those
  steps. Emit `{ label: "Wash bowl 3", durationMin: 2, availableAt, equipmentId: "sink" }`.
  A bowl no step consumes becomes available at minute 0.
- **Tools.** For each equipment entry with `checklist: true` and capacity `<= 2`, find the
  last step that uses it; if that step's `runsUntilMin < makespanMin`, emit
  `{ label: "Wash the " + name.toLowerCase(), durationMin: 3, availableAt: runsUntilMin,
  equipmentId: "sink" }`.

**4b. Generic fillers** are `pack.fillerTasks`, available from minute 0, in array order.
A non-`repeatable` task may be used at most once in the whole schedule.

**4c. Gap filling.** For each cook in index order, compute their idle intervals within
`[0, makespanMin]` from their step assignments. For each idle interval with length
`>= MIN_GAP` (constant: **3**):

```
cursor = gap.start
loop:
  candidates = unused fillers where availableAt <= cursor
               and durationMin <= gap.end - cursor
               and (no equipmentId, or that equipment has free capacity
                    across [cursor, cursor + durationMin) counting other fillers too)
  if none: break
  pick: washables before generic; then earliest availableAt; then longest durationMin;
        then array/derivation order
  assign at cursor as kind "filler"; mark used; cursor += durationMin
```

Sink capacity matters: if the pack defines a `sink` equipment entry, honour it so the
schedule never sends three cooks to one sink. If the pack has no `sink` entry, ignore
`equipmentId: "sink"` on derived washables.

Leftover idle under 3 minutes is fine and prints as blank lane space. Do not invent
filler tasks that are not derived or listed in the pack.

## Stage 5 — Warnings (`js/warnings.js`)

```js
export function checkPlan(pack, plan, schedule) -> Warning[]
```

| Code | Severity | Condition | Message |
|---|---|---|---|
| `CYCLE` | error | dependency cycle | "These steps depend on each other in a loop." |
| `UNTAGGED` | error | any step missing a tag | "Some steps still need a time." |
| `UNBOWLED` | error | any ingredient not in a bowl | "N ingredients aren't in a bowl yet." |
| `OVER_PERIOD` | warn | `makespanMin > pack.labMinutes` | "This plan runs M minutes but the period is L." |
| `LONG_ACTIVE` | warn | a step with `hands: "busy"` and `dur >= 20` | "Are your hands really busy for the whole 20 minutes on '<step>'?" |
| `IDLE_HEAVY` | warn | any cook with `utilizationPct < 50` | "Cook C is standing around for most of the lab." |
| `FAR_FROM_FLOOR` | warn | `makespanMin > floorMin * 1.4` | "This could run in about F minutes. Look for something to start earlier." |
| `SOLO_CROWD` | warn | `kitchen.cooks >= 3` and fewer than 2 steps ever run at the same time | "Almost nothing overlaps — check which steps could happen at the same time." |

`LONG_ACTIVE` and `FAR_FROM_FLOOR` are the two that do the actual teaching. Word them as
questions, not verdicts, and never block on them.

## Known limitations — document, do not fix

- **No lookahead reservation.** A greedy scheduler will occasionally start a short step on
  the only free burner one minute before a critical step needs it. Acceptable at this scale.
- **A passive step needing a cook at the end** (pull the tray out) must be authored as its
  own 1-minute active step. Do not add an `endAttention` field.
- **No cook preferences or skill levels.** Cooks are interchangeable by design; that is
  what solves the role-equity problem in the kitchen.
- **No travel or setup time.** If it matters, the teacher pads a step's suggested duration.
