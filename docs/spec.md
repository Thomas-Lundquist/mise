# Mise en Place Planner — Working Spec

**Status:** current source of intent. Supersedes `mise-planner-build-spec.md` and
`docs/design-brief.md`, both marked historical.

**Repo:** github.com/Thomas-Lundquist/mise · **Live:** thomas-lundquist.github.io/mise

---

## 1. What it is

A pre-lab planning tool Culinary students fill out in the first ten minutes of
class, on district Chromebooks, embedded in a Canvas assignment. It replaces a
paper mise en place sheet. They fill it out, print to PDF, and upload it.

It is a **gate, not a graded artifact**. It has to be fast to complete and
legible on paper. Anything that makes it slower to fill out needs to earn its
place.

## 2. The one thing it teaches

**Organising your own time in the kitchen.** Specifically: noticing that
unattended time is time you can spend on something else, and that the order the
recipe is written in is not the order you cook it in.

Everything in the app should be traceable to that. Sections that don't serve it
are overhead.

### The solo-cook assumption

Students cook in teams, but **each student plans as if they were the only one
cooking.** The skill being taught is personal time organisation, not delegation.

- One "You" lane. Two hands-on steps at the same time is always a real conflict.
- Equipment contention is modelled **within one student's own plan** — their own
  two steps competing for the one oven. Contention between students sharing a
  kitchen is out of scope.

A group toggle exists on the board (§6), but it is a view of the same plan, not
a second plan.

## 3. The flow

**The recipe stays outside the app.** Students arrive with it on paper or open in
another tab. Nothing about it is imported, pasted or parsed; the app holds its
name and two numbers off its header, and that is all. The app is a blank slate
every time.

The sections are ordered to match how a recipe is actually read, so that most of
the app can be filled in **while reading** rather than after:

| # | Section | What it asks | When it can be filled |
|---|---|---|---|
| 1 | Today | Name, kitchen, date, period | Before opening the recipe |
| 2 | The recipe | Name, yield, its claimed prep/cook time; ingredients; the method | While reading |
| 3 | Equipment | What each step uses | After the method exists |
| 4 | Mise en place | Which ingredients go in together | After the method exists |
| 5 | Your plan | The board, and the printout | Derived |

Sections 3 and 4 cannot come earlier, and the previous build's biggest structural
mistake was putting them first:

- **A recipe never lists its equipment.** You find it by reading the method and
  noticing what it assumes. Asking for it before any steps exist means guessing —
  and the old build's step editor said as much out loud: *"Pull some equipment in
  Step 2 and it'll show up here."*
- **A bowl is a moment, and moments are steps.** Grouping ingredients by when
  they go in is impossible before the method is written down.

### Steps are entered forward

The student types each step in the order the recipe gives it. **The app schedules
backward** (§5) — that is arithmetic it does on its own, and it does not care
which end the steps were typed from.

The previous build elicited steps backward, one at a time: *"what is the last
thing you do before it goes on the plate?"*, then *"and what happens right before
that?"* That is good at surfacing forgotten steps, but it cannot be done while
reading — reading runs forward, and answering it requires already being at the
end. The catch it provided is preserved as **one review pass**: once three steps
exist, the section says *read your list from the bottom up; is there anything the
recipe assumes you already did?* Every step row has a **+** that inserts above
it, so acting on that costs no retyping.

### Recipes, not "parts of a dish"

The old model asked students to name the *parts* of a dish — protein, starch,
sauce — before writing any step. That is an abstraction exercise before any
concrete thinking, and students typing forward off a card never hit a part
boundary anyway, because recipes interleave them (*"while the rice cooks, sear
the chicken"*).

It is replaced by something already on the bench: **a recipe**. One by default,
`+ Another recipe` for the lab that hands out a protein and a starch on separate
cards. A sauce written inside the main recipe is part of that recipe, not a
separate one. Nothing needs explaining, and the grouping is still real for the
board and for the per-recipe readout.

## 4. Data model

One plan object. Every section is a view onto it, never a store of its own.

```
plan
├─ student      { name, kitchen, date }
├─ readToEnd    bool
├─ recipes[]    { id, name, serves, prepMins, cookMins }
├─ ingredients[]{ id, recipeId, text, bowlId }
├─ steps[]      { id, recipeId, name, mins, hands, ahead,
│                 equipmentIds[], noEquipment, note, start, cook }
├─ equipment[]  { id, name, station, custom, pulled }
├─ bowls[]      { id, label, stepId }
└─ schedule     { mode, windowMins, periodId, foodUpOverride, anchor, cooks }
```

### 4.1 Station comes from equipment, never from guessing

A step names **which equipment it uses**, and station is a property of the
equipment. There is no keyword-guessing from step text — `"Set up the mixer"`
used to resolve to the Cold station — and conflicts become concrete: *both of
these need the sauté pan*, not *both of these are vaguely Stovetop*.

**Contention is station-level, not per item.** An inventory the app cannot verify
would make warnings look precise while quietly being wrong.

Stations are `Oven / Stovetop / Cold / Prep`. They serve two purposes, and only
one of them warns:

| Station | Lane | Flags conflicts |
|---|---|---|
| Oven | yes | **yes** — one oven, one temperature |
| Stovetop | yes | no — multiple burners |
| Cold | yes | no — a fridge holds many things |
| Prep | yes | no — already caught by the hands conflict |

So **the oven is the only equipment conflict in the app**, deliberately. A model
that over-warns trains students to dismiss warnings, which is the worst outcome
for a design built on warn-never-block (§6). Better one warning students believe
than four they learn to click past.

**"Nothing — it just sits" is a valid answer.** Resting meat on the counter is
genuinely unattended with nothing running it. The point is to make the student
think about where the thing is while it waits, not to force a false answer. Such
a step contends for nothing and draws on the **Prep** lane.

A step using equipment from more than one station draws on the first station in
the table above that it touches, so anything in the oven reads as an oven step.
Contention is checked against *every* station a step touches.

### 4.2 Ingredients are listed once and assigned later

The full ingredient list is typed in section 2, in reading order. Section 4 then
assigns each one to a bowl with a dropdown — **assignment, not retyping**, which
is what makes the up-front typing pay for itself. An ingredient that goes in
straight from the container stays unassigned, and saying so is an answer.

Each bowl names **which step it must be ready before**, which is what lets the
board open with *"before you start, these have to be measured out"* — the actual
definition of mise en place, and something the previous build collected and then
never displayed anywhere.

### 4.3 Nothing is write-once

**Every part of the plan can be added to, changed, or deleted at any point.**
Hard requirement, not polish. Everything is on one scrolling page and every
control is live at all times, which is what makes this true by construction
rather than by effort.

Rules that fall out of it:

- **Deleting a recipe that has work in it** — never silent. Confirm, and offer
  both exits: *delete its steps and ingredients too*, or *move them to…*
- **Deleting equipment or a bowl that things point at** — the reference clears
  and the step or ingredient survives. Losing a step because you tidied the
  equipment list is never the right outcome.
- **Editing a duration after the board is built** — depends on mode. Guided
  re-derives, because the app placed those blocks. Free does not, because the
  student placed them, and silently rearranging hand-placed work is how a tool
  loses trust.

### 4.4 One board, with free placement as a toggle

Every step stores a resolved `start`.

- **Guided** (default): the scheduler computes `start` for every step. Locked.
- **Free** (toggle): same blocks, same lanes, same conflicts — the student sets
  `start` directly, by keyboard.

**The student controls the toggle**, from the board. The teacher sets the starting
mode per assignment (§8). Flipping keeps the work; free → guided warns first,
because it will re-derive positions placed by hand.

### 4.5 One thing is confirmed, not asked

The only tick in the app is **"I read this recipe all the way to the end —
including anything I haven't written down yet."**

Filling the app in while reading (§3) introduces one failure mode that reading
first did not: typing six steps and being ambushed by step seven. That tick is
the counterweight, and it is the one thing a step list cannot already show.

The old build also asked students to predict which step would be **hardest**, in
free text, then point it at a step and flag it on the board. It was cut. Measured
against §2 — *everything should be traceable to organising your own time* — it
teaches anticipating difficulty, which is a different lesson, and it cost a text
field, a dropdown, a board marker and a print marker to do it.

## 5. Scheduling and conflicts

- Scheduled **backward from plate-up**, so "these finish together" is true by
  construction. This is the best idea in the build.
- **One pair of hands, globally.** Hands-on steps never overlap each other,
  whichever recipe they belong to; unattended steps float freely alongside.
  Searing while the rice simmers is competence, not a clash. Scheduling each
  recipe independently against the same plate-up manufactured the very conflicts
  the app then flagged.
- **Prep front-loads.** Any step marked "do ahead" (`step.ahead`) runs in a prep
  block before cooking starts. This costs elapsed time — a simmer window cannot
  absorb prep that is already done — and that is the trade the doctrine is worth.
  The idle gaps it opens are where cleaning down goes.
- **The anchor is a shift, not a direction.** `schedule.anchor` is `early` (plan
  starts when the cooking window opens, spare time lands at the end) or `fixed`
  (plan ends on the period's plate-up, as in service). Identical schedule, only
  its position on the clock moves, so finishing early costs nothing.
- Conflicts are **flagged, never auto-resolved**, and explained in words rather
  than left as a red border.
- Two conflict types: **hands** (two hands-on steps overlapping — the main one)
  and **oven** (§4.1).

## 6. Time budget and feedback

A period is 10 minutes of intro, **70 minutes of cooking**, 10 minutes of clean.
The plan is measured against that flat 70-minute window — the same number in
every period, all year.

The plan is stored as **durations**, not clock times:

- "This plan is 38 minutes long" is true in every period, on a special day, and
  next year. Storing `12:19` bakes one bell schedule into the data.
- Slack is one subtraction — 70 minus the plan.
- A wrong or missing anchor cannot corrupt a plan. It just shows no clock times.

A period supplies the **anchor** that turns durations into wall-clock times for
display, because "12:19, sear the chicken" beats "T+14" when there is a clock on
the wall. The chosen period is named on the board **and on the printout**, so a
wrong pick is visible rather than silently wrong.

What the board reports:

```
Start cooking at 12:02     Food up at 12:35
Your plan takes 33 min     Time to spare 37 min
```

plus, when the student filled in the recipe's own header:

```
The recipe says 40 min. Your plan needs 33 min.
```

That comparison is the lesson stated with the student's own numbers: printed
recipe times assume the mise is already done and nothing waits on anything.

> **Warn, never block.** A student may build a plan that does not fit, and the
> app must let them. It says *"as this stands you may run out of time"* and
> leaves the plan alone. No disabled buttons, no refusal to save, no forced
> correction.

### The group toggle

`schedule.cooks` (1–`MAX_COOKS`) is how many pairs of hands the scheduler may
assume. Same steps, same durations, same backward pass — only the hands
constraint relaxes, so a student keeps one solo plan and whoever is managing the
kitchen flips it up for the day. Each hands-on step is assigned a `cook`, given
to whoever can take it latest and breaking ties toward whoever has done least;
one person quietly doing the whole dish is a bad plan even when the arithmetic
works. Hands conflicts are then checked **per cook**. Stations don't relax: four
cooks still share one oven, and the board says plainly when someone has been
given nothing to do.

## 7. The printed artifact

The PDF is the deliverable and it goes in a recipe book.

- **Clock times must be on it** — the one thing a student needs at the stove.
- **Nothing may be silently dropped.** Overlapping blocks pack into sub-columns
  rather than painting over each other.
- **Two sheets, deliberately.** Sections 1–4 on page one (the ingredient list,
  pull list and bowls double as a setup checklist), the plan on page two with
  room to breathe.
- Identity (name, recipes, date) repeats on **every** page.
- Black and white, no interface chrome, no instructions addressed to a cursor.
- Every colour distinction also carries a text label.

## 8. Teacher configuration

Set once per assignment, via URL parameters on the Canvas embed:

| Param | Purpose | Default |
|---|---|---|
| `recipe` | Prefills the first recipe's name, keys the saved plan | — |
| `foodUp` | Pins plate-up, overriding the period picker. Also starts the plan on the `fixed` anchor | period's time |
| `period` | Preselects a period by id | nearest by time of day |
| `mode` | `guided` or `free` **starting** state — student may change it | `guided` |
| `timer` | Planning countdown, minutes | **off** |

The equipment palette, the stations, the cooking window and the bell schedule
stay teacher-editable in `js/config.js` with no code changes elsewhere.

## 9. Non-goals

- No accounts, no backend, no PII beyond a typed name.
- No grading, scoring, or teacher dashboard. The PDF is the handoff.
- No modelling of other students in the kitchen (§2).
- **No recipe import, paste box, or database.** The recipe stays where it is;
  the app is a blank slate (§3).
- No "cook mode" for use at the station. The PDF is the artifact.

## 10. Code shape

```
index.html          five section shells, everything else rendered by JS
css/style.css       one file, ordered: tokens, base, chrome, per section, print
js/
  config.js         teacher-editable settings, and nothing else
  time.js           clock and duration arithmetic
  model.js          the plan shape, lookups, and every mutation
  schedule.js       backward pass, lanes, conflicts
  storage.js        sessionStorage with a memory fallback, backup/restore
  dom.js            h() — the whole rendering vocabulary
  app.js            boot, plan lifecycle, section order
  views/            one module per section, each exporting render() and status()
test/               node test/run.mjs
```

Two rules keep it legible: **nothing outside `views/` touches the DOM**, and
**nothing inside `views/` reaches into another view**. A view gets `{ plan, save,
refresh }` and returns a node.

`save()` persists without re-rendering, for text typed into a field. `refresh()`
re-renders the whole page and restores the caret, for anything that changes its
shape. Rebuilding everything is cheap at this size and is what keeps five
interdependent sections honest — pull an ingredient and it has to vanish from the
bowl picker, the board and the printout at once.

> **Storage is sessionStorage, deliberately — not localStorage.** These are
> shared district Chromebooks, and one student's name and plan must not still be
> sitting in the browser for whoever uses the machine next. That privacy concern
> outranks convenience. The cost is real: work does not survive closing the tab,
> so "Download backup" is always visible and `beforeunload` warns first. The tier
> choice is one line in `js/storage.js`.

> **No migration.** The app has not been used with students, so saved plans from
> development are discarded rather than migrated. This ends at **v1.0** — the
> first build that goes in front of students — after which saved plans are real
> student work and shape changes need a migration path.

## 11. Not yet verified

Honest list, so none of it gets assumed:

- **Nothing has been tested on a district Chromebook.** Still the single biggest
  unknown: whether `github.io` is blocked by the content filter, and whether
  storage works inside the nested Canvas iframe. The storage fallback chain is
  unit-tested against blocked and throwing storage, not against the real thing.
- **`js/config.js` ships placeholder bell times.** Replace `PERIODS` before
  students use it.
- **Print has not been checked in a real print preview**, only reasoned about.
  Page breaks in particular are unconfirmed.
- **Narrow-viewport layout has not been checked on a real 360px screen.**
- The board has not been driven in a browser end to end; views are covered by a
  render smoke test and the scheduler by unit tests.

## 12. Open questions

Settled: recipe stays outside the app (§3) · sections follow reading order (§3) ·
steps entered forward, scheduled backward (§3) · recipes replace "parts of a
dish" (§3) · equipment is a pass after the method (§3) · full ingredient list,
assigned to bowls later (§4.2) · hardest-step prediction cut (§4.5) · station-level contention, oven only (§4.1) ·
"nothing" is a valid equipment answer (§4.1) · warn-never-block (§6) · one board
with free placement as a toggle (§4.4) · two printed sheets (§7) · sessionStorage
(§10).

Worth revisiting once students have used it, but not holding anything up:

- Whether typing the full ingredient list is too much at 7:40am, or whether the
  saving in section 4 pays for it.
- Whether the one bottom-up review pass catches as much as the old backward
  elicitation did.
- Whether one oven warning is too few in practice.
