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

// What a step uses, by name: its bowls, then its tools. Setup and cleanup use nothing.
function usesOf(task, r) {
  if (task.kind !== "step") return [];
  return task.bowlIds
    .map(function (id) {
      var bowl = r.bowls.find(function (b) { return b.id === id; });
      return bowl && bowlName(bowl, r.bowls);
    })
    .filter(Boolean)
    .concat(task.tools || []);
}

// ---------- Time plan: the team table ----------
// One row per moment something starts; a column per cook. See planTable() in schedule.js.

function planView(plan, r, cookCount) {
  var table = planTable(plan, cookCount);
  var team = cookCount > 1;
  var columns = table.cooks.length + (table.handsOff ? 1 : 0);

  // "6 min", or "6 min · until 9:26" for a task that stretches over more than one row.
  // Hands-off: "10 min · ready 9:39".
  function taskEl(task, opts) {
    opts = opts || {};
    var uses = usesOf(task, r);
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
        oninput: function (e) {
          cookNames[c] = e.target.value;
          // Copy the name onto the printed report's name lines as it's typed.
          document.querySelectorAll('[data-cook-name="' + label + '"]').forEach(function (line) {
            line.textContent = e.target.value;
          });
        }
      })));
  });
  return h("div", { class: "cook-names" },
    h("p", { class: "field-label" }, "Who's who?"),
    h("p", { class: "field-hint" }, "Type names for the printout, or write them in by hand. Names are never saved."),
    grid);
}

// ---------- The printed report ----------
// What Print gives you, built for paper (letter, black and white). Hidden on screen.
// Page 1, the station sheet, is posted at the station. Page 2 holds a run sheet per
// cook, to cut apart, and an "After the lab" reflection.

function cookName(label, team) { return team ? "Cook " + label : "You"; }

// A line to write a cook's name on, filled in if a name was typed in "Who's who?".
function nameLine(label) {
  return h("span", { class: "name-line", "data-cook-name": label }, cookNames[COOK_LABELS.indexOf(label)] || "");
}

function stationSheet(r, plan, cookCount) {
  var team = cookCount > 1;
  var available = Number(r.minutesAvailable) || 0;
  var spare = available - plan.totalMinutes;

  // Without a class start time there are no clock times to show, only minutes.
  var when = r.startTime
    ? [h("p", { class: "soft" }, "Class " + clock(0) + "–" + clock(available)),
       h("p", { class: "big" }, "Done by " + clock(plan.totalMinutes))]
    : [h("p", { class: "soft" }, available + " min class"),
       h("p", { class: "big" }, "Takes " + plan.totalMinutes + " min")];
  when.push(spare >= 0
    ? h("p", { class: "soft" }, plan.totalMinutes + " of " + available + " min · " + spare + " to spare")
    : h("p", { class: "over" }, -spare + " minutes over"));

  var details = [r.servings && "Serves " + r.servings, team ? "Team of " + cookCount : "Solo"];
  var sheet = h("div", { class: "sheet" },
    h("header", { class: "sheet-head" },
      h("div", {},
        h("p", { class: "eyebrow" }, "Lab guide"),
        h("h1", {}, r.title || "Your recipe"),
        h("p", { class: "soft" }, details.filter(Boolean).join(" · "))),
      h("div", { class: "when" }, ...when)));

  if (team) {
    var names = h("div", { class: "names" });
    COOK_LABELS.slice(0, cookCount).forEach(function (label) {
      names.append(h("p", {}, "Cook " + label + ": ", nameLine(label)));
    });
    sheet.append(names);
  }

  // Pull list
  var pull = h("ul", { class: "checks" });
  equipmentList(r).forEach(function (name) { pull.append(h("li", {}, name)); });

  // Mise en place: each bowl with who fills it and when.
  var bowls = h("div", { class: "report-bowls" });
  var inBowl = {};
  r.bowls.forEach(function (bowl) {
    if (!bowl.ingredientIds.length) return;
    var fill = plan.tasks.find(function (t) { return t.id === "fill-" + bowl.id; });
    var lines = h("ul", { class: "checks" });
    bowl.ingredientIds.forEach(function (id) {
      inBowl[id] = true;
      lines.append(h("li", {}, ingredientLine(r.ingredients.find(function (i) { return i.id === id; }))));
    });
    bowls.append(h("div", { class: "report-bowl" },
      h("h3", {}, bowlName(bowl, r.bowls)),
      fill && h("p", { class: "who" },
        (team ? cookName(fill.cook, team) + " · " : "") + clock(fill.start) + " · " + (fill.end - fill.start) + " min"),
      lines));
  });
  var loose = r.ingredients.filter(function (i) { return !inBowl[i.id]; });
  if (loose.length) {
    var looseList = h("ul", { class: "checks" });
    loose.forEach(function (i) { looseList.append(h("li", {}, ingredientLine(i))); });
    bowls.append(h("div", { class: "report-bowl" },
      h("h3", {}, bowls.childNodes.length ? "On their own" : "Ingredients"), looseList));
  }

  sheet.append(
    h("div", { class: "sheet-top" },
      h("section", {}, h("h2", {}, "Pull"), pull),
      h("section", {}, h("h2", {}, "Mise en place"), bowls)),
    h("section", {}, h("h2", {}, "Time plan"), planView(plan, r, cookCount)));
  return sheet;
}

// One cook's own list, in order: their tasks, the hands-off things they start (with a
// timer note), and any free stretch long enough to clean as you go.
function runItems(cook, r, plan, team) {
  var items = [];
  var mine = plan.tasks.filter(function (t) { return t.cook === cook; });
  mine.forEach(function (t) {
    if (t.handsOff) {
      items.push({ time: t.start, order: 0, label: "Start: " + t.label,
        note: "Hands-off · set a timer for " + (t.end - t.start) + " min (ready " + clock(t.end) + ")" });
    } else {
      var uses = usesOf(t, r);
      items.push({ time: t.start, order: 1, label: t.label, minutes: t.end - t.start,
        routine: isRoutine(t), note: uses.length ? "Uses " + uses.join(", ") : null });
    }
  });
  // Free stretches of 5 minutes or more between hands-on tasks.
  var handsOn = mine.filter(function (t) { return !t.handsOff; }).sort(function (a, b) { return a.start - b.start; });
  for (var i = 1; i < handsOn.length; i++) {
    var from = handsOn[i - 1].end, to = handsOn[i].start;
    if (to - from >= 5) {
      items.push({ time: from, order: 2, free: true, label: "Free until " + clock(to),
        note: team ? "Help a teammate, or clean as you go" : "Clean as you go" });
    }
  }
  return items.sort(function (a, b) { return a.time - b.time || a.order - b.order; });
}

function runSheet(cook, r, plan, team) {
  var handsOnMinutes = plan.tasks
    .filter(function (t) { return t.cook === cook && !t.handsOff; })
    .reduce(function (sum, t) { return sum + t.end - t.start; }, 0);
  var body = h("tbody");
  runItems(cook, r, plan, team).forEach(function (it) {
    var timed = it.minutes != null;
    body.append(h("tr", { class: it.free ? "free" : (it.routine ? "routine" : null) },
      h("td", { class: it.free ? null : "box" }),
      h("td", { class: "time" }, clock(it.time)),
      h("td", {}, it.label, it.note && h("span", { class: "run-note" }, it.note)),
      h("td", { class: "planned" }, timed ? it.minutes + " min" : ""),
      h("td", { class: timed ? "actual" : null })));
  });
  return h("div", { class: "run" + (team ? "" : " solo") },
    h("div", { class: "run-head" },
      h("h3", {}, team ? cookName(cook, team) : "Your run sheet", team && nameLine(cook)),
      h("p", { class: "soft small" }, (r.title || "Your recipe") + " · " + handsOnMinutes + " min hands-on")),
    h("table", { class: "run-table" },
      h("thead", {}, h("tr", {},
        h("th", {}), h("th", {}, "Time"), h("th", {}, "Task"),
        h("th", { class: "planned" }, "Plan"), h("th", {}, "Actual"))),
      body));
}

function runSheets(r, plan, cookCount) {
  var team = cookCount > 1;
  var sheet = h("div", { class: "sheet" },
    h("h2", {}, team ? "Run sheets" : "Run sheet"),
    h("p", { class: "cut-note soft" }, team
      ? "Cut along the dashed lines. Each cook keeps their own. Check off each task and write how long it really took."
      : "Check off each task and write how long it really took."));
  COOK_LABELS.slice(0, cookCount).forEach(function (cook) { sheet.append(runSheet(cook, r, plan, team)); });
  sheet.append(h("div", { class: "reflect" },
    h("h2", {}, "After the lab"),
    h("p", {}, "Planned " + plan.totalMinutes + " min. Actual: ", h("span", { class: "blank" }), " min."),
    h("p", {}, "Which step took longer than you planned? Why?"),
    h("div", { class: "line" }), h("div", { class: "line" }),
    h("p", {}, "What will you do differently next time?"),
    h("div", { class: "line" }), h("div", { class: "line" })));
  return sheet;
}

function labReport(r, plan, cookCount) {
  return h("div", { class: "report" }, stationSheet(r, plan, cookCount), runSheets(r, plan, cookCount));
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
    h("p", { class: "field-hint print-hint" }, "Prints a station sheet to post and run sheets to cut apart."),
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
    newRecipeControl(),
    labReport(r, plan, cookCount));
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
