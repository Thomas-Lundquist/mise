// The printed sheet.
//
// TEACHER DECISION, 2026-09-06: the paper is a WORKING SHEET AT THE STOVE. Not
// a gate handed in on Canvas, not a permanent record for the recipe book. That
// decides everything below, and it is why this file exists at all.
//
// What was wrong before: printing was the input form with its chrome hidden by
// CSS. The ingredients printed twice, the steps printed twice, form controls
// printed as underlined blanks so the sheet read like a half-filled worksheet,
// and app.js needed a beforeprint listener to force the folded sections open so
// they printed at all. That listener is gone; nothing here is a form.
//
// So the printout is COMPOSED, not filtered. It shares the plan and the
// scheduler with the screen and nothing else.
//
// TWO PAGES, ALWAYS (teacher, 2026-09-07). Gathering and cooking were two
// sheets; they are now two halves of ONE sheet, and the timeline is the other
// page. Three sheets was one more than a student will carry to a bench that
// already has a chopping board on it, and the first two were never full — the
// gather sheet is a checklist and the stove sheet is a list, so each wasted
// most of a page in whitespace. Folded together they run about two thirds of a
// page for an ordinary lab.
//
// "Almost always" is the honest claim, so this file makes it true rather than
// hoping: estimateMm() adds up what the sheet is about to hold, and a plan too
// big for a page prints at a tighter ink density instead of spilling. A plan
// bigger than even the tightest density does spill to a third page, which is
// the right failure — dropping a step to save paper is not on the table.
//
// Written for a black-and-white school printer, read from three feet away by
// someone with flour on their hands:
//
//   • no large areas of dark fill — a solid block per step, times 180 students,
//     is a toner cartridge
//   • every colour distinction also carries a word
//   • checkboxes, because it is a working document and not a receipt
//   • nothing that addresses a cursor: no "click", no "tap", no buttons
//
// THE TIMELINE IS THE SECOND PAGE, on a page of its own (teacher, 2026-09-06,
// reversing an inference this file originally made the other way). The running
// order on page one answers "what do I do next"; the timeline answers "what
// does the whole thing look like", and it is the one page you would tape inside
// a cabinet door.
//
// It obeys the toner rule by drawing OUTLINES, not fills: hands-on is a solid
// hairline box, unattended is a dashed one over a whisper of grey. That is also
// the distinction carrying a text label, since every block names its shape.

import { STATIONS } from "../config.js";
import {
  ingredientsForRecipe, ingredientsInBowl,
  stepMins, handsMins, waitingMins, hasWaiting, isUnestimated,
  recipeById, bigIdeaForStep, isGrouped, cookCount, periodById, foodUpFor,
} from "../model.js";
import {
  resolveSchedule, computeConflicts, describeConflict, planSpan, resolvedFoodUp, idleGaps,
  timelineLanes, checkpointsByStep,
} from "../schedule.js";
import { packRows, columnStyle } from "../layout.js";
import { clockToMinutes, minutesToClock, formatDuration, formatShort } from "../time.js";
import { readiness, sayReadiness } from "../readiness.js";
import { h } from "../dom.js";

// Paper, not pixels. A letter page at 12mm margins leaves 190 × 254mm; the
// sheet header and the lane heads take the rest of the difference.
const TIMELINE_MM = 196;    // height the drawn timeline may fill
const MAX_MM_PER_MIN = 3;   // so a 20-minute plan is not a poster
const MIN_BLOCK_MM = 5;     // a one-minute step still has to be readable
const TICK_MINS = 5;        // a labelled line every five minutes

export function render(plan) {
  if (plan.steps.length === 0) {
    return h("div", { class: "printout__empty" },
      h("p", { text: "This plan has no steps yet, so there is nothing to take to the stove." }));
  }

  const ranges = resolveSchedule(plan);
  const span = planSpan(plan, ranges);
  const conflicts = computeConflicts(plan, ranges);
  const cooks = cookCount(plan);
  const view = {
    plan, ranges, span, conflicts, cooks,
    // Built in schedule.js, exactly as the board builds them, so the two can
    // never disagree about what is on which lane.
    lanes: timelineLanes(plan, ranges, cooks),
    checkpoints: checkpointsByStep(plan, ranges),
  };
  // Built once, because the running order prints these and the height estimate
  // counts them, and those two have to be looking at the same sheet.
  view.rows = runningOrderRows(view);

  return h("div", null,
    planSheet(view),
    timelineSheet(view));
}

// --- Shared furniture -----------------------------------------------------

// Identity repeats at the top of each sheet. Once the sheets are separated the
// second one is anonymous otherwise, and a class set produces 30 of them.
function identity(plan) {
  const period = periodById(plan.schedule.periodId);
  const where = plan.schedule.foodUpOverride
    ? `food up ${plan.schedule.foodUpOverride}`
    : (period ? period.label : "no period picked");
  const parts = [
    plan.student.name.trim() || "Name ______________",
    plan.recipes.map((r) => r.name.trim()).filter(Boolean).join(" + ") || "Untitled",
    plan.student.date,
    plan.student.kitchen.trim() ? `Kitchen ${plan.student.kitchen.trim()}` : "",
    where,
  ].filter(Boolean);
  return h("p", { class: "sheet__identity", text: parts.join("  ·  ") });
}

function sheetHead(plan, title, subtitle) {
  return h("header", { class: "sheet__head" },
    identity(plan),
    h("h2", { class: "sheet__title", text: title }),
    subtitle && h("p", { class: "sheet__sub", text: subtitle }));
}

// The two halves of page one still say what they are. The old sheet titles
// became these: one rule across the page, with the instruction on the same line
// so naming the half costs nothing but the rule.
function sectionHead(title, aside) {
  return h("h3", { class: "sheet__section" },
    title,
    aside && h("span", { text: aside }));
}

// A tick box drawn in CSS rather than typed as ☐, which not every printer font
// has and which silently becomes a blank square when it is missing.
function tick(label, extra = "") {
  return h("li", { class: `ticklist__item${extra ? ` ${extra}` : ""}` },
    h("span", { class: "tickbox" }),
    h("span", { class: "ticklist__text", text: label }));
}

// --- Page one: gather, then cook ------------------------------------------
//
// Gathering above, cooking below. The clock line is the page's headline rather
// than a line inside it: at a stove it is the first thing you look for, and the
// thing you look for again after every interruption.

function planSheet(view) {
  const { plan, span, conflicts, cooks } = view;
  const result = readiness(plan, { span, conflicts });
  const shape = `${formatDuration(span.end - span.start)} of work in a ${formatDuration(plan.schedule.windowMins)} window`;

  return h("section", { class: `sheet sheet--plan${inkClass(estimateMm(view))}` },
    sheetHead(plan,
      `Start cooking ${minutesToClock(span.start)}  ·  food up ${minutesToClock(resolvedFoodUp(plan))}`,
      cooks > 1 ? `${shape}  ·  ${cooks} cooks` : shape),

    // The teacher wants to see at a glance that the thinking happened,
    // whatever else the paper is for.
    h("p", { class: "sheet__readiness", text: sayReadiness(result) }),

    sectionHead("Before you start", "Gather it all before the clock starts. Tick as you go."),
    // A three-column flow rather than three fixed columns: the blocks balance
    // themselves, so a plan with no equipment does not print a third of a page
    // of nothing, and a long ingredient list uses the width instead of running
    // down one edge.
    h("div", { class: "gather" },
      ingredientList(plan),
      pullList(plan),
      bowlList(plan)),

    sectionHead("At the stove", "Running order — in the order it happens."),
    runningOrder(view),
    clashes(view),
    notes(plan));
}

function ingredientList(plan) {
  if (plan.ingredients.length === 0) return null;
  const many = plan.recipes.length > 1;

  return h("div", { class: "sheet__block" },
    h("h3", { class: "sheet__h", text: "Everything you need out" }),
    plan.recipes.map((recipe) => {
      const items = ingredientsForRecipe(plan, recipe.id);
      if (items.length === 0) return null;
      return h("div", { class: "sheet__group" },
        many && h("h4", { class: "sheet__h4", text: recipe.name || "Untitled recipe" }),
        h("ul", { class: "ticklist" },
          items.map((ing) => tick(ing.text))));
    }));
}

function pullList(plan) {
  if (plan.equipment.length === 0) return null;

  return h("div", { class: "sheet__block sheet__block--pull" },
    h("h3", { class: "sheet__h", text: "Pull this equipment" }),
    equipmentGroups(plan).map((group) =>
      h("div", { class: "sheet__group" },
        h("h4", { class: "sheet__h4", text: group.station.label }),
        h("ul", { class: "ticklist" }, group.items.map((item) => tick(item.name))))));
}

function equipmentGroups(plan) {
  return STATIONS
    .map((station) => ({ station, items: plan.equipment.filter((e) => e.station === station.id) }))
    .filter((g) => g.items.length > 0);
}

function filledBowls(plan) {
  return plan.bowls.filter((b) => ingredientsInBowl(plan, b.id).length > 0 || b.label.trim());
}

// A tick list, where this used to be a four-column table. The table wanted the
// full width of the page to say three things about three bowls, and that
// wastefulness is exactly why gathering used to need a sheet of its own.
function bowlList(plan) {
  const filled = filledBowls(plan);
  if (filled.length === 0) return null;

  return h("div", { class: "sheet__block" },
    h("h3", { class: "sheet__h", text: "Measure these out into bowls" }),
    h("ul", { class: "ticklist" }, filled.map((bowl, i) => {
      const step = bowl.stepId ? plan.steps.find((s) => s.id === bowl.stepId) : null;
      const contents = ingredientsInBowl(plan, bowl.id).map((ing) => ing.text).join(" · ");
      return h("li", { class: "ticklist__item" },
        h("span", { class: "tickbox" }),
        h("span", { class: "ticklist__text" },
          h("span", { class: "sheet__bowlname", text: bowl.label.trim() || `Bowl ${i + 1}` }),
          contents && ` — ${contents}`,
          // A bowl is a moment, not a container: the step it has to be ready
          // before is the only reason it gets measured out early at all.
          step && h("span", { class: "bowl__when", text: `ready before ${step.name}` })));
    })));
}

// --- The running order ----------------------------------------------------

// A time that the STUDENT supplied rather than read off the card. Only these
// get an "actual ____" blank beside them.
//
// The distinction is the point: measuring a number you read off the recipe
// teaches you about the recipe, and measuring one you guessed teaches you about
// yourself. Prep and knife work — the things no recipe ever times, and the
// things students most underestimate — fall on the guessed side automatically.
function isStudentEstimate(step) {
  return !(step.stated || "").trim();
}

// What the sheet says a step will take, and where that number came from. An
// estimate must never print looking like a fact.
function timing(step) {
  if (isUnestimated(step)) return { plan: "no time set", source: "you never put a number on this" };
  const total = formatDuration(stepMins(step));
  const stated = (step.stated || "").trim();
  if (!stated) return { plan: total, source: "your estimate" };
  if (stated === String(stepMins(step))) return { plan: total, source: "recipe" };
  return { plan: total, source: `recipe says ${stated}` };
}

// Said only when there is something to say. A step you stand over from start to
// finish is the default and prints as nothing; the line earns its place when the
// pan is going to let you go, because that is the sentence you act on — it is
// the difference between standing there and getting the plates down.
function shapeWords(step) {
  if (!hasWaiting(step)) return "";
  if (handsMins(step) === 0) return "runs by itself";
  return `${formatDuration(handsMins(step))} hands on, then ${formatDuration(waitingMins(step))} by itself`;
}

// One pass down the clock: every step, and every stretch where a pair of hands
// is free, in the order they happen. This is the half of the page that answers
// "what do I do next" without being read as a diagram.
function runningOrderRows(view) {
  const { plan, ranges, span, cooks } = view;
  const grouped = plan.recipes.some((r) => isGrouped(plan, r.id));
  const manyRecipes = plan.recipes.length > 1;

  // Prep is scheduled with NO internal order — that is the whole point of the
  // mise block, and it is what lets a team split it between them. Printing six
  // prep steps at six exact minutes would claim a precision the scheduler never
  // asserted, so the block prints as one row saying "in any order".
  const prep = plan.steps.filter((step) => step.prep && ranges.get(step.id));
  const rows = [];
  if (prep.length > 0) rows.push({ at: Math.min(...prep.map((s) => ranges.get(s.id).start)), kind: "mise", prep });

  for (const step of plan.steps) {
    if (step.prep) continue;
    const range = ranges.get(step.id);
    if (!range) continue;

    // Everything the row will actually say, worked out here rather than in the
    // cell that prints it, because estimateMm() has to count the lines this row
    // will take and the two must not be able to disagree about them.
    const context = [
      manyRecipes ? (recipeById(plan, step.recipeId) || {}).name : "",
      grouped ? (bigIdeaForStep(plan, step) || {}).name : "",
    ].filter((t) => t && t.trim()).join(" · ");

    // Where a step calls you back partway through. On screen these are notches
    // drawn inside the dish's own block; on paper they have to be words.
    const checks = range.segments
      .filter(({ seg }, i) => seg.hands && seg.mins <= 1 && i > 0 && !range.segments[i - 1].seg.hands)
      .map((part) => `${minutesToClock(part.start)} ${part.seg.label.trim() || "check it"}`);

    rows.push({
      at: range.start, kind: "step", step, range,
      context, checks, shape: shapeWords(step), time: timing(step),
    });
  }
  for (let cook = 0; cook < cooks; cook++) {
    for (const gap of idleGaps(plan, ranges, span, cook)) {
      // A minute of standing still is not worth a line on paper.
      if (gap.end - gap.start >= 3) rows.push({ at: gap.start, kind: "gap", gap, cook });
    }
  }
  // Steps before gaps at the same minute: you finish the job, then you are free.
  rows.sort((a, b) => a.at - b.at || (a.kind === "gap" ? 1 : -1));
  return rows;
}

function runningOrder(view) {
  const { rows, cooks } = view;

  // No heading of its own: the section rule above already says "At the stove ·
  // Running order", and a second line saying it again is a line the sheet has
  // to buy from somewhere.
  return h("div", { class: "sheet__block sheet__block--run" },
    h("p", { class: "sheet__note",
      text: "Every time says where it came from. Where you guessed, write down what it actually took — that is how the guesses get better." }),

    h("table", { class: "sheet__table sheet__table--run" },
      h("thead", null, h("tr", null,
        h("th", { text: "Time" }),
        h("th", { text: "What" }),
        h("th", { text: "How long" }),
        h("th", { text: "Actual" }))),
      h("tbody", null, rows.map((row) => {
        if (row.kind === "mise") return miseRow(view, row);
        if (row.kind === "gap") return gapRow(row, cooks);
        return stepRow(view, row);
      }))));
}

// The mise en place phase, stated as a phase. One row, one span, one blank —
// and the names in any order, because that is exactly what the scheduler says.
function miseRow(view, row) {
  const { ranges, cooks } = view;
  const start = Math.min(...row.prep.map((s) => ranges.get(s.id).start));
  const end = Math.max(...row.prep.map((s) => ranges.get(s.id).end));
  const names = row.prep.map((s) => s.name).filter(Boolean);

  return h("tr", { class: "run__step run__step--prep run__mise" },
    h("td", { class: "run__time", text: minutesToClock(start) }),
    h("td", null,
      h("span", { class: "run__name", text: "Mise en place" }),
      h("span", { class: "run__tag", text: "any order" }),
      h("span", { class: "run__context",
        text: cooks > 1 ? "Split these between you, then start cooking." : "All of this before you start cooking." }),
      h("span", { class: "run__checks", text: names.join(" · " ) })),
    h("td", { class: "run__long" },
      h("span", { class: "run__span" },
        formatDuration(end - start),
        h("span", { class: "run__source", text: "your estimate" })),
      h("span", { class: "run__shape", text: `until ${minutesToClock(end)}` })),
    h("td", { class: "run__actual" }, h("span", { class: "blank" })));
}

function gapRow(row, cooks) {
  const who = cooks > 1 ? `Cook ${row.cook + 1}: ` : "";
  return h("tr", { class: "run__gap" },
    h("td", { class: "run__time", text: minutesToClock(row.gap.start) }),
    h("td", { colSpan: 3,
      text: `${who}hands free until ${minutesToClock(row.gap.end)} — ${formatDuration(row.gap.end - row.gap.start)}. Wash up, wipe down, get plates ready.` }));
}

function stepRow(view, row) {
  const { cooks, conflicts } = view;
  const { step, range, context, checks, shape, time } = row;

  return h("tr", { class: `run__step${step.prep ? " run__step--prep" : ""}` },
    h("td", { class: "run__time", text: minutesToClock(range.start) }),

    h("td", null,
      h("span", { class: "run__name", text: step.name || "(unnamed step)" }),
      step.prep && h("span", { class: "run__tag", text: "prep" }),
      cooks > 1 && h("span", { class: "run__tag", text: `cook ${(step.cook || 0) + 1}` }),
      conflicts.has(step.id) && h("span", { class: "run__tag run__tag--warn", text: "clash" }),
      context && h("span", { class: "run__context", text: context }),
      checks.length > 0 && h("span", { class: "run__checks", text: `back at ${checks.join(", ")}` })),

    // Two lines rather than three. Where the number came from used to have a
    // line to itself; sat beside the number it still prints on every row — a
    // guess never prints as a fact — and the page gets a line per step back.
    h("td", { class: "run__long" },
      h("span", { class: "run__span" },
        time.plan,
        h("span", { class: "run__source", text: time.source })),
      shape && h("span", { class: "run__shape", text: shape })),

    h("td", { class: "run__actual" },
      isStudentEstimate(step) ? h("span", { class: "blank" }) : h("span", { text: "" })));
}

function clashes(view) {
  const lines = clashLines(view);
  if (lines.length === 0) return null;

  return h("div", { class: "sheet__block" },
    h("h3", { class: "sheet__h", text: "Watch out for" }),
    h("ul", { class: "sheet__list" }, lines.map((line) => h("li", { text: line }))),
    view.plan.conflictsAccepted && h("p", { class: "sheet__note",
      text: "You decided to do these one after the other." }));
}

function clashLines(view) {
  const { plan, conflicts, ranges, cooks } = view;
  const lines = [];
  const seen = new Set();
  for (const [stepId, reasons] of conflicts) {
    const step = plan.steps.find((s) => s.id === stepId);
    const range = ranges.get(stepId);
    if (!step || !range) continue;
    for (const otherId of conflicts.keys()) {
      if (otherId === stepId || seen.has(`${otherId}|${stepId}`)) continue;
      const other = ranges.get(otherId);
      if (!other || !(other.start < range.end && range.start < other.end)) continue;
      const otherStep = plan.steps.find((s) => s.id === otherId);
      if (!otherStep) continue;
      seen.add(`${stepId}|${otherId}`);
      lines.push(`"${step.name}" and "${otherStep.name}" — ${describeConflict(reasons, cooks)}.`);
    }
  }
  return lines;
}

function notes(plan) {
  const withNotes = stepsWithNotes(plan);
  if (withNotes.length === 0) return null;
  return h("div", { class: "sheet__block" },
    h("h3", { class: "sheet__h", text: "Don't forget" }),
    h("ul", { class: "sheet__list" }, withNotes.map((step) =>
      h("li", null, h("strong", { text: `${step.name}: ` }), step.note))));
}

function stepsWithNotes(plan) {
  return plan.steps.filter((s) => s.note && s.note.trim());
}

// --- Keeping page one to one page -----------------------------------------
//
// The sheet cannot measure itself. Nothing is laid out at print sizes until the
// print dialog opens, and by then no code of ours runs — so it counts what it
// is about to draw instead. These millimetre costs were read off a rendered
// sheet at full density and are deliberately a shade generous: the failure that
// matters is a plan spilling onto a third page, not one printing a little
// smaller than it strictly had to.
//
// The tightening itself is one CSS custom property, --ink, which every size on
// this sheet is written as a multiple of. Nothing is dropped and nothing is
// reworded at any density; the same sheet is simply set smaller.

// Measured in Chrome with print media emulated at the letter content width.
// They are millimetres of paper, and they only have to be right enough to
// choose between three densities; if the sheet is ever redrawn, remeasure them.
const PAGE_MM = 246;        // letter at 12mm margins, less a margin for error
const DENSE = 0.9;          // how far --ink takes the sheet in at each step
const DENSER = 0.8;

const HEAD_MM = 56;         // the sheet head, the readiness line, the two section
                            // rules, and the margins between every part of it
const BLOCK_MM = 7;         // a block heading and the rule under it
const GROUP_MM = 5;         // a recipe name or a station name inside one
const TICK_MM = 4.5;        // one line with a tick box beside it
const BOWL_LINES = 3;       // a bowl wraps: its contents, then what it precedes
const GATHER_COLS = 2.55;   // three columns, less what imperfect balancing wastes
const RUN_MM = 14;          // the note above the table, and the table's head row
const ROW_LINE_MM = 3.7;    // one line inside a row of the running order
const ROW_PAD_MM = 2.7;     // and the padding above and below it
const GAP_ROW_MM = 6;       // a stretch of free hands is always one line
const TAIL_MM = 6;          // a heading over the clashes or over the notes
const TAIL_LINE_MM = 4.5;   // and one of their lines

// How many lines a string takes in a column holding about `chars` of them.
// Crude on purpose: this is choosing a density, not typesetting.
function lineCount(text, chars) {
  return Math.max(1, Math.ceil((text || "").length / chars));
}

const GATHER_CHARS = 32;    // a tick line in one of the three gather columns
const RUN_CHARS = 62;       // the "what" column of the running order

// What a row of the running order will stand: the taller of its two full cells,
// each counted in lines. Everything it reads was worked out in
// runningOrderRows(), so this cannot drift from what actually prints.
function rowMm(row) {
  if (row.kind === "gap") return GAP_ROW_MM;

  const lines = row.kind === "mise"
    // Name and tag, then the "split these between you" line, then every task in
    // the block on one wrapping line.
    ? 2 + lineCount(row.prep.map((s) => s.name).filter(Boolean).join(" · "), RUN_CHARS)
    : Math.max(
      lineCount(row.step.name, RUN_CHARS)
        + (row.context ? 1 : 0)
        + (row.checks.length > 0 ? lineCount(row.checks.join(", "), RUN_CHARS) : 0),
      1 + (row.shape ? 1 : 0));

  return lines * ROW_LINE_MM + ROW_PAD_MM;
}

function estimateMm(view) {
  const { plan, rows } = view;
  const bowls = filledBowls(plan);

  const blocks = [plan.ingredients.length > 0, plan.equipment.length > 0, bowls.length > 0]
    .filter(Boolean).length;
  const groups = plan.recipes.filter((r) => ingredientsForRecipe(plan, r.id).length > 0).length
    + equipmentGroups(plan).length;
  const ticks = [
    ...plan.ingredients.map((i) => i.text),
    ...plan.equipment.map((e) => e.name),
  ].reduce((n, text) => n + lineCount(text, GATHER_CHARS), 0);

  // The gather band is a three-column flow, so what it holds is divided about
  // three ways — with a floor, because two ingredients still cost a heading and
  // a rule, and columns cannot balance below one line.
  const gatherInk = blocks * BLOCK_MM + groups * GROUP_MM
    + (ticks + bowls.length * BOWL_LINES) * TICK_MM;
  const gather = gatherInk === 0 ? 0 : Math.max(gatherInk / GATHER_COLS, 18);

  const run = rows.reduce((mm, row) => mm + rowMm(row), RUN_MM);

  const clash = clashLines(view).length;
  const note = stepsWithNotes(plan).length;
  const tail = (clash > 0 ? TAIL_MM + clash * TAIL_LINE_MM : 0)
    + (note > 0 ? TAIL_MM + note * TAIL_LINE_MM : 0);

  return HEAD_MM + gather + run + tail;
}

function inkClass(mm) {
  if (mm <= PAGE_MM) return "";
  if (mm <= PAGE_MM / DENSE) return " sheet--dense";
  return " sheet--denser";
}

// --- Page two: the timeline -----------------------------------------------
//
// Scaled to its own page: minutes become millimetres at whatever rate makes the
// plan fill the sheet, capped so a short plan is drawn large but not absurd.
// The screen board's px-per-minute is irrelevant here — paper has a fixed
// height and that is the constraint that sets the scale.

function timelineSheet(view) {
  const { plan, span, lanes } = view;

  const top = span.start;
  // Round the drawn window out to whole ticks, so the last gridline is not a
  // stub and the final block is not flush against the edge of the page.
  const totalMins = Math.max(Math.ceil((span.end - top) / TICK_MINS) * TICK_MINS, TICK_MINS);
  const mmPerMin = Math.min(MAX_MM_PER_MIN, TIMELINE_MM / totalMins);
  const height = totalMins * mmPerMin;

  const ticks = [];
  for (let t = Math.ceil(top / TICK_MINS) * TICK_MINS; t <= top + totalMins; t += TICK_MINS) ticks.push(t);

  // Time the student does not have, drawn as a ruled line rather than as a
  // hatched area — a rule costs no toner. BOTH ends have to be drawn: under a
  // fixed anchor an over-long plan starts before the window opens, and under
  // "finish early" it starts on time and runs past plate-up instead.
  const bottom = top + totalMins;
  const foodUp = clockToMinutes(foodUpFor(plan));
  const windowOpen = foodUp - plan.schedule.windowMins;
  const late = foodUp > top && foodUp < bottom && span.end > foodUp;
  const early = windowOpen > top && windowOpen < bottom;

  return h("section", { class: "sheet sheet--timeline" },
    sheetHead(plan, "The whole plan",
      "Time runs down. Your own hands are the first column; everything else is a machine or a bench doing the work for you."),

    h("div", {
      class: "pt",
      style: { gridTemplateColumns: `14mm repeat(${lanes.length}, 1fr)` },
    },
      h("div", { class: "pt__corner" }),
      lanes.map((lane) => h("div", { class: "pt__head" },
        h("span", { text: lane.label }),
        lane.station && lane.station.exclusive && h("span", { class: "pt__flag", text: "one at a time" }))),

      h("div", { class: "pt__gutter", style: { height: `${height}mm` } },
        ticks.map((t) => h("div", {
          class: "pt__tick",
          style: { top: `${(t - top) * mmPerMin}mm` },
          text: minutesToClock(t),
        }))),

      lanes.map((lane) => {
        const packed = packRows(lane.items, top, mmPerMin, { minSize: MIN_BLOCK_MM, gap: 0.6 });
        return h("div", { class: "pt__track", style: { height: `${height}mm` } },
          ticks.map((t) => h("div", {
            class: "pt__rule",
            style: { top: `${(t - top) * mmPerMin}mm` },
          })),

          late && h("div", {
            class: "pt__limit",
            style: { top: `${(foodUp - top) * mmPerMin}mm` },
          }),
          early && h("div", {
            class: "pt__limit",
            style: { top: `${(windowOpen - top) * mmPerMin}mm` },
          }),

          // The moments this cook is pinned to a pan for a minute. Unlabelled
          // here — page one says what each one is — but the lane must not read
          // as free when it is not.
          (lane.notches || []).map((cp) => h("div", {
            class: "pt__notch",
            style: { top: `${(cp.range.start - top) * mmPerMin}mm` },
          })),

          packed.items.map((item) => printBlock(view, item, {
            tight: item.size < MIN_BLOCK_MM * 1.8,
            style: {
              top: `${item.offset}mm`,
              height: `${item.size}mm`,
              ...columnStyle(item, packed.rowCount, "0.8mm"),
            },
          })));
      })),

    late && h("p", { class: "sheet__note",
      text: `The heavy line across every lane is ${minutesToClock(foodUp)} — food up. Anything below it is running late.` }),
    early && h("p", { class: "sheet__note",
      text: `The heavy line across every lane is ${minutesToClock(windowOpen)}, when your window opens. Anything above it is time you do not have.` }));
}

function printBlock(view, item, { tight, style }) {
  const { checkpoints, cooks } = view;
  const { step, seg, range } = item;
  const hands = seg ? seg.hands : false;
  const label = seg ? (seg.label.trim() || step.name) : step.name;
  const mins = range.end - range.start;
  const notches = seg ? [] : (checkpoints.get(step.id) || []);

  return h("div", {
    class: `pt__block ${hands ? "pt__block--hands" : "pt__block--alone"}${tight ? " pt__block--tight" : ""}`,
    style,
  },
    h("span", { class: "pt__label", text: label }),
    h("span", { class: "pt__time", text: `${minutesToClock(range.start)} · ${formatShort(mins)}` }),
    // Colour is never the only signal, and there is no colour here at all — so
    // the shape is said in words on any block with room for them.
    !tight && h("span", { class: "pt__shape", text: hands ? "hands on" : "runs by itself" }),
    // Where a dish calls you back, drawn inside the dish's own block: the
    // position answers WHICH dish before a word is read.
    notches.map((cp) => h("span", {
      class: "pt__inner-notch",
      style: { top: `${((cp.range.start - range.start) / Math.max(mins, 1)) * 100}%` },
    })));
}
