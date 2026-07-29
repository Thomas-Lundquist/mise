import {
  createPlan, createStep, createEquipment, newId,
  resolveSchedule, computeConflicts, applyGuidedSchedule, resolvedFoodUp,
  minutesToClock, laneForStep, equipmentById, planSpan, cookCount,
} from "../js/plan.js";

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL  ${label}\n      got      ${a}\n      expected ${e}`); }
  else console.log(`ok    ${label}  ${a}`);
}

// One dish, two parts, built the way a student would: steps in the order they
// happen within each part. Nothing is hand-placed anywhere in this file — the
// whole point of the guided schedule is that it comes out right on its own.
function buildPlan({ anchor = "fixed" } = {}) {
  const plan = createPlan({ recipe: "Chicken Piccata with Rice Pilaf", foodUp: "12:35" });
  plan.schedule.anchor = anchor;

  const chicken = { id: newId("component"), name: "Chicken and sauce" };
  const rice = { id: newId("component"), name: "Rice pilaf" };
  plan.components.push(chicken, rice);

  const eq = {
    saute: createEquipment("Sauté pan"),
    saucepan: createEquipment("Saucepan"),
    sheetPan: createEquipment("Sheet pan"),    // Oven
    roasting: createEquipment("Roasting pan"), // Oven
  };
  plan.equipment.push(...Object.values(eq));

  const steps = {};
  const add = (key, componentId, name, mins, hands, equip = []) => {
    const s = createStep({ componentId, name, mins, hands });
    s.equipmentIds = equip.map((e) => e.id);
    plan.steps.push(s);
    steps[key] = s;
    return s;
  };

  add("dredge",  chicken.id, "Pound and dredge chicken", 7, true);
  add("sear",    chicken.id, "Sear chicken cutlets",     8, true,  [eq.saute]);
  add("deglaze", chicken.id, "Deglaze pan and reduce",   6, false, [eq.saute]);
  add("finish",  chicken.id, "Finish sauce with butter", 3, true,  [eq.saucepan]);
  add("plate",   chicken.id, "Plate and spoon sauce",    2, true);

  add("toast",  rice.id, "Toast rice and onion", 5,  true,  [eq.saucepan]);
  add("simmer", rice.id, "Simmer rice covered",  18, false, [eq.saucepan]);
  add("rest",   rice.id, "Rest rice off heat",   5,  false);
  add("fluff",  rice.id, "Fluff rice and season", 2, true);

  return { plan, steps, eq, chicken, rice };
}

// --- The headline: guided mode must not manufacture conflicts --------------
//
// The old scheduler pinned every component to plate-up independently, so with
// two parts the final hands-on steps always collided and the student was warned
// about a plan they had not touched. One pair of hands is now global.
{
  const { plan, steps } = buildPlan();
  const ranges = resolveSchedule(plan);
  const conflicts = computeConflicts(plan, ranges);

  check("two parts, nothing hand-placed, zero conflicts", conflicts.size, 0);

  const hands = plan.steps
    .filter((s) => s.hands)
    .map((s) => ({ name: s.name, ...ranges.get(s.id) }))
    .sort((a, b) => a.start - b.start);
  const overlaps = hands.filter((h, i) => i > 0 && h.start < hands[i - 1].end).map((h) => h.name);
  check("hands-on steps never overlap each other", overlaps, []);

  check("the plan still ends exactly on plate-up",
    minutesToClock(ranges.get(steps.plate.id).end), "12:35");
  check("searing happens while the rice simmers — that's competence, not a clash",
    [minutesToClock(ranges.get(steps.sear.id).start),
     minutesToClock(ranges.get(steps.simmer.id).start)], ["12:14", "12:08"]);
  check("cooking starts 33 min before plate-up",
    minutesToClock(planSpan(plan, ranges).start), "12:02");
}

// --- Prep front-loads ------------------------------------------------------
{
  const { plan, steps } = buildPlan();
  steps.dredge.ahead = true;   // student says the dredging can be done in advance
  const info = applyGuidedSchedule(plan);
  const ranges = resolveSchedule(plan);

  check("the ahead step becomes the prep block", info.prepMins, 7);
  check("and it runs before any cooking starts",
    ranges.get(steps.dredge.id).end <= ranges.get(steps.toast.id).start, true);
  check("prep-first costs elapsed time: 33 -> 39 min", info.span, 39);
  check("still no conflicts", computeConflicts(plan, ranges).size, 0);
}

// --- The two anchors -------------------------------------------------------
{
  const fixed = buildPlan({ anchor: "fixed" });
  const early = buildPlan({ anchor: "early" });
  const fr = resolveSchedule(fixed.plan);
  const er = resolveSchedule(early.plan);
  const fs = planSpan(fixed.plan, fr);
  const es = planSpan(early.plan, er);

  check("fixed anchor ends on the period's plate-up", minutesToClock(fs.end), "12:35");
  check("early anchor starts when the window opens (12:35 - 70)",
    minutesToClock(es.start), "11:25");
  check("early anchor finishes as soon as it can", minutesToClock(es.end), "11:58");
  check("moving the anchor does not change the plan's length",
    [fs.end - fs.start, es.end - es.start], [33, 33]);
  check("plate-up is reported where the food actually goes up",
    [minutesToClock(resolvedFoodUp(fixed.plan)), minutesToClock(resolvedFoodUp(early.plan))],
    ["12:35", "11:58"]);
}

// --- The oven serialises itself -------------------------------------------
{
  const { plan, steps, eq } = buildPlan();
  steps.simmer.equipmentIds = [eq.sheetPan.id];    // both parts now want the oven
  steps.deglaze.equipmentIds = [eq.roasting.id];
  const ranges = resolveSchedule(plan);
  const a = ranges.get(steps.simmer.id);
  const b = ranges.get(steps.deglaze.id);

  check("guided mode never double-books the oven", a.start < b.end && b.start < a.end, false);
  check("so there is nothing to warn about",
    computeConflicts(plan, ranges).size, 0);
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

// --- Free mode: the student's own placement wins ---------------------------
//
// Free mode is also the only way to produce a conflict now, which is the point:
// a warning means you put two things on top of each other on purpose.
{
  const { plan, steps, eq } = buildPlan();
  resolveSchedule(plan);              // guided pass first, so free inherits real starts
  plan.schedule.mode = "free";

  const keptStart = steps.simmer.start;
  steps.toast.start = 60 * 11 + 30;   // 11:30, dragged there by hand
  let ranges = resolveSchedule(plan);
  check("free mode leaves a hand-placed block exactly where it was put",
    minutesToClock(ranges.get(steps.toast.id).start), "11:30");
  check("and does not reflow the others",
    ranges.get(steps.simmer.id).start, keptStart);

  // Drop two hands-on steps onto the same minute deliberately.
  steps.sear.start = steps.dredge.start;
  ranges = resolveSchedule(plan);
  const conflicts = computeConflicts(plan, ranges);
  check("two hands-on steps stacked by hand DO warn",
    [...(conflicts.get(steps.sear.id) || [])], ["hands"]);

  // Same again for the oven.
  steps.simmer.equipmentIds = [eq.sheetPan.id];
  steps.deglaze.equipmentIds = [eq.roasting.id];
  steps.deglaze.start = steps.simmer.start;
  ranges = resolveSchedule(plan);
  check("two oven steps stacked by hand DO warn",
    (computeConflicts(plan, ranges).get(steps.simmer.id) || new Set()).has("Oven"), true);
}

// --- Group mode: same plan, more pairs of hands ----------------------------
//
// Nothing about the plan changes when the toggle moves — same steps, same
// durations, same backward pass. Only the number of hands the scheduler may
// assume, which is why this is a view of one plan rather than a second plan.
{
  const spans = {};
  const loads = {};
  for (const cooks of [1, 2, 3]) {
    const { plan } = buildPlan();
    plan.schedule.cooks = cooks;
    const ranges = resolveSchedule(plan);

    check(`${cooks} cook(s): no conflicts`, computeConflicts(plan, ranges).size, 0);

    // Nobody is ever double-booked against themselves.
    let clashes = 0;
    for (let i = 0; i < cookCount(plan); i++) {
      const mine = plan.steps
        .filter((s) => s.hands && s.cook === i)
        .map((s) => ranges.get(s.id))
        .sort((a, b) => a.start - b.start);
      for (let j = 1; j < mine.length; j++) if (mine[j].start < mine[j - 1].end) clashes++;
    }
    check(`${cooks} cook(s): nobody double-booked with themselves`, clashes, 0);

    const s = planSpan(plan, ranges);
    spans[cooks] = s.end - s.start;
    loads[cooks] = plan.steps.filter((s2) => s2.hands)
      .reduce((acc, s2) => { acc[s2.cook] = (acc[s2.cook] || 0) + s2.mins; return acc; }, {});
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

  const hands = plan.steps.filter((s) => s.hands);
  // Park everything far apart, so the only overlap is the one under test.
  const spread = () => hands.forEach((s, i) => { s.start = 100 + i * 60; });
  const a = hands[0];
  const sameCook = hands.find((s) => s !== a && s.cook === a.cook);
  const otherCook = hands.find((s) => s.cook !== a.cook);

  spread();
  sameCook.start = a.start;
  check("group: one person doing two things DOES warn",
    [...(computeConflicts(plan, resolveSchedule(plan)).get(a.id) || [])], ["hands"]);

  spread();
  otherCook.start = a.start;
  const conflicts = computeConflicts(plan, resolveSchedule(plan));
  check("group: two people working at once does NOT warn",
    [(conflicts.get(a.id) || new Set()).has("hands"),
     (conflicts.get(otherCook.id) || new Set()).has("hands")], [false, false]);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
