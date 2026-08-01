// js/fillers.js — derive washables and fill idle gaps. Pure: no DOM, deterministic.
// See docs/04-scheduler-spec.md Stage 4. Fillers run AFTER the cooking schedule is fixed and
// never move, delay, or displace a step, so makespanMin is unchanged by construction — the
// only property that makes the feature safe (worst case a student is idle, best case clean).

const MIN_GAP = 3;        // idle intervals shorter than this print as blank space (Stage 4c).
const WASH_BOWL_MIN = 2;  // duration of a "Wash bowl N" task (Stage 4a).
const WASH_TOOL_MIN = 3;  // duration of a "Wash the <tool>" task (Stage 4a).

/** Fill each cook's idle gaps with derived washables and generic fillers.
 * Returns a NEW Schedule with `kind: "filler"` assignments added; makespanMin is unchanged,
 * and no filler overlaps a step, overlaps another filler for the same cook, or extends past
 * makespanMin. Honours equipment capacity (a sink, or any other id a filler needs) across cooks
 * when the pack defines it; an id with no pack entry is treated as unlimited. Pure.
 * @param {object} schedule a Schedule from buildSchedule (03-data-model.md)
 * @param {object} pack @param {object} plan
 * @returns {object} a new Schedule */
export function fillGaps(schedule, pack, plan) {
  const makespanMin = schedule.makespanMin;

  // stepId -> runsUntilMin, read off the fixed schedule. A bowl or tool is dirty when its step
  // FINISHES (runsUntilMin), not when the cook walked away (endMin) — food outlives attention.
  const runsUntil = {};
  for (const cook of schedule.cooks) {
    for (const a of cook.assignments) if (a.kind === 'step') runsUntil[a.stepId] = a.runsUntilMin;
  }

  // Flatten steps for consumesBowlOf / equipmentIds lookups.
  const steps = [];
  for (const recipe of pack.recipes) for (const s of recipe.steps) steps.push(s);

  // Equipment capacity is honoured for ANY equipment a filler needs, exactly as 04 Stage 4c:
  // a candidate on equipment E is eligible only if E has free capacity across its window. An
  // equipment id with no pack entry is treated as unlimited — this is Stage 4c's "if the pack
  // has no `sink` entry, ignore `equipmentId: sink`" rule, generalised to every id.
  const capOf = new Map(pack.equipment.map((e) => [e.id, e.capacity]));

  // ── 4a + 4b — the candidate pool, built in derivation order (the final tie-break) ─────────
  const candidates = [];
  let order = 0;

  // 4a bowls: a bowl is available at the LATEST runsUntilMin among steps that consume it; a
  // bowl no step consumes is available at minute 0.
  for (const bowl of plan.bowls || []) {
    const ids = new Set(bowl.ingredientIds);
    let availableAt = 0;
    for (const s of steps) {
      if (!(s.id in runsUntil)) continue;
      if ((s.consumesBowlOf || []).some((i) => ids.has(i)) && runsUntil[s.id] > availableAt) {
        availableAt = runsUntil[s.id];
      }
    }
    candidates.push({
      group: 0, label: `Wash bowl ${bowl.number}`, durationMin: WASH_BOWL_MIN,
      availableAt, equipmentId: 'sink', repeatable: false, used: false, order: order++,
    });
  }

  // 4a tools: checklist equipment with capacity <= 2, washable after its LAST use — but only if
  // that use ends before the makespan, else there is no gap left to wash it in.
  for (const e of pack.equipment) {
    if (!e.checklist || e.capacity > 2) continue;
    let last = -1;
    for (const s of steps) {
      if (!(s.id in runsUntil)) continue;
      if ((s.equipmentIds || []).includes(e.id) && runsUntil[s.id] > last) last = runsUntil[s.id];
    }
    if (last >= 0 && last < makespanMin) {
      candidates.push({
        group: 0, label: `Wash the ${e.name.toLowerCase()}`, durationMin: WASH_TOOL_MIN,
        availableAt: last, equipmentId: 'sink', repeatable: false, used: false, order: order++,
      });
    }
  }

  // 4b generic fillers: available from minute 0, in array order. A non-repeatable task may be
  // used at most once in the whole schedule.
  for (const f of pack.fillerTasks || []) {
    candidates.push({
      group: 1, label: f.label, durationMin: f.durationMin, availableAt: 0,
      equipmentId: f.equipmentId || null, repeatable: !!f.repeatable, used: false, order: order++,
    });
  }

  // ── 4c — gap filling, cook by cook in index order ─────────────────────────────────────────
  // equipBusy accumulates every placed filler's equipment window ACROSS cooks, keyed by
  // equipment id and seeded with that equipment's cooking use, so two cooks are never sent to
  // one capacity-limited resource (a sink, a griddle) at the same minute.
  const equipBusy = new Map();
  const busyOf = (eid) => {
    if (!equipBusy.has(eid)) equipBusy.set(eid, []);
    return equipBusy.get(eid);
  };
  for (const u of schedule.equipmentUse) busyOf(u.equipmentId).push({ startMin: u.startMin, endMin: u.endMin });
  const equipFree = (eid, start, dur) => {
    const cap = capOf.has(eid) ? capOf.get(eid) : Infinity;
    if (cap === Infinity) return true;
    let count = 0;
    for (const b of busyOf(eid)) if (b.startMin < start + dur && b.endMin > start) count += 1;
    return count < cap;
  };

  const cooks = schedule.cooks.map((cook) => {
    const stepAssignments = cook.assignments.filter((a) => a.kind === 'step');
    const fillers = [];

    for (const gap of idleIntervals(stepAssignments, makespanMin)) {
      if (gap.end - gap.start < MIN_GAP) continue;
      let cursor = gap.start;
      for (;;) {
        const pick = choose(candidates, cursor, gap.end, equipFree);
        if (!pick) break;
        const endMin = cursor + pick.durationMin;
        if (endMin <= cursor) break; // guard against a zero-duration task looping forever
        fillers.push({
          kind: 'filler', stepId: null, recipeId: null, label: pick.label,
          startMin: cursor, endMin, runsUntilMin: endMin, hands: 'busy',
          isCritical: false, equipmentIds: pick.equipmentId ? [pick.equipmentId] : [],
        });
        if (pick.equipmentId) busyOf(pick.equipmentId).push({ startMin: cursor, endMin });
        if (!pick.repeatable) pick.used = true;
        cursor = endMin;
      }
    }

    const assignments = stepAssignments.concat(fillers).sort((a, b) => a.startMin - b.startMin);
    let busy = 0;
    for (const a of assignments) busy += a.endMin - a.startMin;
    return { ...cook, assignments, idleMin: makespanMin - busy };
  });

  return { ...schedule, cooks };
}

/** The idle intervals of one cook within [0, makespanMin], from their step assignments.
 * @param {object[]} assignments the cook's step assignments @param {number} makespanMin
 * @returns {{start:number,end:number}[]} gaps in ascending start order */
function idleIntervals(assignments, makespanMin) {
  const sorted = assignments.slice().sort((a, b) => a.startMin - b.startMin);
  const gaps = [];
  let cursor = 0;
  for (const a of sorted) {
    if (a.startMin > cursor) gaps.push({ start: cursor, end: a.startMin });
    if (a.endMin > cursor) cursor = a.endMin;
  }
  if (cursor < makespanMin) gaps.push({ start: cursor, end: makespanMin });
  return gaps;
}

/** Pick the best still-eligible candidate for a slot at `cursor` inside a gap ending at `gapEnd`.
 * Eligible = unused, available by now, short enough to fit, and (if it needs equipment) that
 * equipment has free capacity across the window. Ranked exactly per Stage 4c: washables before
 * generic, then earliest availableAt, then longest durationMin, then derivation order.
 * @param {object[]} candidates @param {number} cursor @param {number} gapEnd
 * @param {(eid:string,start:number,dur:number)=>boolean} equipFree @returns {object|null} */
function choose(candidates, cursor, gapEnd, equipFree) {
  let best = null;
  for (const c of candidates) {
    if (c.used) continue;
    if (c.availableAt > cursor) continue;
    if (c.durationMin > gapEnd - cursor) continue;
    if (c.equipmentId && !equipFree(c.equipmentId, cursor, c.durationMin)) continue;
    if (best === null || beats(c, best)) best = c;
  }
  return best;
}

/** True when candidate c outranks b under the Stage 4c priority order.
 * @param {object} c @param {object} b @returns {boolean} */
function beats(c, b) {
  if (c.group !== b.group) return c.group < b.group;                 // washables (0) before generic (1)
  if (c.availableAt !== b.availableAt) return c.availableAt < b.availableAt; // earliest available
  if (c.durationMin !== b.durationMin) return c.durationMin > b.durationMin; // longest first
  return c.order < b.order;                                          // derivation/array order
}
