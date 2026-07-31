# 10 — Station Affinity (amends 04-scheduler-spec.md)

This document **replaces Stages 3b and 3c** of `04-scheduler-spec.md` and adds one field to
the data model and several test cases. Everything else in `04` stands unchanged: tails, the
floor, dependency clearing at `runsUntilMin`, the equipment capacity check, the clock
advance, and the whole of Stage 4 (fillers) and Stage 5 (warnings) are untouched.

Read this alongside `04`, not instead of it. Where the two appear to conflict on Stages 3b–3c,
this document wins; everywhere else, `04` wins.

## Why this change exists

The baseline scheduler assigns the best available task to the first available cook. That is
optimal for *timing* but produces incoherent stations: a cook does a pilaf step, gets pulled
to the chicken, then back to the pilaf. A real kitchen keeps a cook on a dish while it makes
sense to. We want that coherence **without** reintroducing idle time or forcing one cook to
carry a whole dish (which would make that cook the critical path and starve the others).

The fix is two layers, and it is essential to understand that they are different:

- **Layer 1 — cook selection — is free.** Once a task is chosen, giving it to the cook who
  last worked that dish never changes *when* anything happens, because cooks are
  interchangeable in capability. It only changes whose name is on the block. This is always
  on and costs nothing. Every invariant in `09` still holds exactly.
- **Layer 2 — task selection — is the tunable part.** Preferring an on-dish task over a
  slightly-more-urgent one is what can trade a little speed for coherence. This is the only
  thing allowed to affect the makespan, and it is controlled by a single number,
  `affinityWeight`.

Both layers are the *same mechanism* in the code below (one "on-dish first" sort key); the
distinction is conceptual, so you understand what the knob does and does not put at risk.

## The knob: `affinityWeight`

One integer, in **minutes of tail-slack**. Meaning: "I will let a cook stay on their dish
even if the on-dish task is up to `affinityWeight` minutes less urgent than the most urgent
ready task."

- `affinityWeight = 0` → Layer 2 off. Affinity only decides genuine ties. Free coherence
  from Layer 1, and **every invariant in `09` holds exactly, including invariant 8.** The
  makespan is byte-identical to the no-affinity baseline. This is the safe default.
- `affinityWeight = 3` → a cook may stay on their dish for a task whose tail is within 3
  minutes of the best. Stickier stations; makespan may rise by a bounded amount.
- Higher values → stickier still, more potential makespan cost.

**Where it lives.** A module constant at the top of `js/scheduler.js`:

```js
export const AFFINITY_WEIGHT = 0;   // minutes of tail-slack traded for station coherence
```

If `pack.affinityWeight` is present and is an integer >= 0, it overrides the constant for
that pack. This is the tuning path: set it in a pack, run several recipes, watch the reported
makespan-vs-floor, and once you are happy with a value, bake it into the constant as the new
default and drop the per-pack field. Absent or invalid `pack.affinityWeight` falls back to
the constant. A negative value is clamped to 0.

## New per-cook state

Each cook gains one field, tracked during the simulation:

```
lastRecipeId   // the recipeId of the last STEP this cook was assigned; null at start
```

Set it at the moment of assignment: when step `s` is assigned to cook `c`, immediately set
`c.lastRecipeId = s.recipeId`, so the next assignment in the same minute already sees it.
Fillers (Stage 4) never touch `lastRecipeId`. `null` matches no recipe.

---

## Stage 3b–3c REPLACEMENT — assignment within a minute

At each minute `t`, assign one (cook, step) pair at a time by the procedure below, repeating
until no free cook or no assignable step remains, then advance the clock exactly as in `04`
Stage 3d.

Let `w = effective affinityWeight` (pack override or constant, clamped to >= 0).

**Repeat until no assignment is made this pass:**

1. **Free cooks.** `freeCooks = { cooks c : cookFreeAt[c] <= t and c not yet assigned this
   minute }`. If empty, stop for this minute.

2. **Feasible ready steps.** `ready = { steps s : not scheduled, not assigned this minute,
   every dependency d has stepEnd[d] <= t, AND every equipment id on s has free capacity at
   t }`. The equipment check is the same instantaneous count as `04` Stage 3c. If `ready` is
   empty, stop for this minute. (A step blocked only by equipment simply isn't in `ready`
   this minute; it reappears when the equipment frees. This preserves Case F.)

3. **The band.** `bestTail = max(tail[s] for s in ready)`.
   `band = { s in ready : tail[s] >= bestTail - w }`.
   At `w = 0` the band is exactly the steps tied for the highest tail.

4. **Choose the pair.** Among all pairs `(c, s)` with `c in freeCooks` and `s in band`, pick
   the single best by this ordered key (earlier key dominates; every comparison is
   ascending, so lower sorts first and wins):

   1. **On-dish first:** `0 if c.lastRecipeId === s.recipeId else 1`.
   2. **Step urgency:** `-tail[s]`.
   3. **Passive first:** `0 if tag.hands === "free" else 1`.
   4. **Longer step first:** `-durationMin[s]`.
   5. **Cook index:** `c.index` ascending.
   6. **Step id:** `s.id` ascending, string compare.

5. **Assign it** exactly as in `04` Stage 3c: compute `startMin`, `runsUntilMin`, `endMin`,
   update `cookFreeAt[c]` and `stepEnd[s]`, push the equipment intervals, push the
   Assignment, and set `c.lastRecipeId = s.recipeId`. Mark `c` assigned this minute.

Then advance the clock per `04` Stage 3d and continue the outer loop.

### Why this is correct and safe

- **No affinity in the band → identical to baseline.** If no free cook is on-dish for any
  band step, key 1 is `1` for every pair and the choice falls through to keys 2–6, which is
  the original `04` ordering. Nothing changes.
- **Layer 1 is captured here.** When the top step is, say, a pilaf step and both an on-pilaf
  and an on-chicken cook are free, key 1 hands it to the on-pilaf cook. This costs nothing —
  it only relabels — and it is what removes most visible hopping.
- **Layer 2 is bounded by `w`.** Affinity can promote a lower-tail step only if that step is
  within `w` of `bestTail`, because steps outside the band are not candidates at all. The
  makespan cost is therefore bounded by the knob, not open-ended.
- **Determinism holds at every weight.** Keys 5 and 6 are total orders, so no pair is ever
  truly tied, and `lastRecipeId` evolves deterministically. Invariant 6 holds for any fixed
  `w`.

---

## Data model addition (amends 03-data-model.md)

Add to the **Pack** object, optional:

```js
affinityWeight: 0    // OPTIONAL integer >= 0. Tuning override for the scheduler's station
                     // coherence. Omit to use the scheduler's built-in default. Higher =
                     // stickier stations, at a possible cost to total time.
```

`validatePack` must accept a missing field, accept any integer >= 0, and raise a new
`BAD_AFFINITY` error (severity error) if the field is present but not an integer >= 0.

## Schedule output addition

Add two fields to the `Schedule` object so tuning is observable without reading the timeline:

```js
affinityWeightUsed: 0    // the effective weight this schedule was built with
costOverFloorMin: 0      // makespanMin - floorMin; how far above the theoretical floor
```

`costOverFloorMin` is the number to watch while tuning. At `affinityWeight = 0` it is the
baseline cost of the schedule's real constraints. As you raise the weight, watch how many
minutes you are trading for coherence, and stop where the timeline reads like a real kitchen
without the number climbing further than you're willing to accept.

---

## The honest caveat about invariant 8

Invariant 8 (`09-test-plan.md`) — *adding a cook must never lengthen the plan* — is
**guaranteed only at `affinityWeight = 0`.** Above zero, deliberately keeping a cook on their
dish can leave another cook idle when spreading the work would have finished sooner, which is
exactly the kind of case that can make a 4-cook plan a minute longer than a 3-cook plan. This
is not a bug; it is the trade the knob exists to make, and it is why the knob exists rather
than being hard-coded.

Handle it in the test suite like this:

- Invariant 8 is asserted **hard at `affinityWeight = 0`.** It must never fail there; if it
  does, Layer 1 has leaked into timing and there is a real bug.
- Above 0, invariant 8 becomes a **reported observation, not an assertion.** The suite prints
  the makespan for each cook count at the tuned weight so a regression is visible, but does
  not fail the build on a non-monotone row.

Invariants 1–7 (dependencies, no double-booking, equipment capacity, makespan >= floor,
completeness, determinism, fillers-are-free) hold at **every** weight and stay hard asserts.

---

## New test cases (amends 09-test-plan.md Part 2)

**Case G — cook affinity is free.** 2 cooks. Two recipes, R1 and R2, each a chain of two
active 5-minute steps, no shared equipment, so both chains run fully in parallel. Run at
`affinityWeight = 0`.
→ `makespanMin = 10`, identical to the no-affinity baseline. Additionally assert **coherence**:
the cook who does `R1` step 1 also does `R1` step 2 (not a cross-assignment). This proves
Layer 1 clusters work at zero timing cost.

**Case H — the band trades urgency for coherence.** 1 cook is not enough to show it; use 2.
Construct a minute where the highest-tail ready step belongs to R2 but a free cook just
finished an R1 step, and an R1 step sits in the band (tail within the test's weight of best).
- At `affinityWeight = 0`: the R2 step (higher tail) is taken; assert that exact assignment.
- At `affinityWeight` = the gap between the two tails: the on-dish R1 step is promoted;
  assert that exact assignment instead.
This proves the knob actually moves the choice and does so by the documented amount.

**Case I — determinism at a nonzero weight.** Take the example fixture, set
`affinityWeight = 3`, run `buildSchedule` twice, and assert byte-identical JSON. Then shuffle
the order of recipes, steps, and cooks in the input and assert the output is unchanged.
Determinism must not depend on the weight.

**Fixture check at weight 0.** With `affinityWeight = 0`, the example fixture must still
produce **exactly** the golden values in `fixtures/README.md`: floor 45 and makespans
68 / 47 / 45 / 45 / 45. Affinity at weight 0 changes who does what, never when, so these
numbers must not move. If they move, Layer 1 has a timing leak.

**Invariant 8 at weight 0.** Keep the existing hard assert. Add a separate,
non-failing report of the makespan-by-cook-count row at `affinityWeight = 3` so tuning
regressions are visible without breaking the build.

---

## Build-plan note (amends 07-build-plan.md)

This amendment lands as part of **T5**, not as a new ticket — it is a modification to the
simulation, and building the baseline and the affinity layer separately would mean writing
Stage 3 twice. When implementing T5, read `04` Stages 1–2 and 3d, then implement Stages
3b–3c from *this* document. The session that does T5 must attach both `04` and this file.

`js/model.js` (T2) should be updated to know the optional `affinityWeight` field and the
`BAD_AFFINITY` check; if T2 is already done, fold that small addition into the start of T5
and note it in the T5 commit message.

## Optional, not specified here

Dish-aware fillers — "wash the bowls from *your* dish first" — would be a natural extension,
since `lastRecipeId` and `consumesBowlOf` together make it computable. It is deliberately out
of scope for this amendment to keep Stage 4 unchanged. Consider it only after the core
affinity behavior is tuned and you are happy with it.
