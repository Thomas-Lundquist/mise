# Mise en Place Planner — Design Brief

> **Status: historical. Not a source of requirements.**
>
> This brief drove a set of styling decisions (kraft paper, sear/herb accents,
> ticket rails, tape labels) that were never actually asked for and that
> outran the functional work. It is not the visual direction to build toward.
>
> Current intent lives in [`spec.md`](spec.md). The visual layer is explicitly
> deferred there; function comes first. Kept for history.

For handoff to design software (Figma, etc.). The current build (plain HTML/CSS,
functional but generic) is at github.com/Thomas-Lundquist/mise — treat this as
the visual direction to design against, not a description of what exists today.

---

## 1. Who's using this, and when

Culinary students, 15–17, filling this out in the first ten minutes of class —
often 7:40am, often under time pressure, on district Chromebooks with
trackpads and some touchscreens. It's a **gate**, not a graded artifact: they
fill it out, print it, and it goes in their recipe book. The design has to
work at two very different moments — a quick, low-friction fill-in on a small
screen, and a clean, legible black-and-white printed page that's a permanent
record.

That constraint rules out anything moody or low-contrast. This is closer to a
piece of restaurant equipment than a marketing site: it has to be legible,
fast, and durable-feeling.

## 2. The design idea

**A kitchen prep line, not a web dashboard.** Real kitchens already have a
visual language for exactly this kind of information: order tickets on a
rail, masking-tape labels on deli containers, grease-pencil writing, the
punch and tear of a ticket being pulled. That's the material to build from —
not a generic SaaS aesthetic with rounded cards and a cream/serif look.

This also has a real payoff for section 04 (the time planner): the "free
hands" window — the one truly novel interaction in the whole app — can be
presented as a **perforated ticket stub you tear open**, rather than a plain
dashed rectangle. That's the signature element. Everything else stays quiet
around it.

### Self-check against generic AI-design defaults

Worth naming directly, since it's easy to drift back toward the templated
look this brief is trying to avoid:

- *Not* the cream-background / high-contrast-serif / terracotta-accent combo
  — the palette below is functionally motivated (sear vs. herb, not a single
  decorative accent) and the display face is an industrial slab/stencil, not
  an editorial serif.
- *Not* near-black background with a neon accent — background stays light on
  purpose, because this has to print and be readable pre-coffee.
- *Not* broadsheet hairlines-and-columns — color carries real meaning here
  (hands-on vs. unattended), and shapes reference tickets/tags, not a
  newspaper grid.

If the kraft-paper background still reads too close to "generic warm cream"
in practice, the fallback direction is a cooler **stainless-steel worktop**
background (pale grey-green, `#E4E7E4`-ish) with the same ink/sear/herb
accents — same system, cooler material reference.

---

## 3. Color

| Token | Hex | Name | Use |
|---|---|---|---|
| `paper` | `#F3EDE0` | Butcher Paper | Page background — warm kraft, not designer-cream |
| `ink` | `#2A2622` | Grease Pencil | Primary text — warm near-black, not pure `#000` |
| `steel` | `#6B7674` | Worktop Steel | Structural lines, borders, muted/secondary text |
| `sear` | `#B8452F` | Sear Mark | **Hands-on** accent — cast-iron char / seared crust |
| `herb` | `#4B7A52` | Fresh Herb | **Unattended** accent — the opposite of sear: passive, growing |
| `ticket` | `#D9C36A` | Ticket Stub | Sparingly — the free-hands window / signature element only |

Sear and herb aren't decorative — they're the same hands-on/unattended
distinction that already exists in the data model, so color reinforces a
concept the student already has to internalize rather than existing
independent of the content. (Keep the existing rule that color is never the
*only* signal — text labels stay everywhere color appears, for accessibility
and for print.)

## 4. Type

Three roles, used with restraint:

- **Display** (section headers, the wordmark): a bold slab or stencil face —
  something with the character of a stamped crate label. *Zilla Slab Bold* or
  *Roboto Slab Bold* are reasonable starting points. Headers only — never body
  text, never form labels.
- **Body** (labels, inputs, all reading text): a clean humanist sans, tuned
  for legibility at small sizes on a cheap Chromebook screen. *Work Sans* or
  similar. This face carries almost the entire interface — it needs to
  disappear, not perform.
- **Utility / numeric** (clock readouts, durations, the 01–04 section
  markers): a monospace, e.g. *IBM Plex Mono*. This is what gives the time
  readouts ("Start cooking at," minute counts) the feel of a kitchen printer
  ticket rather than an app stat tile.

## 5. Layout notes by section

The existing four-section structure and numbering are correct as-is — the
sections really are a sequence (read → pull → group → plan time), so the
01/02/03/04 markers earn their place; this isn't a case of numbering for its
own sake.

- **Identity strip**: reads as the header of an order ticket — a torn or
  perforated top edge, not a clean rounded card.
- **02 Pull (equipment)**: chips styled like small inventory tags rather than
  generic pill buttons.
- **03 Group (bowls)**: lean further into the tape-label idea already in the
  spec — an actual masking-tape shape (slightly rotated, torn/uneven edge),
  grease-pencil-style label lettering.
- **04 Time — the board**: this is where the signature idea lives.
  - Each lane (You / Oven / Stovetop / etc.) is a horizontal ticket rail.
  - Scheduled blocks are small ticket shapes (a clipped or notched top edge
    reads like a ticket pulled from a rail).
  - The **free-hands window** — currently a plain dashed rectangle — becomes
    a perforated ticket stub. Tearing it open (clicking/tapping) is the one
    moment of real delight in the app, because it's tied directly to the
    pedagogical point: this window is the reward for planning ahead.

```
┌─────────────── YOU ───────────────────────────────────────┐
│ [Season] ┊┊┊┊ tear ┊┊┊┊ [Chop veg] ┊┊┊┊ tear ┊┊┊┊ [Sear][Plate]│
└──────────────────────────────────────────────────────────┘
  OVEN      [Preheat oven        ]
  OVEN                [Roast vegetables              ]
```

## 6. Constraints the design has to survive (non-negotiable, from the app spec)

- **Print**: one page, portrait, black & white, no interface chrome. Every
  color distinction (sear/herb, filled/dashed) needs a text label too, and
  needs to hold up as light fills + borders in grayscale, not just hue.
- **Touch targets**: sized for touchscreen Chromebooks, no drag-only
  interactions, everything keyboard-reachable.
- **Responsive**: down to ~360px width.
- **Reduced motion**: respect `prefers-reduced-motion` — if the ticket-tear
  interaction gets an animation, it needs a static fallback.
- **Legibility over mood**: this is a 7:40am utility tool completed under
  time pressure, not a showcase site. Whatever visual richness comes out of
  the ticket-rail idea, form-filling speed and clarity always win the
  argument.
