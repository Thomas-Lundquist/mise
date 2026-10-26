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

A short series of screens. Along the top, a thin bar for each screen with its name
(Recipe · Ingredients · Bowls · Steps · Guide); each one is a button, so students can jump
straight to any screen. Work saves automatically in the browser.

| # | Screen | Student enters |
| - | --- | --- |
| 1 | **Recipe** | Recipe name, servings, class start time, minutes available (default 90), number of cooks (1–5) |
| 2 | **Ingredients** | Each ingredient: amount, unit, name, prep (e.g. "diced") |
| 3 | **Bowls** | Group ingredients into bowls by when they're combined; check the suggested minutes to fill each. Ingredient buttons show the amount ("2 tbsp butter") so two butters can be told apart. Opens with Bowl 1 ready. |
| 4 | **Steps** | Each step: what to do, minutes, what it waits for ("Starts: When step 3 is done (Melt butter)", default: the step before), hands-off or not, and what it uses (bowls and tools). At the bottom, "Anything else to pull?" for tools no single step uses. |
| — | **Lab guide** | Nothing; this is the result to view or print |

There's no Equipment screen: students find tools by reading each step ("whisk," "griddle"),
which is where recipes actually mention them.

### The Steps screen

Only one step is open at a time. Every other step is one line that reads like the method:
`2. Whisk wet into dry · 3 min · Bowl 1, Bowl 2, whisk`, with "Edit" on the right. Click
or Enter opens it. The open step has three parts:

1. What to do
2. Timing: Minutes · Starts · Hands-off
3. **Uses:** the step's bowls and tools as removable tags, and one box to add more. Typing
   suggests bowls and tools already named. A bowl can be typed as "Bowl 2", "wet", or
   "Bowl 2 · wet"; anything else is a tool.

### Screen sizes

- **Phone** (narrower than ~480px): ingredient boxes stack on three lines; the progress
  bar shows only the current screen's name (every bar is still a button); the Undo bar
  runs edge to edge.
- **Most screens:** a 40rem reading column; each ingredient on two lines.
- **Wide** (Chromebooks and laptops, 1024px and up): a wider 52rem column; each
  ingredient on one line; a step's Minutes · Starts · Hands-off on one line; on the guide,
  Equipment sits beside Mise en place. Printing always uses the narrow layout.
- Symbol buttons (× ↑ ↓) are drawn large (about 1.6× text size, 48px to tap).

### Keyboard first

Most students use Chromebooks, so everything works without a mouse:

- **Enter moves forward.** Recipe: to the next box, and from the last to the next screen.
  Ingredients: to the next ingredient, or a new one after the last. Bowls: from the name to
  its first ingredient button; from "Minutes to fill" to the next bowl, or a new one.
  Steps: words → Minutes → Uses; Enter on an empty Uses box opens the next step (or adds
  one). Shift+Enter makes a new line in a step's words.
- **Backspace** in an empty Uses box removes the last tag.
- The number of cooks is a set of radio buttons: arrow keys change it.
- After deleting, the cursor lands on the next item, not back at the top.
- Focus is always visible: a solid green ring.

### Undo

- **Ctrl+Z** in a box you're typing in undoes the typing (the browser does this). Anywhere
  else it steps back one change: adding, removing, moving, picking, or a finished bit of
  typing. It goes back to the screen where the change was, puts the cursor there, and
  gives it a brief soft ring.
- After anything is removed, a quiet bar at the bottom says "Removed flour. **Undo**" for
  a few seconds.
- Undo history lives in memory only: closing the page forgets it.

### The lab guide

Three clear sections, in kitchen order:

1. **Equipment:** checklist, built from the steps: tools in order of first use, then the
   "anything else" tools, then "N small bowls for mise en place."
2. **Mise en place:** each bowl and what goes in it, with amounts.
3. **Time plan:** one **team table**, readable like a list and side by side like a chart.
   - Columns: Time · one per cook · Hands-off (only if there are hands-off steps). Solo,
     it's Time · Task · Hands-off, which reads as a plain list.
   - One row for each moment something starts. A cook's task is one cell that stretches
     down over every row it lasts, like merged cells in a spreadsheet, with a green rule
     down its left side. It shows the words, minutes ("6 min · until 9:26" when it lasts
     more than one row), and a small "Uses Bowl 1, whisk" line. Row lines stop at its
     edges, so a long task reads as one block. A blank cell means that cook is free.
   - Hands-off tasks sit in their own column at the time they start, with when they're
     ready ("10 min · ready 9:39") and "Cook A starts it" for a team. They don't stretch.
   - Setup and cleanup are one "Everyone" row for a team.
   - If the plan runs past the end of class, a calm warning above says by how much, and a
     dashed "Class ends" line sits at the right time in the table. A task that runs past
     it stretches right through, so the line visibly stops at that task. A last "Done" row shows
     when everything finishes.
   - Every task gets a full readable row, however short, so nothing is too small to print.
   - On a phone, a team's table scrolls sideways inside its box; on a wide screen it may
     spread wider than the reading column.

   For a team, "Who's who?" boxes above the table let the manager type names (Cook A:
   Maria) for the printout. **Names are never saved**: they're gone when the page closes.
   Left blank, each prints as a line to write a name on by hand.

Above the sections, **Before you print** lists real gaps, each a link to the spot: a step
with no minutes, a step with minutes but no words (it's left out), a named or used bowl
that's empty. It only shows when there's something to fix, and never prints.

Setup ("wash hands, set up station") and cleanup ("clean and sanitize") are added
automatically, so they're always counted in the time plan.

**Printing is the main way the guide is used**, so the print layout gets as much care as
the screen. The screen is the backup. The only names on the printout are the optional
cook names above the time plan.

### Example: pancakes

- **Bowl A, dry:** 2 cups flour, 2 tbsp sugar, 2 tsp baking powder, ½ tsp salt
- **Bowl B, wet:** 1½ cups milk, 2 eggs, 3 tbsp melted butter
- **Step:** Whisk Bowl B into Bowl A until just combined (3 min)
