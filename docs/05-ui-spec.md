# 05 — UI Spec

Two entry points: `index.html` (student) and `author.html` (teacher). `print.html` is
output only. All copy below is final — use it verbatim unless a ticket says otherwise.

Shell for `index.html`: a fixed header holding the pack title and a four-dot step
indicator, a scrolling content area, and a fixed footer with Back / Next. Screens swap by
toggling a `hidden` attribute on four `<section>` elements. No router, no hash navigation
inside the student flow — the hash already holds the pack.

---

## Screen 0 — Start

Purpose: confirm the right lab and set the kitchen size. Under 20 seconds.

- Eyebrow: `TODAY'S LAB`. Then `pack.title` as an h1.
- A plain list of recipe names with ingredient and step counts:
  `Rice Pilaf — 7 ingredients, 6 steps`.
- **How many cooks in your kitchen?** Five large buttons `1 2 3 4 5`, single-select,
  default 4. Buttons, not a slider: a slider on a Chromebook trackpad is a coin flip.
- Optional, collapsed behind a text link **Add names (optional)**: up to five 12-character
  text inputs. Blank names print as `Cook A`–`Cook E`.
- Primary button: **Start planning**.
- If the hash is missing or damaged: show only "This link is damaged. Ask your teacher for
  a new one." Do not show a partial form.
- If a draft exists in `localStorage` for this `packId`: a single line above the button —
  "You started this yesterday. **Pick up where you left off** · Start over."

## Screen 1 — Bowls

Purpose: the student decides what gets combined. This is a real culinary decision and the
app must not make it for them.

Layout: two columns on screens wider than 640px, stacked below that.

**Left — Not in a bowl yet.** Every unassigned ingredient as a chip showing `label`, grouped
under a small recipe-name heading. A counter above: `4 left`.

**Right — Your bowls.** Bowl cards, each with `BOWL 1` as its eyebrow, its ingredients as
removable chips, and a **Remove bowl** text button (only when empty). Below the cards, a
full-width dashed button: **+ New bowl**.

Interaction, both paths required:

- **Tap path (primary).** Tap an ingredient — it gets a heavy `--ink` outline and the bowl
  cards show a **Put here** affordance. Tap a bowl card to move it. Tap the ingredient again
  to deselect. Multi-select is allowed: tap several ingredients, then one bowl.
- **Drag path (secondary).** HTML5 drag-and-drop for mouse users, with a `--steel` dashed
  drop outline on hover. If drag is unavailable or fails, the tap path still works. Never
  make drag the only way to do anything.
- Tapping a chip already in a bowl selects it for moving; a **Take out** button on the chip
  returns it to the left column.

Guidance line under the heading, one sentence: "Put ingredients in the same bowl only if
they go into the pan at the same moment."

**Next** is disabled until every ingredient is placed, with the reason shown next to it:
"2 ingredients still need a bowl."

Optional teacher answer key: if a pack step's `consumesBowlOf` implies two ingredients are
added at different moments and the student has bowled them together, show a quiet inline
note on that bowl — "These two go in at different times. Sure?" — and let them continue.
Never block.

## Screen 2 — Steps (the important one)

Purpose: collect a duration and an active/passive judgement per step, in as few taps as
possible. Target: **two taps per step, zero typing.**

One card per step, in recipe order, all recipes stacked with a recipe-name divider. The
card is compact — aim for six cards visible on a Chromebook screen — and shows:

1. Step number and `shortLabel` in 700 weight; the full `label` in 400 beneath it.
2. **How long?** A row of duration chips: `1 2 3 5 10 15 20 30 45 60`, single-select,
   pre-selected from `suggestedDurationMin`, the number in `--font-data`. No text input,
   no stepper, no "other".
3. **While this happens, are your hands busy?** Two buttons: **Hands busy** /
   **Hands free**, pre-selected from `suggestedHands`.
   - Under **Hands free**, one line of helper text in `--filler`: "You start it and walk
     away — simmering, baking, chilling, resting."
   - Under **Hands busy**: "You're standing there doing it — chopping, stirring, searing."
4. If `teachHint` exists, one line in `--filler` italic.
5. A collapsed text link **This needs something else first** revealing a multi-select list
   of all other steps by `shortLabel`, writing `dependsOnOverride`. Collapsed by default,
   used rarely. **Never ask a student to build a dependency graph** — the default "each
   step follows the one before it in its own recipe" is right about nine times in ten, and
   a wrong graph produces a confidently wrong schedule.

Because every field is pre-filled by the teacher, a student who agrees with everything can
reach the end of this screen with **zero taps**, and disagreement costs one tap. That is the
entire reason steps are pre-loaded rather than typed. Typing recipe steps teaches nothing,
eats the whole ten-minute window, and makes two students' plans impossible to compare.

Sticky at the bottom of the screen while scrolling: a running total in `--font-data`,
`Total hands-on time: 34 min`. It changes as they tag, which is the first place they feel
the model responding to them.

**Next** is enabled always — every step already has a valid tag.

## Screen 3 — Your plan

Purpose: show the schedule, explain it, offer the print.

Order on the page:

1. Two big numbers side by side in `--font-data`: **`47 min` YOUR PLAN** and
   **`42 min` FASTEST POSSIBLE**. If they are equal, a single line: "This is as fast as
   this lab can go."
2. Warnings, most severe first. Each is one sentence with the offending step named. Errors
   render in `--alert` with printing disabled; warnings render in `--ink` on a `--paper`
   panel and do not block.
3. The timeline, on screen, using the same lane structure as the print view (see
   `06-print-spec.md`) at 10px per minute instead of 3mm (revised from 2px during T12 — 2px was
   illegible on screen; the value is the `SCALE` const in `js/ui-review.js`). Tapping a block shows the full
   step label. Nothing else is interactive.
4. Per-cook summary line: `Cook A — 41 min working, 6 min on side tasks`.
5. Primary button: **Print my plan** → opens `print.html` in a new tab with the plan in the
   hash, then calls `window.print()` on load. Never print the iframe itself; printing from
   inside an iframe is unreliable across Chrome versions and a new tab is bulletproof.
6. Secondary text button: **Copy plan code** → copies the encoded plan string to the
   clipboard for a Canvas text submission.

## Teacher — `author.html`

Not pretty, but complete. One long form, save-as-you-type into `localStorage` under
`mise:author:<packId>`, plus **Download pack JSON** and **Load pack JSON** buttons so packs
survive and can be edited next year.

Sections in order:

1. **Day** — `packId`, `title`, `labMinutes`.
2. **Equipment** — a table with columns Name, Id, Capacity, On checklist, and a **+ Add**
   row. Ships pre-filled with a default kitchen the teacher can trim: oven (1), burners (4),
   sink (1), stand mixer (1), food processor (1), cutting board (5), chef knife (5),
   sheet pan (2), sauté pan (2), saucepan (2), mixing spoon (5), scale (2).
3. **Filler tasks** — same table shape: Label, Minutes, Equipment, Repeatable. Ships
   pre-filled with: wipe down your station (3), sweep your kitchen floor (4), refill the
   sanitizer bucket (2), reread the next step out loud to your group (1), check the oven
   temperature (1), put away tools you're done with (3).
4. **Recipes** — repeatable blocks. Each has a name, a paste-in ingredient textarea (one
   per line, ids auto-generated from a slug of the line, `shortLabel` auto-suggested and
   editable), and a step list. Each step row has: label, shortLabel, suggested minutes,
   suggested hands, equipment multi-select, `consumesBowlOf` multi-select, and an
   **Advanced** disclosure for `dependsOnOverride` and `teachHint`.
5. **Check and publish** — runs `validatePack`, lists any errors with the offending ids,
   then shows the assignment URL in a read-only field with **Copy link**. Also runs a
   built-in reference plan (accept every suggestion, 4 cooks) through the scheduler and
   reports "Reference plan: 47 min, floor 42 min" so the teacher sees whether the day is
   even feasible in the period **before** thirty students discover it isn't.

Section 5's feasibility preview is the single most valuable thing on this page. Do not cut it.
