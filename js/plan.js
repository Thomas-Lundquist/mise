// The plan: one object the whole app reads from, plus everything derived from
// it. The four sections (Read / Pull / Group / Time) are views onto this, not
// separate stores — see docs/spec.md §4.
//
// Nothing here touches the DOM.

import {
  STATIONS,
  NO_EQUIPMENT_STATION,
  CUSTOM_EQUIPMENT_STATION,
  EQUIPMENT_PALETTE,
  DEFAULT_BOWL_COUNT,
  COOKING_WINDOW_MINUTES,
  MAX_COOKS,
  PERIODS,
} from "./config.js";

export const PLAN_VERSION = 4;

export function newId(prefix) {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${prefix || "id"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// --- Construction ---------------------------------------------------------

// Which period a student is most likely in: the next one whose food-up time
// hasn't passed yet. Wrong picks are the main risk of anchoring to a period, so
// the default should be right most of the time without anyone thinking about it.
export function defaultPeriodId(now = new Date()) {
  if (PERIODS.length === 0) return null;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const upcoming = PERIODS.find((p) => clockToMinutes(p.foodUp) >= nowMins);
  return (upcoming || PERIODS[PERIODS.length - 1]).id;
}

export function periodById(id) {
  return PERIODS.find((p) => p.id === id) || null;
}

// The absolute moment food has to be plated. A pinned override wins, then the
// chosen period. Everything else in the plan is stored as durations, so this is
// the only place wall-clock time enters.
export function foodUpFor(plan) {
  if (plan.schedule.foodUpOverride) return plan.schedule.foodUpOverride;
  const period = periodById(plan.schedule.periodId);
  return period ? period.foodUp : (PERIODS[0] ? PERIODS[0].foodUp : "12:00");
}

export function createPlan({ recipe = "", foodUp = "", periodId = null, mode = "guided" } = {}) {
  return {
    version: PLAN_VERSION,
    id: newId("plan"),
    createdAt: Date.now(),
    meta: { name: "", kitchen: "", date: todayISO(), recipe },
    read: { done: false, hardest: "", hardestStepId: null },
    equipment: [],
    bowls: Array.from({ length: DEFAULT_BOWL_COUNT }, () => createBowl()),
    components: [],
    steps: [],
    schedule: {
      mode: mode === "free" ? "free" : "guided",
      // How long they actually get to cook. The plan is measured against this,
      // not against a pair of clock times that only hold in one period.
      windowMins: COOKING_WINDOW_MINUTES,
      // Which period supplies the wall-clock labels. Null is survivable — the
      // plan is still valid, it just shows no clock times.
      periodId: periodId || defaultPeriodId(),
      // Set by ?foodUp= on the embed URL, or by hand on a special day. Wins
      // over the period.
      foodUpOverride: foodUp || "",
      // Where the finished schedule gets pinned.
      //   "early" — the plan starts the moment the cooking window opens and
      //             finishes as soon as it can, leaving the spare time at the
      //             end for plating up, eating and an unhurried clean.
      //   "fixed" — the plan ends on the period's plate-up time, which is the
      //             real service discipline and what a pinned ?foodUp= means.
      // Either way the schedule is built backward, so every part still lands
      // together and nothing sits. This only moves the anchor.
      anchor: foodUp ? "fixed" : "early",
      // One pair of hands by default. The group toggle raises this; the plan
      // itself is identical either way, only the scheduler's assumption changes.
      cooks: 1,
    },
    // Which view of Step 4 is showing. Persisted so resuming after a refresh
    // lands the student back where they were. Not a wizard position — every
    // view is reachable from every other at any time (spec §4.3).
    flow: { view: "parts", activeComponentIndex: 0, editingStepId: null },
  };
}

export function createBowl(label = "") {
  return { id: newId("bowl"), label, items: [] };
}

export function createStep({ componentId, name, mins, hands }) {
  return {
    id: newId("step"),
    component: componentId,
    name,
    mins,
    hands,
    equipmentIds: [],
    // Distinguishes "answered: nothing" from "not answered yet" — an unattended
    // step should be asked, but "it just sits" is a real answer (spec §4.1).
    noEquipment: false,
    bowlIds: [],
    note: "",
    // "Can this be done ahead?" — the student's own call, and the mise en place
    // judgement the whole app is named for. True pulls the step into the prep
    // block that runs before any cooking starts. Defaults false so a step stays
    // where it sits in its part unless the student deliberately says otherwise.
    ahead: false,
    // Resolved minutes-from-midnight. Derived in guided mode, authoritative in
    // free mode.
    start: 0,
    // Which pair of hands does this, 0-based. Derived by the scheduler and
    // meaningless when the plan is solo. Unattended steps keep 0 and ignore it.
    cook: 0,
  };
}

export function cookCount(plan) {
  return Math.max(1, Math.min(MAX_COOKS, plan.schedule.cooks || 1));
}

// --- Equipment ------------------------------------------------------------

const PALETTE_BY_NAME = new Map(EQUIPMENT_PALETTE.map((item) => [item.name, item]));

export function createEquipment(name, { custom = false } = {}) {
  const known = PALETTE_BY_NAME.get(name);
  return {
    id: newId("equip"),
    name,
    group: known ? known.group : "Mine",
    station: known ? known.station : CUSTOM_EQUIPMENT_STATION,
    custom: custom || !known,
  };
}

export function equipmentById(plan) {
  return new Map(plan.equipment.map((item) => [item.id, item]));
}

const STATION_ORDER = STATIONS.map((s) => s.id);
const EXCLUSIVE_STATIONS = STATIONS.filter((s) => s.exclusive).map((s) => s.id);

// Every station a step touches. Contention is checked against all of them.
export function stationsForStep(step, byId) {
  const stations = new Set();
  for (const id of step.equipmentIds) {
    const item = byId.get(id);
    if (item) stations.add(item.station);
  }
  if (stations.size === 0 && !step.hands) stations.add(NO_EQUIPMENT_STATION);
  return stations;
}

// The single lane a step draws on: the first station in config order that it
// touches, so anything in the oven reads as an oven step.
export function laneForStep(step, byId) {
  const stations = stationsForStep(step, byId);
  for (const id of STATION_ORDER) {
    if (stations.has(id)) return id;
  }
  return NO_EQUIPMENT_STATION;
}

// --- Mutations ------------------------------------------------------------
//
// Nothing in a plan is write-once (spec §4.3). Deleting something that others
// point at clears the reference and keeps the rest — losing a step because you
// tidied the equipment list is never the right outcome.

export function removeStep(plan, stepId) {
  const idx = plan.steps.findIndex((s) => s.id === stepId);
  if (idx === -1) return;
  plan.steps.splice(idx, 1);
  if (plan.read.hardestStepId === stepId) plan.read.hardestStepId = null;
}

// Steps live in one array with components interleaved, but reordering only ever
// means "move it relative to its own part", so swap with the adjacent sibling.
export function moveStepWithinComponent(plan, stepId, direction) {
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return false;
  const siblings = plan.steps.filter((s) => s.component === step.component);
  const target = siblings[siblings.indexOf(step) + direction];
  if (!target) return false;
  const i = plan.steps.indexOf(step);
  const j = plan.steps.indexOf(target);
  plan.steps[i] = target;
  plan.steps[j] = step;
  return true;
}

// Deleting a part is never silent — the caller decides whether its steps move
// somewhere else or go with it.
export function removeComponent(plan, componentId, { moveTo = null } = {}) {
  const doomed = stepsForComponent(plan, componentId);
  if (moveTo) {
    for (const step of doomed) step.component = moveTo;
  } else {
    for (const step of doomed) removeStep(plan, step.id);
  }
  plan.components = plan.components.filter((c) => c.id !== componentId);
  if (plan.flow.activeComponentIndex >= plan.components.length) {
    plan.flow.activeComponentIndex = Math.max(0, plan.components.length - 1);
  }
}

export function removeEquipment(plan, equipmentId) {
  plan.equipment = plan.equipment.filter((e) => e.id !== equipmentId);
  for (const step of plan.steps) {
    step.equipmentIds = step.equipmentIds.filter((id) => id !== equipmentId);
  }
}

export function removeBowl(plan, bowlId) {
  plan.bowls = plan.bowls.filter((b) => b.id !== bowlId);
  for (const step of plan.steps) {
    step.bowlIds = step.bowlIds.filter((id) => id !== bowlId);
  }
}

// --- Scheduling -----------------------------------------------------------

export function clockToMinutes(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToClock(mins) {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDuration(mins) {
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function stepsForComponent(plan, componentId) {
  return plan.steps.filter((s) => s.component === componentId);
}

// One cook, scheduled backward from plate-up.
//
// Backward is what makes every part of the dish finish together: the part that
// needs the longest lead simply starts earliest, and nothing has to compute
// that. Forward/as-soon-as-possible scheduling loses it — parts finish whenever
// they happen to finish and the food sits. Finishing EARLY is achieved by
// moving the anchor instead (see applyGuidedSchedule), so quality and getting
// out on time were never actually in tension.
//
// The pair of hands is GLOBAL. Two hands-on steps never overlap, whichever part
// of the dish they belong to. The previous model scheduled each component
// independently and pinned all of them to plate-up, so with two or more parts it
// manufactured the collisions it then flagged — the student did nothing wrong
// and got warned anyway.
//
// With more than one cook the hands stop being scarce and the stations start
// to be: the oven is still one oven however many people are standing at it.
// Nothing else about the plan changes — same steps, same durations, same
// backward pass — which is why group is a toggle rather than a second plan.
//
// Returns { starts, cookOf } in the same units as `endAt`.
function scheduleBackward(steps, plan, endAt) {
  const byId = equipmentById(plan);
  const starts = new Map();
  const cookOf = new Map();
  if (steps.length === 0) return { starts, cookOf };

  // One queue per part, walked from its last step toward its first. Keyed off
  // the steps themselves so a step orphaned from its component still schedules.
  const queues = new Map();
  for (const step of steps) {
    if (!queues.has(step.component)) queues.set(step.component, { steps: [], i: 0, deadline: endAt });
    queues.get(step.component).steps.push(step);
  }
  for (const q of queues.values()) q.i = q.steps.length - 1;

  const cooks = cookCount(plan);
  const handsFree = new Array(cooks).fill(endAt); // each cook is free at or before this
  const load = new Array(cooks).fill(0);          // minutes already given to each
  const stationFree = new Map();                  // exclusive station -> free before this
  for (const st of EXCLUSIVE_STATIONS) stationFree.set(st, endAt);

  for (let placed = 0; placed < steps.length; placed++) {
    // Whichever part currently reaches latest is the one still occupying the
    // end of the plan, so it gets to claim the next slot going backward.
    let pick = null;
    for (const q of queues.values()) {
      if (q.i < 0) continue;
      if (!pick || q.deadline > pick.deadline) pick = q;
    }
    if (!pick) break;

    const step = pick.steps[pick.i];
    const stations = stationsForStep(step, byId);

    // Whichever cook can take it latest gets it, so the step lands as close to
    // its deadline as possible. Ties go to whoever has done least — otherwise
    // one person quietly ends up doing the whole dish, which is a bad plan even
    // when the arithmetic works out.
    let chosen = 0;
    if (step.hands) {
      let bestEnd = -Infinity;
      for (let i = 0; i < cooks; i++) {
        const candidate = Math.min(pick.deadline, handsFree[i]);
        if (candidate > bestEnd || (candidate === bestEnd && load[i] < load[chosen])) {
          bestEnd = candidate;
          chosen = i;
        }
      }
    }

    let end = pick.deadline;
    if (step.hands) end = Math.min(end, handsFree[chosen]);
    for (const st of EXCLUSIVE_STATIONS) {
      if (stations.has(st)) end = Math.min(end, stationFree.get(st));
    }

    const start = end - step.mins;
    starts.set(step.id, start);
    if (step.hands) {
      handsFree[chosen] = start;
      load[chosen] += step.mins;
      cookOf.set(step.id, chosen);
    }
    for (const st of EXCLUSIVE_STATIONS) {
      if (stations.has(st)) stationFree.set(st, start);
    }
    pick.deadline = start;
    pick.i -= 1;
  }

  return { starts, cookOf };
}

function earliestStart(steps, starts, fallback) {
  let earliest = fallback;
  for (const step of steps) {
    const start = starts.get(step.id);
    if (start !== undefined) earliest = Math.min(earliest, start);
  }
  return earliest;
}

// Derives every step's start and writes it back onto the steps, so switching to
// free mode inherits the positions rather than starting from nothing.
//
// Scheduled relative to a plate-up of 0 (so every start is negative), then
// shifted once at the end to wherever the anchor says plate-up actually is.
export function applyGuidedSchedule(plan) {
  const cooking = plan.steps.filter((s) => !s.ahead);
  const prep = plan.steps.filter((s) => s.ahead);

  const cookPass = scheduleBackward(cooking, plan, 0);
  const cookStart = earliestStart(cooking, cookPass.starts, 0);

  // Prep front-loads: everything the student marked "can be done ahead" runs
  // before any cooking starts. It costs elapsed time — you can't fill the
  // simmer window with prep that's already done — but doing the mise first is
  // the discipline this app is named for, and the idle window it opens up is
  // where cleanup actually goes.
  const prepPass = scheduleBackward(prep, plan, cookStart);
  const planStart = earliestStart(prep, prepPass.starts, cookStart);

  const target = clockToMinutes(foodUpFor(plan));
  const span = -planStart;
  // "early" pins the START to the moment the window opens; "fixed" pins the END
  // to the period's plate-up. Same schedule, different place on the clock.
  const offset = plan.schedule.anchor === "fixed"
    ? target
    : (target - plan.schedule.windowMins) + span;

  const byStepId = new Map(plan.steps.map((s) => [s.id, s]));
  for (const pass of [cookPass, prepPass]) {
    for (const [id, start] of pass.starts) byStepId.get(id).start = start + offset;
    for (const [id, cook] of pass.cookOf) byStepId.get(id).cook = cook;
  }

  return { span, prepMins: cookStart - planStart, cookMins: -cookStart };
}

// When the food actually goes up. Under a fixed anchor that's the period's
// plate-up time; under "early" it's wherever the plan happens to end, which is
// the number the student needs on the printout.
export function resolvedFoodUp(plan) {
  const target = clockToMinutes(foodUpFor(plan));
  if (plan.schedule.anchor === "fixed" || plan.steps.length === 0) return target;
  let end = -Infinity;
  for (const step of plan.steps) end = Math.max(end, step.start + step.mins);
  return end === -Infinity ? target : end;
}

// What the board actually draws. In free mode the student's own starts win.
export function resolveSchedule(plan) {
  if (plan.schedule.mode !== "free") applyGuidedSchedule(plan);
  const ranges = new Map();
  for (const step of plan.steps) {
    ranges.set(step.id, { start: step.start, end: step.start + step.mins });
  }
  return ranges;
}

export function planSpan(plan, ranges) {
  if (plan.steps.length === 0) return { start: clockToMinutes(foodUpFor(plan)), end: clockToMinutes(foodUpFor(plan)) };
  let start = Infinity;
  let end = -Infinity;
  for (const step of plan.steps) {
    const r = ranges.get(step.id);
    if (!r) continue;
    start = Math.min(start, r.start);
    end = Math.max(end, r.end);
  }
  if (start === Infinity) start = end = clockToMinutes(foodUpFor(plan));
  return { start, end };
}

// --- Conflicts ------------------------------------------------------------

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function flagOverlapping(items, into, reason) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (!overlaps(items[i].range, items[j].range)) continue;
      for (const item of [items[i], items[j]]) {
        if (!into.has(item.id)) into.set(item.id, new Set());
        into.get(item.id).add(reason);
      }
    }
  }
}

// Flag, never block (spec §5, §6). Returns Map<stepId, Set<reason>>.
export function computeConflicts(plan, ranges) {
  const byId = equipmentById(plan);
  const conflicts = new Map();

  const withRange = plan.steps
    .map((step) => ({ id: step.id, step, range: ranges.get(step.id) }))
    .filter((item) => item.range);

  // Hands, checked per cook. Two hands-on steps overlapping is only a clash if
  // it's the same person doing both — with a group that's exactly what the
  // extra pairs of hands are for, and warning about it would be nonsense.
  const perCook = new Map();
  for (const item of withRange) {
    if (!item.step.hands) continue;
    const cook = item.step.cook || 0;
    if (!perCook.has(cook)) perCook.set(cook, []);
    perCook.get(cook).push(item);
  }
  for (const items of perCook.values()) flagOverlapping(items, conflicts, "hands");

  // Only stations marked exclusive warn — currently just the oven.
  for (const station of EXCLUSIVE_STATIONS) {
    const using = withRange.filter((item) => stationsForStep(item.step, byId).has(station));
    flagOverlapping(using, conflicts, station);
  }

  return conflicts;
}

export function describeConflict(reasons, cooks = 1) {
  const parts = [];
  if (reasons.has("hands")) {
    parts.push(cooks > 1
      ? "the same person can only do one of these at a time"
      : "you can only do one of these at a time");
  }
  for (const station of EXCLUSIVE_STATIONS) {
    if (reasons.has(station)) parts.push(`both need the ${station.toLowerCase()}`);
  }
  return parts.join("; ");
}
