// The student flow: five short screens, then the lab guide. See docs/design.md.

var recipe = loadRecipe();
var app = document.getElementById("app");

// Small helper for building elements: h("p", { class: "hint" }, "Text").
function h(tag, attrs) {
  var el = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (key) {
    var value = attrs[key];
    if (key.slice(0, 2) === "on") el.addEventListener(key.slice(2), value);
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

function update(changes) {
  Object.assign(recipe, changes);
  saveRecipe(recipe);
}

// One labelled input. `hint` is an optional one-line helper under the label.
function field(label, input, hint) {
  return h("label", { class: "field" },
    h("span", { class: "field-label" }, label),
    hint && h("span", { class: "field-hint" }, hint),
    input);
}

// ---------- Screens ----------

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
    field("Recipe name", h("input", {
      type: "text", value: recipe.title, placeholder: "Buttermilk Pancakes",
      oninput: function (e) { update({ title: e.target.value }); }
    })),
    h("div", { class: "row" },
      field("Servings", h("input", {
        type: "number", min: "1", inputmode: "numeric", value: recipe.servings,
        oninput: function (e) { update({ servings: e.target.value }); }
      })),
      field("Class starts at", h("input", {
        type: "time", value: recipe.startTime,
        oninput: function (e) { update({ startTime: e.target.value }); }
      }))),
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

function comingSoon(title) {
  return function () {
    return [h("h1", {}, title), h("p", { class: "lead" }, "We'll build this screen next.")];
  };
}

var SCREENS = [
  { name: "Recipe", render: recipeScreen },
  { name: "Ingredients", render: comingSoon("Ingredients") },
  { name: "Equipment", render: comingSoon("Equipment") },
  { name: "Bowls", render: comingSoon("Mise en place bowls") },
  { name: "Steps", render: comingSoon("Steps") }
];

// ---------- Frame: progress, screen, back/next ----------

function goTo(index) {
  update({ screen: Math.max(0, Math.min(SCREENS.length - 1, index)) });
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
  app.replaceChildren(progress(index), h("section", { class: "screen" }, ...SCREENS[index].render()), nav(index));
}

render();
