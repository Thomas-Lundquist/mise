// Scheduling, lanes and conflicts.
//
// The student types their steps forward, in the order the recipe is written.
// This file turns that into a plan: it schedules backward from plate-up so
// every recipe lands together, fits the work around one pair of hands, and
// says — never decides — where two things collide.
//
// The unit of scheduling is a SEGMENT, not a step. A real instruction
// alternates: you put the pan on, it heats without you, you add oil, it cooks
// without you. Those waiting stretches are the whole point of the app, so the
// scheduler has to be able to put someone else's chopping inside them.

import { STATIONS, NO_EQUIPMENT_STATION } from "./config.js";
import { clockToMinutes } from "./time.js";
import {
  equipmentById, cookCount, foodUpFor, stepMins, segmentOffsets, hasWaiting, handsMins,
} from "./model.js";

const STATION_ORDER = STATIONS.map((s) => s.id);
const EXCLUSIVE_STATIONS = STATIONS.filter((s) => s.exclusive).map((s) => s.id);

// --- Stations -------------------------------------------------------------

// Every station a step touches. Contention is checked against all of them.
export function stationsForStep(step, byId) {
  const stations = new Set();
  for (const id of step.equipmentIds) {
    const item = byId.get(id);
    if (item) stations.add(item.station);
  }
  // A step with waiting time and nothing running it is resting on the counter,
  // which is the prep bench. A step that is pure hands needs no fallback: it is
  // on the cook's own lane.
  if (stations.size === 0 && hasWaiting(step)) stations.add(NO_EQUIPMENT_STATION);
  return stations;
}

// The single lane a step's waiting draws on: the first station in config order
// it touches, so anything in the oven reads as an oven step.
export function laneForStep(step, byId) {
  const stations = stationsForStep(step, byId);
  for (const id of STATION_ORDER) {
    if (stations.has(id)) return id;
  }
  return NO_EQUIPMENT_STATION;
}

// --- Busy intervals -------------------------------------------------------
//
// A cook used to be a single watermark — "free at or before minute X" — which
// cannot express being free in the MIDDLE of something. That was fine when a
// step was one block, and became wrong the moment a step could be "put the pan
// on, wait three minutes, add oil": the watermark would reserve the whole span
// and the three free minutes would be unusable.
//
// So availability is a set of busy intervals instead, and placing work means
// finding a slot between them.

function overlapping(busy, start, end) {
  // The latest-starting interval that overlaps [start, end). Latest, because
  // the caller slides work earlier and wants the smallest move that helps.
  let hit = null;
  for (const span of busy) {
    if (span.start < end && start < span.end) {
      if (!hit || span.start > hit.start) hit = span;
    }
  }
  return hit;
}

function occupy(busy, start, end) {
  if (end > start) busy.push({ start, end });
}

// The latest end at or before `deadline` at which this step's whole shape fits.
//
// Its segments are rigid relative to each other, so the search moves the step
// as a unit: find something in the way, slide back just far enough to clear it,
// look again. Each pass strictly decreases the end, so it terminates.
//
// Hands segments occupy only their own slice of the step. An exclusive station
// is held for the step's ENTIRE span — the oven is not free while you stand at
// it with the door open partway through.
function latestFit(step, deadline, cookBusy, stationBusies) {
  const segments = segmentOffsets(step);
  const total = stepMins(step);
  let end = deadline;

  for (let guard = 0; guard < 500; guard++) {
    let next = end;

    for (const busy of stationBusies) {
      const hit = overlapping(busy, end - total, end);
      if (hit) next = Math.min(next, hit.start);
    }

    for (const { seg, to } of segments) {
      if (!seg.hands) continue;
      const after = total - to;          // minutes of the step that follow this segment
      const hit = overlapping(cookBusy, end - after - seg.mins, end - after);
      if (hit) next = Math.min(next, hit.start + after);
    }

    if (next === end) return end;
    end = next;
  }
  return end;
}

function commit(step, end, cookBusy, stationBusies) {
  const total = stepMins(step);
  for (const busy of stationBusies) occupy(busy, end - total, end);
  for (const { seg, to } of segmentOffsets(step)) {
    if (!seg.hands) continue;
    const after = total - to;
    occupy(cookBusy, end - after - seg.mins, end - after);
  }
}

// --- The backward pass ----------------------------------------------------
//
// Backward is what makes every recipe finish together: the one needing the
// longest lead simply starts earliest, and nothing has to compute that.
// Forward/as-soon-as-possible scheduling loses it — things finish whenever they
// happen to finish and the food sits. Finishing EARLY is achieved by moving the
// anchor instead, so quality and getting out on time were never in tension.
//
// The pair of hands is GLOBAL. Hands-on work never overlaps other hands-on
// work, whichever recipe it belongs to. Scheduling each recipe independently
// against the same plate-up manufactured exactly the collisions the app then
// warned about.
//
// With more than one cook the hands stop being scarce and the stations start to
// be: the oven is one oven however many people are standing at it.
//
// Returns { starts, cookOf } in the same units as `endAt`.
function scheduleBackward(steps, plan, endAt, { chained = true } = {}) {
  const byId = equipmentById(plan);
  const starts = new Map();
  const cookOf = new Map();
  if (steps.length === 0) return { starts, cookOf };

  // One queue per recipe, walked from its last step toward its first, so a
  // recipe's steps stay in order. Keyed off the steps themselves so a step
  // orphaned from its recipe still schedules.
  //
  // Unchained, every step is its own queue and therefore free to be placed
  // wherever it fits — which is what prep is (see applyGuidedSchedule).
  const queues = new Map();
  for (const step of steps) {
    const key = chained ? step.recipeId : step.id;
    if (!queues.has(key)) queues.set(key, { steps: [], i: 0, deadline: endAt });
    queues.get(key).steps.push(step);
  }
  for (const queue of queues.values()) queue.i = queue.steps.length - 1;

  const cooks = cookCount(plan);
  const cookBusy = Array.from({ length: cooks }, () => []);
  const load = new Array(cooks).fill(0);
  // The recipe of the last step given to each cook. The pass runs backward, so
  // "last given" is the step that happens LATER on the clock, and matching it
  // produces an unbroken run on one recipe rather than a cook who is handed the
  // rice, then the chicken, then the rice again.
  const lastRecipe = new Array(cooks).fill(null);
  const stationBusy = new Map();
  for (const station of EXCLUSIVE_STATIONS) stationBusy.set(station, []);

  for (let placed = 0; placed < steps.length; placed++) {
    // Whichever recipe currently reaches latest is the one still occupying the
    // end of the plan, so it claims the next slot going backward.
    let pick = null;
    for (const queue of queues.values()) {
      if (queue.i < 0) continue;
      if (!pick || queue.deadline > pick.deadline) pick = queue;
    }
    if (!pick) break;

    const step = pick.steps[pick.i];
    const stations = stationsForStep(step, byId);
    const busies = EXCLUSIVE_STATIONS
      .filter((station) => stations.has(station))
      .map((station) => stationBusy.get(station));

    // Whichever cook can take it latest gets it, so the step lands as close to
    // its deadline as possible. That is the only criterion allowed to affect
    // WHEN anything happens; the two below decide only whose name is on it, and
    // are consulted solely when the timing is identical.
    //
    //   1. the cook already on this recipe, so somebody follows a dish through
    //      instead of being handed a step of the rice, a step of the chicken,
    //      and then the rice again
    //   2. failing that, whoever has done least, so one person does not quietly
    //      end up carrying the whole dish
    //
    // Because every cook is assumed able to do every task, choosing between
    // cooks that tie on timing cannot change the length of the plan.
    let chosen = 0;
    let end = pick.deadline;
    if (cooks === 1) {
      end = latestFit(step, pick.deadline, cookBusy[0], busies);
    } else {
      let best = -Infinity;
      for (let i = 0; i < cooks; i++) {
        const candidate = latestFit(step, pick.deadline, cookBusy[i], busies);
        if (candidate > best) {
          best = candidate;
          chosen = i;
          continue;
        }
        if (candidate < best) continue;
        const onRecipe = lastRecipe[i] === step.recipeId;
        const chosenOnRecipe = lastRecipe[chosen] === step.recipeId;
        if (onRecipe !== chosenOnRecipe) {
          if (onRecipe) chosen = i;
        } else if (load[i] < load[chosen]) {
          chosen = i;
        }
      }
      end = best;
    }

    const start = end - stepMins(step);
    starts.set(step.id, start);
    cookOf.set(step.id, chosen);
    commit(step, end, cookBusy[chosen], busies);
    for (const seg of step.segments) if (seg.hands) load[chosen] += seg.mins;
    // Only a step that actually occupies a cook's hands makes that cook "on"
    // its recipe. A step that is nothing but waiting is assigned a cook by
    // convention and should not claim their attention.
    if (handsMins(step) > 0) lastRecipe[chosen] = step.recipeId;

    // The rest of this recipe has to finish before this step starts. Its
    // waiting time counts: the pan cannot be heating before you put it on.
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

// Derives every step's start and writes it back onto the step, so switching to
// free placement inherits the positions rather than starting from nothing.
//
// Scheduled against a plate-up of 0 (so every start is negative), then shifted
// once at the end to wherever the anchor says plate-up actually is.
export function applyGuidedSchedule(plan) {
  const cooking = plan.steps.filter((s) => !s.prep);
  const prep = plan.steps.filter((s) => s.prep);

  const cookPass = scheduleBackward(cooking, plan, 0);
  const cookStart = earliestStart(cooking, cookPass.starts, 0);

  // Prep front-loads: everything marked prep runs before any cooking starts.
  // It costs elapsed time — you cannot fill a simmer window with prep that is
  // already done — and that is the trade the doctrine is worth. The idle gaps
  // it opens are where cleaning down goes.
  //
  // Scheduled UNCHAINED. Cooking steps follow their recipe in order, because
  // you cannot sear before you dredge, but prep has no such order: juicing a
  // lemon and dicing an onion have nothing to do with each other. Chaining them
  // per recipe was what capped the prep block at the length of one recipe's
  // prep and left extra cooks with nothing to do.
  const prepPass = scheduleBackward(prep, plan, cookStart, { chained: false });
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

// When the food actually goes up. Under a fixed anchor that is the period's
// plate-up; under "early" it is wherever the plan happens to end, which is the
// number the student needs on the printout.
export function resolvedFoodUp(plan) {
  const target = clockToMinutes(foodUpFor(plan));
  if (plan.schedule.anchor === "fixed" || plan.steps.length === 0) return target;
  let end = -Infinity;
  for (const step of plan.steps) end = Math.max(end, step.start + stepMins(step));
  return end === -Infinity ? target : end;
}

// What the board draws. In free placement the student's own starts win.
//
// Returns Map<stepId, { start, end, segments: [{ seg, start, end }] }> — the
// segments are what get drawn, because that is where the hands actually are.
export function resolveSchedule(plan) {
  if (plan.schedule.mode !== "free") applyGuidedSchedule(plan);
  const ranges = new Map();
  for (const step of plan.steps) {
    const segments = segmentOffsets(step).map(({ seg, from, to }) =>
      ({ seg, start: step.start + from, end: step.start + to }));
    ranges.set(step.id, { start: step.start, end: step.start + stepMins(step), segments });
  }
  return ranges;
}

export function planSpan(plan, ranges) {
  const foodUp = clockToMinutes(foodUpFor(plan));
  if (plan.steps.length === 0) return { start: foodUp, end: foodUp };

  let start = Infinity;
  let end = -Infinity;
  for (const step of plan.steps) {
    const range = ranges.get(step.id);
    if (!range) continue;
    start = Math.min(start, range.start);
    end = Math.max(end, range.end);
  }
  if (start === Infinity) start = end = foodUp;
  return { start, end };
}

// --- Hands free -----------------------------------------------------------

// Every stretch a cook's hands are actually occupied, in time order.
//
// Counted from the SEGMENTS, so the minute you stand over a pan to flip a
// cutlet counts as busy even though the board draws it as a notch on the dish
// rather than as a block on your lane. Drawing and availability are different
// questions and only this one decides whether you have time to wash up.
export function handsBlocks(plan, ranges, cook = 0) {
  const out = [];
  for (const step of plan.steps) {
    const range = ranges.get(step.id);
    if (!range || (step.cook || 0) !== cook) continue;
    for (const part of range.segments) {
      if (part.seg.hands && part.seg.mins > 0) out.push({ start: part.start, end: part.end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// The gaps between them, across the WHOLE plan rather than between a cook's own
// first and last job — somebody with a single three-minute task is idle almost
// throughout, and bounding it to their own work would report the opposite.
//
// Shared, because the board and the printed sheet must never disagree about
// when a student is free.
export function idleGaps(plan, ranges, span, cook = 0) {
  const gaps = [];
  let cursor = span.start;
  for (const busy of handsBlocks(plan, ranges, cook)) {
    if (busy.start > cursor) gaps.push({ start: cursor, end: busy.start });
    cursor = Math.max(cursor, busy.end);
  }
  if (cursor < span.end) gaps.push({ start: cursor, end: span.end });
  return gaps;
}

// --- What extra hands cannot fix ------------------------------------------

// A recipe's cooking steps happen one after another — you cannot sear before
// you dredge — so the sum of one recipe's chain is a floor on the whole plan.
// No number of cooks gets under it. That is why raising the group size
// sometimes changes nothing at all, which looks like a broken toggle unless
// somebody says why.
//
// Prep is excluded: it is scheduled unchained precisely because juicing a lemon
// and dicing an onion have nothing to do with each other, so extra hands DO
// shorten it.
export function bindingChain(plan) {
  let longest = null;
  for (const recipe of plan.recipes) {
    const steps = plan.steps.filter((step) => step.recipeId === recipe.id && !step.prep);
    const mins = steps.reduce((total, step) => total + stepMins(step), 0);
    if (mins > 0 && (!longest || mins > longest.mins)) longest = { recipe, steps, mins };
  }
  return longest;
}

// --- Conflicts ------------------------------------------------------------
//
// Flagged, never resolved. The app does not decide what a student is allowed to
// schedule; it says what is wrong and leaves the plan alone.
//
// Keyed by STEP, not by segment, even though the clash is between segments —
// "'Sear the chicken' and 'Toast the rice' — you can only do one of these at a
// time" is what a student can act on.

function flagOverlapping(items, into, reason) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      // Two slices of one step can never clash with each other: they are
      // consecutive by construction.
      if (a.stepId === b.stepId) continue;
      if (!(a.start < b.end && b.start < a.end)) continue;
      for (const item of [a, b]) {
        if (!into.has(item.stepId)) into.set(item.stepId, new Set());
        into.get(item.stepId).add(reason);
      }
    }
  }
}

export function computeConflicts(plan, ranges) {
  const byId = equipmentById(plan);
  const conflicts = new Map();

  // Hands, checked per cook. Two people working at once is the entire point of
  // a group, not a clash.
  const perCook = new Map();
  for (const step of plan.steps) {
    const range = ranges.get(step.id);
    if (!range) continue;
    const cook = step.cook || 0;
    if (!perCook.has(cook)) perCook.set(cook, []);
    for (const { seg, start, end } of range.segments) {
      if (seg.hands) perCook.get(cook).push({ stepId: step.id, start, end });
    }
  }
  for (const items of perCook.values()) flagOverlapping(items, conflicts, "hands");

  // Only stations marked exclusive warn — currently just the oven — and they
  // are held for the whole step, door open or not.
  for (const station of EXCLUSIVE_STATIONS) {
    const using = plan.steps
      .filter((step) => stationsForStep(step, byId).has(station))
      .map((step) => ({ stepId: step.id, ...ranges.get(step.id) }))
      .filter((item) => item.start !== undefined);
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
