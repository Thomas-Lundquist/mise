// tests/fillers.test.js — fillGaps: Stage 4 filler derivation and gap filling.
// See docs/04-scheduler-spec.md (Stage 4) and docs/07-build-plan.md (T6 acceptance criteria).
import { test, eq } from './assert.js';
import { buildSchedule } from '../js/scheduler.js';
import { fillGaps } from '../js/fillers.js';

// ── tiny-pack builders (mirrors scheduler.test.js) ────────────────────────────
const step = (id, order, override, equipmentIds = [], consumesBowlOf = []) =>
  ({ id, recipeId: 'r', order, dependsOnOverride: override, equipmentIds, shortLabel: id, consumesBowlOf });
const tag = (durationMin, hands) =>
  ({ durationMin, hands, attentionMin: hands === 'busy' ? durationMin : Math.min(1, durationMin) });
const mkPack = (steps, { equipment = [], fillerTasks = [] } = {}) => ({
  packVersion: 1, packId: 'p', title: 'T', labMinutes: 50,
  equipment, fillerTasks, recipes: [{ id: 'r', name: 'R', ingredients: [], steps }],
});
const mkPlan = (tagsById, cooks, bowls = []) => ({
  planVersion: 1, packId: 'p', bowls, stepTags: tagsById, kitchen: { cooks, cookNames: [] },
});
// All assignments across cooks, flattened, and just the fillers.
const allAssignments = (s) => s.cooks.flatMap((c) => c.assignments);
const allFillers = (s) => allAssignments(s).filter((a) => a.kind === 'filler');

// ── Criterion: Case B's 19 idle minutes receive at least three fillers ────────
test('Case B: the 19 idle minutes receive at least three fillers', () => {
  const pack = mkPack([step('b1', 1, null), step('b2', 2, null)], {
    fillerTasks: [
      { id: 'f_wipe', label: 'Wipe down your station', durationMin: 3, equipmentId: null, repeatable: true },
      { id: 'f_sanit', label: 'Refill the sanitizer bucket', durationMin: 2, equipmentId: null, repeatable: false },
    ],
  });
  const base = buildSchedule(pack, mkPlan({ b1: tag(20, 'free'), b2: tag(5, 'busy') }, 1));
  const filled = fillGaps(base, pack, mkPlan({ b1: tag(20, 'free'), b2: tag(5, 'busy') }, 1));
  eq(allFillers(filled).length >= 3, true);
  // and every filler sits inside the one real gap [1, 20)
  for (const f of allFillers(filled)) eq(f.startMin >= 1 && f.endMin <= 20, true);
});

// ── Criterion: makespanMin is unchanged by filling (invariant 7) ──────────────
test('invariant 7: makespanMin is identical before and after fillGaps (fixture, cooks 1–5)', async () => {
  const pack = await fetch('../fixtures/recipe-pack.example.json').then((r) => r.json());
  const plan = await fetch('../fixtures/plan.example.json').then((r) => r.json());
  for (let n = 1; n <= 5; n += 1) {
    const p = { ...plan, kitchen: { ...plan.kitchen, cooks: n } };
    const base = buildSchedule(pack, p);
    const filled = fillGaps(base, pack, p);
    eq(filled.makespanMin, base.makespanMin);
  }
});

// ── Criterion: no filler overlaps a step or another filler for the same cook ──
// ── Criterion: no filler extends past makespanMin ─────────────────────────────
test('no filler overlaps a step or another filler, and none passes the makespan (fixture)', async () => {
  const pack = await fetch('../fixtures/recipe-pack.example.json').then((r) => r.json());
  const plan = await fetch('../fixtures/plan.example.json').then((r) => r.json());
  for (let n = 1; n <= 5; n += 1) {
    const p = { ...plan, kitchen: { ...plan.kitchen, cooks: n } };
    const filled = fillGaps(buildSchedule(pack, p), pack, p);
    for (const cook of filled.cooks) {
      const sorted = cook.assignments.slice().sort((a, b) => a.startMin - b.startMin);
      for (let i = 1; i < sorted.length; i += 1) eq(sorted[i].startMin >= sorted[i - 1].endMin, true);
      for (const f of cook.assignments) if (f.kind === 'filler') eq(f.endMin <= filled.makespanMin, true);
    }
  }
});

// ── Criterion: a sink with capacity 1 is never double-booked ──────────────────
test('a capacity-1 sink is never double-booked across cooks', () => {
  // Two independent 20-min passive steps: both cooks free from minute 1 to the makespan (20),
  // and the ONLY filler contends for a capacity-1 sink. Cook A grabs it; cook B must wait.
  const pack = {
    packVersion: 1, packId: 'p', title: 'T', labMinutes: 50,
    equipment: [{ id: 'sink', name: 'Sink', capacity: 1, checklist: false }],
    fillerTasks: [{ id: 'f_sink', label: 'Rinse at the sink', durationMin: 3, equipmentId: 'sink', repeatable: true }],
    recipes: [
      { id: 'r1', name: 'R1', ingredients: [], steps: [{ ...step('x1', 1, []), recipeId: 'r1' }] },
      { id: 'r2', name: 'R2', ingredients: [], steps: [{ ...step('x2', 1, []), recipeId: 'r2' }] },
    ],
  };
  const plan = mkPlan({ x1: tag(20, 'free'), x2: tag(20, 'free') }, 2);
  const filled = fillGaps(buildSchedule(pack, plan), pack, plan);
  const sinkFillers = allFillers(filled).filter((f) => f.equipmentIds.includes('sink'));
  eq(sinkFillers.length >= 1, true); // the sink did get used
  for (let m = 0; m < filled.makespanMin; m += 1) {
    const live = sinkFillers.filter((f) => f.startMin <= m && m < f.endMin).length;
    eq(live <= 1, true);
  }
});

// ── Criterion (B3): a NON-sink capacity-1 equipment is never double-booked by fillers ─────────
test('a capacity-1 non-sink filler equipment is never double-booked across cooks', () => {
  // Same shape as the sink test, but the contended resource is a generic capacity-1 'griddle'.
  // Before B3 (sink-only guard) both idle cooks would grab it at once; the generalized 4c check
  // must serialise them exactly as it does the sink. This exercises the previously-unreached path.
  const pack = {
    packVersion: 1, packId: 'p', title: 'T', labMinutes: 50,
    equipment: [{ id: 'griddle', name: 'Griddle', capacity: 1, checklist: false }],
    fillerTasks: [{ id: 'f_grid', label: 'Season the griddle', durationMin: 3, equipmentId: 'griddle', repeatable: true }],
    recipes: [
      { id: 'r1', name: 'R1', ingredients: [], steps: [{ ...step('x1', 1, []), recipeId: 'r1' }] },
      { id: 'r2', name: 'R2', ingredients: [], steps: [{ ...step('x2', 1, []), recipeId: 'r2' }] },
    ],
  };
  const plan = mkPlan({ x1: tag(20, 'free'), x2: tag(20, 'free') }, 2);
  const filled = fillGaps(buildSchedule(pack, plan), pack, plan);
  const gridFillers = allFillers(filled).filter((f) => f.equipmentIds.includes('griddle'));
  eq(gridFillers.length >= 1, true); // the griddle did get used
  for (let m = 0; m < filled.makespanMin; m += 1) {
    const live = gridFillers.filter((f) => f.startMin <= m && m < f.endMin).length;
    eq(live <= 1, true); // never two cooks on the one griddle at the same minute
  }
});

// ── Derivation: a dirty bowl becomes washable at its consuming step's runsUntilMin ────────────
test('a bowl washable is available at the consuming step end, and sink is ignored with no sink entry', () => {
  // Step 1 (active 5) empties bowl 1 at minute 5; step 2 (passive 20) leaves the cook idle 6–26.
  // The pack defines NO sink, so the washable's sink constraint is ignored and it still places.
  const pack = mkPack(
    [step('e1', 1, [], [], ['i_x']), step('e2', 2, [])],
    { fillerTasks: [] },
  );
  const plan = mkPlan(
    { e1: tag(5, 'busy'), e2: tag(20, 'free') }, 1,
    [{ id: 'b1', number: 1, ingredientIds: ['i_x'] }],
  );
  const filled = fillGaps(buildSchedule(pack, plan), pack, plan);
  const wash = allFillers(filled).filter((f) => f.label === 'Wash bowl 1');
  eq(wash.length, 1);                       // the dirty bowl produced exactly one wash task
  eq(wash[0].startMin >= 5, true);          // never scheduled before the bowl is actually dirty
  eq(wash[0].endMin <= filled.makespanMin, true);
});

// ── Derivation: a contended tool produces a "Wash the <tool>" filler on the fixture ───────────
test('a checklist tool used before the makespan yields a wash-the-tool filler (fixture)', async () => {
  const pack = await fetch('../fixtures/recipe-pack.example.json').then((r) => r.json());
  const plan = await fetch('../fixtures/plan.example.json').then((r) => r.json());
  const filled = fillGaps(buildSchedule(pack, plan), pack, plan);
  const toolWashes = allFillers(filled).filter((f) => f.label.startsWith('Wash the '));
  eq(toolWashes.length >= 1, true);
});

// ── A non-repeatable generic filler is used at most once in the whole schedule ────────────────
test('a non-repeatable filler is placed at most once across all cooks', () => {
  // Two cooks, both idle 1–20; only a single non-repeatable generic is offered.
  const pack = {
    packVersion: 1, packId: 'p', title: 'T', labMinutes: 50, equipment: [],
    fillerTasks: [{ id: 'f_once', label: 'Sweep the floor', durationMin: 4, equipmentId: null, repeatable: false }],
    recipes: [
      { id: 'r1', name: 'R1', ingredients: [], steps: [{ ...step('y1', 1, []), recipeId: 'r1' }] },
      { id: 'r2', name: 'R2', ingredients: [], steps: [{ ...step('y2', 1, []), recipeId: 'r2' }] },
    ],
  };
  const plan = mkPlan({ y1: tag(20, 'free'), y2: tag(20, 'free') }, 2);
  const filled = fillGaps(buildSchedule(pack, plan), pack, plan);
  eq(allFillers(filled).filter((f) => f.label === 'Sweep the floor').length, 1);
});

// ── Determinism: two calls produce byte-identical output ──────────────────────────────────────
test('invariant 6 (fillers): byte-identical output on a repeat call (fixture)', async () => {
  const pack = await fetch('../fixtures/recipe-pack.example.json').then((r) => r.json());
  const plan = await fetch('../fixtures/plan.example.json').then((r) => r.json());
  const a = JSON.stringify(fillGaps(buildSchedule(pack, plan), pack, plan));
  const b = JSON.stringify(fillGaps(buildSchedule(pack, plan), pack, plan));
  eq(a, b);
});
