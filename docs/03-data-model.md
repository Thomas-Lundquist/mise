# 03 — Data Model

Four objects. **Pack** (teacher-authored), **Plan** (student decisions), **Kitchen**
(student-set), **Schedule** (computed). All times are integer minutes. All ids are short
lowercase strings, unique within their pack.

Implement these as plain objects plus validators in `js/model.js`. No classes.

---

## Pack

Authored once per lab day. Read-only to students. Encoded into the assignment URL.

```js
{
  packVersion: 1,          // integer. Bump only if a field changes meaning.
  packId: "p_2026_pilaf",  // string, teacher-set, used as the localStorage draft key
  title: "Lab 4 — Pilaf & Pan Sauce",
  labMinutes: 50,          // usable minutes in the class period; drives a warning only
  equipment: [ Equipment ],
  fillerTasks: [ FillerTask ],   // generic tasks; bowl/tool washing is derived, not listed
  recipes: [ Recipe ]
}
```

### Equipment

A shared, capacity-limited resource in the kitchen. This is what stops the schedule from
telling three cooks to use one oven at once.

```js
{
  id: "oven",
  name: "Oven",
  capacity: 1,        // integer >= 1. Burners are usually one entry with capacity 4.
  checklist: true     // include on the printed equipment checklist
}
```

- `capacity` is per kitchen, not per cook.
- Hand tools that are not contended (whisk, cutting board, peeler) should be entered with
  `capacity: 5` so they never gate the schedule but still print on the checklist.
- **Bowls are not equipment.** Bowls come from the student's grouping and are counted
  separately for the checklist.

### FillerTask

A cleaning or side task used to soak up idle time. Order in the array is the tie-break
priority (earlier = preferred).

```js
{
  id: "f_wipe",
  label: "Wipe down your station",
  durationMin: 3,
  equipmentId: null,     // or an equipment id, e.g. "sink", if it contends
  repeatable: false      // if true, may be assigned more than once per schedule
}
```

### Recipe

```js
{
  id: "r_pilaf",
  name: "Rice Pilaf",
  ingredients: [ Ingredient ],
  steps: [ Step ]
}
```

### Ingredient

```js
{
  id: "i_rice",
  recipeId: "r_pilaf",
  label: "1 1/2 cups long-grain rice",
  shortLabel: "rice"     // used in tight print columns; <= 14 chars
}
```

Quantities live inside `label` as free text. The app never parses or scales them.

### Step (as authored)

```js
{
  id: "s_pilaf_toast",
  recipeId: "r_pilaf",
  order: 3,                       // 1-based position within its recipe
  label: "Toast the rice in the butter until the grains look chalky.",
  shortLabel: "Toast rice",       // <= 22 chars, printed in the timeline block
  suggestedDurationMin: 3,        // pre-fills the student's chip; student may change it
  suggestedHands: "busy",         // "busy" | "free" — pre-fills; student may change it
  equipmentIds: ["burners", "saute"],  // teacher-set, student cannot change
  consumesBowlOf: ["i_rice"],     // ingredient ids whose bowl is emptied by this step
  dependsOnOverride: null,        // null = depends on the previous step in this recipe
  teachHint: null                 // optional one-line coaching text shown while tagging
}
```

**`dependsOnOverride`** is the escape hatch and should be `null` for ~90% of steps.
- `null` → depends on the step with `order - 1` in the same recipe. The step with
  `order: 1` has no dependency.
- `[]` → explicitly independent; can start at minute 0.
- `["s_x", "s_y"]` → depends on exactly those step ids, in any recipe. Cross-recipe
  dependencies are legal (e.g. "rest the chicken" before "slice for both plates").

**`consumesBowlOf`** is how the app knows a bowl is now dirty and washable. If a step
uses the bowl holding the rice, list `"i_rice"`; the app resolves that to whichever bowl
the student put the rice in, and marks that bowl washable when the step ends.

---

## Plan

The student's decisions. Small enough to fit in a Canvas text submission if wanted.

```js
{
  planVersion: 1,
  packId: "p_2026_pilaf",
  bowls: [ Bowl ],
  stepTags: { [stepId]: StepTag },
  kitchen: Kitchen
}
```

### Bowl

```js
{
  id: "b1",
  number: 1,                       // 1-based, printed
  ingredientIds: ["i_flour", "i_salt", "i_soda"]
}
```

- Every ingredient in the pack must appear in exactly one bowl before the plan is valid.
- A bowl with zero ingredients is dropped at validation, and remaining bowls are renumbered.

### StepTag

```js
{
  durationMin: 18,       // integer 1..120, from the chip set below
  hands: "free",         // "busy" | "free"
  attentionMin: 1        // minutes of cook time at the start of a passive step
}
```

- Allowed duration chips: **1, 2, 3, 5, 10, 15, 20, 30, 45, 60**. No free text entry.
  Free typing produces "0 minutes" and "999 minutes" and wrecks the schedule.
- `hands: "busy"` (active) → the cook is occupied for the whole `durationMin`.
- `hands: "free"` (passive) → the cook is occupied for `attentionMin` at the start only,
  then released; the equipment stays occupied for the whole `durationMin`.
- `attentionMin` is computed, not asked: `Math.min(1, durationMin)` when `hands === "free"`,
  and equal to `durationMin` when `hands === "busy"`. Never expose it in the UI.

### Kitchen

```js
{
  cooks: 4,                        // integer 1..5
  cookNames: ["Ana","Ben","","" ]  // optional; blank falls back to "Cook A".."Cook E"
}
```

---

## Schedule (computed output of `scheduler.js`)

```js
{
  ok: true,
  floorMin: 42,          // critical path: the fastest this lab can go
  makespanMin: 47,       // actual computed length
  cooks: [
    {
      index: 0,
      name: "Cook A",
      assignments: [ Assignment ],
      idleMin: 6,                  // minutes with nothing assigned, within [0, makespan]
      utilizationPct: 87
    }
  ],
  equipmentUse: [ { equipmentId: "oven", startMin: 5, endMin: 35, stepId: "s_bake" } ],
  criticalStepIds: ["s_pilaf_simmer", "s_pilaf_rest"],  // steps on the critical path
  bowlCount: 6,
  equipmentChecklist: [ { id: "oven", name: "Oven", count: 1 } ],
  warnings: [ Warning ]
}
```

### Assignment

```js
{
  kind: "step",            // "step" | "filler"
  stepId: "s_pilaf_simmer",
  recipeId: "r_pilaf",
  label: "Simmer covered",     // shortLabel for steps, label for fillers
  startMin: 12,
  endMin: 13,              // when this COOK is free again
  runsUntilMin: 30,        // when the STEP itself finishes; equals endMin for active steps
  hands: "free",
  isCritical: true,
  equipmentIds: ["burners"]
}
```

`endMin` vs `runsUntilMin` is the crux of the whole app: for a passive step the cook is
free at `endMin` while the food keeps cooking until `runsUntilMin`. The print view draws
the cook lane from `startMin` to `endMin` and the equipment strip from `startMin` to
`runsUntilMin`.

### Warning

```js
{
  code: "OVER_PERIOD",     // see 04-scheduler-spec.md for the full code list
  severity: "warn",        // "warn" | "error"
  message: "This plan runs 62 minutes but the period is 50.",
  stepIds: []
}
```

An `error` blocks printing. A `warn` prints a note on the plan and lets the student
continue.

---

## URL encoding (`js/codec.js`)

The pack travels in the URL fragment so it never reaches a server log.

```
https://<host>/index.html#p=<encoded>
```

Encoding, in order: `JSON.stringify` → `TextEncoder` to UTF-8 bytes → base64 →
URL-safe substitution (`+`→`-`, `/`→`_`, strip `=`). Decoding reverses it. Export
`encodePack(pack)`, `decodePack(str)`, `encodePlan(plan)`, `decodePlan(str)`.

- A pack that exceeds **6000 characters encoded** must make `author.html` show:
  "This day is too big for a link. Download the pack file and host it next to the app
  instead." Then fall back to `#pf=<filename>.json` loaded from `/fixtures/`.
- `decodePack` must never throw on bad input. It returns `{ ok: false, error: "..." }`
  and the app shows: "This link is damaged. Ask your teacher for a new one."
- Round-trip is a hard test: `decodePack(encodePack(p))` must deep-equal `p`.

## Validation (`js/model.js`)

Export `validatePack(pack)` and `validatePlan(plan, pack)`, each returning
`{ ok, errors: [{ code, message, ids }] }`. Required checks:

| Code | Condition |
|---|---|
| `DUP_ID` | any id repeated anywhere in the pack |
| `BAD_DEP` | `dependsOnOverride` names an id that doesn't exist |
| `CYCLE` | dependencies form a cycle |
| `MISSING_EQUIP` | a step names an equipment id not in `pack.equipment` |
| `IMPOSSIBLE_EQUIP` | a step needs equipment whose `capacity` is 0 |
| `UNBOWLED` | an ingredient is in no bowl |
| `DOUBLE_BOWLED` | an ingredient is in more than one bowl |
| `UNTAGGED` | a step has no `StepTag` |
| `BAD_COOKS` | `kitchen.cooks` outside 1..5 |
