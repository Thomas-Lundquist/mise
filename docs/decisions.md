# Decisions

Newest first. Each entry: what was decided, and why.

## 2026-10-26: Print gives a paper report, not the guide screen

Print no longer prints the guide as it looks on screen. It prints a report designed for
paper. Page 1 is a **station sheet** to post: the big "Done by" time, cook name lines,
the pull list, the bowls (with who fills each and when), and the team table. Page 2 has
a **run sheet per cook** to cut apart: a checkbox, planned minutes, and an "Actual" blank
for each task, timer notes for hands-off steps, and "Free until…" gaps. It ends with
"After the lab" questions. The guide on screen is unchanged.

**Why:** Paper is the main way the guide is used in class. A posted sheet, plus a
personal list each cook can hold, works better at a station than one long page. The
"Actual" blanks and the reflection turn the lab into practice at estimating time.
**Trade-off:** what prints doesn't look like what's on screen, so the guide says so in
one line under Print. A team of 3 or more needs a third page for the reflection.

## 2026-10-25: Equipment comes from the steps; no Equipment screen

Each step records what it uses (bowls and tools) in one "Uses" box. The guide's equipment
list is built from those, plus an "Anything else to pull?" box for things like towels, plus
a line for the mise en place bowls.

**Why:** Recipes rarely list equipment; students find it by reading the method. Asking
"what does this step use?" teaches exactly that, and it cuts a screen. It also records
which step needs the oven or mixer, the groundwork for shared-equipment limits.
**Trade-off:** no quantity box; students write "2 sheet pans."

## 2026-10-25: One step open at a time

On the Steps screen only the step being edited is open; the others are one-line summaries.

**Why:** Adding "Uses" made each step card busier. One open card keeps the screen calm,
and the closed lines read like the student's own method, top to bottom.

## 2026-10-25: One team table replaces List and Blocks

The time plan is a single table: one row per moment something starts, one column per
cook. A task is one cell stretched down over the rows it lasts (merged cells), with
"until 9:26" when it lasts more than one row; blank means free. No view switch.

(First tried: a thin "still going" line in the rows below a task. It looked detached
from the task and broke the row lines, so it became the stretched cell.)

**Why:** The list was readable but hid who works at the same time. The blocks showed that
but made 1–2 minute tasks too small to read or print. The table keeps both strengths:
every task gets a readable row, and the team is still side by side. Fewer controls, too.
**Trade-off:** a row's height no longer shows how long a task takes; the minutes are printed instead.

## 2026-10-25: Cook names may be typed for the printout, never saved

For teams, the guide has optional "Who's who?" boxes (Cook A: ____). Names live only on
the open page and print with the guide; they are never written to local storage, and
closing the page forgets them. Left blank, they print as lines to fill in by hand.

**Why:** The team uses the manager's plan, so the team needs to know who is Cook A.
Keeping names out of storage keeps the "no personal data stored" rule.
This narrows the earlier "no names" ground rule to "no names *stored*."

## 2026-10-25: Keyboard first, with undo

Enter moves forward on every screen, the progress bar jumps between screens, and Ctrl+Z
(plus an "Undo" bar after removing something) steps back one change and jumps to it.

**Why:** Students mostly use school Chromebooks. Typing a recipe in should feel quick, and
mistakes should be cheap to fix, so deleting can stay one tap without a confirmation.

## 2026-10-22: Each step waits for one thing, not several

A step has a single "Starts after" choice (the step before, any time, or one earlier
step) rather than a checklist of everything it waits for.

**Why:** Simpler screen for students. **Trade-off:** a step that truly needs two things
(cook pancakes needs rested batter *and* a hot griddle) can only name one. Students work
around it by ordering steps, e.g. starting the preheat earlier. Revisit if this comes up
often in real labs.

## 2026-10-22: Critical-path priority and an even split between cooks

Pure recipe-order greedy hands tasks to whoever is free first, which can pile work on one
cook and delay tasks others are waiting on. Now the scheduler starts the tasks that hold
up the most work first, and hands each task to the least-busy free cook. In the pancake
test the split stayed 27 vs 14 hands-on minutes, because one 20-minute step dominates.

**Why:** The teacher wants the plan "greedy, but even", so no student stands around
waiting while a teammate does everything.

## 2026-10-22: Team scheduling with a greedy method, in v1

Steps record what they wait for ("Starts after"). A greedy scheduler gives each ready
task to whichever cook is free soonest. With 1 cook it produces a normal solo plan.

**Why:** The teacher wants plans that split work across lab teams. Recording what each
step waits for is also needed for an accurate solo plan with hands-off steps, so one
method covers both. Deciding what waits on what is itself good recipe-reading practice.

## 2026-10-22: Print-first lab guide

The printed guide is the main way students use it in class and how it's checked. The
screen is the backup. Canvas turn-in waits until the teacher thinks the app is ready.

## 2026-10-22: Static web app, no accounts, data stays in the browser

Plain HTML, CSS, and JavaScript with no build step, hosted free on GitHub Pages.
Student work is saved in their own browser's local storage.

**Why:** No personal or FERPA data is ever collected or stored. Nothing to install, it
works on any device, and it costs nothing. Plain files are the easiest for a non-programmer
to read and for us to change together.

**Trade-off:** Work lives on one device and browser. A student who starts on a Chromebook
won't see it on their phone. Printing or saving as PDF covers turning it in.

## 2026-10-22: No automatic recipe import in v1

**Why:** Typing in the recipe's details is how students practice reading it. Importing
would skip the skill the app exists to teach.
