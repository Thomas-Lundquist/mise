# Mise En Place Planner — Build Spec

**For:** Culinary 2 / Culinary 1, Skyline High School
**Target:** single-page web app, hosted on Google Apps Script, embedded in Canvas assignments via iframe
**Status:** spec for first build

---

## 1. What it is

A pre-lab planning tool students fill out in the first ten minutes of class. It replaces a paper mise en place sheet. Students read the recipe, pull equipment, group ingredients into bowls, and build a time plan by working backward from plate-up. They print to PDF and upload it to the Canvas assignment.

Completing it is the gate for entering the lab. It is not graded on quality — completion only.

---

## 2. Users and context

- **Students, 15–17.** Mixed motivation. Many will be doing this under time pressure at 7:40am.
- **Device:** district Chromebooks, some touchscreen. Assume trackpads, assume small screens, assume no mouse.
- **Session:** one-shot, ~10 minutes, then printed. Not returned to. No accounts, no login.
- **Teacher:** configures per-assignment behavior by changing the iframe URL. No admin UI, no database, no roster.

---

## 3. Non-negotiable constraints

**These are pedagogical, not technical. Do not optimize them away — a "better" implementation that violates them makes the tool worthless.**

1. **The app never auto-solves the time plan.** It may compute arithmetic (clock math, totals, start times). It must never decide *what order* steps go in, *which* tasks can overlap, or *what* a student should be doing during a free window. Those decisions are the thing being taught. The app's job is to surface the opportunity and let the student choose.
2. **The app never extracts steps, equipment, or ingredients from a recipe.** No AI parsing, no autofill from recipe text. Reading the recipe and deciding what it requires is the assignment.
3. **Suggestions are palettes, not answers.** Offering a tappable list of common equipment is fine — it saves typing. Pre-selecting likely equipment is not.
4. **No login, no accounts, no PII beyond a typed name.** Student data never leaves the browser.

---

## 4. Sections

The app is one scrolling page with four numbered sections plus an identity strip.

### Identity strip
Name, kitchen number, date (default today), today's role, recipe name. Plain text inputs. Recipe name and date may be prefilled by URL param.

### 01 — Read
- Checkbox: "I read the entire recipe, start to finish."
- Text input: "The step I think will be hardest today."

Both are deliberately low-effort. The checkbox is an honesty prompt; the text field is a cheap signal the teacher can scan to see where the room expects trouble.

### 02 — Pull (equipment)
- **Search field first.** Typing filters the palette live. This is the primary interaction.
- **Tappable palette below**, grouped: Cook / Prep / Measure. Tapping toggles selection.
- **Custom add** for anything not in the palette.
- Selected items display in a "pulled" tray with individual remove.

Palette contents should live in a single config object at the top of the file so the teacher can edit the list without hunting through code.

### 03 — Group (bowls)
- Grid of bowl cards. Three by default, add/remove freely.
- Each bowl has a **label field** (styled like tape on a deli container) and a list of ingredients.
- Ingredient entry: type + Enter appends, focus stays in the field for fast repeat entry.

### 04 — Time
The core of the app. See section 5.

---

## 5. Time planner

Two modes, same underlying board. Mode is set by URL param — see section 7.

### 5a. Scaffolded mode (default, fall semester)

**Phase 1 — backward elicitation.**
One question at a time, building a list upward:

- First prompt: *"What is the very last thing you do before it goes on the plate?"*
- Subsequent prompts: *"And what happens right before '[most recently entered step]'?"*

For each step the student enters:
- Name (text)
- Duration in minutes (number)
- **Hands-on or unattended** — a two-button toggle, phrased concretely: "Hands on it (chopping, stirring, searing)" vs "Runs by itself (baking, simmering, chilling, resting)".

The hands-on flag is the load-bearing input. It is what makes lane layout computable without asking a teenager to reason about scheduling. Keep the wording physical and concrete.

Steps are stored in forward chronological order (each new entry unshifts to the front).

**Phase 2 — the board.**
Renders lanes on a proportional timeline:
- A **You** lane containing all hands-on steps, serialized.
- One lane per unattended step, grouped by station (Oven / Stovetop / Cold / Prep). Station is keyword-guessed from the step name with a manual override.

Baseline schedule is fully serial: every step starts when the previous ends. Then:

- Any unattended block creates a **free-hands window** on the You lane, rendered as a dashed outline.
- Clicking a window opens a prompt: *"'[step]' runs for N minutes without you. What could you be doing during that window?"*
- The picker offers **only steps later in the student's own chain** that **fit inside the window**. The student picks one, or declines.
- Choosing one re-schedules that step to run concurrently inside the window.
- A running list of overlapped pairs displays below the board with one-click undo, headed by a prompt to double-check that each pair genuinely can run simultaneously.

**Readouts:**
- **Start cooking at** — service time minus total elapsed. Large, prominent.
- **Total time**
- **Overlapping saves you** — difference between serial total and current total, expressed as a later start time. This is the reward signal; it should feel good to move.

### 5b. Open mode (spring semester)

Same board, no elicitation phase and no prompts. Student adds blocks directly, assigns lanes, and positions them.

- **Snap to 5-minute increments.**
- **Keyboard support is required, not optional.** Arrow keys move a selected block; shift+arrow resizes. Trackpad dragging on a Chromebook is miserable and pure drag-and-drop excludes keyboard users entirely.
- Two hands-on blocks overlapping on the You lane is a conflict — flag it visibly. Two blocks overlapping in the same equipment lane is also a conflict (one oven, one burner). Flag, don't block.

### Known simplification
Blocks must fit entirely inside a window; tasks can't be split across windows. Real kitchens split tasks constantly. Accept this for v1, revisit after a semester of use.

---

## 6. Data model

```js
{
  meta:      { name, kitchen, date, role, recipe },
  read:      { done: bool, hardest: string },
  equipment: [ "Sauté pan", "Chef knife", ... ],
  bowls:     [ { label: string, items: [string] } ],
  time: {
    service: "12:35",              // 24h
    steps: [
      {
        id:    string,
        name:  string,
        mins:  number,
        hands: bool,               // false = unattended
        lane:  "Oven"|"Stovetop"|"Cold"|"Prep",
        par:   number|null         // index of step this runs concurrently inside
      }
    ]
  }
}
```

`steps` is in forward chronological order. `par` is the only scheduling state — everything else derives from it.

---

## 7. Teacher configuration

All config via URL query params on the iframe `src`. No settings screen, no backend.

| Param | Values | Default | Effect |
|---|---|---|---|
| `mode` | `scaffold` \| `open` | `scaffold` | Which time planner |
| `recipe` | string | empty | Prefills recipe name |
| `service` | `HH:MM` | `12:35` | Prefills plate-up time |
| `timer` | minutes, or `0` | `10` | Header countdown; `0` hides it |

So the fall assignment embeds `…/exec?mode=scaffold&recipe=B%C3%A9chamel&service=12:35` and the spring one changes `scaffold` to `open`. Switching a class from training wheels to open canvas is a one-character edit in the Canvas assignment.

---

## 8. Persistence

Save state to `localStorage` on every change, keyed by recipe name, and restore on load. A refresh mid-period should not wipe ten minutes of work.

**Risk to test on day one:** the app runs in a nested iframe (Canvas → Apps Script `exec` → Apps Script's internal sandbox frame). Browser storage partitioning in third-party frame contexts may block `localStorage` entirely. Verify inside a real Canvas page before building anything on top of it.

Fallbacks in order of preference if it's blocked:
1. `sessionStorage`
2. In-memory only, plus a prominent "Open in new tab" link so students can work outside the frame
3. A "download draft" button producing a small JSON file they can re-upload

---

## 9. Output

- **Print stylesheet is a first-class requirement, not a polish item.** The printed page is the actual deliverable that goes in the student's recipe book.
- One page, portrait, black and white, no interface chrome — hide palettes, add-buttons, prompts, timer, and controls.
- The board must remain legible in print: light fills instead of dark ones, borders instead of color-only distinctions.
- Test `window.print()` from inside the Canvas iframe early. If it prints the parent page instead of the frame, provide an "Open full page" link and print from there.
- Suggested filename convention for the PDF: `LastName-Recipe-Mise.pdf`, communicated in on-screen helper text since the browser controls the actual save dialog.

---

## 10. Deployment

**Host:** Google Apps Script web app, deployed under the district Google account.

- `doGet` must end with `.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)` or the browser refuses to frame it.
- Editing code does not update a live deployment. Every change needs a new deployment version. Expect to be caught by this at least once.
- Chosen over GitHub Pages specifically because it lives inside the district Google tenant and is unlikely to hit a content filter. A `github.io` domain may work fine or may be blocked, and you won't find out until thirty students load it simultaneously.

**Embed in Canvas:**
- Paste an iframe into the **assignment description** via the HTML editor (`</>`), not a separate page — the tool and the submit button should be on one screen.
- HTTPS only. Iframe content renders in View mode, not Edit mode.
- Canvas strips some iframe attributes; keep it to `src`, `width`, `height`, and inline `style`.
- Assignment submission type: file upload, PDF.
- Canvas mobile app iframe rendering is historically unreliable. Test before August if any students work from phones.

---

## 11. Accessibility and device floor

- Visible keyboard focus on every interactive element.
- All actions reachable by keyboard — no drag-only interactions.
- Respect `prefers-reduced-motion`.
- Tap targets sized for touchscreen Chromebooks.
- Responsive down to ~360px width.
- Color is never the only signal (hands-on vs unattended needs a text label too, not just blue vs green).

---

## 12. Out of scope for v1

Listed explicitly so they don't get built:

- Accounts, logins, rosters, or any server-side state
- Teacher dashboard or submission viewing (Canvas already does this)
- Recipe database or recipe import
- AI recipe parsing or step suggestion
- Grading, scoring, or rubric logic
- Multi-student collaboration on one plan
- Task splitting across multiple windows

---

## 13. Build order

1. Static shell: identity strip, sections 01–03, print stylesheet. Verify printing works from inside a real Canvas iframe.
2. Verify `localStorage` in the nested frame. Pick the persistence path based on the result.
3. Scaffolded time planner, phase 1 (elicitation).
4. Scaffolded time planner, phase 2 (board, windows, overlap).
5. URL param config.
6. Open mode.

Steps 1 and 2 are deliberately first because they're the two things most likely to fail in a way that changes the architecture, and both are cheap to test.
