# Mise en Place Planner — Working Spec

**Status:** current source of intent. Supersedes `mise-planner-build-spec.md`
and `docs/design-brief.md`, both now marked historical.

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

**Organising your own time in the kitchen.** Specifically: working backward from
when food has to be up, and noticing that unattended time is time you can spend
on something else.

Everything in the app should be traceable to that. Sections that don't serve it
are overhead.

### The solo-cook assumption

Students cook in teams, but **each student plans as if they were the only one
cooking.** This is deliberate. The skill being taught is personal time
organisation, not delegation or team scheduling.

Consequences, to be applied consistently:

- One "You" lane. Two hands-on steps at the same time is always a real conflict.
- Equipment contention is modelled **within one student's own plan** — their own
  two steps competing for the one oven. Contention between students sharing a
  kitchen is out of scope.
- **`Today's role` is removed.** Under a solo-cook model it can never affect
  anything, and it's a field to fill at 7:40am that buys nothing. One less.

## 3. The core problem with the current build

The four sections are four independent forms that happen to share a page.
Nothing flows between them, so students enter overlapping information up to
three times:

| Entered in | Also asked for in | Currently connected? |
|---|---|---|
| Equipment (Pull) | Station lanes (Time) | No — station is guessed from step text |
| Bowls of ingredients (Group) | "Prep reminders" per step (Time) | No — same question, asked twice |
| Hardest step (Read) | The board | No — captured and never used (§4.5) |

**The fix that unlocks most of the rest: make it one plan with four views.**

## 4. Data model

One plan object. The four sections are views onto it, not separate stores.

```
plan
├─ meta        { name, kitchen, date, recipe }
├─ read        { done, hardest, hardestStepId }
├─ equipment[] { id, name, group, station }
├─ bowls[]     { id, label, items[] }
├─ components[]{ id, name }
└─ steps[]     { id, component, name, mins, hands,
                 equipmentIds[], bowlIds[], start, notes[] }
```

Five changes carry the weight — the first three remove duplicate questions, the
last two remove dead ends:

### 4.1 Station comes from equipment, not from guessing

`step.lane` (a string guessed from the step name) is deleted, along with
`guessStation` and `STATION_KEYWORDS`. Instead a step names **which equipment it
uses**, chosen from what the student pulled in Pull. Station is a property of
the equipment.

This gives Pull an actual job, removes a whole class of wrong guesses
(`"Set up the mixer"` currently resolves to the Cold station), and makes
conflicts concrete and correct: *both of these need the saucepan* rather than
*both of these are vaguely Stovetop*.

Palette entries gain one field:

```js
{ name: "Sauté pan", group: "Cook", station: "Stovetop" }
{ name: "Sheet pan", group: "Cook", station: "Oven" }
```

**Contention is station-level, not per item.** Per-item counts were considered
and rejected — an inventory the app can't verify would make warnings *look*
precise while quietly being wrong.

Stations are `Oven / Stovetop / Cold / Prep`. They serve two different purposes,
and only one of them warns:

| Station | Lane | Flags conflicts |
|---|---|---|
| Oven | yes | **yes** — one oven, one temperature |
| Stovetop | yes | no — multiple burners |
| Cold | yes | no — a fridge holds many things |
| Prep | yes | no — already caught by the hands conflict |

So **the oven is the only equipment conflict in the app.** Every station still
gets a lane, because seeing where your work is happening is the point of the
board; but only the oven produces a warning.

This is deliberately narrow. A model that over-warns trains students to dismiss
warnings, which is the worst possible outcome for a design built on
warn-never-block (§6). Flagging "you're using the prep counter twice at once"
would also double-warn on something the You lane already catches. Better one
warning students believe than four they learn to click past.

**Rule:** an unattended step must *answer* the equipment question, but "nothing"
is a valid answer. Resting meat on the counter or letting dough relax is
genuinely unattended with nothing running it. The picker therefore offers an
explicit **"Nothing — it just sits"** option alongside the pulled equipment.

The point is to make the student think about where the thing is while it waits,
not to force a false answer. A step answered "nothing" contends for nothing and
draws on the **Prep** lane — resting on the counter is the prep bench, which
keeps every unattended step on a lane without inventing a fifth station.

A step using equipment from more than one station (a saucepan and a whisk) draws
on the first station in the list above that it touches, so anything in the oven
reads as an oven step. Contention is checked against *every* station a step
touches, not just the one it draws on.

### 4.2 Bowls attach to steps

The separate "prep reminders" **phase** is deleted — the wall of nine identical
inputs, presented as mandatory, ordered by accident of entry. What it collected
survives in two better places.

Each step gets:

1. **Which bowls do you need ready before this?** — the same information Group
   already collected, entered once, attached where it means something.
2. **A short free-text note.** Kept, because not every reminder is a bowl.

For reminders that carry real duration — *preheat the pan*, *fill the ice bath*,
*get the water boiling* — the app should **push students to enter them as actual
steps** rather than notes. They take time, so they belong on the timeline. That
is the more honest lesson, and it's the difference between a plan that works and
one that forgets the twelve minutes the oven needs. The free-text note stays as
the escape hatch for genuinely untimed things (*get plates down*).

This is also closer to what mise en place actually is: the board can then open
with **"Before you start: these bowls must be prepped,"** which is the real
lesson and currently isn't stated anywhere.

Group gains a prompt (it currently has none — just three boxes labelled `LABEL`).

### 4.3 Nothing is write-once

**Every part of the plan can be added to, changed, or deleted at any point in
the process.** This is a hard requirement, not polish, and the current build
fails it in several places:

| Today | Required |
|---|---|
| Components can't be revisited after "Start planning" — the naming UI never renders again | Add / rename / remove parts at any time |
| Steps can only be deleted, never edited — a typo'd duration means retyping the row | Edit name, minutes, hands-on, equipment, bowls in place |
| Steps can't be reordered | Reorder within a component |
| The board offers no route back to parts | Every stage reachable from every other stage |

Rules that fall out of it:

**Deleting a part that has steps** — never silent. Confirm, and offer both exits:

> "Rice pilaf" has 4 steps. **[Delete them too]** **[Move them to…]** **[Cancel]**

**Editing a duration after the board is built** — depends on mode, because the
question is who positioned the blocks:

- **Guided** — the app derived the positions, so it re-derives them. Expected.
- **Free** — the student placed those blocks deliberately. Only the edited block
  resizes; nothing else moves. Silently rearranging hand-placed work is how a
  tool loses trust.

**Deleting equipment or a bowl that steps point at** — the reference clears and
the step survives. Losing a step because you tidied the equipment list is never
the right outcome. (The existing `par` unpairing on step deletion already works
this way and is the right precedent.)

### 4.4 One board, with free placement as a toggle

`openBlocks` is deleted. Open mode stops being a separate URL mode with its own
data model, its own renderer and its own inspector, and becomes **a toggle on
the one board.**

Every step stores a resolved `start`:

- **Guided** (default): the backward elicitation produces the chain and the
  scheduler computes `start` for every step. Starts are locked.
- **Free** (toggle): the same blocks, same lanes, same conflicts — the student
  now sets `start` directly by keyboard.

**The student controls the toggle**, from the board itself. The teacher sets the
starting mode per assignment (§8), but students can move either way at any time.
Someone who's got it can work faster; someone who hasn't can drop back to the
prompts mid-plan rather than being stuck.

Flipping keeps the work. Guided → free is the semester arc; free → guided is
allowed but warns first, because it will re-derive positions the student placed
by hand (§4.3).

One renderer, one set of bugs to fix, one print path.

### 4.5 The hardest step gets flagged

Read asks which step the student expects to be hardest, then drops it. Instead:
once their steps exist, they can point that prediction at one of them
(`read.hardestStepId`), and it's **marked on the board and on the printout**.

Free text stays — they answer before they've written any steps, and the answer
may not map to one. Pointing it at a step is an offer, not a requirement.

Small piece of plumbing, but it's the one that makes Read part of the plan
rather than a warm-up question.

## 5. Scheduling and conflicts

- Every component's chain is scheduled backward from the same food-up time, so
  "these finish together" is true by construction. **Keep this** — it's the best
  idea in the current build.
- Conflicts are **flagged, never auto-resolved.** The app does not decide what a
  student is allowed to schedule. Keep this too.
- Two conflict types:
  - **Hands** — two hands-on steps overlapping. Always real, and the main one.
  - **Oven** — two steps needing the oven at the same time. The only equipment
    conflict; other stations draw lanes but never warn (§4.1).
- Conflicts need an on-screen explanation, not just a red border and a `⚠`.
  Currently the board's first impression is several red blocks and no text
  saying what is wrong or what to do about it.

## 6. Time budget and feedback

A period is **10 minutes of intro, 70 minutes of cooking, 10 minutes of clean**.
So the thing the plan is measured against is a flat **70-minute cooking
window** — the same number in every period, all year.

### Durations, not clock times

The plan is stored as **durations**, not wall-clock times. This matters more
than it sounds:

- A plan is "30 minutes long". That's true in every period, on a special day,
  and next year. Storing `12:19` bakes one bell schedule into the data.
- Slack is one subtraction — 70 minus the plan — with no second config value and
  no assumption about when the kitchen actually opened.
- A wrong or missing anchor can't corrupt the plan. It just shows no clock times.

A period supplies the **anchor** that turns those durations into wall-clock
times for display. That's worth keeping: "12:19, sear the chicken" beats
"T+14" when you're under pressure and there's a clock on the wall.

```
COOKING_WINDOW_MINUTES = 70   — what the plan is measured against
PERIODS = [{ id, label, foodUp }]  — set once for the year, supplies the anchor
```

Students pick their period; it defaults to whichever matches the current time of
day. `?foodUp=` on the embed URL pins it instead — needed when each period has
its own Canvas page, and how a special day is handled. The chosen period is
named on the board **and on the printout**, so a wrong pick is visible rather
than silently wrong.

> **Warn, never block.** A student may build a plan that doesn't fit the time
> available, and the app must let them. It says *"as this stands you may run
> out of time"* and leaves the plan alone. This is the same principle already
> applied to conflicts (§5) — the app surfaces problems, it never decides what
> a student is allowed to schedule. No disabled buttons, no refusal to save, no
> forced correction.

### Why this matters: the payoff currently doesn't land

Today the board's headline reward is `Overlapping saves you: X`, computed as a
max across components. Overlapping inside any component that isn't the longest
one produces **no visible change at all** — the student performs the app's
signature interaction and every readout stays identical, including a savings box
that still reads "Tap a dashed window to save time," as though the click didn't
register. With two components this happens roughly half the time.

Replace it with **slack against the real deadline**:

```
You have 52 min of kitchen time.        (kitchenOpens → foodUp)
Your plan needs 38 min.
You're 14 min ahead.                    ← this moves whenever anything improves
```

Plus per-component breathing room, which is what actually teaches critical path:

```
Rice pilaf is your longest part — it sets your start time.
Chicken and sauce has 7 min of slack.
```

## 7. The printed artifact

The PDF is the deliverable and it goes in a recipe book. Requirements:

- **Clock times must be on it.** The printed board currently has no time axis and
  no durations on blocks — bars on rails with no numbers. This is the one thing
  a student needs at the stove.
- **Nothing may be silently dropped.** Overlapping blocks currently draw on top
  of each other; a step vanished entirely from my test printout.
- **Two sheets, deliberately.** Sections 1–3 on page one (equipment and bowls
  double as a setup checklist), the time plan on page two with room to breathe.
  Both go in the recipe book. Not a compromise — the current forced page break
  is the right call and stays.
- Identity (name, recipe, date) repeats on **every** page. The time plan is
  forced onto its own page and currently carries no name on it at all, so
  separating the sheets makes page two anonymous.
- Black and white, no interface chrome, no instructions addressed to a cursor
  ("Tap a dashed window…" currently prints).
- Every colour distinction also carries a text label.

## 8. Teacher configuration

Set once per assignment, via URL parameters on the Canvas embed:

| Param | Purpose | Default |
|---|---|---|
| `recipe` | Prefills recipe name, keys the saved plan | — |
| `foodUp` | Pins plate-up time, overriding the period picker | period's time |
| `period` | Preselects a period by id | nearest by time of day |
| `board` | `vertical` to try the vertical timeline | horizontal |
| `mode` | `guided` or `free` **starting** state — student may change it (§4.4) | `guided` |
| `timer` | Planning countdown, minutes | **off** |

Equipment palette stays teacher-editable in `js/config.js` with no code changes
elsewhere.

## 9. Non-goals

- No accounts, no backend, no PII beyond a typed name.
- No grading, scoring, or teacher dashboard. The PDF is the handoff.
- No modelling of other students in the kitchen (see §2).
- No recipe database or import. Students type their steps.
- No "cook mode" for use at the station. The PDF is the artifact. Revisit later.

## 10. Scope

Ordered so the board gets rebuilt **once**, against the unified model, rather
than fixed now and again after. Styling is deferred throughout — no visual
changes except where a fix requires them.

**Status: Phases 0–3 are built.** Phase 4 (the visual layer) remains deferred.
See the end of this section for what's built but not yet verified.

### Phase 0 — cheap unblocking

- Mark old docs historical ✅
- Planning timer off by default; label it; survive a refresh
- `.btn:disabled` styling and a hint — disabled buttons currently look enabled

> **No migration.** The app has not been used with students yet, so Phase 1 is
> free to change the saved-plan shape outright. Any drafts in browser storage
> from development are discarded rather than migrated — writing migration code
> for data that doesn't exist is waste. This freedom ends at v1.0; after that,
> saved plans are real student work and shape changes need a migration path.

> **v1.0** is the label for the first build that goes in front of students.
> Everything before it is free to change.

### Phase 1 — one plan

- Unified data model (§4)
- Equipment carries station + count; delete `guessStation`, `STATION_KEYWORDS`
- Steps reference equipment and bowls; "Nothing — it just sits" is a valid answer
- Delete the prep-reminders phase; bowls-per-step plus a free-text note per step
- Delete `openBlocks`; migrate to `steps` with explicit `start`
- Group gains a prompt
- **Full editability (§4.3)** — add / change / delete components, steps, bowls
  and equipment at any point, from any stage. Built in from the start rather
  than retrofitted, because it constrains how state and navigation are shaped.
- **Plan history** — a list of recent plans (recipe + date), pick one on load.
  The download-a-backup control becomes **always visible**, not just an
  emergency measure that appears when storage fails, so students can keep their
  own copies regardless of what the Canvas iframe allows. Lands here rather than
  later because it's a persistence change and the data model is already being
  reshaped; doing both at once avoids migrating saved plans twice.

### Phase 2 — one board

Rebuilt once, against the Phase 1 model:

- One lane per station, not one per step
- Overlapping blocks stack into sub-rows instead of drawing over each other
- Block labels carry name + clock time + duration; no more `P.`
- Free-placement toggle replaces open mode
- Keyboard reachable (guided-mode blocks currently aren't)
- Conflict explanation in words
- Print: axis, durations, repeated identity, nothing dropped
- Responsive to 360px (the time axis currently desyncs from its own lanes)

### Phase 3 — feedback that lands

- `kitchenOpens` / `foodUp` config
- Slack readout replacing the broken savings box (§6)
- Per-component breathing room
- Completeness nudges: unattended steps have equipment, at least one bowl has
  contents, plan finishes by `foodUp`

### Phase 4 — deferred

- Visual layer: revisit the styling questions we set aside

### Built but not yet verified

Honest list of what hasn't been proven, so it doesn't get assumed:

- **Nothing has been tested on a district Chromebook**, which is still the
  single biggest unknown: whether `github.io` is blocked by the content filter,
  and whether storage works inside the nested Canvas iframe. The storage
  fallback chain is unit-tested against blocked and throwing storage, but not
  against the real thing.
- **360px was verified by forcing the breakpoint, not by an actual narrow
  viewport.** The layout is structurally right; exact wrapping is unconfirmed.
- **Print was verified by swapping the print media query to screen**, not by an
  actual print preview. Page breaks in particular are unconfirmed.
- The hardest-step marker on a block is currently colour-only, so it likely
  doesn't survive greyscale printing — needs a text or shape treatment.
- Very short steps (2–3 min) still truncate their label on screen at typical
  widths. They stack rather than overlap and carry a tooltip and full
  accessible name, so nothing is lost — but they're tight.

## 11. Open questions

Settled: solo-cook model (§2) · one plan / four views (§4) · one board with free
placement as a toggle (§4.4) · station-level contention (§4.1) · "nothing" is a
valid equipment answer (§4.1) · warn-never-block (§6) · parts named first but
everything editable throughout (§4.3) · delete-a-part offers delete-or-move
(§4.3) · guided reflows, free doesn't (§4.3) · keep several plans (§10).

Also settled: oven is the only warning station (§4.1) · stations stay
`Oven / Stovetop / Cold / Prep` · student controls the mode toggle (§4.4) ·
recent-plans list with download always available (§10) · two printed sheets
(§7) · bowls stay free-text · `role` dropped (§2) · hardest step flags on the
board (§4.5).

**Nothing is currently open.** Things worth revisiting once students have used
it, but which shouldn't hold up building:

- Whether naming the parts of the dish up front is a stumbling block in practice
  (§4.3 makes it recoverable either way, so this is an observation to make, not
  a decision to take now)
- Whether free-text bowls let too many forgotten ingredients through
- Whether one oven warning is too few in practice
