// The plan model.
//
// Mostly this pins one rule down: nothing in a plan is write-once, and deleting
// something other parts point at must clear the reference and keep the rest.
// Losing a step because you tidied the equipment list is never the right
// outcome, and every one of these cascades used to be untested.

import {
  createPlan, createStep, appendStep, insertStepBefore, removeStep, moveStep,
  addRecipe, removeRecipe, addIngredient, removeIngredient,
  addEquipment, removeEquipment, addBowl, removeBowl,
  addSegment, removeSegment, moveSegment, stepMins, handsMins, waitingMins, hasWaiting,
  stepsForRecipe, ingredientsForRecipe, ingredientsInBowl,
  claimedMinutes, hasWork, defaultPeriodId, defaultPlanDate,
  isUnestimated, unestimatedSteps, statedTotalMinutes, setStatedMinutes,
  suggestedEquipment, acceptSuggestion,
} from "../js/model.js";
import { parseStatedMinutes } from "../js/time.js";
import { readiness, sayReadiness } from "../js/readiness.js";
import { bindingChain } from "../js/schedule.js";

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL  ${label}\n      got      ${a}\n      expected ${e}`); }
  else console.log(`ok    ${label}  ${a}`);
}

const add = (plan, recipeId, name, mins = 5, hands = true) =>
  appendStep(plan, createStep({ recipeId, name, mins, hands }));

// Steps used to carry `mins` directly; they now carry a list of timed lines,
// and a one-line step is the same thing said a longer way.

// --- A new plan ------------------------------------------------------------
{
  const plan = createPlan({ recipe: "Chicken piccata" });
  check("starts with exactly one recipe, already named", plan.recipes.map((r) => r.name), ["Chicken piccata"]);
  check("and nothing else filled in",
    [plan.steps.length, plan.ingredients.length, plan.equipment.length, plan.bowls.length],
    [0, 0, 0, 0]);
  check("a blank plan is not work worth warning about losing", hasWork(createPlan()), false);
  check("but a plan opened from a teacher's link, already named, is", hasWork(plan), true);
  check("the recipe's own claimed time is unset, not zero", claimedMinutes(plan), null);
}

// --- Steps go in forward, and can be edited afterwards ---------------------
{
  const plan = createPlan();
  const recipe = plan.recipes[0];
  add(plan, recipe.id, "Preheat oven", 12, false);
  add(plan, recipe.id, "Dice the onion", 4);
  const sear = add(plan, recipe.id, "Sear the chicken", 6);

  check("steps keep the order they were typed in",
    stepsForRecipe(plan, recipe.id).map((s) => s.name),
    ["Preheat oven", "Dice the onion", "Sear the chicken"]);

  // Forward entry is easy to leave holes in — most recipes never say "rest the
  // meat" where it has to happen — so inserting must not mean retyping.
  const rest = createStep({ recipeId: recipe.id, name: "Rest the meat", mins: 5, hands: false });
  insertStepBefore(plan, rest, sear.id);
  check("a forgotten step slots in above another",
    stepsForRecipe(plan, recipe.id).map((s) => s.name),
    ["Preheat oven", "Dice the onion", "Rest the meat", "Sear the chicken"]);
  check("and inherits its neighbour's start rather than midnight", rest.start, sear.start);

  moveStep(plan, rest.id, 1);
  check("reordering swaps with the next sibling",
    stepsForRecipe(plan, recipe.id).map((s) => s.name),
    ["Preheat oven", "Dice the onion", "Sear the chicken", "Rest the meat"]);
  check("and refuses to walk off the end", moveStep(plan, rest.id, 1), false);
}

// Reordering never reaches across recipes, even though steps share one array.
{
  const plan = createPlan();
  const first = plan.recipes[0];
  const second = addRecipe(plan, "Rice");
  const a = add(plan, first.id, "A");
  add(plan, second.id, "B");
  check("a lone step in its own recipe cannot move", moveStep(plan, a.id, 1), false);
}

// --- Deleting equipment keeps the steps that used it -----------------------
{
  const plan = createPlan();
  const recipe = plan.recipes[0];
  const step = add(plan, recipe.id, "Sear the chicken");

  const pan = addEquipment(plan, "Sauté pan");
  const again = addEquipment(plan, "sauté PAN");
  check("equipment is deduped case-insensitively", [plan.equipment.length, again.id === pan.id], [1, true]);
  check("a palette item brings its station with it", pan.station, "Stovetop");
  check("something the student names themselves lands on Prep",
    addEquipment(plan, "Mandoline").station, "Prep");

  step.equipmentIds = [pan.id];
  removeEquipment(plan, pan.id);
  check("removing equipment clears the reference", step.equipmentIds, []);
  check("but keeps the step", stepsForRecipe(plan, recipe.id).length, 1);
}

// --- Deleting a bowl keeps its ingredients --------------------------------
{
  const plan = createPlan();
  const recipe = plan.recipes[0];
  const flour = addIngredient(plan, recipe.id, "1 cup flour");
  const bowl = addBowl(plan, "Dredge");
  flour.bowlId = bowl.id;

  check("an ingredient sits in its bowl", ingredientsInBowl(plan, bowl.id).map((i) => i.text), ["1 cup flour"]);
  removeBowl(plan, bowl.id);
  check("removing the bowl loosens the ingredient rather than deleting it",
    [plan.ingredients.length, flour.bowlId], [1, null]);
}

// --- Deleting a step clears everything pointing at it ----------------------
{
  const plan = createPlan();
  const recipe = plan.recipes[0];
  const step = add(plan, recipe.id, "Dredge the chicken");
  const bowl = addBowl(plan, "Dredge");
  bowl.stepId = step.id;
  removeStep(plan, step.id);
  check("the bowl is no longer ready before a step that does not exist", bowl.stepId, null);
  check("and the step is gone", plan.steps.length, 0);
}

// --- Deleting a recipe offers both exits -----------------------------------
{
  const plan = createPlan({ recipe: "Chicken" });
  const chicken = plan.recipes[0];
  const rice = addRecipe(plan, "Rice");
  add(plan, rice.id, "Toast the rice");
  addIngredient(plan, rice.id, "1 cup rice");

  removeRecipe(plan, rice.id, { moveTo: chicken.id });
  check("moving keeps the steps, under the other recipe",
    stepsForRecipe(plan, chicken.id).map((s) => s.name), ["Toast the rice"]);
  check("and the ingredients with them",
    ingredientsForRecipe(plan, chicken.id).map((i) => i.text), ["1 cup rice"]);
  check("the recipe itself is gone", plan.recipes.length, 1);
}

{
  const plan = createPlan({ recipe: "Chicken" });
  const rice = addRecipe(plan, "Rice");
  add(plan, rice.id, "Toast the rice");
  addIngredient(plan, rice.id, "1 cup rice");

  removeRecipe(plan, rice.id);
  check("deleting takes its steps and ingredients with it",
    [plan.steps.length, plan.ingredients.length], [0, 0]);
}

// There is always at least one recipe. A plan with none has nothing to plan.
{
  const plan = createPlan({ recipe: "Only one" });
  removeRecipe(plan, plan.recipes[0].id);
  check("the last recipe cannot be removed", plan.recipes.length, 1);
}

// --- Ingredients -----------------------------------------------------------
{
  const plan = createPlan();
  const recipe = plan.recipes[0];
  const butter = addIngredient(plan, recipe.id, "2 tbsp butter");
  addIngredient(plan, recipe.id, "1 onion, diced");
  check("ingredients keep reading order",
    ingredientsForRecipe(plan, recipe.id).map((i) => i.text), ["2 tbsp butter", "1 onion, diced"]);
  removeIngredient(plan, butter.id);
  check("and can be removed one at a time",
    ingredientsForRecipe(plan, recipe.id).map((i) => i.text), ["1 onion, diced"]);
}

// --- What the recipe claims ------------------------------------------------
{
  const plan = createPlan({ recipe: "Chicken" });
  plan.recipes[0].prepMins = 15;
  check("one stated number is enough to compare against", claimedMinutes(plan), 15);
  plan.recipes[0].cookMins = 30;
  check("prep and cook add up", claimedMinutes(plan), 45);
  const second = addRecipe(plan, "Rice");
  second.cookMins = 20;
  check("and so do several recipes", claimedMinutes(plan), 65);
}

// A ?period= naming no real period must not be kept. An unmatched id leaves the
// picker showing its first option while the plan believes something else, so
// every printed time would be wrong and look authoritative.
{
  const good = createPlan({ periodId: "p3" });
  check("a real period id is honoured", good.schedule.periodId, "p3");
  const typo = createPlan({ periodId: "p33" });
  check("a typo is never kept",
    [typo.schedule.periodId === "p33", typo.schedule.periodId === null || typeof typo.schedule.periodId === "string"],
    [false, true]);
}

// --- Only guess the period when the guess is reliable ----------------------
//
// The default used to fall through to the LAST period of the day for anyone
// planning outside school hours, which put a wrong clock time on every line of
// the sheet while looking authoritative. During school hours nobody is asked
// anything, which is the whole point of having a default at all.
{
  const at = (h, m = 0) => new Date(2026, 8, 6, h, m);
  check("mid-morning picks the period still to come", defaultPeriodId(at(9, 0)), "p1");
  check("just after one period's plate-up picks the next", defaultPeriodId(at(9, 30)), "p2");
  check("the evening picks nothing at all", defaultPeriodId(at(20, 0)), null);
  check("and dates the sheet for the lab, not for tonight",
    [defaultPlanDate(at(20, 0)), defaultPlanDate(at(9, 0))], ["2026-09-07", "2026-09-06"]);
}

// --- What the recipe says --------------------------------------------------
//
// The minutes field is a reading task, not a guess: the card states its times
// and reading them off it is the skill. So a range is taken as written and
// planned on its SLOW end, and a card that gives a cue rather than a number
// must never block the step.
{
  check("a plain number is itself", parseStatedMinutes("6"), { mins: 6, range: false });
  check("a range plans for the slow case", parseStatedMinutes("5-7"), { mins: 7, range: true });
  check("however it is written", parseStatedMinutes("5 to 7"), { mins: 7, range: true });
  check("words around the number are fine", parseStatedMinutes("about 8"), { mins: 8, range: false });
  check("a cue is not a number", parseStatedMinutes("until golden brown"), { mins: 0, range: false });
  check("and neither is nothing", parseStatedMinutes(""), { mins: 0, range: false });
}

// A step with no time goes in, is carried, and is counted somewhere visible.
{
  const plan = createPlan();
  const recipe = plan.recipes[0];
  const timed = appendStep(plan, createStep({ recipeId: recipe.id, name: "Dice the onion", mins: 4, shape: "hands" }));
  const untimed = appendStep(plan, createStep({ recipeId: recipe.id, name: "Sauté until golden", mins: 0, shape: "hands" }));

  check("a step the card put no number on is still a step", plan.steps.length, 2);
  check("it is carried unestimated", [isUnestimated(timed), isUnestimated(untimed)], [false, true]);
  check("and counted where it can be seen",
    unestimatedSteps(plan).map((step) => step.name), ["Sauté until golden"]);
  check("the plan's own total ignores what it cannot know", statedTotalMinutes(plan), 4);

  const applied = setStatedMinutes(untimed, "10-12");
  check("reading a range off the card later plans for the slow end",
    [applied.mins, applied.range, untimed.segments[0].mins, untimed.stated], [12, true, 12, "10-12"]);
  check("and the step stops being unestimated", isUnestimated(untimed), false);
}

// --- The shape a step arrives in -------------------------------------------
//
// "Starts, then runs by itself" is the shape almost every instruction has, and
// it is the only one that lets a plan overlap anything. It used to exist only
// for a student who reopened a finished step and added lines by hand.
{
  const plan = createPlan();
  const recipe = plan.recipes[0].id;
  const shaped = (name, mins, shape) =>
    appendStep(plan, createStep({ recipeId: recipe, name, mins, shape }));

  const hands = shaped("Dice the onion", 4, "hands");
  check("hands on the whole time is one line, all yours",
    [hands.segments.length, handsMins(hands), waitingMins(hands)], [1, 4, 0]);

  const runs = shaped("Rest the meat", 10, "runs");
  check("runs by itself is one line, none of it yours",
    [runs.segments.length, handsMins(runs), waitingMins(runs)], [1, 0, 10]);

  const both = shaped("Simmer the rice", 18, "start-then-runs");
  check("start-then-runs arrives as two lines without anyone editing it",
    [both.segments.length, handsMins(both), waitingMins(both)], [2, 1, 17]);
  check("the lead comes out of the stated time, so the step still adds up to the card",
    stepMins(both), 18);
  check("and the waiting line is what makes the plan able to overlap", hasWaiting(both), true);

  const brief = shaped("Taste it", 1, "start-then-runs");
  check("a step too short to split stays one line", brief.segments.length, 1);

  const unknown = shaped("Reduce until thick", 0, "start-then-runs");
  check("with no time read off the card the shape is still kept",
    [unknown.segments.length, unknown.segments.map((seg) => seg.hands)], [2, [true, false]]);
  check("and it asks to be filled in", isUnestimated(unknown), true);
}

// --- Reading the method for its equipment ----------------------------------
//
// A recipe never lists its equipment. Guessing out loud teaches the mapping
// better than an empty dropdown, so long as the guess is visibly a guess and
// nothing is attached until the student says so.
{
  const plan = createPlan();
  const recipe = plan.recipes[0].id;
  const step = (name) => appendStep(plan, createStep({ recipeId: recipe, name, mins: 5, shape: "hands" }));

  check("roasting suggests the pan that puts it in the oven",
    suggestedEquipment(plan, step("Roast the vegetables")), ["Sheet pan"]);
  check("and an ending does not hide the word",
    suggestedEquipment(plan, step("Roasting the garlic")), ["Sheet pan"]);
  check("a word inside a longer one is not a match",
    suggestedEquipment(plan, step("Season the cutlets")), []);
  check("nothing recognised is no guess at all",
    suggestedEquipment(plan, step("Ask the teacher")), []);

  const dice = step("Dice the onion");
  check("one step can imply several things",
    suggestedEquipment(plan, dice), ["Chef knife", "Cutting board"]);
  check("nothing is in the plan until a guess is accepted", plan.equipment.length, 0);

  acceptSuggestion(plan, dice, "Chef knife");
  check("accepting one puts it in the plan, on the step, with its station",
    [plan.equipment.map((e) => `${e.name}/${e.station}`), dice.equipmentIds.length], [["Chef knife/Prep"], 1]);
  check("and it stops being offered", suggestedEquipment(plan, dice), ["Cutting board"]);
}

// --- Ready to hand in? -----------------------------------------------------
//
// Derived from answers already given, so it costs no new questions. It says
// what is missing; it never blocks anything.
{
  const plan = createPlan({ periodId: "p2" });
  const recipe = plan.recipes[0].id;
  appendStep(plan, createStep({ recipeId: recipe, name: "Sauté until golden", mins: 0, shape: "hands" }));
  const span = { start: 0, end: 20 };

  const first = readiness(plan, { span, conflicts: new Map() });
  check("a fresh plan names everything it still needs",
    first.missing.map((item) => item.id), ["name", "read", "times"]);
  check("and says so in one line", sayReadiness(first),
    '3 of 6 — still need: your name, to tick that you read the recipe to the end and a time on "Sauté until golden".');

  plan.student.name = "Ana";
  plan.readToEnd = true;
  setStatedMinutes(plan.steps[0], "6");
  const done = readiness(plan, { span, conflicts: new Map() });
  check("filling them in finishes the checklist", [done.met, done.missing.length], [6, 0]);
  check("and it says so", sayReadiness(done), "This plan is ready to hand in.");

  const clash = new Map([["a", new Set(["hands"])]]);
  check("an unresolved clash is not ready",
    readiness(plan, { span, conflicts: clash }).missing.map((i) => i.id), ["clashes"]);
  plan.conflictsAccepted = true;
  check("but deciding to live with it is a real answer",
    readiness(plan, { span, conflicts: clash }).missing.length, 0);

  const over = readiness(plan, { span: { start: 0, end: 200 }, conflicts: new Map() });
  check("a plan that does not fit is flagged, not blocked",
    over.missing.map((i) => i.id), ["fits"]);
}

// --- What extra cooks cannot fix -------------------------------------------
//
// One recipe's steps happen in order, so the sum of that chain is a floor no
// number of hands gets under. Raising the group size then changes nothing,
// which looks like a broken toggle unless something names the chain.
{
  const plan = createPlan();
  const chicken = plan.recipes[0];
  const rice = addRecipe(plan, "Rice pilaf");
  const step = (recipeId, name, mins, shape, prep = false) =>
    appendStep(plan, createStep({ recipeId, name, mins, shape, prep }));

  step(chicken.id, "Pound the cutlets", 5, "hands", true);
  step(chicken.id, "Sear the chicken", 8, "hands");
  step(rice.id, "Toast the rice", 5, "hands");
  step(rice.id, "Simmer covered", 18, "runs");
  step(rice.id, "Rest it", 5, "runs");
  step(rice.id, "Fluff and season", 2, "hands");

  const chain = bindingChain(plan);
  check("the binding chain is the longest run that has to happen in order",
    [chain.recipe.name, chain.mins], ["Rice pilaf", 30]);
  check("prep is left out of it, because extra hands really do shorten prep",
    chain.steps.some((s) => s.prep), false);
}

// --- A step is a sequence of timed lines -----------------------------------
//
// One line is the normal case and behaves exactly like a plain step. Several
// lines is what a real instruction looks like: put the pan on, wait for it,
// add oil, wait again.
{
  const plan = createPlan();
  const recipe = plan.recipes[0];
  const step = add(plan, recipe.id, "Sear the chicken", 13, true);

  check("a new step is one line", step.segments.length, 1);
  check("and reads as a plain step", [stepMins(step), handsMins(step), hasWaiting(step)], [13, 13, false]);

  step.segments[0].mins = 1;
  addSegment(plan, step.id, { mins: 5, hands: false });
  addSegment(plan, step.id, { mins: 1, hands: true });
  addSegment(plan, step.id, { mins: 6, hands: false });

  check("the total is the sum of its lines", stepMins(step), 13);
  check("but only two of those minutes are yours", handsMins(step), 2);
  check("and eleven are waiting", waitingMins(step), 11);

  // Where the pan has to heat up is between two things you already typed.
  const first = step.segments[0];
  const inserted = addSegment(plan, step.id, { afterSegmentId: first.id, mins: 2, hands: false });
  check("a line can be inserted anywhere, not just at the end",
    step.segments.indexOf(inserted), 1);

  moveSegment(plan, step.id, inserted.id, 1);
  check("and reordered", step.segments.indexOf(inserted), 2);

  check("lines can be removed", removeSegment(plan, step.id, inserted.id), true);
  check("leaving the rest", step.segments.length, 4);
}

// A step with no lines has no duration, so it is not a step.
{
  const plan = createPlan();
  const step = add(plan, plan.recipes[0].id, "Dice the onion", 4, true);
  check("the last line cannot be removed", removeSegment(plan, step.id, step.segments[0].id), false);
  check("so the step keeps its duration", stepMins(step), 4);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
