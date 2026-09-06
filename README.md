# Mise en Place Planner

A pre-lab planning tool for Culinary students at Skyline High School. Replaces a
paper mise en place sheet: students work through a recipe, write down its steps,
work out what equipment it implies and what has to be measured out first, and get
a time plan back — then print to PDF for the Canvas assignment.

It's a gate, not a graded artifact — filled in during the first ten minutes of
class, on district Chromebooks, embedded in a Canvas page.

**Spec: [`docs/spec.md`](docs/spec.md).** The older
[`mise-planner-build-spec.md`](mise-planner-build-spec.md) and
[`docs/design-brief.md`](docs/design-brief.md) are historical and are not
requirements — see the notes at the top of each.

## The flow

**The recipe stays outside the app.** Students arrive with it on paper or open in
another tab. Nothing is imported or pasted; the app is a blank slate.

The five sections follow the order a recipe is actually read, so most of it can
be filled in *while* reading rather than after:

| | | |
|---|---|---|
| **1** | Today | Name, kitchen, date, period — which sets when food is up |
| **2** | The recipe | Its name, yield and claimed times; the ingredient list; the method |
| **3** | Equipment | What each step uses. A recipe never lists this — you read the method for it |
| **4** | Mise en place | Which ingredients go into a bowl together, and before which step |
| **5** | Your plan | The board, and the printout |

Sections 3 and 4 come after the method because they have to. You can't know the
pans until you know the steps, and a bowl is a *moment* — moments are steps.

**Steps go in forward**, in the recipe's own order, because that's how reading
works. The app schedules them **backward from plate-up**, so every recipe lands
together. One review pass at the end asks the student to read their list bottom
to top and slot in whatever the recipe assumed — preheating, resting, getting the
water on.

## What the plan gives back

The time plan is an **output, not a puzzle**. The student says what the steps
are, how long each takes, whether their hands are on it, and whether it can be
done ahead — and the schedule falls out, built backward with **one pair of
hands**, so hands-on steps never overlap while unattended ones run alongside.

- **Slack** against the flat 70-minute cooking window, and, if they filled in the
  recipe's own header, how their plan compares to what the recipe claimed.
- **A pull list**, grouped by station, tickable as things come out of the
  cupboard.
- **"Before you start"** — the bowls that have to exist before anything happens.
- **The gaps**: where their hands are free while something else cooks. That's
  when the cleaning down happens, not at the bell.
- **Conflicts in words** — never blocked, always explained.

Two toggles sit on the board. The **anchor** decides where the finished plan
sits on the clock: finishing as early as possible (spare time at the end) or
plating up at a set time, as in service. **How many of you are cooking** (up to
five) splits the "You" lane into one lane per cook and shows who does what — the
same plan either way, for whoever is managing the kitchen that day. The oven
stays shared however many people are standing at it.

The timeline runs **vertically** — time down the page, lanes as columns, which
suits portrait paper and narrow screens.

## Status

**Not yet ready for students.** Two things first:

1. `js/config.js` ships **placeholder bell times** (marked ⚠️). Replace `PERIODS`
   with the real schedule.
2. Nothing has been tested on a district Chromebook — specifically whether
   `github.io` is blocked by the content filter, and whether browser storage
   works inside the nested Canvas iframe.

See [`docs/spec.md` §11](docs/spec.md) for the full list of what hasn't been
verified.

Work is saved to **sessionStorage, not localStorage** — these are shared
Chromebooks and a student's plan shouldn't outlive their session on the machine.
That means work does not survive closing the tab; the page warns before that
happens, and "Download backup" is always available.

## Running locally

No build step, no dependencies. Any static file server works:

```
python -m http.server 8000
```

Opening `index.html` directly over `file://` will not work — the app uses ES
modules, which need `http://`.

## Tests

```
node test/run.mjs
```

Covers the plan model and its cascades, the scheduling arithmetic, and the
persistence layer including the storage fallbacks that matter inside a
locked-down iframe. See [`test/README.md`](test/README.md).

## Code layout

```
js/config.js     teacher-editable settings, and nothing else
js/time.js       clock and duration arithmetic
js/model.js      the plan shape, lookups, every mutation
js/schedule.js   backward pass, lanes, conflicts
js/storage.js    sessionStorage with a memory fallback, backup/restore
js/dom.js        h() — the whole rendering vocabulary
js/app.js        boot, plan lifecycle, section order
js/views/        one module per section: render() and status()
```

Nothing outside `views/` touches the DOM; nothing inside `views/` reaches into
another view.

## Configuration

Teacher-editable settings live in [`js/config.js`](js/config.js): the equipment
palette, which stations exist and which of them warn about collisions, the
cooking window, and the period bell times.

Per-assignment settings go on the embed URL:

| Param | Effect |
|---|---|
| `?recipe=` | Prefills the recipe name |
| `?foodUp=` | Pins plate-up time, overriding the period picker |
| `?period=` | Preselects a period by id |
| `?timer=` | Planning countdown in minutes (off by default) |
| `?mode=free` | Start on free placement instead of guided |
| `?demo` | Load a worked example plan instead of a blank one |

## Deployment

Hosted on GitHub Pages, served from `master`. Plain static HTML/CSS/JS with no
build step, so it can be ported to Google Apps Script without much work if the
district content filter turns out to block `github.io`.
