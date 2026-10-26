// Builds the time plan from a recipe. See docs/data-model.md for the rules.
// All times are minutes from the start of class.

var SETUP_MINUTES = 5;
var CLEANUP_MINUTES = 10;
var COOK_LABELS = ["A", "B", "C", "D", "E"];

// Suggested minutes to fill a bowl: 1 per ingredient, +3 for each with a prep note, min 2.
function suggestBowlMinutes(bowl, ingredients) {
  var minutes = 0;
  bowl.ingredientIds.forEach(function (id) {
    var ing = ingredients.find(function (i) { return i.id === id; });
    if (!ing) return;
    minutes += 1;
    if (ing.prep && ing.prep.trim()) minutes += 3;
  });
  return Math.max(2, minutes);
}

function bowlMinutes(bowl, ingredients) {
  return bowl.minutes == null ? suggestBowlMinutes(bowl, ingredients) : bowl.minutes;
}

// "Bowl 2 · Wet": numbered by position, with the student's label if they gave one.
function bowlName(bowl, bowls) {
  var name = "Bowl " + (bowls.indexOf(bowl) + 1);
  return bowl.label && bowl.label.trim() ? name + " · " + bowl.label.trim() : name;
}

// Turns bowls and steps into one list of work tasks, in priority order:
// recipe order, with each bowl just before the first step that uses it.
function buildWorkTasks(recipe) {
  var tasks = [];
  var placedBowls = {};
  var bowlsById = {};
  recipe.bowls.forEach(function (b) { bowlsById[b.id] = b; });

  // An empty bowl has nothing to fill, so it isn't a task.
  function addBowl(bowl) {
    if (placedBowls[bowl.id] || !bowl.ingredientIds.length) return;
    placedBowls[bowl.id] = true;
    tasks.push({
      id: "fill-" + bowl.id,
      kind: "bowl",
      label: "Fill " + bowlName(bowl, recipe.bowls),
      minutes: bowlMinutes(bowl, recipe.ingredients),
      handsOff: false,
      bowlIds: [bowl.id],
      tools: [],
      waitsFor: []
    });
  }

  recipe.steps.forEach(function (step, index) {
    var waitsFor = [];
    (step.bowlIds || []).forEach(function (bowlId) {
      var bowl = bowlsById[bowlId];
      if (!bowl || !bowl.ingredientIds.length) return;
      addBowl(bowl);
      waitsFor.push("fill-" + bowl.id);
    });

    var after = step.after || "previous";
    if (after === "previous") {
      if (index > 0) waitsFor.push(recipe.steps[index - 1].id);
    } else if (after !== "any") {
      // Only earlier steps count; anything else would make a loop.
      var earlier = recipe.steps.slice(0, index).some(function (s) { return s.id === after; });
      if (earlier) waitsFor.push(after);
    }

    tasks.push({
      id: step.id,
      kind: "step",
      label: step.text,
      minutes: Math.max(0, Number(step.minutes) || 0),
      handsOff: !!step.handsOff,
      bowlIds: step.bowlIds || [],
      tools: step.tools || [],
      waitsFor: waitsFor
    });
  });

  // Bowls no step uses still need filling.
  recipe.bowls.forEach(addBowl);
  return tasks;
}

// For each task: its own minutes plus the longest chain of tasks waiting on it.
// Bigger means more of the recipe is held up until it's done.
function criticalPathMinutes(tasks) {
  var waitingOn = {};
  tasks.forEach(function (t) {
    t.waitsFor.forEach(function (id) { (waitingOn[id] = waitingOn[id] || []).push(t); });
  });
  var memo = {};
  function path(task) {
    if (memo[task.id] !== undefined) return memo[task.id];
    var longest = 0;
    (waitingOn[task.id] || []).forEach(function (next) { longest = Math.max(longest, path(next)); });
    return (memo[task.id] = task.minutes + longest);
  }
  tasks.forEach(path);
  return memo;
}

function schedule(recipe) {
  var cookCount = Math.min(5, Math.max(1, Number(recipe.cooks) || 1));
  var plan = [];
  var cookFreeAt = [];
  var endOf = {};

  for (var c = 0; c < cookCount; c++) {
    plan.push({ id: "setup-" + c, kind: "setup", label: "Wash hands and set up station",
      cook: COOK_LABELS[c], start: 0, end: SETUP_MINUTES, handsOff: false, bowlIds: [], tools: [] });
    cookFreeAt.push(SETUP_MINUTES);
  }

  var pending = buildWorkTasks(recipe);
  var pathMinutes = criticalPathMinutes(pending);
  var workDone = cookFreeAt.map(function () { return 0; });

  while (pending.length) {
    // Tasks whose prerequisites are all placed, with the time they become ready.
    var candidates = [];
    pending.forEach(function (task, index) {
      var readyAt = SETUP_MINUTES;
      for (var j = 0; j < task.waitsFor.length; j++) {
        var end = endOf[task.waitsFor[j]];
        if (end === undefined) return;
        readyAt = Math.max(readyAt, end);
      }
      candidates.push({ task: task, index: index, readyAt: readyAt });
    });

    // The next moment a cook is free and a task is ready.
    var now = Math.max(Math.min.apply(null, cookFreeAt),
      Math.min.apply(null, candidates.map(function (x) { return x.readyAt; })));

    // Of the tasks ready now, take the one holding up the most work; ties go to recipe order.
    var pick = candidates
      .filter(function (x) { return x.readyAt <= now; })
      .reduce(function (best, x) {
        return pathMinutes[x.task.id] > pathMinutes[best.task.id] ? x : best;
      });

    // Of the cooks free now, give it to whoever has done the least work so far.
    var cook = -1;
    for (var i = 0; i < cookCount; i++) {
      if (cookFreeAt[i] > now) continue;
      if (cook === -1 || workDone[i] < workDone[cook]) cook = i;
    }

    var start = now;
    var task = pick.task;
    var end = start + task.minutes;
    endOf[task.id] = end;
    cookFreeAt[cook] = task.handsOff ? start : end;
    if (!task.handsOff) workDone[cook] += task.minutes;
    plan.push({ id: task.id, kind: task.kind, label: task.label, cook: COOK_LABELS[cook],
      start: start, end: end, handsOff: task.handsOff, bowlIds: task.bowlIds, tools: task.tools });
    pending.splice(pick.index, 1);
  }

  var lastEnd = plan.reduce(function (m, t) { return Math.max(m, t.end); }, SETUP_MINUTES);
  for (var k = 0; k < cookCount; k++) {
    plan.push({ id: "cleanup-" + k, kind: "cleanup", label: "Clean and sanitize station",
      cook: COOK_LABELS[k], start: lastEnd, end: lastEnd + CLEANUP_MINUTES, handsOff: false, bowlIds: [], tools: [] });
  }

  plan.sort(function (a, b) { return a.start - b.start || a.cook.localeCompare(b.cook); });
  var total = lastEnd + CLEANUP_MINUTES;
  var available = Number(recipe.minutesAvailable) || 0;
  return { tasks: plan, totalMinutes: total, overrunMinutes: Math.max(0, total - available) };
}

function isRoutine(task) { return task.kind === "setup" || task.kind === "cleanup"; }

// Lays the plan out as the lab guide's team table: one row for each moment something
// starts, with a cell per cook and one for hands-off work. For a team, setup and cleanup
// are one "everyone" row. Also marks when class ends (if the plan runs over) and when
// everything is done.
//
// A cook's task is one cell that stretches down over every row it lasts (like merged
// cells in a spreadsheet), so a long task reads as one block:
//   { tasks, span }  the task(s) starting here, covering `span` rows from this one
//   { covered: true } a row the cell above already stretches over (draw nothing)
//   {}               free
// Hands-off tasks don't stretch; they sit at their start, and the guide says when they're ready.
function planTable(plan, cookCount) {
  var cooks = COOK_LABELS.slice(0, cookCount);
  var team = cookCount > 1;
  var times = [];
  plan.tasks.forEach(function (t) { if (times.indexOf(t.start) === -1) times.push(t.start); });
  times.sort(function (a, b) { return a - b; });

  var rows = [];
  times.forEach(function (time) {
    var starting = plan.tasks.filter(function (t) { return t.start === time; });
    var routine = team ? starting.filter(isRoutine) : [];
    var everyone = routine.length ? { kind: "everyone", time: time, task: routine[0] } : null;
    // Setup comes before anything else at its time; cleanup after.
    if (everyone && routine[0].kind === "setup") rows.push(everyone);
    if (routine.length < starting.length) rows.push({ kind: "tasks", time: time });
    if (everyone && routine[0].kind === "cleanup") rows.push(everyone);
  });

  // "Class ends" is a row of its own, so a task running past it visibly crosses the line.
  if (plan.overrunMinutes > 0) {
    var ends = plan.totalMinutes - plan.overrunMinutes;
    var mark = { kind: "classEnds", time: ends };
    var at = rows.findIndex(function (r) { return r.time >= ends; });
    if (at === -1) rows.push(mark); else rows.splice(at, 0, mark);
  }
  rows.push({ kind: "done", time: plan.totalMinutes });

  function hasCells(row) { return row && (row.kind === "tasks" || row.kind === "classEnds"); }
  rows.forEach(function (row) {
    if (!hasCells(row)) return;
    row.cells = cooks.map(function () { return {}; });
    var handsOff = plan.tasks.filter(function (t) { return t.handsOff && t.start === row.time; });
    row.handsOff = row.kind === "tasks" && handsOff.length ? { tasks: handsOff } : {};
  });

  cooks.forEach(function (cook, c) {
    var mine = plan.tasks.filter(function (t) {
      return t.cook === cook && !t.handsOff && !(team && isRoutine(t));
    });
    rows.forEach(function (row, i) {
      if (row.kind !== "tasks" || row.cells[c].covered) return;
      var starting = mine.filter(function (t) { return t.start === row.time; });
      if (!starting.length) return;
      var end = Math.max.apply(null, starting.map(function (t) { return t.end; }));
      var span = 1;
      while (hasCells(rows[i + span]) && rows[i + span].time < end) {
        rows[i + span].cells[c] = { covered: true };
        span++;
      }
      row.cells[c] = { tasks: starting, span: span };
    });
  });

  return {
    cooks: cooks,
    handsOff: plan.tasks.some(function (t) { return t.handsOff; }),
    rows: rows
  };
}

if (typeof module !== "undefined") {
  module.exports = { schedule: schedule, planTable: planTable, suggestBowlMinutes: suggestBowlMinutes };
}
