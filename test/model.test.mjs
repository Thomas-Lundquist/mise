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
  claimedMinutes, hasWork,
} from "../js/model.js";

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
  check("a typo falls back to a real period rather than being kept",
    [typo.schedule.periodId === "p33", typeof typo.schedule.periodId], [false, "string"]);
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
