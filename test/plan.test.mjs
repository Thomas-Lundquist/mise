import {
  createPlan, createStep, createEquipment, newId,
  resolveSchedule, computeConflicts, applyGuidedSchedule,
  minutesToClock, laneForStep, stationsForStep, equipmentById, planSpan,
} from "../js/plan.js";

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL  ${label}\n      got      ${a}\n      expected ${e}`); }
  else console.log(`ok    ${label}  ${a}`);
}

// --- Build the same dish I walked through in the browser -------------------
const plan = createPlan({ recipe: "Chicken Piccata with Rice Pilaf", foodUp: "12:35" });

const chicken = { id: newId("component"), name: "Chicken and sauce" };
const rice = { id: newId("component"), name: "Rice pilaf" };
plan.components.push(chicken, rice);

const sautePan = createEquipment("Sauté pan");
const saucepan = createEquipment("Saucepan");
const sheetPan = createEquipment("Sheet pan");   // Oven
const roasting = createEquipment("Roasting pan"); // Oven
plan.equipment.push(sautePan, saucepan, sheetPan, roasting);

// Steps are entered backward, each unshifted onto the front, so the array ends
// up in forward chronological order per component.
function addStep(componentId, name, mins, hands, equip = []) {
  const s = createStep({ componentId, name, mins, hands });
  s.equipmentIds = equip.map((e) => e.id);
  plan.steps.unshift(s);
  return s;
}

// Chicken: 7 + 8 + 6 + 3 + 2 = 26 min
const plate  = addStep(chicken.id, "Plate and spoon sauce over", 2, true);
const finish = addStep(chicken.id, "Finish sauce with butter", 3, true, [saucepan]);
const deglaze= addStep(chicken.id, "Deglaze pan and reduce", 6, false, [sautePan]);
const sear   = addStep(chicken.id, "Sear chicken cutlets", 8, true, [sautePan]);
const dredge = addStep(chicken.id, "Pound and dredge chicken", 7, true);

// Rice: 5 + 18 + 5 + 2 = 30 min
const fluff  = addStep(rice.id, "Fluff rice and season", 2, true);
const rest   = addStep(rice.id, "Rest rice off heat", 5, false);          // no equipment
const simmer = addStep(rice.id, "Simmer rice covered", 18, false, [saucepan]);
const toast  = addStep(rice.id, "Toast rice and onion", 5, true, [saucepan]);

// --- Guided scheduling -----------------------------------------------------
let ranges = resolveSchedule(plan);
const span = planSpan(plan, ranges);

check("rice is the longest part, so cooking starts 30 min before food up",
  minutesToClock(span.start), "12:05");
check("everything finishes at food up", minutesToClock(span.end), "12:35");
check("chicken chain starts later than rice (26 vs 30 min)",
  minutesToClock(ranges.get(dredge.id).start), "12:09");
check("last chicken step ends at food up",
  minutesToClock(ranges.get(plate.id).end), "12:35");
check("last rice step ends at food up",
  minutesToClock(ranges.get(fluff.id).end), "12:35");

// --- Lanes -----------------------------------------------------------------
const byId = equipmentById(plan);
check("unattended step with no equipment lands on Prep (the counter)",
  laneForStep(rest, byId), "Prep");
check("saucepan step lands on Stovetop", laneForStep(simmer, byId), "Stovetop");
check("a step touching the oven reads as an oven step",
  laneForStep({ ...sear, equipmentIds: [sautePan.id, sheetPan.id] }, byId), "Oven");

// --- Conflicts: hands ------------------------------------------------------
let conflicts = computeConflicts(plan, ranges);
check("plate and fluff both want your hands in the last 2 min",
  [conflicts.has(plate.id), conflicts.has(fluff.id)], [true, true]);
check("that conflict is a hands conflict",
  [...(conflicts.get(plate.id) || [])], ["hands"]);

// --- Conflicts: only the oven warns ---------------------------------------
check("two stovetop steps overlapping do NOT warn (several burners)",
  (() => {
    const simmerR = ranges.get(simmer.id), deglazeR = ranges.get(deglaze.id);
    const doOverlap = simmerR.start < deglazeR.end && deglazeR.start < simmerR.end;
    return [doOverlap, (conflicts.get(simmer.id) || new Set()).has("Stovetop")];
  })(), [true, false]);

// Move both chicken pan steps into the oven and re-check.
sear.equipmentIds = [roasting.id];
deglaze.equipmentIds = [sheetPan.id];
simmer.equipmentIds = [sheetPan.id];
ranges = resolveSchedule(plan);
conflicts = computeConflicts(plan, ranges);
check("two overlapping oven steps DO warn",
  (conflicts.get(simmer.id) || new Set()).has("Oven"), true);

// --- Free-hands pairing shortens the chain it belongs to -------------------
sear.equipmentIds = [sautePan.id];
deglaze.equipmentIds = [sautePan.id];
simmer.equipmentIds = [saucepan.id];
finish.par = deglaze.id;                    // run "Finish sauce" inside the deglaze window
const perComponent = applyGuidedSchedule(plan);
const chickenSpan = perComponent.find((c) => c.component.id === chicken.id);
check("pairing shortens the chicken chain 26 -> 23", chickenSpan.span, 23);
check("but rice is still the longest part at 30",
  Math.max(...perComponent.map((c) => c.span)), 30);
check("...which is exactly why the old savings readout never moved",
  minutesToClock(planSpan(plan, resolveSchedule(plan)).start), "12:05");

// --- Free mode honours hand-placed starts ---------------------------------
plan.schedule.mode = "free";
toast.start = 60 * 11 + 30; // 11:30 by hand
ranges = resolveSchedule(plan);
check("free mode leaves a hand-placed block exactly where it was put",
  minutesToClock(ranges.get(toast.id).start), "11:30");
check("free mode does not reflow the others",
  minutesToClock(ranges.get(simmer.id).start), "12:10");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
