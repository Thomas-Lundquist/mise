// The lab guide: equipment, mise en place, time plan. Built to print. See docs/design.md.
// Uses h(), recipe, goTo() and friends from app.js.

// Drop rows the student left blank so they don't clutter the guide.
function filledRecipe() {
  var ingredients = recipe.ingredients.filter(function (i) { return i.name && i.name.trim(); });
  var ids = ingredients.map(function (i) { return i.id; });
  return Object.assign({}, recipe, {
    ingredients: ingredients,
    equipment: recipe.equipment.filter(function (e) { return e.name && e.name.trim(); }),
    bowls: recipe.bowls.map(function (b) {
      return Object.assign({}, b, { ingredientIds: b.ingredientIds.filter(function (id) { return ids.indexOf(id) !== -1; }) });
    }),
    steps: recipe.steps.filter(function (s) { return s.text && s.text.trim(); })
  });
}

// Minutes from the start of class, as a clock time ("9:20") if we know when class starts.
function clock(minutes) {
  var match = /^(\d{1,2}):(\d{2})/.exec(recipe.startTime || "");
  if (!match) {
    return Math.floor(minutes / 60) + ":" + String(minutes % 60).padStart(2, "0");
  }
  var total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  var hours = Math.floor(total / 60) % 24;
  return (hours % 12 || 12) + ":" + String(total % 60).padStart(2, "0");
}

// Setup and cleanup are the same for every cook, so show each as one "Everyone" row.
function planRows(tasks, cookCount) {
  var rows = [];
  var seen = {};
  tasks.forEach(function (t) {
    if ((t.kind === "setup" || t.kind === "cleanup") && cookCount > 1) {
      if (seen[t.kind]) return;
      seen[t.kind] = true;
      rows.push(Object.assign({}, t, { cook: "All" }));
    } else {
      rows.push(t);
    }
  });
  return rows;
}

function guideView() {
  var r = filledRecipe();
  var cookCount = Number(r.cooks) || 1;
  var plan = schedule(r);
  var bowlsById = {};
  r.bowls.forEach(function (b) { bowlsById[b.id] = b; });

  // Header and summary
  var details = [];
  if (r.servings) details.push("Serves " + r.servings);
  details.push(cookCount === 1 ? "Solo" : "Team of " + cookCount);

  var summary = h("p", { class: "summary" },
    (r.startTime ? "Starts " + clock(0) + " · Done by " + clock(plan.totalMinutes) + " · " : "") +
    plan.totalMinutes + " of " + r.minutesAvailable + " minutes");

  var fit = plan.overrunMinutes > 0
    ? h("p", { class: "warning" },
        h("strong", {}, plan.overrunMinutes + " minutes over. "),
        "Look for steps that could start earlier, or split up long ones.")
    : null;

  // 1. Equipment
  var equipment = h("ul", { class: "checklist" });
  r.equipment.forEach(function (e) {
    equipment.append(h("li", {}, (e.qty > 1 ? e.qty + " × " : "") + e.name));
  });

  // 2. Mise en place
  var mise = h("div", { class: "bowls" });
  var inBowl = {};
  r.bowls.forEach(function (bowl) {
    if (!bowl.ingredientIds.length) return;
    var lines = h("ul", { class: "checklist" });
    bowl.ingredientIds.forEach(function (id) {
      inBowl[id] = true;
      var ing = r.ingredients.find(function (i) { return i.id === id; });
      lines.append(h("li", {}, ingredientLine(ing)));
    });
    mise.append(h("div", { class: "bowl" }, h("h3", {}, bowlName(bowl, r.bowls)), lines));
  });
  var loose = r.ingredients.filter(function (i) { return !inBowl[i.id]; });
  if (loose.length) {
    var looseList = h("ul", { class: "checklist" });
    loose.forEach(function (i) { looseList.append(h("li", {}, ingredientLine(i))); });
    mise.append(h("div", { class: "bowl" }, h("h3", {}, r.bowls.length ? "On their own" : "Ingredients"), looseList));
  }

  // 3. Time plan
  var table = h("table", { class: "plan" },
    h("thead", {}, h("tr", {},
      h("th", {}, "Time"),
      cookCount > 1 && h("th", {}, "Who"),
      h("th", {}, "Task"),
      h("th", { class: "num" }, "Min"))));
  var body = h("tbody");
  planRows(plan.tasks, cookCount).forEach(function (t) {
    var bowls = t.kind === "step" && t.bowlIds.length
      ? t.bowlIds.map(function (id) { return bowlsById[id] && bowlName(bowlsById[id], r.bowls); }).filter(Boolean)
      : [];
    body.append(h("tr", { class: t.kind === "step" || t.kind === "bowl" ? "" : "routine" },
      h("td", { class: "time" }, clock(t.start)),
      cookCount > 1 && h("td", {}, t.cook),
      h("td", {},
        t.label,
        t.handsOff && h("span", { class: "tag" }, "hands-off"),
        bowls.length > 0 && h("span", { class: "uses" }, "Uses " + bowls.join(", "))),
      h("td", { class: "num" }, String(t.end - t.start))));
  });
  table.append(body);

  return h("article", { class: "guide" },
    h("div", { class: "guide-actions" },
      h("button", { type: "button", class: "button-quiet", onclick: function () { goTo(SCREENS.length - 1); } }, "← Edit"),
      h("button", { type: "button", class: "button-primary", onclick: function () { window.print(); } }, "Print")),
    h("p", { class: "eyebrow" }, "Lab guide"),
    h("h1", {}, r.title || "Your recipe"),
    h("p", { class: "lead" }, details.join(" · ")),
    summary,
    fit,
    h("section", { class: "guide-section" },
      h("h2", {}, "1. Equipment"),
      r.equipment.length ? equipment : h("p", { class: "field-hint" }, "None listed.")),
    h("section", { class: "guide-section" },
      h("h2", {}, "2. Mise en place"),
      r.ingredients.length ? mise : h("p", { class: "field-hint" }, "No ingredients yet.")),
    h("section", { class: "guide-section" },
      h("h2", {}, "3. Time plan"),
      table),
    newRecipeControl());
}

// "Start a new recipe" asks for a second tap instead of a pop-up.
var confirmingNew = false;
function newRecipeControl() {
  var box = h("div", { class: "new-recipe" });
  if (!confirmingNew) {
    box.append(h("button", { type: "button", class: "button-small", onclick: function () {
      confirmingNew = true; render();
    } }, "Start a new recipe"));
  } else {
    box.append(
      h("span", {}, "This clears everything you entered. "),
      h("button", { type: "button", class: "button-small danger", onclick: function () {
        confirmingNew = false;
        recipe = emptyRecipe();
        save();
        goTo(0);
      } }, "Yes, clear it"),
      h("button", { type: "button", class: "button-small", onclick: function () {
        confirmingNew = false; render();
      } }, "Cancel"));
  }
  return box;
}
