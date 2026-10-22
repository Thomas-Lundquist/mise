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

// Turns bowls and steps into one list of work tasks, in priority order:
// recipe order, with each bowl just before the first step that uses it.
function buildWorkTasks(recipe) {
  var tasks = [];
  var placedBowls = {};
  var bowlsById = {};
  recipe.bowls.forEach(function (b) { bowlsById[b.id] = b; });

  function addBowl(bowl) {
    if (placedBowls[bowl.id]) return;
    placedBowls[bowl.id] = true;
    tasks.push({
      id: "fill-" + bowl.id,
      kind: "bowl",
      label: "Fill bowl: " + (bowl.label || "Bowl"),
      minutes: bowlMinutes(bowl, recipe.ingredients),
      handsOff: false,
      bowlIds: [bowl.id],
      waitsFor: []
    });
  }

  recipe.steps.forEach(function (step, index) {
    var waitsFor = [];
    (step.bowlIds || []).forEach(function (bowlId) {
      var bowl = bowlsById[bowlId];
      if (!bowl) return;
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
      cook: COOK_LABELS[c], start: 0, end: SETUP_MINUTES, handsOff: false, bowlIds: [] });
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
      start: start, end: end, handsOff: task.handsOff, bowlIds: task.bowlIds });
    pending.splice(pick.index, 1);
  }

  var lastEnd = plan.reduce(function (m, t) { return Math.max(m, t.end); }, SETUP_MINUTES);
  for (var k = 0; k < cookCount; k++) {
    plan.push({ id: "cleanup-" + k, kind: "cleanup", label: "Clean and sanitize station",
      cook: COOK_LABELS[k], start: lastEnd, end: lastEnd + CLEANUP_MINUTES, handsOff: false, bowlIds: [] });
  }

  plan.sort(function (a, b) { return a.start - b.start || a.cook.localeCompare(b.cook); });
  var total = lastEnd + CLEANUP_MINUTES;
  var available = Number(recipe.minutesAvailable) || 0;
  return { tasks: plan, totalMinutes: total, overrunMinutes: Math.max(0, total - available) };
}

if (typeof module !== "undefined") {
  module.exports = { schedule: schedule, suggestBowlMinutes: suggestBowlMinutes };
}
