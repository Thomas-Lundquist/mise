# Tests

```
node test/run.mjs
```

No dependencies, no build step, no test framework — the app is plain static
files and these keep it that way. Each file runs standalone too:

```
node test/schedule.test.mjs
```

`run.mjs` starts each file in its own process, which is required rather than
tidy: the storage tests stub `globalThis.window` to fake a locked-down iframe,
and `storage.js` picks its tier once at import time. Sharing a process would let
one test's fake browser leak into the next.

## What's covered

These test the parts where a mistake is silent — the plan's own bookkeeping,
scheduling arithmetic, and persistence. Anything that needs a DOM is checked in
the browser instead.

**`model.test.mjs`** — the rule that nothing in a plan is write-once, and that
deleting something other parts point at clears the reference and keeps the rest.
Every one of these cascades used to be untested:

- removing equipment clears it off the steps that used it, and keeps the steps
- removing a bowl loosens its ingredients rather than deleting them
- removing a step clears the bowls that were ready before it
- deleting a recipe offers both exits — take its steps and ingredients with it,
  or move them to another recipe — and the last recipe can never be removed
- steps keep the order they were typed in, insert above a neighbour without
  retyping, and reorder only within their own recipe
- equipment dedupes case-insensitively, brings its station from the palette, and
  falls back to Prep when the student names something the palette doesn't know

**`schedule.test.mjs`** — builds a real two-recipe plate (chicken piccata with
rice pilaf), typed forward the way a student would, and checks the schedule that
comes out:

- two recipes, nothing hand-placed, produce **zero** conflicts. Scheduling each
  recipe independently against the same plate-up used to manufacture the very
  collisions the app then warned about
- one pair of hands is global — hands-on steps never overlap each other — while
  searing during the simmer is left alone
- steps marked Prep front-load into an unordered block a team can split, and
  for it, which is the trade being made deliberately
- both anchors: same plan length, different place on the clock
- the oven serialises itself in guided mode, so there is nothing to warn about
- lanes: an unattended step with no equipment lands on Prep, and a step touching
  the oven reads as an oven step even when it also uses a pan
- free placement leaves hand-placed blocks exactly where they were put, does not
  reflow the rest, and *is* the only way to produce a conflict
- group mode: more hands finishes sooner, work is shared rather than dumped on
  one person, nobody is double-booked against themselves, two people working at
  once does not warn — and four cooks still have one oven

**`storage.test.mjs`** — plan history: round-trips, ordering, the 12-plan cap
evicting stored plans and not just list entries, deletion, refusing to load a
plan from an older shape, and purging pre-rewrite drafts without touching other
apps' keys. Also guards that nothing ever reaches localStorage, which is the
whole point of the tier choice.

**`storage-blocked.test.mjs`** — the tier fallback, which matters because the app
runs in a nested iframe (Canvas → github.io) that may refuse storage outright.
Covers localStorage rejecting writes, and storage throwing on mere property
access. Saving and loading must keep working either way.

## The fixture that looks like a curiosity

`schedule.test.mjs` deliberately pushes a step onto the plan raw before adding
one properly:

```js
check("pushed on raw, the board would span from midnight", ...)
```

`createStep` defaults `start` to 0, and free placement never re-derives it, so a
step added after switching used to sit at 00:00 — the plan spanned 755 minutes,
the board drew about 6800px, and the real work was squashed into the bottom 2%.
The fixture pins the broken behaviour alongside the fixed one so the reason
`appendStep` seeds a start stays documented, and a refactor can't quietly
reintroduce it.
