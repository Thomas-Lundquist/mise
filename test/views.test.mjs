// The views, driven through a stub DOM.
//
// These exist because the interaction layer is where the bugs actually landed,
// and it had no coverage: a draft step's "what is still missing" list was read
// once at render time and captured by the submit handler, so typing a name and
// a duration updated the button but not the check behind it — the Add button
// looked enabled and did nothing.
//
// The stub is deliberately thin. It is not a browser and cannot tell you
// anything about layout or CSS; it verifies that a view builds without throwing
// and that its handlers do what they claim to the plan.

// Views update small things in place rather than re-rendering — the hint under
// the add-step row, for one — and they reach them with getElementById. A stub
// that always returned null made those updates invisible to the test while
// working fine in a browser, so ids are registered as they are set.
const nodesById = new Map();

function makeNode(tag) {
  return {
    tagName: tag,
    className: "",
    textContent: "",
    style: {},
    childNodes: [],
    attrs: {},
    listeners: {},
    appendChild(child) {
      if (child == null) throw new Error(`${tag}: appendChild(${child})`);
      this.childNodes.push(child);
      return child;
    },
    replaceChildren(...children) { this.childNodes = children; },
    setAttribute(key, value) {
      this.attrs[key] = String(value);
      if (key === "id") nodesById.set(String(value), this);
    },
    addEventListener(event, fn) { (this.listeners[event] ||= []).push(fn); },
    focus() {}, remove() {}, click() {},
  };
}

// Real elements have properties that look settable and are not. `input.list`
// returns the resolved <datalist>, so assigning to it throws in strict mode —
// which silently aborted a whole render. A stub of plain objects can never
// reproduce that, so one is modelled here deliberately.
const READ_ONLY = { input: ["list"] };

function makeElement(tag) {
  const node = makeNode(tag);
  for (const key of READ_ONLY[tag] || []) {
    Object.defineProperty(node, key, { get: () => null, configurable: true });
  }
  return node;
}

globalThis.document = {
  createElement: makeElement,
  createTextNode: (t) => ({ tagName: "#text", textContent: String(t), childNodes: [] }),
  getElementById: (id) => nodesById.get(id) || null,
  activeElement: null,
  body: makeNode("body"),
};
globalThis.window = { location: { search: "" }, sessionStorage: null, addEventListener() {}, confirm: () => true };

const M = await import("../js/model.js");
const views = {};
for (const name of ["today", "recipes", "equipment", "mise", "board"]) {
  views[name] = await import(`../js/views/${name}.js`);
}
// Not one of the five: the printed sheet is a document of its own, takes the
// plan rather than a ctx, and has no status line.
const printout = await import("../js/views/printout.js");

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL  ${label}\n      got      ${a}\n      expected ${e}`); }
  else console.log(`ok    ${label}  ${a}`);
}

// --- Walking the stub tree -------------------------------------------------

function find(node, id) {
  if (!node || !node.childNodes) return null;
  if (node.attrs && node.attrs.id === id) return node;
  for (const child of node.childNodes) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return null;
}

function allText(node, out = []) {
  if (!node) return out;
  if (node.textContent && (!node.childNodes || node.childNodes.length === 0)) out.push(node.textContent);
  for (const child of node.childNodes || []) allText(child, out);
  return out;
}

function countClass(node, className, n = 0) {
  if (!node) return n;
  if (typeof node.className === "string" && node.className.split(" ").includes(className)) n += 1;
  for (const child of node.childNodes || []) n = countClass(child, className, n);
  return n;
}

function fire(node, event, payload = {}) {
  if (!node) throw new Error(`fire(${event}) on a missing element`);
  const handlers = node.listeners[event] || [];
  if (handlers.length === 0) throw new Error(`no ${event} handler on ${node.tagName}`);
  for (const fn of handlers) fn({ target: node, preventDefault() {}, ...payload });
}

function type(node, value) {
  node.attrs.value = String(value);
  node.value = String(value);
  fire(node, "input", { target: { value: String(value) } });
}

const ctxFor = (plan) => ({ plan, save() {}, refresh() {} });

// --- A plan the way a student would leave it -------------------------------

function samplePlan() {
  const plan = M.createPlan({ recipe: "Chicken piccata", foodUp: "12:35" });
  const chicken = plan.recipes[0];
  chicken.prepMins = 15;
  chicken.cookMins = 25;
  const rice = M.addRecipe(plan, "Rice pilaf");

  for (const t of ["2 tbsp butter", "1 onion, diced", "1 cup flour"]) M.addIngredient(plan, chicken.id, t);
  M.addIngredient(plan, rice.id, "1 cup rice");

  const mk = (recipeId, name, mins, hands) =>
    M.appendStep(plan, M.createStep({ recipeId, name, mins, hands }));
  const dredge = mk(chicken.id, "Pound and dredge chicken", 7, true);
  const sear = mk(chicken.id, "Sear chicken cutlets", 8, true);
  mk(chicken.id, "Deglaze pan and reduce", 6, false);
  mk(chicken.id, "Plate and spoon sauce", 2, true);
  mk(rice.id, "Toast rice and onion", 5, true);
  mk(rice.id, "Simmer rice covered", 18, false);

  const pan = M.addEquipment(plan, "Sauté pan");
  sear.equipmentIds = [pan.id];
  sear.note = "get plates down";

  const bowl = M.addBowl(plan, "Dredge");
  plan.ingredients[2].bowlId = bowl.id;
  bowl.stepId = dredge.id;

  return plan;
}

// --- Every view builds, in every mode --------------------------------------
{
  const plan = samplePlan();
  const ctx = ctxFor(plan);
  for (const [name, view] of Object.entries(views)) {
    let threw = null;
    for (const mode of ["guided", "free"]) {
      for (const cooks of [1, 3]) {
        plan.schedule.mode = mode;
        plan.schedule.cooks = cooks;
        try { view.render(ctx); view.status(plan); }
        catch (err) { threw = `${mode}/${cooks}: ${err.message}`; }
      }
    }
    check(`${name} builds in every mode`, threw, null);
  }
  plan.schedule.mode = "guided";
  plan.schedule.cooks = 1;
}

// An empty plan is the first thing a student sees, and half the views have
// nothing to show yet. None of them may throw.
{
  const empty = M.createPlan();
  const ctx = ctxFor(empty);
  for (const [name, view] of Object.entries(views)) {
    let threw = null;
    try { view.render(ctx); view.status(empty); }
    catch (err) { threw = err.message; }
    check(`${name} builds on an empty plan`, threw, null);
  }
}

// --- Adding a step ---------------------------------------------------------
//
// The regression. Typing does not re-render — that is what keeps the caret
// steady — so anything the submit handler needs must be read when it runs, not
// captured when the row was drawn.
{
  const plan = M.createPlan({ recipe: "Salsa" });
  const recipe = plan.recipes[0];
  const ctx = ctxFor(plan);

  const draw = () => views.recipes.render(ctx);
  let tree = draw();

  // Steps live behind the big-ideas pass now. Skipping it is one tap and leaves
  // exactly the flat list this replaced, which is what the rest of this block
  // is about.
  fire(find(tree, `idea-skip-${recipe.id}`), "click");
  tree = draw();
  const scope = M.bigIdeasForRecipe(plan, recipe.id)[0].id;

  // The button is never disabled. A greyed-out control that does nothing when
  // clicked is indistinguishable from a broken one, and this app warns rather
  // than refuses everywhere else.
  const addBtn = () => find(tree, `add-step-${scope}`);
  const hint = () => find(tree, `add-hint-${scope}`);
  check("Add step is never disabled", addBtn().attrs.disabled, undefined);

  fire(addBtn(), "click");
  check("clicking an untouched row adds nothing", plan.steps.length, 0);
  check("and says everything that is missing", hint().textContent,
    "Still needed: what the step is and whether your hands are on it.");

  // Minutes are NOT a gate. Recipes are sometimes silent — "sauté until golden
  // brown" gives a cue, not a number — and a student with nothing to read must
  // not be stuck mid-flow.
  type(find(tree, `add-name-${scope}`), "Dice the tomatoes");
  type(find(tree, `add-mins-${scope}`), "4");
  fire(addBtn(), "click");
  check("filling name and minutes alone does not add a step", plan.steps.length, 0);
  check("and the hint narrows to what is actually left", hint().textContent,
    "Still needed: whether your hands are on it.");

  fire(find(tree, `add-shape-${scope}-hands`), "click");
  fire(addBtn(), "click");
  check("answering both adds the step", plan.steps.length, 1);
  check("with what was typed, as a single timed line",
    plan.steps.map((s) => [s.name, s.segments.length, s.segments[0].mins, s.segments[0].hands]),
    [["Dice the tomatoes", 1, 4, true]]);

  // The order that actually broke: the shape chosen FIRST, then the text
  // fields. Choosing it re-renders, so the captured list was stale from then on.
  tree = draw();
  fire(find(tree, `add-shape-${scope}-runs`), "click");
  tree = draw();
  type(find(tree, `add-name-${scope}`), "Let it sit");
  type(find(tree, `add-mins-${scope}`), "10");
  fire(find(tree, `add-step-${scope}`), "click");
  check("and it still works when the shape is answered first", plan.steps.length, 2);
  check("the waiting answer is kept", plan.steps[1].segments[0].hands, false);

  // The shape that makes a plan able to overlap at all, on the first pass,
  // without anyone reopening a finished step to add lines by hand.
  tree = draw();
  type(find(tree, `add-name-${scope}`), "Simmer the sauce");
  type(find(tree, `add-mins-${scope}`), "20");
  fire(find(tree, `add-shape-${scope}-start-then-runs`), "click");
  tree = draw();
  fire(find(tree, `add-step-${scope}`), "click");
  check("start-then-runs arrives already split into a lead and a wait",
    plan.steps[2].segments.map((seg) => [seg.mins, seg.hands]), [[1, true], [19, false]]);

  // A range is what the card says. The app plans on its slow end and says so
  // before the step is even added, which is where the rule is learnt.
  tree = draw();
  type(find(tree, `add-name-${scope}`), "Sear the cutlets");
  type(find(tree, `add-mins-${scope}`), "5-7");
  fire(find(tree, `add-shape-${scope}-hands`), "click");
  tree = draw();
  check("a range is read back before the step is added",
    find(tree, `add-hint-${scope}`).textContent,
    "Planning for 7 min — the slow end of 5-7.");
  fire(find(tree, `add-step-${scope}`), "click");
  check("and the plan is built on the slow case",
    [plan.steps[3].segments[0].mins, plan.steps[3].stated], [7, "5-7"]);

  // A card that gives a cue rather than a number must never block the step.
  tree = draw();
  type(find(tree, `add-name-${scope}`), "Sauté until golden brown");
  fire(find(tree, `add-shape-${scope}-hands`), "click");
  tree = draw();
  check("a step with no time says what will happen to it",
    find(tree, `add-hint-${scope}`).textContent,
    "No time on this one. It'll go in unestimated — the board will remind you.");
  fire(find(tree, `add-step-${scope}`), "click");
  check("and goes in anyway rather than stranding the student",
    [plan.steps.length, M.isUnestimated(plan.steps[4])], [5, true]);

  // The draft is cleared, not carried into the next step.
  tree = draw();
  check("the draft row is empty again",
    [find(tree, `add-name-${scope}`).attrs.value, find(tree, `add-mins-${scope}`).attrs.value],
    ["", ""]);
  check("an untouched row says nothing rather than nagging",
    find(tree, `add-hint-${scope}`).textContent, "");
}

// --- The big ideas pass ----------------------------------------------------
//
// The teacher's own workflow: read the recipe, name the three or four big
// things you have to do, then write the sub-tasks under each. Offered first,
// before any step exists — and skippable, so it is never a toll gate.
{
  const plan = M.createPlan({ recipe: "Chicken piccata" });
  const recipe = plan.recipes[0];
  const ctx = ctxFor(plan);
  const draw = () => views.recipes.render(ctx);
  let tree = draw();

  check("a fresh recipe asks for the big ideas first",
    Boolean(find(tree, `idea-skip-${recipe.id}`)), true);
  check("and holds the step rows back until it is answered",
    find(tree, `add-name-${M.bigIdeasForRecipe(plan, recipe.id)[0].id}`), null);

  const first = M.bigIdeasForRecipe(plan, recipe.id)[0];
  type(find(tree, `idea-name-${first.id}`), "Prep the chicken");
  fire(find(tree, `idea-add-${recipe.id}`), "click");
  tree = draw();

  const two = M.bigIdeasForRecipe(plan, recipe.id);
  check("another big idea can be named", two.length, 2);
  type(find(tree, `idea-name-${two[1].id}`), "Make the pan sauce");
  fire(find(tree, `idea-done-${recipe.id}`), "click");
  tree = draw();

  check("settling keeps the named ones and drops the blanks",
    M.bigIdeasForRecipe(plan, recipe.id).map((b) => b.name),
    ["Prep the chicken", "Make the pan sauce"]);
  check("the recipe is now grouped", M.isGrouped(plan, recipe.id), true);
  check("and every big idea has its own add row",
    M.bigIdeasForRecipe(plan, recipe.id).every((b) => Boolean(find(tree, `add-name-${b.id}`))),
    true);

  // The point of a per-group add row: a step lands where you typed it.
  const sauce = M.bigIdeasForRecipe(plan, recipe.id)[1];
  type(find(tree, `add-name-${sauce.id}`), "Deglaze the pan");
  type(find(tree, `add-mins-${sauce.id}`), "6");
  fire(find(tree, `add-shape-${sauce.id}-hands`), "click");
  fire(find(tree, `add-step-${sauce.id}`), "click");
  check("a step joins the big idea whose row it was typed in",
    M.stepsForBigIdea(plan, sauce.id).map((s) => s.name), ["Deglaze the pan"]);
  check("and not the other one", M.stepsForBigIdea(plan, first.id).length, 0);
}

// Skipping leaves exactly what was there before: one plain list, no headings.
{
  const plan = M.createPlan({ recipe: "Salsa" });
  const recipe = plan.recipes[0];
  const ctx = ctxFor(plan);
  let tree = views.recipes.render(ctx);

  fire(find(tree, `idea-skip-${recipe.id}`), "click");
  tree = views.recipes.render(ctx);

  check("skipping leaves one unnamed big idea and no grouping",
    [M.bigIdeasForRecipe(plan, recipe.id).length, M.isGrouped(plan, recipe.id)], [1, false]);
  check("and the step row is right there",
    Boolean(find(tree, `add-name-${M.bigIdeasForRecipe(plan, recipe.id)[0].id}`)), true);
}

// A plan that already has steps and never answered — the worked example, a
// restored file — must not be ambushed by the prompt.
{
  const plan = samplePlan();
  const tree = views.recipes.render(ctxFor(plan));
  check("a plan that already has steps is not asked to name big ideas",
    find(tree, `idea-skip-${plan.recipes[0].id}`), null);
}

// --- Adding an ingredient --------------------------------------------------
{
  const plan = M.createPlan({ recipe: "Salsa" });
  const recipe = plan.recipes[0];
  const tree = views.recipes.render(ctxFor(plan));

  const input = find(tree, `ing-add-${recipe.id}`);
  input.value = "3 tomatoes";
  fire(input, "keydown", { key: "Enter" });
  check("Enter in the ingredient box adds it", plan.ingredients.map((i) => i.text), ["3 tomatoes"]);
}

// --- Equipment attaches to the step it was typed on ------------------------
{
  const plan = samplePlan();
  const step = plan.steps[0];
  const tree = views.equipment.render(ctxFor(plan));

  const input = find(tree, `equip-add-${step.id}`);
  input.value = "Cutting board";
  fire(input, "keydown", { key: "Enter" });

  const added = plan.equipment.find((e) => e.name === "Cutting board");
  check("typing equipment on a step creates it", Boolean(added), true);
  check("attaches it to that step", step.equipmentIds.includes(added.id), true);
  check("and it brings its station from the palette", added.station, "Prep");
}

// --- Equipment is guessed out loud, and never attached silently ------------
{
  const plan = samplePlan();
  const roast = M.appendStep(plan, M.createStep({
    recipeId: plan.recipes[0].id, name: "Roast the vegetables", mins: 20, shape: "runs",
  }));
  const before = plan.equipment.length;
  const tree = views.equipment.render(ctxFor(plan));
  const text = allText(tree).join(" | ");

  check("the section says the guesses are guesses", text.includes("Dashed ones are our guess"), true);
  check("and nothing is attached until the student says so",
    [plan.equipment.length, roast.equipmentIds.length], [before, 0]);

  // Accepting is one tap, which is the whole point: the section becomes a
  // review rather than a third walk through the recipe.
  const guess = (function findGuess(node) {
    if (node && node.className === "chip chip--guess" && node.childNodes[0]
        && node.childNodes[0].textContent === "Sheet pan?") return node;
    for (const child of (node && node.childNodes) || []) {
      const hit = findGuess(child);
      if (hit) return hit;
    }
    return null;
  })(tree);
  check("the guess is on the step it was read from", Boolean(guess), true);
  fire(guess, "click");
  check("one tap accepts it, with the station that puts the step on a lane",
    [plan.equipment.find((e) => e.name === "Sheet pan").station, roast.equipmentIds.length],
    ["Oven", 1]);
}

// --- Short moments become notches, not slivers -----------------------------
//
// A one-minute hands-on line between two waiting lines of the same step is an
// interruption of that step, not a task of its own. Drawn as a block it is an
// illegible sliver on the cook's lane that also says nothing about which dish
// is calling. It comes off the lane and goes onto the dish's own block.
{
  const plan = M.createPlan({ recipe: "Chicken", foodUp: "12:35" });
  plan.schedule.anchor = "fixed";
  const sear = M.createStep({ recipeId: plan.recipes[0].id, name: "Sear the chicken", mins: 1, hands: true });
  M.appendStep(plan, sear);
  sear.segments[0].label = "put the pan on";
  for (const [label, mins, hands] of [["pan heats", 3, false], ["flip", 1, true], ["cooks", 3, false]]) {
    Object.assign(M.addSegment(plan, sear.id, { mins, hands }), { label });
  }
  // A one-minute step of its own has nothing to interrupt, so it stays a block.
  M.appendStep(plan, M.createStep({ recipeId: plan.recipes[0].id, name: "Taste and adjust", mins: 1, hands: true }));

  const text = allText(views.board.render(ctxFor(plan))).join(" | ");
  check("the board lists the moments as watch points", text.includes("Watch points"), true);
  check("naming the dish that calls you back", text.includes("Sear the chicken"), true);
  check("and what it wants", [text.includes("flip"), text.includes("put the pan on")], [true, true]);
  check("a standalone one-minute step is still a block, not a watch point",
    text.includes("Taste and adjust"), true);
}

// Starting something is not being called back to it. Every "starts, then runs
// by itself" step opens with a short hands-on line, and treating those as
// notches would take the one minute your hands are actually busy off the cook's
// lane — which is the one thing that lane is for.
{
  const plan = M.createPlan({ recipe: "Rice", foodUp: "12:35" });
  plan.schedule.anchor = "fixed";
  const rice = M.appendStep(plan, M.createStep({
    recipeId: plan.recipes[0].id, name: "Simmer the rice", mins: 20, shape: "start-then-runs",
  }));
  const text = allText(views.board.render(ctxFor(plan))).join(" | ");
  check("the lead of a start-then-runs step is not a watch point",
    text.includes("Watch points"), false);
  check("and its waiting line is still what the board is drawing",
    M.waitingMins(rice), 19);
}

// --- The board says the things it exists to say ----------------------------
{
  const plan = samplePlan();
  const text = allText(views.board.render(ctxFor(plan))).join(" | ");
  for (const phrase of [
    "Start cooking at", "Food up at", "Your plan takes",
    "Before you start", "Where your time goes", "Don't forget", "The recipe says",
  ]) {
    check(`the board says "${phrase}"`, text.includes(phrase), true);
  }

  // The question every student has and the app never answered.
  check("and answers whether the plan is ready to hand in",
    text.includes("Still need:"), true);
  check("naming what is actually missing", text.includes("your name"), true);
  check("without ever standing between them and the printer",
    text.includes("Nothing here stops you printing."), true);
}

// --- A step with no time is carried, and said out loud ---------------------
{
  const plan = samplePlan();
  M.appendStep(plan, M.createStep({
    recipeId: plan.recipes[0].id, name: "Sauté until golden brown", mins: 0, shape: "hands",
  }));
  const text = allText(views.board.render(ctxFor(plan))).join(" | ");
  check("the board counts the steps it cannot draw",
    text.includes("no time yet"), true);
  check("and says the length is a floor, not an answer",
    text.includes("at least this long"), true);
}

// --- Why more cooks sometimes change nothing -------------------------------
//
// Verified before this existed: chicken + rice pilaf stays the same length at
// 1, 2, 3 and 5 cooks because the rice chain is binding. The manager flipped
// the toggle, saw no improvement, and got no reason why.
{
  const plan = samplePlan();
  plan.schedule.cooks = 3;
  const text = allText(views.board.render(ctxFor(plan))).join(" | ");
  check("the board names the chain that sets the length",
    text.includes("is what sets the length"), true);
  check("and says plainly that hands will not help it",
    text.includes("No number of cooks makes it shorter"), true);
}

// --- The printed sheet -----------------------------------------------------
//
// A WORKING SHEET AT THE STOVE (teacher decision, 2026-09-06) — not the input
// form with its chrome hidden, which is what it used to be. That old printout
// said the ingredients twice and the steps twice, and printed form controls as
// underlined blanks so the whole thing read like a half-filled worksheet.
{
  const plan = samplePlan();
  plan.student.name = "Ana";
  const tree = printout.render(plan);
  const text = allText(tree).join(" | ");

  for (const phrase of ["Before you start", "At the stove", "Running order", "Start cooking"]) {
    check(`the sheet says "${phrase}"`, text.includes(phrase), true);
  }

  // Screen-only teaching. Useless with flour on your hands, and the decision
  // was explicit that it comes off the paper.
  for (const phrase of ["Where your time goes", "The recipe says", "Plan options", "Before you move on"]) {
    check(`and does NOT say "${phrase}"`, text.includes(phrase), false);
  }

  check("it carries clock times, which is the one thing needed at a stove",
    /\d\d:\d\d/.test(text), true);
  check("identity leads both sheets, so a separated page two is not anonymous",
    countClass(tree, "sheet__identity"), 2);
  check("and it is two sheets", countClass(tree, "sheet"), 2);
}

// Prep has no internal order — that is what lets a team split it — so printing
// one row per prep step at an exact minute would claim precision the scheduler
// never asserted.
{
  const plan = samplePlan();
  plan.steps[0].prep = true;
  plan.steps[1].prep = true;
  const tree = printout.render(plan);
  const text = allText(tree).join(" | ");

  check("the mise block prints as one row", countClass(tree, "run__mise"), 1);
  check("saying so in words", text.includes("any order"), true);
  check("and naming what is in it",
    text.includes("Pound and dredge chicken") && text.includes("Sear chicken cutlets"), true);
}

// A number the app or the student guessed must never print looking like one the
// recipe stated. This is the whole reason `stated` exists.
{
  const plan = M.createPlan({ recipe: "Chicken", foodUp: "12:35" });
  const recipe = plan.recipes[0];
  M.appendStep(plan, M.createStep({
    recipeId: recipe.id, name: "Simmer the sauce", mins: 20, shape: "hands", stated: "20",
  }));
  M.appendStep(plan, M.createStep({
    recipeId: recipe.id, name: "Dice the onion", mins: 4, shape: "hands", stated: "",
  }));

  const tree = printout.render(plan);
  const text = allText(tree).join(" | ");
  check("a time read off the card is labelled as the recipe's",
    text.includes("recipe"), true);
  check("a time the student supplied is labelled as theirs",
    text.includes("your estimate"), true);
  check("and only the guessed one gets a blank to measure against",
    countClass(tree, "blank"), 1);
}

// Never throws on the shapes a student can actually leave behind.
{
  let threw = null;
  try {
    printout.render(M.createPlan());
    const solo = M.createPlan({ recipe: "Toast" });
    M.appendStep(solo, M.createStep({
      recipeId: solo.recipes[0].id, name: "Sauté until golden", mins: 0, shape: "hands",
    }));
    printout.render(solo);
    const group = samplePlan();
    group.schedule.cooks = 3;
    printout.render(group);
  } catch (err) {
    threw = err.message;
  }
  check("the sheet builds on an empty plan, an untimed step and a group", threw, null);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
