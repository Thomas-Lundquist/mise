// The lab guide: equipment, mise en place, time plan. Built to print. See docs/design.md.
// Uses h(), recipe, goTo() and friends from app.js.

// Drop rows the student left blank so they don't clutter the guide.
function filledRecipe() {
  var ingredients = recipe.ingredients.filter(function (i) { return i.name && i.name.trim(); });
  var ids = ingredients.map(function (i) { return i.id; });
  return Object.assign({}, recipe, {
    ingredients: ingredients,
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

// Everything to pull: tools from the steps in order of first use, the extras, then the
// mise en place bowls.
function equipmentList(r) {
  var items = knownTools(r);
  var bowls = r.bowls.filter(function (b) { return b.ingredientIds.length; }).length;
  if (bowls) items.push(bowls + (bowls === 1 ? " small bowl" : " small bowls") + " for mise en place");
  return items;
}

// Things the student probably meant to fill in, each with where to fix it.
// Shown on screen, never printed.
function recipeGaps(r) {
  var gaps = [];
  var steps = screenNamed("Steps");
  recipe.steps.forEach(function (s, i) {
    var name = "Step " + (i + 1);
    if (norm(s.text) && !hasMinutes(s)) {
      gaps.push({ text: name + " has no minutes.", screen: steps, step: s.id, focus: s.id + "-minutes" });
    } else if (!norm(s.text) && (hasMinutes(s) || s.tools.length || s.bowlIds.length)) {
      gaps.push({ text: name + " has no words, so it's left out.", screen: steps, step: s.id, focus: s.id });
    }
  });
  // An empty bowl only matters if the student named it or a step uses it.
  r.bowls.forEach(function (b) {
    var used = recipe.steps.some(function (s) { return s.bowlIds.indexOf(b.id) !== -1; });
    if (!b.ingredientIds.length && (norm(b.label) || used)) {
      gaps.push({ text: bowlName(b, r.bowls) + " is empty.", screen: screenNamed("Bowls"), focus: b.id });
    }
  });
  return gaps;
}

function gapsNote(gaps) {
  if (!gaps.length) return null;
  var list = h("ul");
  gaps.forEach(function (g) {
    list.append(h("li", {}, h("button", {
      type: "button", class: "link",
      onclick: function () {
        if (g.step) openStepId = g.step;
        focusAfterRender = g.focus;
        goTo(g.screen);
      }
    }, g.text)));
  });
  return h("div", { class: "gaps" }, h("strong", {}, "Before you print"), list);
}

// ---------- Time plan: the team table ----------
// One row per moment something starts; a column per cook. See planTable() in schedule.js.

function planView(plan, r, cookCount) {
  var table = planTable(plan, cookCount);
  var team = cookCount > 1;
  var columns = table.cooks.length + (table.handsOff ? 1 : 0);
  var bowlsById = {};
  r.bowls.forEach(function (b) { bowlsById[b.id] = b; });

  // "6 min", or "6 min · until 9:26" for a task that stretches over more than one row.
  // Hands-off: "10 min · ready 9:39".
  function taskEl(task, opts) {
    opts = opts || {};
    var uses = task.kind !== "step" ? [] : task.bowlIds
      .map(function (id) { return bowlsById[id] && bowlName(bowlsById[id], r.bowls); })
      .filter(Boolean)
      .concat(task.tools || []);
    var minutes = (task.end - task.start) + " min";
    if (task.handsOff) minutes += " · ready " + clock(task.end);
    else if (opts.long) minutes += " · until " + clock(task.end);
    return h("div", { class: "task" + (isRoutine(task) ? " routine" : "") },
      task.label, " ",
      h("span", { class: "task-min" }, minutes),
      opts.note && h("span", { class: "uses" }, opts.note),
      uses.length > 0 && h("span", { class: "uses" }, "Uses " + uses.join(", ")));
  }

  // Returns null for a row the cell above already stretches over.
  function cell(c, handsOff) {
    if (c.covered) return null;
    if (!c.tasks) return h("td");
    var td = h("td", { class: handsOff ? "handsoff-cell" : "task-cell", rowspan: c.span > 1 ? String(c.span) : null });
    c.tasks.forEach(function (t) {
      td.append(taskEl(t, { long: c.span > 1, note: handsOff && team ? "Cook " + t.cook + " starts it" : null }));
    });
    return td;
  }

  var head = h("tr", {}, h("th", { class: "time" }, "Time"));
  table.cooks.forEach(function (c) { head.append(h("th", {}, team ? "Cook " + c : "Task")); });
  if (table.handsOff) head.append(h("th", {}, "Hands-off"));

  var body = h("tbody");
  table.rows.forEach(function (row) {
    var time = h("td", { class: "time" }, clock(row.time));
    if (row.kind === "done") {
      body.append(h("tr", { class: "done" }, time, h("td", { colspan: String(columns) }, "Done")));
    } else if (row.kind === "everyone") {
      body.append(h("tr", {}, time,
        h("td", { colspan: String(table.cooks.length) }, taskEl(row.task, { note: "Everyone" })),
        table.handsOff && h("td")));
    } else {
      // A "class ends" row has cells too: a task running past the end of class stretches
      // right through it.
      var tr = h("tr", { class: row.kind === "classEnds" ? "class-ends" : null },
        row.kind === "classEnds" ? h("td", { class: "time" }, clock(row.time), h("span", { class: "uses" }, "Class ends")) : time);
      row.cells.concat(table.handsOff ? [row.handsOff] : []).forEach(function (c, i) {
        var td = cell(c, i === row.cells.length);
        if (td) tr.append(td);
      });
      body.append(tr);
    }
  });

  return h("div", { class: "plan-scroll" + (team ? " is-wide" : "") },
    h("table", { class: "plan", style: team ? "min-width:" + (4 + columns * 9) + "rem" : null },
      h("thead", {}, head), body),
    team && h("p", { class: "field-hint" }, "A long task stretches down through the rows it lasts. Blank means free."));
}

// Typed on the guide for the printout only. Never saved: gone when the page closes.
var cookNames = [];

function cookNamesBox(cookCount) {
  var grid = h("div", { class: "cook-names-grid" });
  COOK_LABELS.slice(0, cookCount).forEach(function (label, c) {
    grid.append(h("label", { class: "cook-name" },
      h("span", {}, "Cook " + label + ":"),
      h("input", {
        type: "text", value: cookNames[c] || "", autocomplete: "off", "data-focus": "cook-" + c,
        oninput: function (e) { cookNames[c] = e.target.value; }
      })));
  });
  return h("div", { class: "cook-names" },
    h("p", { class: "field-label" }, "Who's who?"),
    h("p", { class: "field-hint" }, "Type names for the printout, or write them in by hand. Names are never saved."),
    grid);
}

function guideView() {
  var r = filledRecipe();
  var cookCount = Number(r.cooks) || 1;
  var plan = schedule(r);
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
  var tools = equipmentList(r);
  var equipment = h("ul", { class: "checklist" });
  tools.forEach(function (name) { equipment.append(h("li", {}, name)); });

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
    mise.append(h("div", { class: "bowl" }, h("h3", {}, mise.childNodes.length ? "On their own" : "Ingredients"), looseList));
  }

  return h("article", { class: "guide" },
    h("div", { class: "guide-actions" },
      h("p", { class: "eyebrow" }, "Lab guide"),
      h("button", { type: "button", class: "button-primary", onclick: function () { window.print(); } }, "Print")),
    h("h1", {}, r.title || "Your recipe"),
    h("p", { class: "lead" }, details.join(" · ")),
    summary,
    fit,
    gapsNote(recipeGaps(r)),
    // Side by side on a wide screen; stacked on a phone and on paper.
    h("div", { class: "guide-top" },
      h("section", { class: "guide-section" },
        h("h2", {}, "1. Equipment"),
        tools.length ? equipment : h("p", { class: "field-hint" }, "None listed. Add tools to your steps.")),
      h("section", { class: "guide-section" },
        h("h2", {}, "2. Mise en place"),
        r.ingredients.length ? mise : h("p", { class: "field-hint" }, "No ingredients yet."))),
    h("section", { class: "guide-section guide-plan" },
      h("h2", {}, "3. Time plan"),
      cookCount > 1 && cookNamesBox(cookCount),
      planView(plan, r, cookCount)),
    newRecipeControl());
}

// "Start a new recipe" asks for a second tap instead of a pop-up, and can be undone.
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
        remember(null);
        recipe = emptyRecipe();
        openStepId = null;
        save();
        goTo(0);
        showToast("Cleared the recipe.");
      } }, "Yes, clear it"),
      h("button", { type: "button", class: "button-small", onclick: function () {
        confirmingNew = false; render();
      } }, "Cancel"));
  }
  return box;
}
