// The scheduler.
//
// Students type their steps forward, in the order the recipe is written. Every
// check below builds a plan that way — nothing is hand-placed unless the test
// says so — because the whole promise of the guided board is that it comes out
// right without the student arranging anything.

import {
  createPlan, createStep, appendStep, createEquipment, addRecipe, cookCount, windowOpens,
  addSegment, stepMins, handsMins,
} from "../js/model.js";
import {
  resolveSchedule, computeConflicts, applyGuidedSchedule, resolvedFoodUp,
  planSpan, laneForStep,
} from "../js/schedule.js";
import { equipmentById } from "../js/model.js";
import { minutesToClock } from "../js/time.js";

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL  ${label}\n      got      ${a}\n      expected ${e}`); }
  else console.log(`ok    ${label}  ${a}`);
}

// Two recipes on one plate-up, each typed forward off its own card.
function buildPlan({ anchor = "fixed" } = {}) {
  const plan = createPlan({ recipe: "Chicken piccata", foodUp: "12:35" });
  plan.schedule.anchor = anchor;

  const chicken = plan.recipes[0];
  const rice = addRecipe(plan, "Rice pilaf");

  const eq = {
    saute: createEquipment("Sauté pan"),
    saucepan: createEquipment("Saucepan"),
    sheetPan: createEquipment("Sheet pan"),    // Oven
    roasting: createEquipment("Roasting pan"), // Oven
  };
  plan.equipment.push(...Object.values(eq));

  const steps = {};
  const add = (key, recipe, name, mins, hands, equip = []) => {
    const step = createStep({ recipeId: recipe.id, name, mins, hands });
    step.equipmentIds = equip.map((item) => item.id);
    plan.steps.push(step);
    steps[key] = step;
    return step;
  };

  add("dredge",  chicken, "Pound and dredge chicken", 7, true);
  add("sear",    chicken, "Sear chicken cutlets",     8, true,  [eq.saute]);
  add("deglaze", chicken, "Deglaze pan and reduce",   6, false, [eq.saute]);
  add("finish",  chicken, "Finish sauce with butter", 3, true,  [eq.saucepan]);
  add("plate",   chicken, "Plate and spoon sauce",    2, true);

  add("toast",  rice, "Toast rice and onion",  5,  true,  [eq.saucepan]);
  add("simmer", rice, "Simmer rice covered",   18, false, [eq.saucepan]);
  add("rest",   rice, "Rest rice off heat",    5,  false);
  add("fluff",  rice, "Fluff rice and season", 2,  true);

  return { plan, steps, eq, chicken, rice };
}

// --- The headline: guided mode must not manufacture conflicts --------------
//
// Scheduling each recipe independently against the same plate-up made their
// final hands-on steps collide every time, so a student was warned about a plan
// they had not touched. One pair of hands is global.
{
  const { plan, steps } = buildPlan();
  const ranges = resolveSchedule(plan);
  const conflicts = computeConflicts(plan, ranges);

  check("two recipes, nothing hand-placed, zero conflicts", conflicts.size, 0);

  const hands = plan.steps
    .flatMap((s) => ranges.get(s.id).segments
      .filter((x) => x.seg.hands)
      .map((x) => ({ name: s.name, start: x.start, end: x.end })))
    .sort((a, b) => a.start - b.start);
  const overlaps = hands.filter((item, i) => i > 0 && item.start < hands[i - 1].end).map((item) => item.name);
  check("hands-on steps never overlap each other", overlaps, []);

  check("the plan still ends exactly on plate-up",
    minutesToClock(ranges.get(steps.plate.id).end), "12:35");
  check("searing happens while the rice simmers — competence, not a clash",
    [minutesToClock(ranges.get(steps.sear.id).start),
     minutesToClock(ranges.get(steps.simmer.id).start)], ["12:14", "12:08"]);
  check("cooking starts 33 min before plate-up",
    minutesToClock(planSpan(plan, ranges).start), "12:02");
}

// --- Prep front-loads ------------------------------------------------------
{
  const { plan, steps } = buildPlan();
  steps.dredge.ahead = true;   // the student says the dredging can be done in advance
  const info = applyGuidedSchedule(plan);
  const ranges = resolveSchedule(plan);

  check("the do-ahead step becomes the prep block", info.prepMins, 7);
  check("and it runs before any cooking starts",
    ranges.get(steps.dredge.id).end <= ranges.get(steps.toast.id).start, true);
  check("prep-first costs elapsed time: 33 -> 39 min", info.span, 39);
  check("still no conflicts", computeConflicts(plan, ranges).size, 0);
}

// --- The two anchors -------------------------------------------------------
{
  const fixed = buildPlan({ anchor: "fixed" });
  const early = buildPlan({ anchor: "early" });
  const fixedRanges = resolveSchedule(fixed.plan);
  const earlyRanges = resolveSchedule(early.plan);
  const fixedSpan = planSpan(fixed.plan, fixedRanges);
  const earlySpan = planSpan(early.plan, earlyRanges);

  check("fixed anchor ends on the period's plate-up", minutesToClock(fixedSpan.end), "12:35");
  check("early anchor starts when the window opens (12:35 - 70)",
    minutesToClock(earlySpan.start), "11:25");
  check("early anchor finishes as soon as it can", minutesToClock(earlySpan.end), "11:58");
  check("moving the anchor does not change the plan's length",
    [fixedSpan.end - fixedSpan.start, earlySpan.end - earlySpan.start], [33, 33]);
  check("plate-up is reported where the food actually goes up",
    [minutesToClock(resolvedFoodUp(fixed.plan)), minutesToClock(resolvedFoodUp(early.plan))],
    ["12:35", "11:58"]);
}

// --- The oven serialises itself -------------------------------------------
{
  const { plan, steps, eq } = buildPlan();
  steps.simmer.equipmentIds = [eq.sheetPan.id];    // both recipes now want the oven
  steps.deglaze.equipmentIds = [eq.roasting.id];
  const ranges = resolveSchedule(plan);
  const a = ranges.get(steps.simmer.id);
  const b = ranges.get(steps.deglaze.id);

  check("guided mode never double-books the oven", a.start < b.end && b.start < a.end, false);
  check("so there is nothing to warn about", computeConflicts(plan, ranges).size, 0);
}

// --- Lanes -----------------------------------------------------------------
{
  const { plan, steps, eq } = buildPlan();
  const byId = equipmentById(plan);
  check("unattended step with no equipment lands on Prep (the counter)",
    laneForStep(steps.rest, byId), "Prep");
  check("saucepan step lands on Stovetop", laneForStep(steps.simmer, byId), "Stovetop");
  check("a step touching the oven reads as an oven step",
    laneForStep({ ...steps.sear, equipmentIds: [eq.saute.id, eq.sheetPan.id] }, byId), "Oven");
}

// --- Free placement: the student's own positions win ------------------------
//
// Free placement is also the only way to produce a conflict now, which is the
// point: a warning means you put two things on top of each other on purpose.
{
  const { plan, steps } = buildPlan();
  resolveSchedule(plan);              // guided pass first, so free inherits real starts
  plan.schedule.mode = "free";

  const keptStart = steps.simmer.start;
  steps.toast.start = 60 * 11 + 30;   // 11:30, put there by hand
  let ranges = resolveSchedule(plan);
  check("free placement leaves a hand-placed block exactly where it was put",
    minutesToClock(ranges.get(steps.toast.id).start), "11:30");
  check("and does not reflow the others", ranges.get(steps.simmer.id).start, keptStart);

  // Drop two hands-on steps onto the same minute deliberately.
  steps.sear.start = steps.dredge.start;
  ranges = resolveSchedule(plan);
  check("two hands-on steps stacked by hand DO warn",
    [...(computeConflicts(plan, ranges).get(steps.sear.id) || [])], ["hands"]);
}

// --- Group mode: same plan, more pairs of hands ----------------------------
{
  const spans = {};
  const loads = {};
  for (const cooks of [1, 2, 3]) {
    const { plan } = buildPlan();
    plan.schedule.cooks = cooks;
    const ranges = resolveSchedule(plan);

    check(`${cooks} cook(s): no conflicts`, computeConflicts(plan, ranges).size, 0);

    let clashes = 0;
    for (let i = 0; i < cookCount(plan); i++) {
      const mine = plan.steps
        .filter((s) => s.cook === i)
        .flatMap((s) => ranges.get(s.id).segments.filter((x) => x.seg.hands))
        .sort((a, b) => a.start - b.start);
      for (let j = 1; j < mine.length; j++) if (mine[j].start < mine[j - 1].end) clashes++;
    }
    check(`${cooks} cook(s): nobody double-booked with themselves`, clashes, 0);

    const span = planSpan(plan, ranges);
    spans[cooks] = span.end - span.start;
    loads[cooks] = plan.steps.reduce((acc, s) => {
      if (handsMins(s) > 0) acc[s.cook] = (acc[s.cook] || 0) + handsMins(s);
      return acc;
    }, {});
  }

  check("more hands finishes sooner", [spans[1] > spans[2], spans[2] >= spans[3]], [true, true]);
  check("solo puts everything on one pair of hands", Object.keys(loads[1]).length, 1);
  check("two cooks share the work", Object.keys(loads[2]).length, 2);
}

// A shared oven does not care how many people are standing at it.
{
  const { plan, steps, eq } = buildPlan();
  plan.schedule.cooks = 4;
  steps.simmer.equipmentIds = [eq.sheetPan.id];
  steps.deglaze.equipmentIds = [eq.roasting.id];
  const ranges = resolveSchedule(plan);
  const a = ranges.get(steps.simmer.id);
  const b = ranges.get(steps.deglaze.id);
  check("four cooks still only have one oven", a.start < b.end && b.start < a.end, false);
}

// Hands conflicts are per person, so the extra cooks actually mean something.
{
  const { plan } = buildPlan();
  plan.schedule.cooks = 3;
  resolveSchedule(plan);
  plan.schedule.mode = "free";

  const hands = plan.steps.filter((s) => handsMins(s) > 0);
  const spread = () => hands.forEach((s, i) => { s.start = 100 + i * 60; });
  const first = hands[0];
  const sameCook = hands.find((s) => s !== first && s.cook === first.cook);
  const otherCook = hands.find((s) => s.cook !== first.cook);

  spread();
  sameCook.start = first.start;
  check("group: one person doing two things DOES warn",
    [...(computeConflicts(plan, resolveSchedule(plan)).get(first.id) || [])], ["hands"]);

  spread();
  otherCook.start = first.start;
  const conflicts = computeConflicts(plan, resolveSchedule(plan));
  check("group: two people working at once does NOT warn",
    [(conflicts.get(first.id) || new Set()).has("hands"),
     (conflicts.get(otherCook.id) || new Set()).has("hands")], [false, false]);
}

// --- A step added in free placement must not land at midnight --------------
//
// createStep defaults start to 0 and free placement never re-derives it, so a
// step added after switching used to sit at 00:00. The plan then spanned 755
// minutes and the board drew about 6800px, with the real work in the bottom 2%.
// Steps are entered forward, so a new one begins where its recipe ends.
{
  const { plan, steps } = buildPlan();
  resolveSchedule(plan);                 // guided pass writes real starts
  plan.schedule.mode = "free";
  const before = planSpan(plan, resolveSchedule(plan));

  const recipeEnds = Math.max(...plan.steps
    .filter((s) => s.recipeId === steps.dredge.recipeId)
    .map((s) => s.start + stepMins(s)));

  const makeStep = () => createStep({
    recipeId: steps.dredge.recipeId, name: "Forgot this step", mins: 5, hands: true,
  });
  check("a brand new step starts at midnight until it is seeded", makeStep().start, 0);

  // The old path: push it on raw, exactly as the UI used to.
  {
    const raw = makeStep();
    plan.steps.unshift(raw);
    const blown = planSpan(plan, resolveSchedule(plan));
    check("pushed on raw, the board would span from midnight",
      [minutesToClock(blown.start), blown.end - blown.start > 700], ["00:00", true]);
    plan.steps.shift();
  }

  const added = makeStep();
  appendStep(plan, added);
  const ranges = resolveSchedule(plan);
  check("seeded, it starts exactly where its recipe ended",
    ranges.get(added.id).start, recipeEnds);
  check("and the board stays a sane height",
    (planSpan(plan, ranges).end - before.start) * 9 < 2000, true);
}

// The first step of a brand new recipe starts when the cooking window opens,
// not at midnight.
{
  const plan = createPlan({ recipe: "Fresh", foodUp: "12:35" });
  plan.schedule.anchor = "fixed";
  plan.schedule.mode = "free";

  const first = createStep({ recipeId: plan.recipes[0].id, name: "Prep", mins: 4, hands: true });
  appendStep(plan, first);
  check("first step of an empty recipe starts when the window opens (12:35 - 70)",
    [minutesToClock(resolveSchedule(plan).get(first.id).start), windowOpens(plan)],
    ["11:25", 11 * 60 + 25]);
}

// --- The point of breaking a step into lines --------------------------------
//
// "Sear the chicken" is not one thing. You put the pan on, it heats without
// you, you add oil, it cooks without you. Recorded as one 13-minute hands-on
// block, those 11 waiting minutes are gone. Recorded as lines, the scheduler
// can put someone else's chopping inside them — which is the entire lesson.
{
  const build = (brokenDown) => {
    const plan = createPlan({ recipe: "Chicken", foodUp: "12:35" });
    plan.schedule.anchor = "fixed";
    const chicken = plan.recipes[0];
    const salad = addRecipe(plan, "Salad");

    const sear = createStep({ recipeId: chicken.id, name: "Sear the chicken", mins: 13, hands: true });
    appendStep(plan, sear);
    if (brokenDown) {
      // The same thirteen minutes, said honestly: you are only holding two of
      // them.
      sear.segments[0].mins = 1;
      sear.segments[0].label = "put the pan on";
      for (const [label, mins, hands] of [
        ["pan comes up to temp", 5, false],
        ["lay the chicken in", 1, true],
        ["cook, flip once", 6, false],
      ]) {
        Object.assign(addSegment(plan, sear.id, { mins, hands }), { label });
      }
    }
    appendStep(plan, createStep({ recipeId: salad.id, name: "Chop the salad", mins: 4, hands: true }));
    return plan;
  };

  const lumped = build(false);
  const split = build(true);
  const lumpedSpan = planSpan(lumped, resolveSchedule(lumped));
  const splitSpan = planSpan(split, resolveSchedule(split));

  check("both plans hold the same 17 minutes of work",
    [stepMins(lumped.steps[0]) + stepMins(lumped.steps[1]),
     stepMins(split.steps[0]) + stepMins(split.steps[1])], [17, 17]);
  check("lumped into one hands-on block, nothing can overlap it", lumpedSpan.end - lumpedSpan.start, 17);
  check("broken into lines, the chopping fits inside the waiting",
    splitSpan.end - splitSpan.start, 13);
  check("and neither plan has a conflict",
    [computeConflicts(lumped, resolveSchedule(lumped)).size,
     computeConflicts(split, resolveSchedule(split)).size], [0, 0]);

  // The chopping has to land in a genuine gap, not on top of the cook.
  const ranges = resolveSchedule(split);
  const hands = split.steps
    .flatMap((step) => ranges.get(step.id).segments.filter((x) => x.seg.hands))
    .sort((a, b) => a.start - b.start);
  const clashes = hands.filter((h, i) => i > 0 && h.start < hands[i - 1].end).length;
  check("the one pair of hands is never double-booked", clashes, 0);
}

// A step's lines stay welded together: the pan cannot start heating before you
// put it on, so nothing may be scheduled into the middle of a step's own shape.
{
  const plan = createPlan({ recipe: "Chicken", foodUp: "12:35" });
  plan.schedule.anchor = "fixed";
  const step = createStep({ recipeId: plan.recipes[0].id, name: "Sear", mins: 0, hands: true });
  step.segments = [
    { id: "a", label: "put the pan on", mins: 1, hands: true },
    { id: "b", label: "heats", mins: 5, hands: false },
    { id: "c", label: "chicken in", mins: 1, hands: true },
  ];
  appendStep(plan, step);
  const range = resolveSchedule(plan).get(step.id);
  check("the lines run back to back",
    range.segments.map((x) => [x.start - range.start, x.end - range.start]),
    [[0, 1], [1, 6], [6, 7]]);
  check("and the step's span is their total", range.end - range.start, 7);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
