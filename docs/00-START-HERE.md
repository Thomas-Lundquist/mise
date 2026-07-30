# Mise Planner — Build Scaffold

**Read this file first, every session.**

You are helping build a small, dependency-free web app called **Mise Planner**. It is
embedded as an iframe in a Canvas course. High school Culinary 2 students use it to plan
their *mise en place* before a cooking lab, and it prints a one-or-two page PDF they tape
to a cabinet during the lab.

## The one rule that matters

**These documents are the source of truth. Do not redesign anything.**

If a document tells you the tie-breaking order for the scheduler, use exactly that order.
If a document names a file, create exactly that file. If something is genuinely
unspecified and you cannot proceed, **stop, and append the question to
`OPEN-QUESTIONS.md`** with the ticket number. Do not invent a behavior and move on — the
whole point of this scaffold is that many different sessions produce one consistent app.

## Documents

| File | What it's for | Who needs it |
|---|---|---|
| `00-START-HERE.md` | This file. Orientation and rules. | Every session |
| `01-product-spec.md` | What the app is, who uses it, constraints, non-goals. | Every session |
| `02-conventions.md` | Code style, file layout, visual tokens, forbidden patterns. | Every session |
| `03-data-model.md` | Every data structure, field by field. | Most tickets |
| `04-scheduler-spec.md` | The scheduling algorithm, in near-code detail. | Tickets 4–7 |
| `05-ui-spec.md` | Every screen, control, and label. | Tickets 8–13 |
| `06-print-spec.md` | The printed PDF layout and measurements. | Ticket 13 |
| `07-build-plan.md` | Numbered tickets with acceptance criteria. | Every session |
| `08-prompt-templates.md` | Copy-paste prompts for starting a work session. | The teacher |
| `09-test-plan.md` | Invariants and hand-computed cases. | Tickets 4–7 |
| `fixtures/recipe-pack.example.json` | A real two-recipe lab day. | Tickets 3–13 |
| `fixtures/plan.example.json` | A student's completed tagging for that pack. | Tickets 4–7 |

## How a work session goes

1. The teacher pastes the prompt from `08-prompt-templates.md` with one ticket number.
2. You read `00`, `01`, `02`, `07`, plus the documents that ticket lists.
3. You produce **only** the files that ticket lists.
4. You state, in one short paragraph, what you did and how you verified it.
5. You do not start the next ticket.

One ticket per session. Tickets are sized so a session stays small and verifiable.

## The three-phase shape of the app

- **Teacher, once per lab day:** opens `author.html`, enters or pastes the day's recipes,
  gets a long URL. Pastes that URL into the Canvas assignment. Nothing is stored on a
  server, ever.
- **Student, ~8 minutes:** opens the URL, groups ingredients into bowls, tags each
  pre-loaded step with a duration and whether their hands are busy, sets how many cooks are
  in the kitchen, clicks **Make my plan**.
- **Output:** a print view with bowl groupings, an equipment checklist, and a lane-by-lane
  time sheet with idle time filled by cleaning tasks.

## Vocabulary (use these exact words in code and UI)

- **Pack** — a lab day's recipes, authored by the teacher. Read-only to students.
- **Plan** — a student's tagging decisions on top of a pack.
- **Schedule** — the computed output: assignments of steps to cooks and minutes.
- **Cook** — one student in the kitchen (`Cook A` … `Cook E`). Never "worker" or "resource".
- **Active step** — hands busy the whole time (chopping, stirring, searing).
- **Passive step** — starts, then runs on its own (simmering, baking, chilling, resting).
- **Filler** — a cleaning or side task dropped into a cook's idle gap.
- **Floor** — the critical path length: the fastest this lab can possibly go.
- **Makespan** — the actual total length of the computed schedule.

## Non-negotiable technical constraints

- No build step. No npm. No bundler. No framework. No TypeScript. No CSS preprocessor.
- No external network requests at runtime. No font CDNs, no CDN scripts, no analytics.
- Must work on a school-managed Chromebook in Chrome, inside an iframe, offline after load.
- Everything must be plain files served statically (GitHub Pages).
