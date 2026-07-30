# 09 — Test Plan

No test framework. `tests/test.html` imports every `*.test.js` and calls `report()`.
Tests are the only defence against a scheduler regression, and a scheduler regression is
invisible — the output still looks like a schedule.

## Part 1 — Invariants (run on every fixture, for cooks = 1,2,3,4,5)

These must hold for any valid input. They catch most real bugs without anyone hand-computing
an expected timeline.

1. **Dependencies respected.** For every scheduled step and every dependency `d`:
   `startMin >= runsUntilMin(d)`.
2. **No cook double-booked.** For each cook, sorted assignments (steps and fillers together)
   never overlap: each `startMin >= previous endMin`.
3. **Equipment capacity never exceeded.** For every minute `m` in `[0, makespanMin)` and
   every equipment id, the number of intervals with `startMin <= m < endMin` is
   `<= capacity`.
4. **Makespan is not below the floor.** `makespanMin >= floorMin`. If it is ever lower, the
   graph or the tails are wrong.
5. **Complete.** Every step in the pack appears exactly once in exactly one cook's
   assignments.
6. **Deterministic.** `JSON.stringify(buildSchedule(p, pl))` is identical across two calls
   and across a shuffle of the input arrays' order.
7. **Fillers are free.** `makespanMin` before and after `fillGaps` is identical.
8. **One cook is a bound.** `makespanMin` with 1 cook is `>=` makespan with 2 cooks, which is
   `>=` 3, and so on. Adding a cook must never make the plan longer.

Invariant 8 is the single best smoke test in the suite. It fails loudly whenever a tie-break
or an equipment check is subtly wrong.

## Part 2 — Hand-computed cases

Each is a tiny pack built inline in the test file. Expected values are exact.

**Case A — serial chain.** 1 cook. Three active steps, 5 min each, chained.
→ `floorMin = 15`, `makespanMin = 15`, cook idle 0.

**Case B — passive dominates.** 1 cook. Step 1 passive 20 min (attention 1), Step 2 active
5 min depending on Step 1.
→ `floorMin = 25`, `makespanMin = 25`. Cook works minutes 0–1 and 20–25, so cook time is 6
and idle is 19. Fillers must occupy at least 3 of the idle slots after `fillGaps`.

**Case C — free parallelism.** 2 cooks. Two independent recipes, one active 10-minute step
each, no shared equipment.
→ `floorMin = 10`, `makespanMin = 10`, both cooks busy 0–10.

**Case D — equipment contention.** 2 cooks. Two independent active 10-minute steps, both
requiring `oven` with `capacity: 1`.
→ `makespanMin = 20`. One cook idles 0–10 or 10–20. This proves the capacity check works;
without it the answer would wrongly be 10.

**Case E — the passive tie-break.** 1 cook. At minute 0, two independent steps are ready:
step `s_a` active 10 min, step `s_b` passive 10 min. Both have `tail = 10`, so rule 1 ties
and rule 2 decides.
→ `s_b` starts at 0, the cook is released at 1, `s_a` runs 1–11. `makespanMin = 11`.
If the implementation gets the tie-break backwards, `s_a` runs 0–10, `s_b` runs 10–20, and
`makespanMin = 20`. **This case is the whole reason rule 2 exists** — keep it in the suite
forever.

**Case F — the blocked candidate must not stall the minute.** 2 cooks. At minute 0: `s_hi`
has the longest tail but needs `oven` (capacity 1) which a passive step already occupies
until minute 30; `s_lo` needs nothing.
→ `s_lo` starts at 0 on the free cook. If the implementation stalls the whole minute when
the top-priority candidate is blocked, `s_lo` starts at 30 and the makespan balloons.
This tests the "skip this candidate and continue" clause in Stage 3c.

## Part 3 — Codec and model

- Round-trip: `decodePack(encodePack(pack))` deep-equals `pack` for the example fixture.
- Malformed input: truncated, non-base64, empty, and `undefined` all return `{ ok: false }`
  and never throw.
- Every validation code from `03-data-model.md` has one triggering and one passing test.

## Part 4 — Manual checks (there is no automated UI test; do these by hand)

Record results in `OPEN-QUESTIONS.md` under a `## Manual test log` heading, dated.

1. Chromebook, Chrome, inside a Canvas iframe at 900px wide: complete the whole flow.
2. Trackpad only, no mouse: complete Screen 1 using taps.
3. Keyboard only: reach and operate every control; focus is always visible.
4. Print preview at 100%, black-and-white, headers off: passive blocks look different from
   active ones; nothing is clipped; the floor line is where the number says it is.
5. `localStorage` disabled in site settings: the app still works start to finish.
6. Offline after first load: the app still works (no runtime network requests at all).
7. 360px-wide window: nothing overlaps or overflows horizontally.

## Part 2b — Fixture golden values

`tests/scheduler.test.js` must also assert the reference table in `fixtures/README.md`:
`floorMin === 45`, the exact critical path, and the makespans 68 / 47 / 45 / 45 / 45 for
1 through 5 cooks. These come from the spec, not from an implementation, so they are a real
check rather than a snapshot of whatever the code happened to do first. Never regenerate
them from your own output.
