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

  // The button is never disabled. A greyed-out control that does nothing when
  // clicked is indistinguishable from a broken one, and this app warns rather
  // than refuses everywhere else.
  const addBtn = () => find(tree, `add-step-${recipe.id}`);
  const hint = () => find(tree, `add-hint-${recipe.id}`);
  check("Add step is never disabled", addBtn().attrs.disabled, undefined);

  fire(addBtn(), "click");
  check("clicking an untouched row adds nothing", plan.steps.length, 0);
  check("and says everything that is missing", hint().textContent,
    "Still needed: what the step is, how many minutes and whether your hands are on it.");

  type(find(tree, `add-name-${recipe.id}`), "Dice the tomatoes");
  type(find(tree, `add-mins-${recipe.id}`), "4");
  fire(addBtn(), "click");
  check("filling name and minutes alone does not add a step", plan.steps.length, 0);
  check("and the hint narrows to what is actually left", hint().textContent,
    "Still needed: whether your hands are on it.");

  fire(find(tree, `add-hands-${recipe.id}-on`), "click");
  fire(addBtn(), "click");
  check("answering all three adds the step", plan.steps.length, 1);
  check("with what was typed, as a single timed line",
    plan.steps.map((s) => [s.name, s.segments.length, s.segments[0].mins, s.segments[0].hands]),
    [["Dice the tomatoes", 1, 4, true]]);

  // The order that actually broke: hands chosen FIRST, then the text fields.
  // Choosing hands re-renders, so the captured list was stale from then on.
  tree = draw();
  fire(find(tree, `add-hands-${recipe.id}-off`), "click");
  tree = draw();
  type(find(tree, `add-name-${recipe.id}`), "Let it sit");
  type(find(tree, `add-mins-${recipe.id}`), "10");
  fire(find(tree, `add-step-${recipe.id}`), "click");
  check("and it still works when hands is answered first", plan.steps.length, 2);
  check("the waiting answer is kept", plan.steps[1].segments[0].hands, false);

  // The draft is cleared, not carried into the next step.
  tree = draw();
  check("the draft row is empty again",
    [find(tree, `add-name-${recipe.id}`).attrs.value, find(tree, `add-mins-${recipe.id}`).attrs.value],
    ["", ""]);
  check("an untouched row says nothing rather than nagging",
    find(tree, `add-hint-${recipe.id}`).textContent, "");
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
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
