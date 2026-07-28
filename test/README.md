# Tests

```
node test/run.mjs
```

No dependencies, no build step, no test framework — the app is plain static
files and these keep it that way. Each file runs standalone too:

```
node test/plan.test.mjs
```

## What's covered

These test the parts where a mistake is silent — scheduling arithmetic and
persistence. Anything that needs a DOM is checked in the browser instead.

**`plan.test.mjs`** — builds a real two-part dish (chicken piccata with rice
pilaf) and checks the schedule against it:

- every part finishes at food-up, by construction, and the longest one sets
  the start time
- lanes: an unattended step with no equipment lands on Prep, and a step
  touching the oven reads as an oven step even when it also uses a pan
- the oven is the only station that warns — two overlapping stovetop steps
  must stay quiet
- hands conflicts are always flagged
- free mode leaves hand-placed blocks exactly where they were put, and
  doesn't reflow the rest

**`storage.test.mjs`** — plan history: round-trips, ordering, the 12-plan cap
evicting stored plans and not just list entries, deletion, refusing to load a
plan from an older shape, and purging pre-rewrite drafts without touching
other apps' keys.

**`storage-blocked.test.mjs`** — the tier fallback, which matters because the
app runs in a nested iframe (Canvas → github.io) that may refuse storage
outright. Covers localStorage rejecting writes, and storage throwing on mere
property access. Saving and loading must keep working either way.

## A note on one fixture

`plan.test.mjs` contains this:

```js
check("...which is exactly why the old savings readout never moved", ...)
```

That isn't a curiosity. The original board reported "overlapping saves you X"
as a max across parts, so overlapping inside any part that wasn't the longest
changed no visible number at all — a student did the one thing the app exists
to teach and got nothing back. The fixture pins that behaviour so the reason
per-part give exists stays documented, and so a future refactor can't quietly
reintroduce it.
