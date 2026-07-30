// tests/warnings.test.js — checkPlan: Stage 5 plan sanity warnings.
// See docs/04-scheduler-spec.md (Stage 5) and docs/07-build-plan.md (T7 acceptance criteria).
// Each warning code has one triggering test; severity separation and interpolation are checked too.
import { test, eq } from './assert.js';
import { buildSchedule } from '../js/scheduler.js';
import { checkPlan } from '../js/warnings.js';

// ── tiny-pack builders (mirror scheduler/fillers tests) ───────────────────────
const step = (id, order, override, equipmentIds = [], shortLabel = id) =>
  ({ id, recipeId: 'r', order, dependsOnOverride: override, equipmentIds, shortLabel, consumesBowlOf: [] });
const tag = (durationMin, hands) =>
  ({ durationMin, hands, attentionMin: hands === 'busy' ? durationMin : Math.min(1, durationMin) });
const mkPack = (steps, { equipment = [], fillerTasks = [], labMinutes = 50, ingredients = [] } = {}) => ({
  packVersion: 1, packId: 'p', title: 'T', labMinutes,
  equipment, fillerTasks, recipes: [{ id: 'r', name: 'R', ingredients, steps }],
});
const mkPlan = (tagsById, cooks, bowls = []) => ({
  planVersion: 1, packId: 'p', bowls, stepTags: tagsById, kitchen: { cooks, cookNames: [] },
});
// Find the (first) warning with a given code, or undefined.
const byCode = (ws, code) => ws.find((w) => w.code === code);
const codes = (ws) => ws.map((w) => w.code);

// ── CYCLE (error) ─────────────────────────────────────────────────────────────
test('CYCLE: a dependency loop surfaces as an error', () => {
  const pack = mkPack([step('a', 1, ['b']), step('b', 2, ['a'])]);
  const plan = mkPlan({ a: tag(5, 'busy'), b: tag(5, 'busy') }, 1);
  const sched = buildSchedule(pack, plan);          // returns { ok:false, warnings:[CYCLE] }
  eq(sched.ok, false);
  const w = byCode(checkPlan(pack, plan, sched), 'CYCLE');
  eq(w.severity, 'error');
  eq(w.message, 'These steps depend on each other in a loop.');
});

// ── UNTAGGED (error) ──────────────────────────────────────────────────────────
test('UNTAGGED: a step with no tag is an error (no schedule available)', () => {
  const pack = mkPack([step('a', 1, null), step('b', 2, null)]);
  const plan = mkPlan({ a: tag(5, 'busy') }, 1);     // b is untagged; buildSchedule would throw
  const w = byCode(checkPlan(pack, plan, undefined), 'UNTAGGED');
  eq(w.severity, 'error');
  eq(w.message, 'Some steps still need a time.');
  eq(w.stepIds, ['b']);
});

// ── UNBOWLED (error) — interpolates the count ─────────────────────────────────
test('UNBOWLED: ungrouped ingredients are an error, count interpolated', () => {
  const pack = mkPack([step('a', 1, null)], {
    ingredients: [
      { id: 'i_x', recipeId: 'r', label: 'x', shortLabel: 'x' },
      { id: 'i_y', recipeId: 'r', label: 'y', shortLabel: 'y' },
    ],
  });
  const plan = mkPlan({ a: tag(5, 'busy') }, 1, []); // no bowls at all → both unbowled
  const w = byCode(checkPlan(pack, plan, buildSchedule(pack, plan)), 'UNBOWLED');
  eq(w.severity, 'error');
  eq(w.message, "2 ingredients aren't in a bowl yet.");
  eq(w.stepIds, ['i_x', 'i_y']);
});

// ── OVER_PERIOD (warn) — interpolates makespan and period ─────────────────────
test('OVER_PERIOD: makespan over the period, numbers interpolated', () => {
  const pack = mkPack([step('a', 1, null)], { labMinutes: 5 });
  const plan = mkPlan({ a: tag(10, 'busy') }, 1);    // makespan 10 > 5
  const w = byCode(checkPlan(pack, plan, buildSchedule(pack, plan)), 'OVER_PERIOD');
  eq(w.severity, 'warn');
  eq(w.message, 'This plan runs 10 minutes but the period is 5.');
});

// ── LONG_ACTIVE (warn) — interpolates duration and step name ──────────────────
test('LONG_ACTIVE: a 20-min hands-busy step names itself; a 15-min one does not', () => {
  const pack = mkPack([step('a', 1, null, [], 'Knead dough'), step('b', 2, null, [], 'Rest')]);
  const plan = mkPlan({ a: tag(20, 'busy'), b: tag(15, 'busy') }, 1);
  const ws = checkPlan(pack, plan, buildSchedule(pack, plan));
  const longs = ws.filter((w) => w.code === 'LONG_ACTIVE');
  eq(longs.length, 1);                               // only the 20-min step qualifies
  eq(longs[0].severity, 'warn');
  eq(longs[0].stepIds, ['a']);
  eq(longs[0].message, "Are your hands really busy for the whole 20 minutes on 'Knead dough'?");
});

// ── IDLE_HEAVY (warn) — names the idle cook ───────────────────────────────────
test('IDLE_HEAVY: a cook under 50% utilization is named', () => {
  // One 10-min active step, two cooks: Cook A is 100% busy, Cook B is 0%.
  const pack = mkPack([step('a', 1, null)]);
  const plan = mkPlan({ a: tag(10, 'busy') }, 2);
  const ws = checkPlan(pack, plan, buildSchedule(pack, plan));
  const idle = ws.filter((w) => w.code === 'IDLE_HEAVY');
  eq(idle.length, 1);
  eq(idle[0].severity, 'warn');
  eq(idle[0].message, 'Cook B is standing around for most of the lab.');
});

// ── FAR_FROM_FLOOR (warn) — interpolates the floor ────────────────────────────
test('FAR_FROM_FLOOR: makespan well above the floor, floor interpolated', () => {
  // Two independent 10-min active steps sharing a capacity-1 oven, 2 cooks:
  // floor = 10 (each chain is 10), but the oven serializes them → makespan 20 > 10*1.4.
  const pack = mkPack(
    [{ ...step('a', 1, [], ['oven']), recipeId: 'r' }, { ...step('b', 1, [], ['oven']), recipeId: 'r2' }],
    { equipment: [{ id: 'oven', name: 'Oven', capacity: 1, checklist: true }] },
  );
  pack.recipes = [
    { id: 'r', name: 'R', ingredients: [], steps: [{ ...step('a', 1, [], ['oven']), recipeId: 'r' }] },
    { id: 'r2', name: 'R2', ingredients: [], steps: [{ ...step('b', 1, [], ['oven']), recipeId: 'r2' }] },
  ];
  const plan = mkPlan({ a: tag(10, 'busy'), b: tag(10, 'busy') }, 2);
  const sched = buildSchedule(pack, plan);
  eq(sched.floorMin, 10);
  eq(sched.makespanMin, 20);
  const w = byCode(checkPlan(pack, plan, sched), 'FAR_FROM_FLOOR');
  eq(w.severity, 'warn');
  eq(w.message, 'This could run in about 10 minutes. Look for something to start earlier.');
});

// ── SOLO_CROWD (warn) — 3+ cooks but nothing overlaps ─────────────────────────
test('SOLO_CROWD: three cooks, a serial chain, nothing ever overlaps', () => {
  // Two chained 5-min active steps run one-after-another; with 3 cooks two stand idle.
  const pack = mkPack([step('a', 1, null), step('b', 2, null)]);
  const plan = mkPlan({ a: tag(5, 'busy'), b: tag(5, 'busy') }, 3);
  const w = byCode(checkPlan(pack, plan, buildSchedule(pack, plan)), 'SOLO_CROWD');
  eq(!!w, true);
  eq(w.severity, 'warn');
  eq(w.message, 'Almost nothing overlaps — check which steps could happen at the same time.');
});

test('SOLO_CROWD: does NOT fire when steps overlap, even with 3 cooks', () => {
  // Two independent 10-min steps run 0–10 in parallel → 2 concurrent, so no SOLO_CROWD.
  const pack = {
    packVersion: 1, packId: 'p', title: 'T', labMinutes: 50, equipment: [], fillerTasks: [],
    recipes: [
      { id: 'r1', name: 'R1', ingredients: [], steps: [{ ...step('x', 1, []), recipeId: 'r1' }] },
      { id: 'r2', name: 'R2', ingredients: [], steps: [{ ...step('y', 1, []), recipeId: 'r2' }] },
    ],
  };
  const plan = mkPlan({ x: tag(10, 'busy'), y: tag(10, 'busy') }, 3);
  eq(byCode(checkPlan(pack, plan, buildSchedule(pack, plan)), 'SOLO_CROWD'), undefined);
});

// ── Separation: every error precedes every warn, and each code's severity is right ──
test('errors are separated from warns and ordered before them', () => {
  // Unbowled ingredient (error) + over-period makespan (warn) + a long-active step (warn).
  const pack = mkPack([step('a', 1, null, [], 'Simmer')], {
    labMinutes: 5,
    ingredients: [{ id: 'i_x', recipeId: 'r', label: 'x', shortLabel: 'x' }],
  });
  const plan = mkPlan({ a: tag(20, 'busy') }, 1, []); // makespan 20 > 5, dur 20 busy, no bowls
  const ws = checkPlan(pack, plan, buildSchedule(pack, plan));
  // Order: all errors, then all warns.
  const firstWarn = ws.findIndex((w) => w.severity === 'warn');
  const lastError = ws.map((w) => w.severity).lastIndexOf('error');
  eq(lastError < firstWarn, true);
  // The expected codes are present in table order.
  eq(codes(ws), ['UNBOWLED', 'OVER_PERIOD', 'LONG_ACTIVE']);
  for (const w of ws) eq(w.severity, w.code === 'UNBOWLED' ? 'error' : 'warn');
});

// ── A clean, fast, fully-tagged, fully-bowled plan yields no warnings at all ───
test('a tidy plan produces an empty warning list', () => {
  const pack = mkPack([step('a', 1, null)], {
    ingredients: [{ id: 'i_x', recipeId: 'r', label: 'x', shortLabel: 'x' }],
  });
  const plan = mkPlan({ a: tag(5, 'busy') }, 1, [{ id: 'b1', number: 1, ingredientIds: ['i_x'] }]);
  eq(checkPlan(pack, plan, buildSchedule(pack, plan)), []);
});
