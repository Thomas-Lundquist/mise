// The student flow: five short screens, then the lab guide. See docs/design.md.

var recipe = loadRecipe();
var app = document.getElementById("app");
var focusAfterRender = null; // data-focus value of the input to focus after the next render

// Small helper for building elements: h("p", { class: "hint" }, "Text").
function h(tag, attrs) {
  var el = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (key) {
    var value = attrs[key];
    if (key.slice(0, 2) === "on") el.addEventListener(key.slice(2), value);
    else if (key === "value") el.value = value;
    else if (value === true) el.setAttribute(key, "");
    else if (value !== false && value != null) el.setAttribute(key, value);
  });
  for (var i = 2; i < arguments.length; i++) {
    var child = arguments[i];
    if (child == null || child === false) continue;
    el.append(child);
  }
  return el;
}

function save() { saveRecipe(recipe); }

function update(changes) {
  Object.assign(recipe, changes);
  save();
}

// One labelled input. `hint` is an optional one-line helper under the label.
function field(label, input, hint) {
  return h("label", { class: "field" },
    h("span", { class: "field-label" }, label),
    hint && h("span", { class: "field-hint" }, hint),
    input);
}

// A text box bound to obj[key]. Typing saves without redrawing, so focus isn't lost.
function boundInput(obj, key, attrs) {
  return h("input", Object.assign({
    type: "text",
    value: obj[key] == null ? "" : obj[key],
    oninput: function (e) { obj[key] = e.target.value; save(); }
  }, attrs));
}

// A toggle button, used for picking cooks, ingredients, and bowls.
function chip(label, pressed, onclick) {
  return h("button", { type: "button", class: "chip", "aria-pressed": String(pressed), onclick: onclick }, label);
}

function addButton(label, onclick) {
  return h("button", { type: "button", class: "button-add", onclick: onclick }, label);
}

function quietButton(label, onclick, aria) {
  return h("button", { type: "button", class: "button-small", onclick: onclick, "aria-label": aria || label }, label);
}

// Add an item to a list, then redraw and put the cursor in it.
function addItem(list, item) {
  list.push(item);
  save();
  focusAfterRender = item.id;
  render();
}

// Lists start with one empty item so the screen never opens blank.
function ensureOne(list, makeItem) {
  if (!list.length) { list.push(makeItem()); save(); }
}

function ingredientLine(ing) {
  var text = [ing.amount, ing.unit, ing.name].filter(function (s) { return s && s.trim(); }).join(" ");
  return ing.prep && ing.prep.trim() ? text + ", " + ing.prep.trim() : text;
}

// ---------- 1. Recipe ----------

function recipeScreen() {
  var cookButtons = h("div", { class: "segmented", role: "group", "aria-label": "Cooks on your team" });
  [1, 2, 3, 4, 5].forEach(function (n) {
    cookButtons.append(h("button", {
      type: "button",
      "aria-pressed": String(recipe.cooks === n),
      onclick: function () { update({ cooks: n }); render(); }
    }, String(n)));
  });

  return [
    h("h1", {}, "What are you cooking?"),
    h("p", { class: "lead" }, "Find these at the top of your recipe."),
    field("Recipe name", boundInput(recipe, "title", { placeholder: "Buttermilk Pancakes" })),
    h("div", { class: "row" },
      field("Servings", boundInput(recipe, "servings", { type: "number", min: "1", inputmode: "numeric" })),
      field("Class starts at", boundInput(recipe, "startTime", { type: "time" }))),
    field("Minutes for the lab", h("input", {
      type: "number", min: "1", inputmode: "numeric", value: recipe.minutesAvailable,
      oninput: function (e) { update({ minutesAvailable: Number(e.target.value) || 0 }); }
    }), "A full class is about 90."),
    h("div", { class: "field" },
      h("span", { class: "field-label" }, "Cooks on your team"),
      h("span", { class: "field-hint" }, "Just you? Choose 1."),
      cookButtons)
  ];
}

// ---------- 2. Ingredients ----------

function newIngredient() { return { id: newId("i"), amount: "", unit: "", name: "", prep: "" }; }

function removeIngredient(id) {
  recipe.ingredients = recipe.ingredients.filter(function (i) { return i.id !== id; });
  recipe.bowls.forEach(function (b) {
    b.ingredientIds = b.ingredientIds.filter(function (x) { return x !== id; });
  });
  save();
  render();
}

function ingredientsScreen() {
  ensureOne(recipe.ingredients, newIngredient);
  var list = h("div", { class: "items" });
  recipe.ingredients.forEach(function (ing) {
    list.append(h("div", { class: "item" },
      h("div", { class: "ingredient-grid" },
        boundInput(ing, "amount", { placeholder: "2", "aria-label": "Amount", "data-focus": ing.id }),
        boundInput(ing, "unit", { placeholder: "cups", "aria-label": "Unit" }),
        boundInput(ing, "name", { placeholder: "flour", "aria-label": "Ingredient", class: "span-name" })),
      h("div", { class: "item-inline-row" },
        boundInput(ing, "prep", { placeholder: "Prep, if any: diced, melted…", "aria-label": "Prep" }),
        quietButton("×", function () { removeIngredient(ing.id); }, "Remove ingredient"))));
  });

  return [
    h("h1", {}, "Ingredients"),
    h("p", { class: "lead" }, "List each one in the order the recipe gives them."),
    list,
    addButton("+ Add ingredient", function () { addItem(recipe.ingredients, newIngredient()); })
  ];
}

// ---------- 3. Equipment ----------

function newEquipment() { return { id: newId("e"), name: "", qty: 1 }; }

function equipmentScreen() {
  ensureOne(recipe.equipment, newEquipment);
  var list = h("div", { class: "items" });
  recipe.equipment.forEach(function (eq) {
    list.append(h("div", { class: "item item-inline" },
      h("input", {
        type: "number", min: "1", inputmode: "numeric", value: eq.qty, "aria-label": "How many",
        class: "in-qty",
        oninput: function (e) { eq.qty = Number(e.target.value) || 1; save(); }
      }),
      boundInput(eq, "name", { placeholder: "mixing bowl", "aria-label": "Equipment", "data-focus": eq.id }),
      quietButton("×", function () {
        recipe.equipment = recipe.equipment.filter(function (x) { return x.id !== eq.id; });
        save();
        render();
      }, "Remove equipment")));
  });

  return [
    h("h1", {}, "Equipment"),
    h("p", { class: "lead" }, "Every tool you'll pull before you start."),
    list,
    addButton("+ Add equipment", function () { addItem(recipe.equipment, newEquipment()); })
  ];
}

// ---------- 4. Bowls ----------

function newBowl() { return { id: newId("b"), label: "", ingredientIds: [], minutes: null }; }

function bowlsScreen() {
  var named = recipe.ingredients.filter(function (i) { return i.name && i.name.trim(); });
  if (!named.length) {
    return [
      h("h1", {}, "Mise en place bowls"),
      h("p", { class: "lead" }, "Add your ingredients first, then come back to group them."),
      addButton("← Go to ingredients", function () { goTo(1); })
    ];
  }

  var inSomeBowl = {};
  recipe.bowls.forEach(function (b) { b.ingredientIds.forEach(function (id) { inSomeBowl[id] = b.id; }); });

  var list = h("div", { class: "items" });
  recipe.bowls.forEach(function (bowl, index) {
    // Only show ingredients that are free or already in this bowl.
    var choices = h("div", { class: "chips" });
    named.forEach(function (ing) {
      var owner = inSomeBowl[ing.id];
      if (owner && owner !== bowl.id) return;
      choices.append(chip(ing.name, owner === bowl.id, function () {
        if (owner === bowl.id) bowl.ingredientIds = bowl.ingredientIds.filter(function (x) { return x !== ing.id; });
        else bowl.ingredientIds.push(ing.id);
        save();
        render();
      }));
    });
    if (!choices.childNodes.length) {
      choices.append(h("span", { class: "field-hint" }, "Every ingredient is already in a bowl."));
    }

    var suggested = suggestBowlMinutes(bowl, recipe.ingredients);
    list.append(h("div", { class: "item" },
      h("div", { class: "item-head" },
        h("h2", {}, "Bowl " + (index + 1)),
        quietButton("Remove", function () {
          recipe.bowls = recipe.bowls.filter(function (b) { return b.id !== bowl.id; });
          recipe.steps.forEach(function (s) {
            s.bowlIds = (s.bowlIds || []).filter(function (x) { return x !== bowl.id; });
          });
          save();
          render();
        }, "Remove bowl " + (index + 1))),
      boundInput(bowl, "label", { placeholder: "Name it: dry, wet, sauce…", "aria-label": "Bowl name", "data-focus": bowl.id }),
      h("div", { class: "field" },
        h("span", { class: "field-label" }, "What goes in it"),
        choices),
      field("Minutes to fill", h("input", {
        type: "number", min: "1", inputmode: "numeric", class: "in-qty",
        value: bowl.minutes == null ? suggested : bowl.minutes,
        oninput: function (e) { bowl.minutes = e.target.value === "" ? null : Number(e.target.value); save(); }
      }), "Suggested: " + suggested + " min. Change it if you think it'll take longer.")));
  });

  var loose = named.filter(function (i) { return !inSomeBowl[i.id]; });
  return [
    h("h1", {}, "Mise en place bowls"),
    h("p", { class: "lead" }, "Group ingredients that get added at the same time."),
    list,
    addButton("+ Add bowl", function () { addItem(recipe.bowls, newBowl()); }),
    loose.length > 0 && recipe.bowls.length > 0 && h("p", { class: "note" },
      h("strong", {}, "Not in a bowl: "),
      loose.map(function (i) { return i.name; }).join(", "),
      h("br"),
      h("span", { class: "field-hint" }, "That's fine. They'll be listed on their own."))
  ];
}

// ---------- 5. Steps ----------

function newStep() { return { id: newId("s"), text: "", minutes: "", handsOff: false, bowlIds: [], after: "previous" }; }

function moveStep(index, by) {
  var steps = recipe.steps;
  var to = index + by;
  if (to < 0 || to >= steps.length) return;
  steps.splice(to, 0, steps.splice(index, 1)[0]);
  save();
  render();
}

function stepsScreen() {
  ensureOne(recipe.steps, newStep);
  var list = h("div", { class: "items" });
  recipe.steps.forEach(function (step, index) {
    var bowlChips = null;
    if (recipe.bowls.length) {
      bowlChips = h("div", { class: "chips" });
      recipe.bowls.forEach(function (bowl) {
        var used = (step.bowlIds || []).indexOf(bowl.id) !== -1;
        bowlChips.append(chip(bowlName(bowl, recipe.bowls), used, function () {
          step.bowlIds = used
            ? step.bowlIds.filter(function (x) { return x !== bowl.id; })
            : (step.bowlIds || []).concat(bowl.id);
          save();
          render();
        }));
      });
    }

    var startsAfter = null;
    if (index > 0) {
      var select = h("select", {
        "aria-label": "Starts after",
        onchange: function (e) { step.after = e.target.value; save(); }
      });
      select.append(h("option", { value: "previous" }, "When step " + index + " is done"));
      for (var j = 0; j < index - 1; j++) {
        select.append(h("option", { value: recipe.steps[j].id }, "When step " + (j + 1) + " is done"));
      }
      select.append(h("option", { value: "any" }, "Any time"));
      select.value = step.after || "previous";
      if (select.selectedIndex === -1) select.value = "previous";
      startsAfter = field("Starts", select);
    }

    list.append(h("div", { class: "item" },
      h("div", { class: "item-head" },
        h("h2", {}, "Step " + (index + 1)),
        h("div", { class: "item-tools" },
          index > 0 && quietButton("↑", function () { moveStep(index, -1); }, "Move step up"),
          index < recipe.steps.length - 1 && quietButton("↓", function () { moveStep(index, 1); }, "Move step down"),
          quietButton("Remove", function () {
            recipe.steps.splice(index, 1);
            recipe.steps.forEach(function (s) { if (s.after === step.id) s.after = "previous"; });
            save();
            render();
          }, "Remove step " + (index + 1)))),
      h("textarea", {
        rows: "2", placeholder: "Whisk the wet bowl into the dry bowl", "aria-label": "What to do",
        "data-focus": step.id,
        oninput: function (e) { step.text = e.target.value; save(); }
      }, step.text),
      h("div", { class: "row row-tight" },
        field("Minutes", boundInput(step, "minutes", { type: "number", min: "0", inputmode: "numeric", class: "in-qty" })),
        h("label", { class: "check" },
          h("input", {
            type: "checkbox", checked: !!step.handsOff,
            onchange: function (e) { step.handsOff = e.target.checked; save(); }
          }),
          h("span", {},
            h("span", { class: "field-label" }, "Hands-off"),
            h("span", { class: "field-hint" }, "Baking, chilling, resting")))),
      bowlChips && h("div", { class: "field" }, h("span", { class: "field-label" }, "Bowls used"), bowlChips),
      startsAfter));
  });

  return [
    h("h1", {}, "Steps"),
    h("p", { class: "lead" }, "Each step in your own words. Short is fine."),
    list,
    addButton("+ Add step", function () { addItem(recipe.steps, newStep()); })
  ];
}

var SCREENS = [
  { name: "Recipe", render: recipeScreen },
  { name: "Ingredients", render: ingredientsScreen },
  { name: "Equipment", render: equipmentScreen },
  { name: "Bowls", render: bowlsScreen },
  { name: "Steps", render: stepsScreen }
];
var GUIDE = SCREENS.length; // the lab guide comes after the last screen

// ---------- Frame: progress, screen, back/next ----------

function goTo(index) {
  update({ screen: Math.max(0, Math.min(GUIDE, index)) });
  render();
  window.scrollTo(0, 0);
}

function progress(index) {
  var bar = h("ol", { class: "progress-bar" });
  SCREENS.forEach(function (s, i) {
    bar.append(h("li", { class: i <= index ? "done" : "", title: s.name }));
  });
  return h("div", { class: "progress" },
    h("p", { class: "progress-text" }, "Step " + (index + 1) + " of " + SCREENS.length + " · " + SCREENS[index].name),
    bar);
}

function nav(index) {
  var last = index === SCREENS.length - 1;
  return h("div", { class: "nav" },
    index > 0
      ? h("button", { type: "button", class: "button-quiet", onclick: function () { goTo(index - 1); } }, "← Back")
      : h("span"),
    h("button", { type: "button", class: "button-primary", onclick: function () { goTo(index + 1); } },
      last ? "See lab guide →" : "Next →"));
}

function render() {
  var index = recipe.screen || 0;
  if (index >= GUIDE) {
    app.replaceChildren(guideView());
  } else {
    app.replaceChildren(progress(index), h("section", { class: "screen" }, ...SCREENS[index].render()), nav(index));
  }
  if (focusAfterRender) {
    var el = app.querySelector('[data-focus="' + focusAfterRender + '"]');
    if (el) el.focus();
    focusAfterRender = null;
  }
}

render();
