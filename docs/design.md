# Design

## Principles

The teacher's earlier attempt had "so much going on visually" that it was unpleasant to
use. These rules exist to prevent that.

1. **One job per screen.** Each screen asks the student for one kind of thing.
2. **Generous space.** Large type (body ~18px), roomy line height, wide margins. Not dense,
   but not so spread out that you scroll forever.
3. **Few words.** Short labels and one-line hints. No paragraphs of instructions.
4. **Quiet color.** One accent color and neutrals. Color marks meaning (like a warning),
   not decoration.
5. **Readable at a glance in the kitchen.** The lab guide should be scannable from arm's
   length on a phone or on paper.
6. **Prints well.** The lab guide prints cleanly in black and white.

## Student flow (v1)

A short series of steps with a progress indicator ("Step 2 of 5"). Students can move back
and forth freely. Work saves automatically in the browser.

| # | Screen | Student enters |
| - | --- | --- |
| 1 | **Recipe** | Recipe name, servings, class start time, minutes available (default 90), number of cooks (1–5) |
| 2 | **Ingredients** | Each ingredient: amount, unit, name, prep (e.g. "diced") |
| 3 | **Equipment** | Each tool or piece of equipment, with quantity |
| 4 | **Bowls** | Group ingredients into bowls by when they're combined; check the suggested minutes to fill each |
| 5 | **Steps** | Each step: what to do, minutes, hands-off or not, which bowls it uses, and what it waits for ("Starts after: Step 3", default: the step before) |
| — | **Lab guide** | Nothing; this is the result to view or print |

### The lab guide

Three clear sections, in kitchen order:

1. **Equipment:** checklist.
2. **Mise en place:** each bowl and what goes in it, with amounts.
3. **Time plan:** clock time, who (Cook A, B…), step, and the bowls it uses. Hands-off
   steps (baking, chilling) are visibly marked. If the plan runs past the end of class,
   show a calm, clear warning with by how much. With one cook, the "who" column is hidden.

   Two views, switched with **List | Blocks** (the choice is remembered and is what prints):
   - **List:** one row per task, in time order.
   - **Blocks:** one column per cook plus "Hands-off" column(s), time running down the
     page, each task a block as tall as it takes (14px per minute). Shows what happens at
     the same time, side by side. On narrow screens the chart scrolls sideways inside its
     box; on wide screens it may spread wider than the reading column.

Setup ("wash hands, set up station") and cleanup ("clean and sanitize") are added
automatically, so they're always counted in the time plan.

**Printing is the main way the guide is used**, so the print layout gets as much care as
the screen. The screen is the backup. No name line on the printout.

### Example: pancakes

- **Bowl A, dry:** 2 cups flour, 2 tbsp sugar, 2 tsp baking powder, ½ tsp salt
- **Bowl B, wet:** 1½ cups milk, 2 eggs, 3 tbsp melted butter
- **Step:** Whisk Bowl B into Bowl A until just combined (3 min)
