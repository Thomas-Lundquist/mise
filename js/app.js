// The student flow: four short screens, then the lab guide. See docs/design.md.

var recipe = loadRecipe();
var app = document.getElementById("app");
var focusAfterRender = null;  // data-focus value of the box to put the cursor in after the next render
var flashAfterRender = false; // briefly highlight that box's item (after an undo)
var openStepId = null;        // the one step that's open on the Steps screen (not saved)

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

// A toggle button, used for picking ingredients for a bowl.
function chip(label, pressed, onclick, focusKey) {
  return h("button", { type: "button", class: "chip", "aria-pressed": String(pressed), "data-focus": focusKey, onclick: onclick }, label);
}

function addButton(label, onclick) {
  return h("button", { type: "button", class: "button-add", onclick: onclick }, label);
}

function quietButton(label, onclick, aria, focusKey) {
  return h("button", { type: "button", class: "button-small", onclick: onclick, "aria-label": aria || label, "data-focus": focusKey }, label);
}

// A quiet button with a symbol (× ↑ ↓), drawn larger so it's easy to see and tap.
function iconButton(symbol, onclick, aria, focusKey) {
  var button = quietButton(symbol, onclick, aria, focusKey);
  button.classList.add("button-icon");
  return button;
}

// Put the cursor in the box with this data-focus value, if it's on screen.
function focusBox(key) {
  var el = app.querySelector('[data-focus="' + key + '"]');
  if (el) el.focus();
  return el;
}

// Add an item to a list (so it can be undone), then redraw and put the cursor in it.
function addItem(list, item) {
  var last = list[list.length - 1];
  remember(last && last.id);
  list.push(item);
  save();
  focusAfterRender = item.id;
  render();
}

// After removing list[index], land on the item that took its place (or the one before).
function landNear(list, index) {
  var item = list[Math.min(index, list.length - 1)];
  focusAfterRender = item ? item.id : null;
}

// Lists start with one empty item so the screen never opens blank.
function ensureOne(list, makeItem) {
  if (!list.length) { list.push(makeItem()); save(); }
}

function isBlank(item, keys) {
  return keys.every(function (k) { return !String(item[k] == null ? "" : item[k]).trim(); });
}

// Names match ignoring capitals and extra spaces: "Whisk " is the same tool as "whisk".
function norm(text) { return String(text || "").trim().replace(/\s+/g, " ").toLowerCase(); }
function sameName(a, b) { return norm(a) === norm(b); }

function shorten(text, max) {
  return text.length > max ? text.slice(0, max - 1).trim() + "…" : text;
}

// "2 tbsp butter": enough to tell two butters apart.
function ingredientShort(ing) {
  return [ing.amount, ing.unit, ing.name].filter(function (s) { return s && String(s).trim(); }).join(" ");
}

function ingredientLine(ing) {
  var text = ingredientShort(ing);
  return ing.prep && ing.prep.trim() ? text + ", " + ing.prep.trim() : text;
}

// Every tool named so far, in order of first use, keeping the first spelling.
function knownTools(r) {
  r = r || recipe;
  var tools = [];
  function add(tool) {
    if (norm(tool) && !tools.some(function (t) { return sameName(t, tool); })) tools.push(tool.trim());
  }
  r.steps.forEach(function (s) { (s.tools || []).forEach(add); });
  (r.extraTools || []).forEach(add);
  return tools;
}

// Enter moves to the next box, like Tab. From the last box, it goes to the next screen.
function nextOnEnter(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  var boxes = Array.prototype.slice.call(
    app.querySelectorAll(".screen input:not([type=radio]), .screen input[type=radio]:checked"));
  var next = boxes[boxes.indexOf(e.target) + 1];
  if (next) next.focus();
  else goTo((recipe.screen || 0) + 1, true);
}

// A row of removable tags with a box to add more. Enter adds what's typed (so does
// leaving the box); Backspace in an empty box removes the last tag. Tags are added and
// removed in place, without redrawing, so the cursor stays put.
//   o.add(text) changes the recipe and returns the new tag, or null if it's already there.
//   Each tag is { label, remove() }.
function tagBox(o) {
  var listId = o.key + "-list";
  var datalist = h("datalist", { id: listId });
  (o.suggestions || []).forEach(function (s) { datalist.append(h("option", { value: s })); });

  var input = h("input", {
    type: "text", placeholder: o.placeholder, "aria-label": o.label, list: listId,
    autocomplete: "off", "data-focus": o.key,
    onkeydown: function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (input.value.trim()) commit();
        else if (o.onEmptyEnter) o.onEmptyEnter();
      } else if (e.key === "Backspace" && !input.value && o.tags.length) {
        e.preventDefault();
        removeTag(o.tags[o.tags.length - 1]);
      }
    },
    onblur: function () { if (input.value.trim()) commit(); }
  });

  var box = h("div", { class: "tags" });
  o.tags.forEach(function (tag) { box.append(tagEl(tag)); });
  box.append(input, datalist);

  function tagEl(tag) {
    tag.el = h("span", { class: "tag-item" }, tag.label,
      h("button", { type: "button", class: "tag-remove", "aria-label": "Remove " + tag.label,
        onclick: function () { removeTag(tag); } }, "×"));
    return tag.el;
  }

  function removeTag(tag) {
    remember(o.key);
    tag.remove();
    save();
    o.tags.splice(o.tags.indexOf(tag), 1);
    tag.el.remove();
    input.focus();
    showToast("Removed " + tag.label + ".");
  }

  function commit() {
    var tag = o.add(input.value.trim());
    input.value = "";
    if (!tag) return;
    save();
    o.tags.push(tag);
    box.insertBefore(tagEl(tag), input);
    Array.prototype.slice.call(datalist.options).forEach(function (option) {
      if (sameName(option.value, tag.label)) option.remove();
    });
  }

  return h("div", { class: "field" },
    h("span", { class: "field-label" }, o.label),
    o.hint && h("span", { class: "field-hint" }, o.hint),
    box);
}

// ---------- 1. Recipe ----------

function recipeScreen() {
  var cookChoices = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Cooks on your team" });
  [1, 2, 3, 4, 5].forEach(function (n) {
    cookChoices.append(h("label", {},
      h("input", {
        type: "radio", name: "cooks", value: String(n), checked: recipe.cooks === n,
        "data-focus": "cooks-" + n,
        onchange: function () { remember("cooks-" + recipe.cooks); update({ cooks: n }); },
        onkeydown: nextOnEnter
      }),
      h("span", {}, String(n))));
  });

  return [
    h("h1", {}, "What are you cooking?"),
    h("p", { class: "lead" }, "Find these at the top of your recipe."),
    field("Recipe name", boundInput(recipe, "title", { placeholder: "Buttermilk Pancakes", "data-focus": "title", onkeydown: nextOnEnter })),
    h("div", { class: "row" },
      field("Servings", boundInput(recipe, "servings", { type: "number", min: "1", inputmode: "numeric", "data-focus": "servings", onkeydown: nextOnEnter })),
      field("Class starts at", boundInput(recipe, "startTime", { type: "time", "data-focus": "startTime", onkeydown: nextOnEnter }))),
    field("Minutes for the lab", h("input", {
      type: "number", min: "1", inputmode: "numeric", value: recipe.minutesAvailable, "data-focus": "minutes",
      oninput: function (e) { update({ minutesAvailable: Number(e.target.value) || 0 }); },
      onkeydown: nextOnEnter
    }), "A full class is about 90."),
    h("div", { class: "field" },
      h("span", { class: "field-label" }, "Cooks on your team"),
      h("span", { class: "field-hint" }, "Just you? Choose 1."),
      cookChoices)
  ];
}

// ---------- 2. Ingredients ----------

var INGREDIENT_BOXES = ["amount", "unit", "name", "prep"];

function newIngredient() { return { id: newId("i"), amount: "", unit: "", name: "", prep: "" }; }

function removeIngredient(index) {
  var ing = recipe.ingredients[index];
  remember(ing.id);
  recipe.ingredients.splice(index, 1);
  recipe.bowls.forEach(function (b) {
    b.ingredientIds = b.ingredientIds.filter(function (x) { return x !== ing.id; });
  });
  save();
  landNear(recipe.ingredients, index);
  render();
  showToast("Removed " + (norm(ing.name) ? ing.name.trim() : "an ingredient") + ".");
}

// Enter goes to the next ingredient, or starts a new one after the last.
function ingredientEnter(e, index) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  var list = recipe.ingredients;
  if (index < list.length - 1) focusBox(list[index + 1].id);
  else if (!isBlank(list[index], INGREDIENT_BOXES)) addItem(list, newIngredient());
}

function ingredientsScreen() {
  ensureOne(recipe.ingredients, newIngredient);
  var list = h("div", { class: "items" });
  recipe.ingredients.forEach(function (ing, index) {
    function box(key, attrs) {
      return boundInput(ing, key, Object.assign({
        "data-focus": key === "amount" ? ing.id : ing.id + "-" + key,
        onkeydown: function (e) { ingredientEnter(e, index); }
      }, attrs));
    }
    // One grid, so the boxes can sit on one line on a wide screen and stack on a phone.
    list.append(h("div", { class: "item ingredient" },
      box("amount", { placeholder: "2", "aria-label": "Amount", class: "in-amount" }),
      box("unit", { placeholder: "cups", "aria-label": "Unit", class: "in-unit" }),
      box("name", { placeholder: "flour", "aria-label": "Ingredient", class: "in-name" }),
      box("prep", { placeholder: "Prep, if any: diced, melted…", "aria-label": "Prep", class: "in-prep" }),
      iconButton("×", function () { removeIngredient(index); }, "Remove ingredient")));
  });

  return [
    h("h1", {}, "Ingredients"),
    h("p", { class: "lead" }, "List each one in the order the recipe gives them. Enter starts the next one."),
    list,
    addButton("+ Add ingredient", function () { addItem(recipe.ingredients, newIngredient()); })
  ];
}

// ---------- 3. Bowls ----------

function newBowl() { return { id: newId("b"), label: "", ingredientIds: [], minutes: null }; }

function removeBowl(index) {
  var bowl = recipe.bowls[index];
  var name = bowlName(bowl, recipe.bowls);
  remember(bowl.id);
  recipe.bowls.splice(index, 1);
  recipe.steps.forEach(function (s) {
    s.bowlIds = s.bowlIds.filter(function (x) { return x !== bowl.id; });
  });
  save();
  landNear(recipe.bowls, index);
  render();
  showToast("Removed " + name + ".");
}

// Enter in "Minutes to fill" goes to the next bowl, or starts a new one after the last.
function bowlMinutesEnter(e, index) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  var bowls = recipe.bowls;
  if (index < bowls.length - 1) focusBox(bowls[index + 1].id);
  else if (bowls[index].ingredientIds.length || norm(bowls[index].label)) addItem(bowls, newBowl());
}

function bowlsScreen() {
  var named = recipe.ingredients.filter(function (i) { return i.name && i.name.trim(); });
  if (!named.length) {
    return [
      h("h1", {}, "Mise en place bowls"),
      h("p", { class: "lead" }, "Add your ingredients first, then come back to group them."),
      addButton("← Go to ingredients", function () { goTo(1); })
    ];
  }
  ensureOne(recipe.bowls, newBowl);

  var inSomeBowl = {};
  recipe.bowls.forEach(function (b) { b.ingredientIds.forEach(function (id) { inSomeBowl[id] = b.id; }); });

  var list = h("div", { class: "items" });
  recipe.bowls.forEach(function (bowl, index) {
    // Only show ingredients that are free or already in this bowl.
    var choices = h("div", { class: "chips" });
    named.forEach(function (ing) {
      var owner = inSomeBowl[ing.id];
      if (owner && owner !== bowl.id) return;
      var key = bowl.id + "-" + ing.id;
      choices.append(chip(ingredientShort(ing), owner === bowl.id, function () {
        remember(key);
        if (owner === bowl.id) bowl.ingredientIds = bowl.ingredientIds.filter(function (x) { return x !== ing.id; });
        else bowl.ingredientIds.push(ing.id);
        save();
        focusAfterRender = key;
        render();
      }, key));
    });
    if (!choices.childNodes.length) {
      choices.append(h("span", { class: "field-hint" }, "Every ingredient is already in a bowl."));
    }

    var suggested = suggestBowlMinutes(bowl, recipe.ingredients);
    list.append(h("div", { class: "item" },
      h("div", { class: "item-head" },
        h("h2", {}, "Bowl " + (index + 1)),
        quietButton("Remove", function () { removeBowl(index); }, "Remove bowl " + (index + 1))),
      boundInput(bowl, "label", {
        placeholder: "Name it: dry, wet, sauce…", "aria-label": "Bowl name", "data-focus": bowl.id,
        onkeydown: function (e) {
          if (e.key !== "Enter") return;
          e.preventDefault();
          var first = choices.querySelector(".chip");
          if (first) first.focus();
        }
      }),
      h("div", { class: "field" },
        h("span", { class: "field-label" }, "What goes in it"),
        choices),
      field("Minutes to fill", h("input", {
        type: "number", min: "1", inputmode: "numeric", class: "in-qty", "data-focus": bowl.id + "-minutes",
        value: bowl.minutes == null ? suggested : bowl.minutes,
        oninput: function (e) { bowl.minutes = e.target.value === "" ? null : Number(e.target.value); save(); },
        onkeydown: function (e) { bowlMinutesEnter(e, index); }
      }), "Suggested: " + suggested + " min. Change it if you think it'll take longer.")));
  });

  var loose = named.filter(function (i) { return !inSomeBowl[i.id]; });
  return [
    h("h1", {}, "Mise en place bowls"),
    h("p", { class: "lead" }, "Group ingredients that get added at the same time."),
    list,
    addButton("+ Add bowl", function () { addItem(recipe.bowls, newBowl()); }),
    loose.length > 0 && h("p", { class: "note" },
      h("strong", {}, "Not in a bowl: "),
      loose.map(ingredientShort).join(", "),
      h("br"),
      h("span", { class: "field-hint" }, "That's fine. They'll be listed on their own."))
  ];
}

// ---------- 4. Steps ----------

function newStep() { return { id: newId("s"), text: "", minutes: "", handsOff: false, bowlIds: [], tools: [], after: "previous" }; }

function openStep(id, focusKey) {
  openStepId = id;
  focusAfterRender = focusKey || id;
  render();
}

function addStep() {
  var last = recipe.steps[recipe.steps.length - 1];
  remember(last && last.id);
  var step = newStep();
  recipe.steps.push(step);
  save();
  openStep(step.id);
}

function moveStep(index, by) {
  var steps = recipe.steps;
  var to = index + by;
  if (to < 0 || to >= steps.length) return;
  remember(steps[index].id);
  steps.splice(to, 0, steps.splice(index, 1)[0]);
  save();
  focusAfterRender = steps[to].id + (by < 0 ? "-up" : "-down");
  render();
}

function removeStep(index) {
  var step = recipe.steps[index];
  remember(step.id);
  recipe.steps.splice(index, 1);
  recipe.steps.forEach(function (s) { if (s.after === step.id) s.after = "previous"; });
  save();
  var next = recipe.steps[Math.min(index, recipe.steps.length - 1)];
  openStep(next ? next.id : null);
  showToast("Removed step " + (index + 1) + ".");
}

// Enter on an empty "Uses" box: on to the next step, or a new one after the last.
function nextStepFrom(index) {
  var next = recipe.steps[index + 1];
  if (next) openStep(next.id);
  else if (norm(recipe.steps[index].text)) addStep();
}

function hasMinutes(step) { return String(step.minutes == null ? "" : step.minutes).trim() !== ""; }

// The bowls and tools a step uses, by name.
function usesNames(step) {
  return step.bowlIds
    .map(function (id) { return recipe.bowls.find(function (b) { return b.id === id; }); })
    .filter(Boolean)
    .map(function (b) { return bowlName(b, recipe.bowls); })
    .concat(step.tools);
}

// A bowl by any of its names: "Bowl 2", "wet", or "Bowl 2 · wet".
function findBowl(text) {
  return recipe.bowls.find(function (b, i) {
    return sameName(text, bowlName(b, recipe.bowls)) || sameName(text, "Bowl " + (i + 1)) ||
      (norm(b.label) && sameName(text, b.label));
  });
}

// Adds a bowl or a tool to a step. Returns its tag, or null if the step already uses it.
function addUse(step, text) {
  var bowl = findBowl(text);
  if (bowl) {
    if (step.bowlIds.indexOf(bowl.id) !== -1) return null;
    remember(step.id + "-uses");
    step.bowlIds.push(bowl.id);
    return { label: bowlName(bowl, recipe.bowls), remove: function () {
      step.bowlIds = step.bowlIds.filter(function (x) { return x !== bowl.id; });
    } };
  }
  if (step.tools.some(function (t) { return sameName(t, text); })) return null;
  remember(step.id + "-uses");
  var tool = knownTools().find(function (t) { return sameName(t, text); }) || text;
  step.tools.push(tool);
  return { label: tool, remove: function () {
    step.tools = step.tools.filter(function (t) { return t !== tool; });
  } };
}

// A closed step: one line that opens it.
function stepLine(step, index) {
  var text = norm(step.text) ? step.text.trim() : null;
  var meta = [hasMinutes(step) ? step.minutes + " min" : "no minutes yet"];
  if (step.handsOff) meta.push("hands-off");
  var uses = usesNames(step);
  if (uses.length) meta.push(uses.join(", "));
  return h("button", {
    type: "button", class: "step-line", "data-focus": step.id + "-line",
    "aria-label": "Step " + (index + 1) + ": " + (text || "no words yet") + ". Open to edit.",
    onclick: function () { openStep(step.id); }
  },
    h("span", { class: "step-line-main" },
      h("span", { class: "step-line-text" }, (index + 1) + ". ", text || h("span", { class: "muted" }, "No words yet")),
      h("span", { class: "step-line-meta" }, meta.join(" · "))),
    h("span", { class: "step-line-edit", "aria-hidden": "true" }, "Edit"));
}

// "When step 3 is done (Melt the butter…)", so students needn't scroll up to check.
function doneOption(j) {
  var words = norm(recipe.steps[j].text) ? " (" + shorten(recipe.steps[j].text.trim(), 30) + ")" : "";
  return "When step " + (j + 1) + " is done" + words;
}

// The open step: what to do, its timing, and what it uses.
function stepCard(step, index) {
  var startsAfter = null;
  if (index > 0) {
    var select = h("select", {
      "aria-label": "Starts", "data-focus": step.id + "-after",
      onchange: function (e) { remember(step.id + "-after"); step.after = e.target.value; save(); }
    });
    select.append(h("option", { value: "previous" }, doneOption(index - 1)));
    for (var j = 0; j < index - 1; j++) {
      select.append(h("option", { value: recipe.steps[j].id }, doneOption(j)));
    }
    select.append(h("option", { value: "any" }, "Any time"));
    select.value = step.after || "previous";
    if (select.selectedIndex === -1) select.value = "previous";
    startsAfter = field("Starts", select);
  }

  var tags = [];
  step.bowlIds.forEach(function (id) {
    var bowl = recipe.bowls.find(function (b) { return b.id === id; });
    if (bowl) tags.push({ label: bowlName(bowl, recipe.bowls), remove: function () {
      step.bowlIds = step.bowlIds.filter(function (x) { return x !== id; });
    } });
  });
  step.tools.forEach(function (tool) {
    tags.push({ label: tool, remove: function () {
      step.tools = step.tools.filter(function (t) { return t !== tool; });
    } });
  });
  var suggestions = recipe.bowls
    .filter(function (b) { return step.bowlIds.indexOf(b.id) === -1; })
    .map(function (b) { return bowlName(b, recipe.bowls); })
    .concat(knownTools().filter(function (t) {
      return !step.tools.some(function (x) { return sameName(x, t); });
    }));

  return h("div", { class: "item step-open" },
    h("div", { class: "item-head" },
      h("h2", {}, "Step " + (index + 1)),
      h("div", { class: "item-tools" },
        index > 0 && iconButton("↑", function () { moveStep(index, -1); }, "Move step up", step.id + "-up"),
        index < recipe.steps.length - 1 && iconButton("↓", function () { moveStep(index, 1); }, "Move step down", step.id + "-down"),
        quietButton("Remove", function () { removeStep(index); }, "Remove step " + (index + 1)))),
    h("textarea", {
      rows: "2", placeholder: "Whisk the wet bowl into the dry bowl", "aria-label": "What to do",
      "data-focus": step.id,
      oninput: function (e) { step.text = e.target.value; save(); },
      onkeydown: function (e) {
        if (e.key !== "Enter" || e.shiftKey) return;
        e.preventDefault();
        focusBox(step.id + "-minutes");
      }
    }, step.text),
    // Minutes · Starts · Hands-off: one row on a wide screen, wrapping on a narrow one.
    h("div", { class: "timing" + (startsAfter ? "" : " timing-first") },
      field("Minutes", boundInput(step, "minutes", {
        type: "number", min: "0", inputmode: "numeric", "data-focus": step.id + "-minutes",
        onkeydown: function (e) {
          if (e.key !== "Enter") return;
          e.preventDefault();
          focusBox(step.id + "-uses");
        }
      })),
      startsAfter,
      h("label", { class: "check" },
        h("input", {
          type: "checkbox", checked: !!step.handsOff, "data-focus": step.id + "-handsoff",
          onchange: function (e) { remember(step.id + "-handsoff"); step.handsOff = e.target.checked; save(); }
        }),
        h("span", {},
          h("span", { class: "field-label" }, "Hands-off"),
          h("span", { class: "field-hint" }, "Baking, chilling, resting")))),
    tagBox({
      key: step.id + "-uses",
      label: "Uses",
      hint: "Bowls and tools. Type one, then Enter.",
      placeholder: "Bowl or tool…",
      tags: tags,
      suggestions: suggestions,
      add: function (text) { return addUse(step, text); },
      onEmptyEnter: function () { nextStepFrom(index); }
    }));
}

function extraToolsBox() {
  return tagBox({
    key: "extra",
    label: "Anything else to pull?",
    hint: "Towels, sanitizer bucket, cutting board…",
    placeholder: "Add a tool…",
    tags: recipe.extraTools.map(function (tool) {
      return { label: tool, remove: function () {
        recipe.extraTools = recipe.extraTools.filter(function (t) { return t !== tool; });
      } };
    }),
    add: function (text) {
      if (recipe.extraTools.some(function (t) { return sameName(t, text); })) return null;
      remember("extra");
      recipe.extraTools.push(text);
      return { label: text, remove: function () {
        recipe.extraTools = recipe.extraTools.filter(function (t) { return t !== text; });
      } };
    }
  });
}

function stepsScreen() {
  ensureOne(recipe.steps, newStep);
  if (!recipe.steps.some(function (s) { return s.id === openStepId; })) openStepId = recipe.steps[0].id;
  var list = h("div", { class: "items items-tight" });
  recipe.steps.forEach(function (step, index) {
    list.append(step.id === openStepId ? stepCard(step, index) : stepLine(step, index));
  });

  return [
    h("h1", {}, "Steps"),
    h("p", { class: "lead" }, "Each step in your own words. Short is fine."),
    list,
    addButton("+ Add step", addStep),
    h("div", { class: "extra-tools" }, extraToolsBox())
  ];
}

var SCREENS = [
  { name: "Recipe", render: recipeScreen },
  { name: "Ingredients", render: ingredientsScreen },
  { name: "Bowls", render: bowlsScreen },
  { name: "Steps", render: stepsScreen }
];
var GUIDE = SCREENS.length; // the lab guide comes after the last screen

function screenNamed(name) {
  return SCREENS.findIndex(function (s) { return s.name === name; });
}

// ---------- Frame: progress, screen, back/next ----------

// `focusFirst` puts the cursor in the new screen's first box: for keyboard users, who
// pressed Enter or Space rather than clicking (a click has e.detail of 1 or more).
function goTo(index, focusFirst) {
  update({ screen: Math.max(0, Math.min(GUIDE, index)) });
  window.scrollTo(0, 0);
  render();
  if (focusFirst) {
    var first = app.querySelector(".screen input, .screen textarea, .screen select, .guide-actions button");
    if (first) first.focus();
  }
}

// Every screen by name, plus the guide. Each one is a button, so students can jump around.
function progress(current) {
  var list = h("ol", { class: "progress-steps" });
  SCREENS.map(function (s) { return s.name; }).concat("Guide").forEach(function (name, i) {
    list.append(h("li", {},
      h("button", {
        type: "button", class: i <= current ? "done" : "", "data-focus": "progress-" + i,
        "aria-current": i === current ? "step" : null,
        onclick: function (e) { goTo(i, e.detail === 0); }
      }, name)));
  });
  return h("nav", { class: "progress", "aria-label": "Screens" }, list);
}

function nav(index) {
  var last = index === SCREENS.length - 1;
  return h("div", { class: "nav" },
    index > 0
      ? h("button", { type: "button", class: "button-quiet", onclick: function (e) { goTo(index - 1, e.detail === 0); } }, "← Back")
      : h("span"),
    h("button", { type: "button", class: "button-primary", onclick: function (e) { goTo(index + 1, e.detail === 0); } },
      last ? "See lab guide →" : "Next →"));
}

function render() {
  // Redrawing replaces every box, so keep the cursor where it was unless told otherwise.
  var active = document.activeElement;
  var keepFocus = active && app.contains(active) ? active.getAttribute("data-focus") : null;

  var index = recipe.screen || 0;
  if (index >= GUIDE) {
    app.replaceChildren(progress(GUIDE), guideView());
  } else {
    app.replaceChildren(progress(index), h("section", { class: "screen" }, ...SCREENS[index].render()), nav(index));
  }

  var key = focusAfterRender || keepFocus;
  focusAfterRender = null;
  if (key) {
    // "s12-up" falls back to "s12" if the up button is gone (the step moved to the top).
    var el = app.querySelector('[data-focus="' + key + '"]') ||
      app.querySelector('[data-focus="' + key.split("-")[0] + '"]');
    if (el) {
      el.focus({ preventScroll: flashAfterRender });
      if (flashAfterRender) flash(el);
    }
  }
  flashAfterRender = false;
}

// ---------- Undo ----------
// Ctrl+Z in a box you're typing in undoes the typing (the browser does that). Anywhere
// else it steps back one change: adding, removing, moving, picking, or a finished bit of
// typing. Each change is remembered as a copy of the recipe from just before it. Memory
// only: closing the page forgets it.

var undoStack = [];
var typedSinceLastChange = false; // typed in the current box since the last remembered change
var beforeTyping = null;          // the recipe as it was before that typing
var typingKey = null;             // which box it was

function pushUndo(snapshot, focusKey) {
  undoStack.push({ recipe: snapshot, focus: focusKey, openStep: openStepId });
  if (undoStack.length > 50) undoStack.shift();
}

// A finished bit of typing becomes one undoable change.
function commitTyping() {
  if (typedSinceLastChange && beforeTyping && beforeTyping !== JSON.stringify(recipe)) {
    pushUndo(beforeTyping, typingKey);
  }
  typedSinceLastChange = false;
  beforeTyping = null;
}

// Call just before changing the recipe (other than typing).
function remember(focusKey) {
  commitTyping();
  pushUndo(JSON.stringify(recipe), focusKey);
  hideToast();
}

function undo() {
  commitTyping();
  var last = undoStack.pop();
  if (!last) return;
  hideToast();
  recipe = JSON.parse(last.recipe);
  save();
  openStepId = last.openStep;
  confirmingNew = false;
  focusAfterRender = last.focus;
  flashAfterRender = true;
  render();
}

function isTextBox(el) {
  return el.matches && el.matches("textarea, input:not([type=checkbox]):not([type=radio])");
}

// Runs before the box's own handler saves, so the recipe is still as it was.
document.addEventListener("input", function (e) {
  if (!isTextBox(e.target)) return;
  if (!beforeTyping) {
    beforeTyping = JSON.stringify(recipe);
    typingKey = e.target.getAttribute("data-focus");
  }
  typedSinceLastChange = true;
  hideToast();
}, true);

document.addEventListener("focusout", function (e) {
  if (isTextBox(e.target)) commitTyping();
});

document.addEventListener("keydown", function (e) {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
  if (isTextBox(e.target) && typedSinceLastChange) return; // the browser undoes the typing
  e.preventDefault();
  undo();
});

// A short highlight so the eye finds what just came back.
function flash(el) {
  var target = el.closest(".item, .step-line, .tag-item, .chip") || el;
  target.scrollIntoView({ block: "center" });
  target.classList.remove("flash");
  void target.offsetWidth; // restart the animation
  target.classList.add("flash");
}

// "Removed flour. Undo" along the bottom, for a few seconds after something is removed.
var toast = document.getElementById("toast");
var toastTimer = null;

function showToast(message) {
  clearTimeout(toastTimer);
  toast.replaceChildren(
    h("span", {}, message),
    h("button", { type: "button", class: "toast-undo", onclick: function () { undo(); } }, "Undo"),
    h("span", { class: "toast-keys" }, "Ctrl+Z"));
  toast.classList.add("is-showing");
  toastTimer = setTimeout(hideToast, 8000);
}

function hideToast() {
  clearTimeout(toastTimer);
  toast.classList.remove("is-showing");
  toast.replaceChildren();
}

render();
