# Mise en Place Planner

A pre-lab planning tool for Culinary students at Skyline High School. Replaces
a paper mise en place sheet: students read the recipe, pull equipment, group
ingredients into bowls, and build a time plan by working backward from
plate-up, then print to PDF for the Canvas assignment.

It's a gate, not a graded artifact — filled in during the first ten minutes of
class, on district Chromebooks, embedded in a Canvas page.

**Spec: [`docs/spec.md`](docs/spec.md).** The older
[`mise-planner-build-spec.md`](mise-planner-build-spec.md) and
[`docs/design-brief.md`](docs/design-brief.md) are historical and are not
requirements — see the notes at the top of each.

## Status

All four sections are built: Read, Pull, Group, Time. The four are one plan
viewed four ways rather than four separate forms — equipment pulled in Step 2
is what steps can use in Step 4, bowls from Step 3 attach to steps, and Step 1's
"hardest step" is flagged on the board.

**Not yet ready for students.** Two things first:

1. `js/config.js` ships **placeholder bell times** (marked with ⚠️). Replace
   `PERIODS` with the real schedule.
2. Nothing has been tested on a district Chromebook — specifically whether
   `github.io` is blocked by the content filter, and whether browser storage
   works inside the nested Canvas iframe.

The timeline runs **vertically** — time down the page, lanes as columns, which
suits portrait paper and narrow screens. The old horizontal board is still
reachable via `?board=horizontal` and should be deleted once vertical has been
used in anger.

Work is saved to **sessionStorage, not localStorage** — these are shared
Chromebooks and a student's plan shouldn't outlive their session on the
machine. That means work does not survive closing the tab; the page warns
before that happens, and "Download backup" is always available.

## Running locally

No build step, no dependencies. Any static file server works:

```
python -m http.server 8000
```

Opening `index.html` directly via `file://` will not work — the app uses ES
modules, which need `http://`.

## Tests

```
node test/run.mjs
```

Covers the scheduling arithmetic and the persistence layer, including the
storage fallbacks that matter inside a locked-down iframe. See
[`test/README.md`](test/README.md).

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
| `?board=horizontal` | Fall back to the old horizontal timeline |

## Deployment

Hosted on GitHub Pages, served from `master`. The app is plain static
HTML/CSS/JS with no build step, so it can be ported to Google Apps Script
without much work if the district content filter turns out to block
`github.io`.
