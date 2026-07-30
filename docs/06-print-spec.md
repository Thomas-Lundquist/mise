# 06 — Print Spec

The printed page is the actual deliverable. It gets taped inside a cabinet door and read
from three feet away by someone with flour on their hands, on a black-and-white school
printer. Design for that, not for the screen.

Files: `print.html`, `css/print.css`, `js/print.js`.

`print.html` reads the plan and pack from the URL hash, renders, then calls
`window.print()` once on load. It has no navigation and no buttons except a small
**Print again** link that is `display: none` in print media.

## Page setup

```css
@page { size: letter portrait; margin: 12mm; }
```

Content width 190mm. Everything in `pt` or `mm`, never `px`, never `rem`. Black on white
only — the tokens from `02-conventions.md` are for screen; in print, `--passive` becomes a
15% gray fill and `--active` becomes a 100% black border with white fill. **No large areas
of dark fill.** A solid block per step eats a toner cartridge across 180 students.

## Page 1 — Bowls and equipment

Header, one line, 10pt: `pack.title` left, `Cooks: 4` right, then a hairline rule.
Below it a name blank: `Name ____________________  Kitchen ____`. Handwritten, because the
app has no accounts and the teacher still needs to know whose plan this is.

**BOWLS** — eyebrow label, then a two-column table:

| Bowl | Goes in it |
|---|---|
| 1 | 1 1/2 cups long-grain rice |
| 2 | 1/2 onion, small dice · 1 clove garlic, minced |

- Bowl number in `--font-data`, 12pt bold. Ingredients at 10pt, full `label` text, separated
  by a middle dot when several share a bowl.
- Every bowl row gets a 4mm empty checkbox at the left so the student ticks off bowls as they
  scale and measure. The paper is a working document, not a receipt.

**EQUIPMENT** — eyebrow label, then a checkbox list in three columns, 10pt, alphabetical:

```
[ ] Chef knife        [ ] Mixing bowls x6    [ ] Saucepan
[ ] Cutting board     [ ] Oven               [ ] Sauté pan
```

Bowls appear as one entry, `Mixing bowls x<bowlCount>`. Only equipment with
`checklist: true` and actually used by a scheduled step appears.

If bowls and equipment together fit in less than half the page, the timeline may start on
page 1 after a 8mm gap. Otherwise force `page-break-before: always` on the timeline.

## Page 2 — The time sheet

This is the ticket rail. One column per cook, hung off a time spine.

```
      ┌─────────────┬─────────────┬─────────────┬─────────────┐
 MIN  │   COOK A    │   COOK B    │   COOK C    │   COOK D    │  OVEN/BURNERS
      ├─────────────┼─────────────┼─────────────┼─────────────┤
  0 ──│ Dice onion  │ Toast rice  │ Trim chick. │ Preheat oven│  ▓ oven 0-10
      │             │ ┌ ─ ─ ─ ─ ┐ │             │             │  ▓ burner 3-21
  5 ──│             │ │ Simmer  │ │             │ Wash bowl 1 │
      │ Mince garlic│ │ (18 min)│ │ Season      │             │
 10 ──│             │ └ ─ ─ ─ ─ ┘ │             │             │
      ...
      ├─────────────┴─────────────┴─────────────┴─────────────┤
 42 ══╪══════════ FLOOR — 42 MIN ═════════════════════════════╡
 47 ──│ done                                                  │
      └───────────────────────────────────────────────────────┘
```

### Measurements

- **1 minute = 3mm.** A 50-minute lab is 150mm tall and fits one page with the header.
- If `makespanMin > 70`, drop to 2mm per minute. If still over one page, break at a 5-minute
  boundary and repeat the full header row on the next page.
- Time spine: 14mm wide, right-aligned numbers in `--font-data` 9pt, a tick every minute and
  a labelled tick every 5 minutes with a hairline gridline all the way across.
- Cook lanes share the remaining width equally, 4–5 lanes for a 190mm page. Minimum lane
  width 30mm; below that, reduce to 2mm per minute rather than narrowing lanes further.
- Equipment strip: rightmost 22mm, unlabelled bars showing `equipmentUse` intervals so the
  group can see the oven is committed. Only equipment with `capacity <= 2` appears here.

### Block rendering

Blocks are absolutely positioned inside their lane: `top = startMin * scale`,
`height = (endMin - startMin) * scale`, minimum height 5mm so a 1-minute step is still
readable.

| Kind | Border | Fill | Label |
|---|---|---|---|
| Active step | 0.5pt solid black | white | shortLabel, 9pt, 700 |
| Passive step | 0.5pt **dashed** black | 15% gray | shortLabel + `(18 min)` on a second line |
| Filler | 0.25pt dotted black | white | label, 8pt, **italic**, `--filler` gray text |
| Critical step | as above **plus** a 1.5pt solid black bar down the left edge | | |

A passive step draws the cook-hold portion (`startMin`→`endMin`, usually 1 minute) as the
solid part, then a dashed outline continuing to `runsUntilMin` with no fill and the label
`↓ runs to :30`. That visual — a thin start marker and a long empty box — is the whole
lesson about passive time, so do not simplify it into one solid block.

Every block carries a small step reference in the corner, `R1·3` for recipe 1 step 3, in
`--font-data` 7pt, keying back to the recipe handout.

### Footer, below the last lane

1. The **floor line**: a 1.5pt double rule across all lanes at `floorMin * scale`, labelled
   `FLOOR — 42 MIN`. If the makespan is longer, the space between the last block and the
   floor line is visible white gap. Do not soften this. It is the argument the sheet exists
   to make.
2. One line, 9pt: `Your plan: 47 min · Fastest possible: 42 min · Period: 50 min`.
3. Any warnings, 9pt, prefixed `Note:`. Errors never print, because errors block printing.
4. Bottom rule and one line of `--font-data` 8pt: `Printed from Mise Planner · <packId>`.

## Print rules that are easy to get wrong

- `-webkit-print-color-adjust: exact; print-color-adjust: exact;` on the timeline container,
  or Chrome drops the gray fills and every block looks identical.
- `break-inside: avoid` on the bowls table rows and on the equipment list.
- No `position: fixed` anywhere in print CSS; it duplicates on every page in Chrome.
- Hide the screen header, footer, and all buttons with a single `@media print` rule.
- Test at 100% scale with "Headers and footers" off. Do not rely on "fit to page".
