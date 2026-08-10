# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Mise Planner — working agreement

The specs in docs/ are the source of truth. Do not redesign anything.

- Work ONE ticket at a time from docs/07-build-plan.md. Do not start the next ticket.
- Before coding: read docs/00, 01, 02, 07, plus the docs that ticket lists. Restate the
  ticket and list the files you'll produce, then wait for me to say go.
- Follow docs/02-conventions.md exactly: no dependencies, no build step, no framework,
  named exports, pure modules stay pure, no innerHTML with dynamic content.
- If something is genuinely unspecified, add it to docs/OPEN-QUESTIONS.md and continue with
  the spec as written. Never invent behavior and move on.
- If a hand-computed test (docs/09) fails, fix the code, never the test.
- One ticket = one commit, message prefixed with the ticket number (e.g. "T3: codec.js").

## Commands

- **Run locally:** `python3 -m http.server 8000`, then open `http://localhost:8000/index.html`.
  ES modules require HTTP; opening via `file://` fails on imports by design (not a bug).
- **Run tests:** open `http://localhost:8000/tests/test.html`. `assert.js` writes an
  `<h1>` with the pass/fail count and lists any failures. There is no npm/node runner.
- **Run one test file:** edit `tests/test.html` to import only that `*.test.js`, or open a
  scratch page that imports it. Tests are plain ES modules, no framework, no CLI.
- **Author a pack:** open `author.html` to build a teacher pack and produce a share URL.
- **Print view:** `print.html` opened in a new tab renders the printable plan.

There is no lint step and no formatter config; match the conventions in docs/02 by hand.

## Architecture

Three static HTML entry points, no router, no server, no persistence beyond the URL and a
localStorage draft:

- **`author.html`** (teacher) → `ui-author.js`: enter recipes, get a long share URL.
- **`index.html`** (student) → `app.js`: the four-screen planning flow.
- **`print.html`** → `print.js`: the printable output, opened in a new tab.

**The purity boundary is the core design constraint** (docs/02-conventions.md):

- **Pure modules** — `model.js`, `codec.js`, `scheduler.js`, `fillers.js`, `warnings.js`.
  No `document`, `window`, `localStorage`, `Date.now()`, or `Math.random()`. Determinism is
  a hard requirement: the same input must always produce the same output. This is what makes
  the hand-computed cases in docs/09-test-plan.md authoritative.
- **DOM modules** — `app.js`, `print.js`, and every `ui-*.js`. All DOM built with
  `createElement` + `textContent`; **never** `innerHTML` from pack/plan/URL content.
- **`store.js`** is the only place `localStorage` is touched, and only for a student draft
  keyed `mise:draft:<packId>`, always wrapped in try/catch with a memory fallback.

**Data flow in the student app (`app.js`):**

1. The pack arrives in `location.hash`: `#p=<encoded>` (inline, via `codec.js`) or
   `#pf=<name>.json` (a file under `/fixtures/`, fetched with a relative URL only).
2. A single mutable `plan` object is created by `blankPlan(pack)` and edited in place as the
   student moves through screens. `app.js` owns screen switching and the Back/Next footer.
3. The four screens are `hidden`-toggled sections of the one page, each mounted by a
   `ui-*.js` module that returns a `{ refresh }` controller:
   - Screen 0 Start — pack summary, cook count, names (built in `app.js`)
   - Screen 1 Bowls — `ui-bowls.js`, gates Next until every ingredient is bowled
   - Screen 2 Steps — `ui-steps.js`, tag each step active/passive + duration
   - Screen 3 Review — `ui-review.js` (auto schedule) **or** `ui-manual.js` (manual board);
     the student toggles `viewMode` between them
4. Screens gate forward progress only through `setNextEnabled(ok, reason)` — the shell owns
   the button, the screen owns the rule.

**Domain vocabulary (use these exact words in code and UI — see docs/00):** Pack (teacher's
recipes, read-only to students), Plan (student's tagging on a pack), Schedule (computed
output), Cook (`Cook A`…`Cook E`, never "worker"), Active step (hands busy), Passive step
(runs on its own), Filler (cleaning task in an idle gap), Floor (critical-path length),
Makespan (actual schedule length).

## Constraints most likely to be violated by accident

Full list in docs/00 and docs/02; these are the ones easy to break without noticing:
`innerHTML` with dynamic content, `eval`, `new Function`, `alert/confirm/prompt`, any CDN /
webfont / non-relative `fetch`, a float or `Date` object in the scheduler (integer minutes
only), or "cleaning up" something the docs specify. The app must run offline in a Canvas
iframe on a school Chromebook, responsive to 360px.
