// tests/graph.test.js — buildGraph: dependency resolution, tails, floor, critical path, cycles.
// See docs/04-scheduler-spec.md (Stages 1–2) and docs/09-test-plan.md (hand cases A–C, Part 2b).
import { test, eq } from './assert.js';
import { buildGraph } from '../js/scheduler.js';

// buildGraph only reads pack.recipes[].steps (id, order, dependsOnOverride) and plan.stepTags,
// so these inline packs carry nothing else. Real food lives only in the fixtures.
const step = (id, order, override) => ({ id, recipeId: 'r', order, dependsOnOverride: override });
const recipe = (id, steps) => ({ id, steps });
const pack = (recipes) => ({ recipes });
const plan = (durById) => ({
  stepTags: Object.fromEntries(Object.entries(durById).map(([id, d]) => [id, { durationMin: d }])),
});

// ── Case A — serial chain. Three active 5-min steps, chained. floorMin = 15. ──
test('Case A: serial chain has floorMin 15', () => {
  const p = pack([recipe('r', [step('a1', 1, null), step('a2', 2, null), step('a3', 3, null)])]);
  const g = buildGraph(p, plan({ a1: 5, a2: 5, a3: 5 }));
  eq(g.floorMin, 15);
});
test('Case A: the whole chain is critical', () => {
  const p = pack([recipe('r', [step('a1', 1, null), step('a2', 2, null), step('a3', 3, null)])]);
  eq(buildGraph(p, plan({ a1: 5, a2: 5, a3: 5 })).criticalStepIds, ['a1', 'a2', 'a3']);
});

// ── Case B — passive dominates. Passive 20 then active 5 that depends on it. floorMin = 25. ──
test('Case B: passive step drives floorMin to 25', () => {
  const p = pack([recipe('r', [step('b1', 1, null), step('b2', 2, null)])]);
  const g = buildGraph(p, plan({ b1: 20, b2: 5 }));
  eq(g.floorMin, 25);
  eq(g.criticalStepIds, ['b1', 'b2']);
});

// ── Case C — free parallelism. Two independent 10-min recipes. floorMin = 10. ──
test('Case C: independent recipes give floorMin 10', () => {
  const p = { recipes: [recipe('r1', [step('c1', 1, null)]), recipe('r2', [step('c2', 1, null)])] };
  const g = buildGraph(p, plan({ c1: 10, c2: 10 }));
  eq(g.floorMin, 10);
});
test('Case C: both steps depend on nothing', () => {
  const p = { recipes: [recipe('r1', [step('c1', 1, null)]), recipe('r2', [step('c2', 1, null)])] };
  const g = buildGraph(p, plan({ c1: 10, c2: 10 }));
  eq(g.deps, { c1: [], c2: [] });
});

// ── succ is the inverse of deps ───────────────────────────────────────────────
test('successors are the inverse of dependencies', () => {
  const p = pack([recipe('r', [step('a1', 1, null), step('a2', 2, null)])]);
  eq(buildGraph(p, plan({ a1: 5, a2: 5 })).succ, { a1: ['a2'], a2: [] });
});

// ── Cycle — returns the CYCLE error, never hangs ──────────────────────────────
test('a dependency cycle returns { ok: false }', () => {
  const p = pack([recipe('r', [step('x', 1, ['y']), step('y', 2, ['x'])])]);
  eq(buildGraph(p, plan({ x: 5, y: 5 })).ok, false);
});
test('the cycle result carries a CYCLE error of severity error', () => {
  const p = pack([recipe('r', [step('x', 1, ['y']), step('y', 2, ['x'])])]);
  const g = buildGraph(p, plan({ x: 5, y: 5 }));
  eq(g.warnings[0].code, 'CYCLE');
  eq(g.warnings[0].severity, 'error');
});

// ── Fixture golden values — from fixtures/README.md, computed from the spec, not the code. ──
const examplePack = await fetch('../fixtures/recipe-pack.example.json').then((r) => r.json());
const examplePlan = await fetch('../fixtures/plan.example.json').then((r) => r.json());

test('example fixture: floorMin is 45', () => {
  eq(buildGraph(examplePack, examplePlan).floorMin, 45);
});
test('example fixture: critical path is the pilaf chain', () => {
  eq(buildGraph(examplePack, examplePlan).criticalStepIds, [
    's_pil_prep', 's_pil_sweat', 's_pil_toast', 's_pil_liquid', 's_pil_simmer', 's_pil_rest', 's_pil_fluff',
  ]);
});
