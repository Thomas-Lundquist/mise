# 02 — Conventions

## File layout

Create exactly this structure. Do not add directories.

```
/index.html            Student flow (all four steps, one page, no router)
/author.html           Teacher pack builder
/print.html            Print view, opened in a new tab
/css/app.css           Screen styles (tokens live here)
/css/print.css         Print styles only, linked from print.html
/js/model.js           Types, defaults, validation. No DOM.
/js/codec.js           Pack/plan <-> URL-safe string. No DOM.
/js/scheduler.js       Scheduling algorithm. Pure. No DOM.
/js/fillers.js         Filler derivation + gap filling. Pure. No DOM.
/js/warnings.js        Plan sanity warnings. Pure. No DOM.
/js/store.js           In-memory + localStorage draft persistence.
/js/ui-bowls.js        Screen 1
/js/ui-steps.js        Screen 2
/js/ui-review.js       Screen 3
/js/ui-author.js       Teacher builder UI
/js/app.js             Boots index.html, owns screen switching
/js/print.js           Boots print.html
/fixtures/*.json       Test data (copied from the docs pack)
/tests/test.html       Open in a browser to run all tests
/tests/assert.js       Twenty-line assertion helper. No test framework.
/tests/*.test.js       One file per module under test
```

## JavaScript rules

- ES modules (`<script type="module">`). Named exports only, never `export default`.
- Vanilla JS. No dependencies of any kind, ever, including dev dependencies.
- `scheduler.js`, `fillers.js`, `warnings.js`, `model.js`, and `codec.js` are **pure**:
  no `document`, no `window`, no `localStorage`, no `Date.now()`, no `Math.random()`.
  Determinism is a hard requirement — the same input must always produce the same output.
- All DOM work lives in `ui-*.js`, `app.js`, or `print.js`.
- JSDoc comment blocks for every exported function: params, return, and one-line purpose.
  No TypeScript, no `.d.ts`.
- 2-space indent. Semicolons. `const` by default. Template literals over concatenation.
- Build DOM with `document.createElement` and `textContent`. **Never** assign
  `innerHTML` from any value that came from a pack, a plan, or a URL.
- Integer minutes everywhere. No floats, no seconds, no `Date` objects in the scheduler.
- Fail loudly in pure modules: `throw new Error('scheduler: ...')` with a message that
  names the module and the offending id.

## Storage rules

- `localStorage` is allowed **only** inside `store.js`, and only for a student's
  in-progress draft, keyed `mise:draft:<packId>`. A draft is a convenience, not a
  requirement; the app must work correctly if `localStorage` throws or is disabled, so
  wrap every access in `try/catch` and fall back to memory.
- If you are asked to demo any of this inside a Claude artifact preview rather than as
  hosted files, browser storage is unavailable there — use in-memory state for the demo
  and leave `store.js` unchanged.

## Local development

No server-side anything, but ES modules need HTTP. Run:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`. Opening via `file://` will fail on module
imports; that is expected and is not a bug to fix.

## Visual direction

The subject is a working kitchen, so the interface borrows from a kitchen's own paper: prep
lists, masking-tape labels written in marker, a ticket rail on the pass. Not "restaurant
elegance," not a consumer recipe app. Flat, high-contrast, blunt, fast to read at arm's
length with wet hands.

**Signature element: the ticket rail.** The timeline is a set of vertical lanes hung off a
punched time spine down the left edge, and beneath the last block there is a single heavy
rule labelled `FLOOR — 42 MIN`: the fastest this lab could possibly run. The visible gap
between the last block and the floor line is the whole lesson.

Spend the boldness there. Everything else stays quiet.

### Tokens — put these in `css/app.css` as `:root` custom properties and use nothing else

```css
--ink:      #16181A;  /* text, rules, marker */
--paper:    #F6F6F3;  /* page background — cool, not cream */
--panel:    #FFFFFF;  /* cards, inputs */
--steel:    #B9BFC4;  /* borders, dividers, disabled */
--active:   #0E5C54;  /* active step blocks — hands busy */
--passive:  #E9D48A;  /* passive step blocks — masking tape */
--filler:   #8A9199;  /* side tasks, secondary text */
--alert:    #A8321E;  /* warnings only, never decoration */
```

Colour carries meaning, so it must never be the *only* carrier: active blocks are solid
with a dark border, passive blocks are tape-yellow with a dashed border, fillers are gray
with an italic label. This survives a black-and-white printer, which is what the school has.

### Type

**No webfonts. No font CDN.** System stacks only:

```css
--font-ui:   system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
--font-data: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

Personality comes from treatment, not from a purchased face:

- Section eyebrows and every label: `--font-ui`, 700, uppercase, `letter-spacing: .12em`,
  11–12px. This is the masking-tape marker voice.
- Body and step text: `--font-ui`, 400, 15px minimum on screen, `line-height: 1.45`.
- **Every number and every clock time uses `--font-data`** with `font-variant-numeric:
  tabular-nums`. Times must align in a column; this is functional, not stylistic.
- Weight does the emphasis. Do not use italic except for fillers.

### Layout and interaction

- `border-radius: 2px` maximum. Corners are not the personality here.
- One accent per screen. No gradients, no shadows deeper than
  `0 1px 0 var(--steel)`, no glassmorphism.
- Tap targets minimum 44×44px. **Every drag interaction must have a tap equivalent**
  (tap the ingredient, then tap the bowl). Chromebook trackpad drags fail constantly and
  a student will not fight it.
- Visible keyboard focus: `outline: 2px solid var(--ink); outline-offset: 2px`. Do not
  remove outlines.
- Respect `@media (prefers-reduced-motion: reduce)`. Motion is limited to screen
  transitions under 150ms anyway.
- Responsive down to 360px wide. The iframe in Canvas is narrower than students expect.

## Copy rules

- Sentence case for sentences, uppercase only for the eyebrow labels described above.
- Buttons name the action and keep the same word all the way through: the button says
  **Make my plan**, so the screen it produces is headed **Your plan**.
- Speak the kitchen's language, not the code's: "While this cooks, are your hands busy?"
  never "Set step occupancy mode."
- Errors say what happened and what to do: "Two ingredients aren't in a bowl yet — tap
  them, then tap a bowl." Never "Validation failed."
- Empty states are instructions, not decoration.

## Forbidden

- `innerHTML` with dynamic content, `eval`, `new Function`.
- Any `fetch` to a non-relative URL.
- Emoji as UI icons.
- `alert()`, `confirm()`, `prompt()`.
- Renaming, "cleaning up", or contradicting anything in the docs. Ambiguity goes in
  `OPEN-QUESTIONS.md`.
