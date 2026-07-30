# 01 — Product Spec

## The problem

In a Culinary 2 lab, groups of 3–5 students share a kitchen. Left alone, they cook
serially: one person works, the others stand around, and the last twenty minutes are a
panic. They also have no habit of starting the long, unattended things first. *Mise en
place* is the fix, and this tool is the scaffold for learning it.

The tool exists to make **parallelism and passive time visible**. The printed schedule is
the artifact; the learning is in the tagging decisions that produce it.

## Users

**Students** — 14–18 years old, on Chromebooks, in a hurry. This is a starter activity due
in the first ten minutes of class, opened the day before. They will not read instructions.
They will tap, not drag, if tapping is offered. They will type as little as possible.

**The teacher** — one person, ~180 students, no aide. Authors packs occasionally, in a prep
period. Willing to spend twenty minutes once per recipe if it saves students ten minutes
every lab.

## What the app must do

1. **Bowls.** Student assigns every ingredient in the pack to a numbered bowl. One
   ingredient per bowl up to many per bowl. The bowl grouping decision is the student's,
   not the app's.
2. **Equipment.** The app produces one deduplicated checklist across all of the day's
   recipes, derived from the steps plus the number of bowls. The student does not type this.
3. **Time sheet.** From the student's step tags, the app computes a step-by-step schedule
   for 1–5 cooks with as little idle time as possible, fills remaining idle gaps with
   cleaning and side tasks, and prints it.
4. **Print.** One click produces a printable page via the browser's print dialog, which is
   how the student gets a PDF to submit or tape up.

## Grading context (why some things are the way they are)

The mise en place assignment is **ungraded** and gate-like: a kitchen group cannot begin
cooking until about three of its members have finished theirs, and no individual student
enters the kitchen until theirs is done. Students who miss the window take a
professionalism hit that caps the lab score at a 3.

Consequences for the design:

- **No accounts, no server, no grades.** Nothing to store. Nothing to breach. No FERPA
  surface.
- **Speed beats polish.** Every extra click is multiplied by 180 students under time
  pressure.
- **The plan must be checkable at a glance.** The teacher walks the room and looks at a
  printed page. Legibility at arm's length matters more than screen beauty.

## Non-goals (do not build these)

- Recipe scaling or unit conversion. A separate tool already does conversions.
- Nutrition data, cost, or inventory.
- Student accounts, saved history, teacher dashboards, or submission collection.
- Multi-kitchen or whole-class coordination. One kitchen at a time.
- Anything that calls a language model at runtime. The schedule must be deterministic:
  the same tags must always produce the same schedule, so the teacher can verify it and
  two students can compare their reasoning.

## Deferred to Phase 4 (specified, but built last)

**Manual mode.** Later in the semester, the auto-scheduler is replaced by a drag-and-drop
lane view where the student places blocks themselves, and the app only *validates*: it
flags dependency violations and equipment conflicts, and shows their makespan next to the
algorithm's. Same data model, same print view. Build it only when Ticket 14 is called.

## Definition of done for v1

A student can open a pack URL on a Chromebook, finish in under eight minutes without
asking a question, and print a legible plan whose timeline has no cook idle for more than
three consecutive minutes without a filler task assigned.
