// js/warnings.js — plan sanity warnings. Pure: no DOM, no Date, no randomness.
// See docs/04-scheduler-spec.md Stage 5. Errors block printing; warns are coaching.

/** Produce the ordered list of warnings and errors for a plan and its schedule.
 * Errors (severity "error") come first, then warns, each group in the Stage-5 table order.
 * Structural errors (UNTAGGED, UNBOWLED) and the tag-only warn (LONG_ACTIVE) are derived
 * straight from pack+plan, so they hold even when there is no usable schedule; CYCLE is read
 * back from a { ok:false } schedule, and the makespan-dependent warns run only when ok.
 * @param {object} pack a validated Pack (see docs/03-data-model.md)
 * @param {object} plan the student's Plan
 * @param {object} [schedule] the computed Schedule, or a { ok:false, warnings } cycle result
 * @returns {Array<{code:string,severity:string,message:string,stepIds:string[]}>} */
export function checkPlan(pack, plan, schedule) {
  const errors = [];
  const warns = [];
  const tags = (plan && plan.stepTags) || {};
  const hasSchedule = !!(schedule && schedule.ok === true);

  // ── Errors ──────────────────────────────────────────────────────────────────

  // CYCLE — buildSchedule cannot simulate a cyclic graph; it returns { ok:false, warnings }.
  // We surface that pre-built error object as-is rather than re-deriving the graph here.
  if (schedule && schedule.ok === false) {
    for (const w of schedule.warnings || []) {
      if (w.code === 'CYCLE') {
        errors.push({ code: 'CYCLE', severity: 'error', message: w.message, stepIds: (w.stepIds || []).slice() });
      }
    }
  }

  // UNTAGGED — any step with no StepTag. buildSchedule *throws* on this, so it is detected
  // here from the plan directly (the caller may hold no schedule at all in that case).
  const untagged = [];
  for (const recipe of pack.recipes) {
    for (const s of recipe.steps) if (!tags[s.id]) untagged.push(s.id);
  }
  if (untagged.length) {
    errors.push({ code: 'UNTAGGED', severity: 'error', message: 'Some steps still need a time.', stepIds: untagged });
  }

  // UNBOWLED — any ingredient in no bowl. Bowls never affect scheduling, so this can fire
  // alongside a perfectly good schedule. stepIds carries the ingredient ids (see OPEN-QUESTIONS).
  const bowled = new Set();
  for (const b of (plan && plan.bowls) || []) for (const ing of b.ingredientIds || []) bowled.add(ing);
  const unbowled = [];
  for (const recipe of pack.recipes) {
    for (const ing of recipe.ingredients || []) if (!bowled.has(ing.id)) unbowled.push(ing.id);
  }
  if (unbowled.length) {
    errors.push({
      code: 'UNBOWLED',
      severity: 'error',
      message: `${unbowled.length} ingredients aren't in a bowl yet.`,
      stepIds: unbowled,
    });
  }

  // ── Warns, in Stage-5 table order ────────────────────────────────────────────

  // OVER_PERIOD — the plan runs longer than the class period.
  if (hasSchedule && schedule.makespanMin > pack.labMinutes) {
    warns.push({
      code: 'OVER_PERIOD',
      severity: 'warn',
      message: `This plan runs ${schedule.makespanMin} minutes but the period is ${pack.labMinutes}.`,
      stepIds: [],
    });
  }

  // LONG_ACTIVE — a hands-busy step of 20+ minutes; likely a passive step mis-tagged as active.
  // One warning per qualifying step so each names itself. Derived from tags, no schedule needed.
  for (const recipe of pack.recipes) {
    for (const s of recipe.steps) {
      const tag = tags[s.id];
      if (tag && tag.hands === 'busy' && tag.durationMin >= 20) {
        warns.push({
          code: 'LONG_ACTIVE',
          severity: 'warn',
          message: `Are your hands really busy for the whole ${tag.durationMin} minutes on '${s.shortLabel}'?`,
          stepIds: [s.id],
        });
      }
    }
  }

  // IDLE_HEAVY — a cook busy under half the lab. One warning per idle cook, in cook-index order.
  if (hasSchedule) {
    for (const cook of schedule.cooks) {
      if (cook.utilizationPct < 50) {
        warns.push({
          code: 'IDLE_HEAVY',
          severity: 'warn',
          message: `${cook.name} is standing around for most of the lab.`,
          stepIds: [],
        });
      }
    }
  }

  // FAR_FROM_FLOOR — the makespan is well above the critical-path floor; something startable early
  // is being left late. The teaching warn: worded as an invitation, not a verdict.
  if (hasSchedule && schedule.makespanMin > schedule.floorMin * 1.4) {
    warns.push({
      code: 'FAR_FROM_FLOOR',
      severity: 'warn',
      message: `This could run in about ${schedule.floorMin} minutes. Look for something to start earlier.`,
      stepIds: [],
    });
  }

  // SOLO_CROWD — three or more cooks, yet no two steps ever run at once. Overlap uses each step's
  // full elapsed window [startMin, runsUntilMin) so a passive step still cooking counts as running
  // (see OPEN-QUESTIONS). Fewer than 2 concurrent means the parallelism is going unused.
  if (hasSchedule && plan.kitchen.cooks >= 3 && maxConcurrentSteps(schedule) < 2) {
    warns.push({
      code: 'SOLO_CROWD',
      severity: 'warn',
      message: 'Almost nothing overlaps — check which steps could happen at the same time.',
      stepIds: [],
    });
  }

  return errors.concat(warns);
}

/** Peak number of steps whose elapsed windows [startMin, runsUntilMin) overlap at one instant.
 * A sweep over start/end events; at equal times an end is processed before a start, so steps
 * that merely touch ([a,b)[b,c)) do not count as simultaneous.
 * @param {object} schedule a Schedule with ok:true @returns {number} */
function maxConcurrentSteps(schedule) {
  const events = [];
  for (const cook of schedule.cooks) {
    for (const a of cook.assignments) {
      if (a.kind !== 'step') continue;
      events.push({ t: a.startMin, delta: 1 });
      events.push({ t: a.runsUntilMin, delta: -1 });
    }
  }
  events.sort((x, y) => x.t - y.t || x.delta - y.delta);
  let current = 0;
  let max = 0;
  for (const e of events) {
    current += e.delta;
    if (current > max) max = current;
  }
  return max;
}
