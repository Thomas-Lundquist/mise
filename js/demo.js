// A worked example plan, loaded with ?demo on the URL.
//
// Its first job is saving whoever is working on this app from retyping a recipe
// every time they reload. Its second is being a plan worth showing a class: it
// deliberately exercises everything the board can say — two recipes finishing
// together, a prep block a team can split, steps broken into timed lines,
// one-minute moments that become notches on the dish they interrupt, bowls
// attached to the steps that need them, and two things competing for one pan.
//
// This module is imported dynamically, so none of it is loaded unless asked for.

import {
  createPlan, createStep, createSegment, appendStep, addRecipe,
  addIngredient, addEquipment, addBowl, stepById,
} from "./model.js";

// A fixed id, so reloading ?demo replaces the demo plan rather than stacking up
// a dozen copies in the plan picker.
const DEMO_ID = "demo-chicken-piccata";

export function buildDemoPlan() {
  const plan = createPlan({ recipe: "Chicken piccata", foodUp: "12:35" });
  plan.id = DEMO_ID;
  plan.student = { name: "Demo Student", kitchen: "3", date: plan.student.date };
  plan.readToEnd = true;

  const chicken = plan.recipes[0];
  chicken.prepMins = 15;
  chicken.cookMins = 25;
  const rice = addRecipe(plan, "Rice pilaf");
  rice.prepMins = 5;
  rice.cookMins = 20;

  const gear = {};
  for (const name of [
    "Sauté pan", "Saucepan", "Chef knife", "Cutting board",
    "Mixing bowl (small)", "Measuring cups (dry)", "Tongs",
  ]) gear[name] = addEquipment(plan, name);

  // --- Steps ---------------------------------------------------------------
  // `lines` is the step broken into timed pieces. A one-minute hands-on line
  // between two waiting lines is what becomes a notch on the board.
  const add = (recipe, { name, mins, hands, prep = false, uses = [], note = "", lines = null }) => {
    const step = createStep({ recipeId: recipe.id, name, mins, hands, prep });
    step.equipmentIds = uses.map((n) => gear[n].id);
    step.note = note;
    if (lines) {
      step.segments = lines.map(([label, m, h]) => Object.assign(createSegment({ mins: m, hands: h }), { label }));
    }
    return appendStep(plan, step);
  };

  add(chicken, { name: "Pound the cutlets", mins: 5, hands: true, prep: true, uses: ["Cutting board"] });
  add(chicken, { name: "Set up the dredge", mins: 3, hands: true, prep: true, uses: ["Mixing bowl (small)", "Measuring cups (dry)"] });
  add(chicken, { name: "Juice the lemons", mins: 2, hands: true, prep: true });
  add(chicken, { name: "Chop the parsley", mins: 2, hands: true, prep: true, uses: ["Chef knife", "Cutting board"] });

  const sear = add(chicken, {
    name: "Sear the chicken", mins: 14, hands: true, uses: ["Sauté pan", "Tongs"],
    lines: [
      ["put the pan on", 1, true],
      ["pan comes up to temp", 3, false],
      ["lay the cutlets in", 1, true],
      ["first side", 4, false],
      ["flip", 1, true],
      ["second side", 4, false],
    ],
  });

  add(chicken, {
    name: "Make the pan sauce", mins: 6, hands: true, uses: ["Sauté pan"],
    lines: [["deglaze and add capers", 2, true], ["reduce", 4, false]],
  });

  add(chicken, { name: "Plate and spoon sauce", mins: 2, hands: true, note: "get the plates down first" });

  add(rice, { name: "Dice the onion", mins: 3, hands: true, prep: true, uses: ["Chef knife", "Cutting board"] });
  add(rice, { name: "Measure the stock", mins: 1, hands: true, prep: true, uses: ["Measuring cups (dry)"] });
  add(rice, { name: "Toast rice and onion", mins: 4, hands: true, uses: ["Saucepan"] });

  add(rice, {
    name: "Simmer the rice", mins: 18, hands: true, uses: ["Saucepan"],
    lines: [
      ["get it going", 1, true],
      ["simmering", 8, false],
      ["stir once", 1, true],
      ["simmering", 8, false],
    ],
  });

  add(rice, { name: "Fluff and season", mins: 2, hands: true });

  // --- Ingredients ---------------------------------------------------------
  const ing = {};
  const put = (recipe, texts) => {
    for (const text of texts) ing[text] = addIngredient(plan, recipe.id, text);
  };
  put(chicken, [
    "2 chicken breasts, halved", "1/2 cup flour", "1 tsp salt", "1/2 tsp black pepper",
    "3 tbsp butter", "2 tbsp olive oil", "1/4 cup capers, drained",
    "2 lemons", "1/2 cup chicken stock", "2 tbsp parsley",
  ]);
  put(rice, ["1 cup long-grain rice", "1/2 onion", "2 cups chicken stock", "1 tbsp butter"]);

  // --- Bowls ---------------------------------------------------------------
  // A bowl is a moment: it names the step it has to be ready before.
  const dredge = addBowl(plan, "Dredge");
  dredge.stepId = sear.id;
  for (const t of ["1/2 cup flour", "1 tsp salt", "1/2 tsp black pepper"]) ing[t].bowlId = dredge.id;

  const sauce = addBowl(plan, "Sauce");
  sauce.stepId = stepById(plan, plan.steps.find((s) => s.name === "Make the pan sauce").id).id;
  for (const t of ["1/4 cup capers, drained", "1/2 cup chicken stock", "2 lemons"]) ing[t].bowlId = sauce.id;

  return plan;
}
