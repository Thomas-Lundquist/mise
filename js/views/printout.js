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
// Written for a black-and-white school printer, read from three feet away by
// someone with flour on their hands:
//
//   • no large areas of dark fill — a solid block per step, times 180 students,
//     is a toner cartridge
//   • every colour distinction also carries a word
//   • checkboxes, because it is a working document and not a receipt
//   • nothing that addresses a cursor: no "click", no "tap", no buttons
//
// WHY THERE IS NO TIMELINE HERE. The board is the planning artefact and it is
// magnificent on screen, but at a stove the question is "what do I do next",
// which a time-ordered list answers better than a Gantt — and a printed Gantt
// is precisely the wall of dark fill the toner constraint rules out. The
// overlap it teaches has already been taught by the time the paper is printed.

import { STATIONS } from "../config.js";
import {
  ingredientsForRecipe, ingredientsInBowl,
  stepMins, handsMins, waitingMins, hasWaiting, isUnestimated,
  recipeById, bigIdeaForStep, isGrouped, cookCount, periodById,
} from "../model.js";
import {
  resolveSchedule, computeConflicts, describeConflict, planSpan, resolvedFoodUp, idleGaps,
} from "../schedule.js";
import { minutesToClock, formatDuration } from "../time.js";
import { readiness, sayReadiness } from "../readiness.js";
import { h } from "../dom.js";

export function render(plan) {
  if (plan.steps.length === 0) {
    return h("div", { class: "printout__empty" },
      h("p", { text: "This plan has no steps yet, so there is nothing to take to the stove." }));
  }

  const ranges = resolveSchedule(plan);
  const span = planSpan(plan, ranges);
  const conflicts = computeConflicts(plan, ranges);
  const cooks = cookCount(plan);
  const view = { plan, ranges, span, conflicts, cooks };

  return h("div", null,
    sheetOne(view),
    sheetTwo(view));
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

// A tick box drawn in CSS rather than typed as ☐, which not every printer font
// has and which silently becomes a blank square when it is missing.
function tick(label, extra = "") {
  return h("li", { class: `ticklist__item${extra ? ` ${extra}` : ""}` },
    h("span", { class: "tickbox" }),
    h("span", { class: "ticklist__text", text: label }));
}

// --- Sheet one: before you start ------------------------------------------
//
// The gathering sheet, in the order decided 2026-09-04: the full ingredient
// list as a checklist, then the pull list grouped by station, then the bowls
// with what goes in each and which step it has to be ready before.

function sheetOne(view) {
  const { plan, span, conflicts } = view;
  const result = readiness(plan, { span, conflicts });

  return h("section", { class: "sheet sheet--prep" },
    sheetHead(plan, "Before you start", "Gather it all before the clock starts. Tick as you go."),

    // The teacher wants to see at a glance that the thinking happened,
    // whatever else the paper is for.
    h("p", { class: "sheet__readiness", text: sayReadiness(result) }),

    ingredientList(plan),
    pullList(plan),
    bowlList(plan));
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
        h("ul", { class: "ticklist ticklist--cols" },
          items.map((ing) => tick(ing.text))));
    }));
}

function pullList(plan) {
  if (plan.equipment.length === 0) return null;
  const groups = STATIONS
    .map((station) => ({ station, items: plan.equipment.filter((e) => e.station === station.id) }))
    .filter((g) => g.items.length > 0);

  return h("div", { class: "sheet__block" },
    h("h3", { class: "sheet__h", text: "Pull this equipment" }),
    h("div", { class: "sheet__stations" }, groups.map((group) =>
      h("div", { class: "sheet__group" },
        h("h4", { class: "sheet__h4", text: group.station.label }),
        h("ul", { class: "ticklist" }, group.items.map((item) => tick(item.name)))))));
}

function bowlList(plan) {
  const filled = plan.bowls.filter((b) => ingredientsInBowl(plan, b.id).length > 0 || b.label.trim());
  if (filled.length === 0) return null;

  return h("div", { class: "sheet__block" },
    h("h3", { class: "sheet__h", text: "Measure these out into bowls" }),
    h("table", { class: "sheet__table" },
      h("thead", null, h("tr", null,
        h("th", { text: "" }),
        h("th", { text: "Bowl" }),
        h("th", { text: "What goes in it" }),
        h("th", { text: "Ready before" }))),
      h("tbody", null, filled.map((bowl, i) => {
        const step = bowl.stepId ? plan.steps.find((s) => s.id === bowl.stepId) : null;
        return h("tr", null,
          h("td", null, h("span", { class: "tickbox" })),
          h("td", { class: "sheet__bowlname", text: bowl.label.trim() || `Bowl ${i + 1}` }),
          h("td", { text: ingredientsInBowl(plan, bowl.id).map((ing) => ing.text).join(" · ") }),
          h("td", { text: step ? step.name : "—" }));
      }))));
}

// --- Sheet two: at the stove ----------------------------------------------

function sheetTwo(view) {
  const { plan, span, cooks } = view;

  return h("section", { class: "sheet sheet--stove" },
    sheetHead(plan, "At the stove"),

    h("p", { class: "sheet__numbers" },
      h("strong", { text: `Start cooking ${minutesToClock(span.start)}` }),
      `  ·  food up ${minutesToClock(resolvedFoodUp(plan))}  ·  `,
      `${formatDuration(span.end - span.start)} of work in a ${formatDuration(plan.schedule.windowMins)} window`,
      cooks > 1 ? `  ·  ${cooks} cooks` : ""),

    runningOrder(view),
    clashes(view),
    notes(plan));
}

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

function shapeWords(step) {
  if (!hasWaiting(step)) return "hands on";
  if (handsMins(step) === 0) return "runs by itself";
  return `${formatDuration(handsMins(step))} hands on, then ${formatDuration(waitingMins(step))} by itself`;
}

// One pass down the clock: every step, and every stretch where a pair of hands
// is free, in the order they happen. This is the sheet's whole reason to exist
// — it answers "what do I do next" without being read as a diagram.
function runningOrder(view) {
  const { plan, ranges, span, cooks } = view;

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
    if (range) rows.push({ at: range.start, kind: "step", step, range });
  }
  for (let cook = 0; cook < cooks; cook++) {
    for (const gap of idleGaps(plan, ranges, span, cook)) {
      // A minute of standing still is not worth a line on paper.
      if (gap.end - gap.start >= 3) rows.push({ at: gap.start, kind: "gap", gap, cook });
    }
  }
  // Steps before gaps at the same minute: you finish the job, then you are free.
  rows.sort((a, b) => a.at - b.at || (a.kind === "gap" ? 1 : -1));

  const grouped = plan.recipes.some((r) => isGrouped(plan, r.id));
  const manyRecipes = plan.recipes.length > 1;

  return h("div", { class: "sheet__block" },
    h("h3", { class: "sheet__h", text: "Running order" }),
    h("p", { class: "sheet__note",
      text: "Every time here says where it came from. Where you guessed rather than read it off the recipe there's a blank — write down what it actually took, because that is how next week's guesses get better." }),

    h("table", { class: "sheet__table sheet__table--run" },
      h("thead", null, h("tr", null,
        h("th", { text: "Time" }),
        h("th", { text: "What" }),
        h("th", { text: "How long" }),
        h("th", { text: "Actual" }))),
      h("tbody", null, rows.map((row) => {
        if (row.kind === "mise") return miseRow(view, row);
        if (row.kind === "gap") return gapRow(row, cooks);
        return stepRow(view, row, { grouped, manyRecipes });
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
      h("span", { text: formatDuration(end - start) }),
      h("span", { class: "run__shape", text: `until ${minutesToClock(end)}` }),
      h("span", { class: "run__source", text: "your estimate" })),
    h("td", { class: "run__actual" }, h("span", { class: "blank" })));
}

function gapRow(row, cooks) {
  const who = cooks > 1 ? `Cook ${row.cook + 1}: ` : "";
  return h("tr", { class: "run__gap" },
    h("td", { class: "run__time", text: minutesToClock(row.gap.start) }),
    h("td", { colSpan: 3,
      text: `${who}hands free until ${minutesToClock(row.gap.end)} — ${formatDuration(row.gap.end - row.gap.start)}. Wash up, wipe down, get plates ready.` }));
}

function stepRow(view, row, { grouped, manyRecipes }) {
  const { plan, ranges, cooks, conflicts } = view;
  const { step, range } = row;
  const time = timing(step);

  // Where a step calls you back partway through. On screen these are notches
  // drawn inside the dish's own block; on paper they have to be words.
  const checks = range.segments
    .filter(({ seg }, i) => seg.hands && seg.mins <= 1 && i > 0 && !range.segments[i - 1].seg.hands)
    .map((part) => `${minutesToClock(part.start)} ${part.seg.label.trim() || "check it"}`);

  const context = [
    manyRecipes ? (recipeById(plan, step.recipeId) || {}).name : "",
    grouped ? (bigIdeaForStep(plan, step) || {}).name : "",
  ].filter((s) => s && s.trim());

  return h("tr", { class: `run__step${step.prep ? " run__step--prep" : ""}` },
    h("td", { class: "run__time", text: minutesToClock(range.start) }),

    h("td", null,
      h("span", { class: "run__name", text: step.name || "(unnamed step)" }),
      step.prep && h("span", { class: "run__tag", text: "prep" }),
      cooks > 1 && h("span", { class: "run__tag", text: `cook ${(step.cook || 0) + 1}` }),
      conflicts.has(step.id) && h("span", { class: "run__tag run__tag--warn", text: "clash" }),
      context.length > 0 && h("span", { class: "run__context", text: context.join(" · ") }),
      checks.length > 0 && h("span", { class: "run__checks", text: `back at ${checks.join(", ")}` })),

    h("td", { class: "run__long" },
      h("span", { text: time.plan }),
      h("span", { class: "run__shape", text: shapeWords(step) }),
      // The provenance of the number, always, so a guess never prints as a fact.
      h("span", { class: "run__source", text: time.source })),

    h("td", { class: "run__actual" },
      isStudentEstimate(step) ? h("span", { class: "blank" }) : h("span", { text: "" })));
}

function clashes(view) {
  const { plan, conflicts, ranges, cooks } = view;
  if (conflicts.size === 0) return null;

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
  if (lines.length === 0) return null;

  return h("div", { class: "sheet__block" },
    h("h3", { class: "sheet__h", text: "Watch out for" }),
    h("ul", { class: "sheet__list" }, lines.map((line) => h("li", { text: line }))),
    plan.conflictsAccepted && h("p", { class: "sheet__note",
      text: "You decided to do these one after the other." }));
}

function notes(plan) {
  const withNotes = plan.steps.filter((s) => s.note && s.note.trim());
  if (withNotes.length === 0) return null;
  return h("div", { class: "sheet__block" },
    h("h3", { class: "sheet__h", text: "Don't forget" }),
    h("ul", { class: "sheet__list" }, withNotes.map((step) =>
      h("li", null, h("strong", { text: `${step.name}: ` }), step.note))));
}
