// Is this plan done enough to hand in?
//
// Every student asks it and, until now, the app never answered: the footer says
// print to PDF and upload it to Canvas, and nothing anywhere says when you are
// ready to do that.
//
// Nothing here is a score and nothing here is a grade. Every item is derived
// from answers the student has already given, so it costs them no new questions
// — and it never blocks printing. The app warns and does not decide, which is
// the doctrine written into config.js, and this must not be the thing that
// breaks it.

import { PERIODS } from "./config.js";
import { unestimatedSteps } from "./model.js";

// `span` and `conflicts` come from the board, which has already computed them.
// Passing them in keeps this a pure function of the plan plus its schedule, so
// it can be tested without a DOM.
export function readiness(plan, { span, conflicts } = {}) {
  const untimed = unestimatedSteps(plan);
  const needsPeriod = PERIODS.length > 0 &&
    !plan.schedule.foodUpOverride &&
    !plan.schedule.periodId;
  const overBy = span ? (span.end - span.start) - plan.schedule.windowMins : 0;
  const clashes = conflicts ? conflicts.size : 0;

  const items = [
    {
      id: "name",
      met: Boolean(plan.student.name.trim()),
      need: "your name",
    },
    {
      id: "period",
      met: !needsPeriod,
      need: "which period you're cooking in",
    },
    {
      id: "read",
      met: Boolean(plan.readToEnd),
      need: "to tick that you read the recipe to the end",
    },
    {
      id: "times",
      met: untimed.length === 0,
      need: untimed.length === 1
        ? `a time on "${untimed[0].name}"`
        : `times on ${untimed.length} steps`,
    },
    {
      id: "fits",
      met: overBy <= 0,
      need: "a plan that fits the time you get to cook",
    },
    {
      // Resolved, or knowingly accepted. A real kitchen has these problems too,
      // so "I know, I'll do them one after the other" has to be a real answer —
      // otherwise the only way to finish would be to plan something untrue.
      id: "clashes",
      met: clashes === 0 || Boolean(plan.conflictsAccepted),
      need: "to sort out the clashes, or say you've decided to live with them",
    },
  ];

  const met = items.filter((item) => item.met).length;
  return { items, met, total: items.length, missing: items.filter((item) => !item.met) };
}

function listNeeds(result) {
  const needs = result.missing.map((item) => item.need);
  return needs.length === 1
    ? needs[0]
    : `${needs.slice(0, -1).join(", ")} and ${needs[needs.length - 1]}`;
}

// What is still missing, on its own. The board draws the count as its own
// marker, so repeating it in the sentence would say the same thing twice.
export function sayNeeds(result) {
  return result.missing.length === 0 ? "" : `Still need: ${listNeeds(result)}.`;
}

// "4 of 6 — still need: your name." The self-contained one-liner, for anywhere
// the count is not already on screen beside it.
export function sayReadiness(result) {
  if (result.missing.length === 0) return "This plan is ready to hand in.";
  return `${result.met} of ${result.total} — still need: ${listNeeds(result)}.`;
}
