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
  PERIODS,
} from "./config.js";

export const PLAN_VERSION = 3;

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
    // Guided-mode scheduling input: null = sits in its component's own serial
    // chain; otherwise the id of the unattended step whose window it runs in.
    par: null,
    // Resolved minutes-from-midnight. Derived in guided mode, authoritative in
    // free mode.
    start: 0,
  };
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
  for (const other of plan.steps) {
    if (other.par === stepId) other.par = null; // its window no longer exists
  }
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

// Builds one component's serial chain, then shifts it so the component's own
// end lands exactly on foodUp. Every part of the dish finishing together is
// true by construction rather than something the app has to compute — this is
// the best idea in the original build and it stays.
function scheduleComponent(componentSteps, foodUpMinutes) {
  const anchors = componentSteps.filter((s) => s.par == null);
  const local = new Map();

  let t = 0;
  for (const anchor of anchors) {
    local.set(anchor.id, t);
    t += anchor.mins;
  }
  const span = t;

  for (const step of componentSteps) {
    if (step.par == null) continue;
    const anchorStart = local.get(step.par);
    if (anchorStart === undefined) continue; // dangling; leave unscheduled
    local.set(step.id, anchorStart);
  }

  const offset = foodUpMinutes - span;
  const starts = new Map();
  for (const [id, localStart] of local) starts.set(id, offset + localStart);

  // `span` is what the component actually takes with overlapping applied;
  // `baseline` is what it would take with everything strictly sequential.
  return { starts, span, baseline: componentSteps.reduce((sum, s) => sum + s.mins, 0) };
}

// Derives every step's start from the guided backward chains and writes it back
// onto the steps, so switching to free mode inherits the positions rather than
// starting from nothing.
export function applyGuidedSchedule(plan) {
  const foodUpMinutes = clockToMinutes(foodUpFor(plan));
  const perComponent = [];

  for (const component of plan.components) {
    const componentSteps = stepsForComponent(plan, component.id);
    const result = scheduleComponent(componentSteps, foodUpMinutes);
    for (const step of componentSteps) {
      const start = result.starts.get(step.id);
      if (start !== undefined) step.start = start;
    }
    perComponent.push({ component, span: result.span, baseline: result.baseline });
  }

  return perComponent;
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

  // One pair of hands. Always real, and the main conflict in the app.
  flagOverlapping(withRange.filter((item) => item.step.hands), conflicts, "hands");

  // Only stations marked exclusive warn — currently just the oven.
  for (const station of EXCLUSIVE_STATIONS) {
    const using = withRange.filter((item) => stationsForStep(item.step, byId).has(station));
    flagOverlapping(using, conflicts, station);
  }

  return conflicts;
}

export function describeConflict(reasons) {
  const parts = [];
  if (reasons.has("hands")) parts.push("you can only do one of these at a time");
  for (const station of EXCLUSIVE_STATIONS) {
    if (reasons.has(station)) parts.push(`both need the ${station.toLowerCase()}`);
  }
  return parts.join("; ");
}
