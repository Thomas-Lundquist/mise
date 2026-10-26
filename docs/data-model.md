# Data model

Everything a student enters is one **recipe** object, saved in the browser's local
storage. Nothing is sent to a server.

```json
{
  "version": 2,
  "title": "Buttermilk Pancakes",
  "servings": 4,
  "startTime": "09:15",
  "minutesAvailable": 90,
  "cooks": 2,
  "ingredients": [
    { "id": "i1", "amount": "2", "unit": "cups", "name": "flour", "prep": "" }
  ],
  "bowls": [
    { "id": "b1", "label": "Dry", "ingredientIds": ["i1"], "minutes": null }
  ],
  "steps": [
    { "id": "s1", "text": "Whisk wet into dry", "minutes": 3, "handsOff": false,
      "bowlIds": ["b1"], "tools": ["whisk"], "after": "previous" }
  ],
  "extraTools": ["towels", "sanitizer bucket"],
  "screen": 3
}
```

Notes:
- `amount` is text so students can write "½" or "1 ½" naturally.
- An ingredient can sit in at most one bowl. Ingredients not in a bowl still appear in
  the mise en place list on their own.
- `cooks` is the team size, 1–5. Cooks are labeled Cook A, Cook B, and so on. Names typed
  on the lab guide for the printout are **never** stored here or anywhere else.
- A step's `tools` are plain words. `extraTools` are tools no single step uses. There are
  no quantities: a student writes "2 sheet pans". Tools match ignoring capitals and extra
  spaces, keeping the first spelling. The guide's equipment list is built from these, plus
  one line for the mise en place bowls.
- `after` is what must finish before this step can start: `"previous"` (the default,
  the step right before it), `"any"` (any time after setup), or the id of an earlier step.
- `screen` is where the student left off (0–3 for the entry screens, 4 for the guide).
- `version` is 2. Older saved work (no version) is upgraded when it loads: its
  `equipment` list becomes `extraTools` ("2 × sheet pan"), its List/Blocks choice is
  dropped, and its screen number is mapped onto the new screens.
- A bowl's `minutes` is `null` until the student changes it. While it's `null`, the
  suggested time is used: **1 minute per ingredient, plus 3 more for each ingredient with
  a prep note** (diced, minced…), and never less than 2 minutes.

## How the time plan is calculated

One method, the same for 1 cook or 5: **list scheduling with critical-path priority and
load balancing**. It's greedy (no cook stands idle if there's a ready task) but tries to
keep the work even and to start the tasks that hold everything else up.

**Tasks.** The plan is built from:
1. **Setup** (wash hands, set up station): every cook, 5 minutes, at the same time.
2. **Fill each bowl** (measure and prep its ingredients): one task per bowl, so bowls can
   be split between cooks. Uses the bowl's minutes (suggested or the student's own). An
   empty bowl has nothing to fill, so it isn't a task.
3. **The recipe's steps.** A step that uses a bowl also waits for that bowl to be filled.
4. **Cleanup** (clean and sanitize): every cook, 10 minutes, after the last step.

**Scheduling, repeated until every task is placed:**
- A task is *ready* when everything it waits for is finished.
- Move to the next moment when a cook is free *and* a task is ready.
- **Critical path first:** of the ready tasks, take the one with the longest chain of
  work waiting behind it (its own minutes plus the longest chain after it). Ties go to
  recipe order, with each bowl counted just before the first step that uses it.
- **Even split:** of the cooks free at that moment, give it to whoever has done the
  fewest hands-on minutes so far.

Some waiting can't be avoided: if step 4 needs step 3, step 4 can't start sooner no
matter how many cooks there are. And one long task (cook pancakes, 20 min) can't be
split between cooks unless the student writes it as two steps.
- A **hands-off** task (baking, chilling) has a cook start it, then frees that cook
  right away. The tasks waiting on it still wait until its time is up.
- The plan ends when cleanup ends. If that's later than `startTime + minutesAvailable`,
  the guide shows the overrun.

**Not handled yet:** shared equipment (two tasks needing the one oven at the same time).
Steps now record their tools, which is the groundwork for this.

## How the time plan is shown

`planTable()` in `js/schedule.js` turns the plan into the guide's team table: one row for
each moment a task starts, a cell per cook plus one for hands-off work. A cook's task is
one cell spanning every row it lasts (`span`); the rows it stretches over are marked
`covered` and draw nothing; other cells are free. Hands-off tasks sit only at their start.
For a team, setup and cleanup are single "everyone" rows (setup first at its time,
cleanup last). A "class ends" row is placed at the right time if the plan runs over (tasks
can stretch across it), and a "done" row ends the table.
