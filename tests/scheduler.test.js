// tests/scheduler.test.js — buildSchedule: the Stage-3 simulation.
// See docs/04-scheduler-spec.md (Stage 3) and docs/09-test-plan.md (invariants + hand cases A–F).
import { test, eq } from './assert.js';
import { buildSchedule, buildGraph } from '../js/scheduler.js';

// ── tiny-pack builders ────────────────────────────────────────────────────────
// buildSchedule reads step id/recipeId/order/dependsOnOverride/equipmentIds/shortLabel,
// pack.equipment (for capacity), plan.stepTags, plan.kitchen.cooks, plan.bowls. Nothing else.
const step = (id, order, override, equipmentIds = []) =>
  ({ id, recipeId: 'r', order, dependsOnOverride: override, equipmentIds, shortLabel: id, consumesBowlOf: [] });
const tag = (durationMin, hands) =>
  ({ durationMin, hands, attentionMin: hands === 'busy' ? durationMin : Math.min(1, durationMin) });
const mkPack = (steps, equipment = []) => ({
  packVersion: 1, packId: 'p', title: 'T', labMinutes: 50,
  equipment, fillerTasks: [], recipes: [{ id: 'r', name: 'R', ingredients: [], steps }],
});
const mkPlan = (tagsById, cooks) => ({
  planVersion: 1, packId: 'p', bowls: [], stepTags: tagsById, kitchen: { cooks, cookNames: [] },
});
// Flatten every assignment across cooks, keyed by stepId, for pointed assertions.
const byStep = (sched) => {
  const m = {};
  for (const cook of sched.cooks) for (const a of cook.assignments) m[a.stepId] = a;
  return m;
};

// ── Case A — serial chain, 1 cook. floor 15, makespan 15, idle 0. ─────────────
test('Case A: serial chain runs 15 minutes with no idle', () => {
  const pack = mkPack([step('a1', 1, null), step('a2', 2, null), step('a3', 3, null)]);
  const s = buildSchedule(pack, mkPlan({ a1: tag(5, 'busy'), a2: tag(5, 'busy'), a3: tag(5, 'busy') }, 1));
  eq(s.floorMin, 15);
  eq(s.makespanMin, 15);
  eq(s.cooks[0].idleMin, 0);
});

// ── Case B — passive dominates, 1 cook. floor/makespan 25; cook busy 6, idle 19. ──
test('Case B: passive 20 + active 5 gives makespan 25, idle 19', () => {
  const pack = mkPack([step('b1', 1, null), step('b2', 2, null)]);
  const s = buildSchedule(pack, mkPlan({ b1: tag(20, 'free'), b2: tag(5, 'busy') }, 1));
  eq(s.floorMin, 25);
  eq(s.makespanMin, 25);
  eq(s.cooks[0].idleMin, 19);
});

// ── Case C — free parallelism, 2 cooks. floor/makespan 10, both busy. ─────────
test('Case C: two independent 10-min steps finish at 10 on two cooks', () => {
  const pack = {
    packVersion: 1, packId: 'p', title: 'T', labMinutes: 50, equipment: [], fillerTasks: [],
    recipes: [
      { id: 'r1', name: 'R1', ingredients: [], steps: [{ ...step('c1', 1, []), recipeId: 'r1' }] },
      { id: 'r2', name: 'R2', ingredients: [], steps: [{ ...step('c2', 1, []), recipeId: 'r2' }] },
    ],
  };
  const s = buildSchedule(pack, mkPlan({ c1: tag(10, 'busy'), c2: tag(10, 'busy') }, 2));
  eq(s.floorMin, 10);
  eq(s.makespanMin, 10);
  eq(s.cooks[0].idleMin, 0);
  eq(s.cooks[1].idleMin, 0);
});

// ── Case D — equipment contention, 2 cooks, oven capacity 1. makespan 20. ─────
test('Case D: shared capacity-1 oven serialises two 10-min steps to 20', () => {
  const pack = mkPack(
    [step('d1', 1, [], ['oven']), step('d2', 2, [], ['oven'])],
    [{ id: 'oven', name: 'Oven', capacity: 1, checklist: true }],
  );
  const s = buildSchedule(pack, mkPlan({ d1: tag(10, 'busy'), d2: tag(10, 'busy') }, 2));
  eq(s.makespanMin, 20);
});

// ── Case E — the passive tie-break, 1 cook. s_b (free) starts first; makespan 11. ──
test('Case E: on a tail tie the hands-free step goes first, makespan 11', () => {
  const pack = {
    packVersion: 1, packId: 'p', title: 'T', labMinutes: 50, equipment: [], fillerTasks: [],
    recipes: [
      { id: 'r1', name: 'R1', ingredients: [], steps: [{ ...step('s_a', 1, []), recipeId: 'r1' }] },
      { id: 'r2', name: 'R2', ingredients: [], steps: [{ ...step('s_b', 1, []), recipeId: 'r2' }] },
    ],
  };
  const s = buildSchedule(pack, mkPlan({ s_a: tag(10, 'busy'), s_b: tag(10, 'free') }, 1));
  const at = byStep(s);
  eq(at.s_b.startMin, 0);
  eq(at.s_a.startMin, 1);
  eq(s.makespanMin, 11);
});

// ── Case F — a blocked candidate must not stall the minute, 2 cooks. ──────────
test('Case F: a candidate blocked on equipment does not delay a free one', () => {
  const pack = {
    packVersion: 1, packId: 'p', title: 'T', labMinutes: 50, fillerTasks: [],
    equipment: [{ id: 'oven', name: 'Oven', capacity: 1, checklist: true }],
    recipes: [
      { id: 'r1', name: 'R1', ingredients: [], steps: [{ ...step('p', 1, [], ['oven']), recipeId: 'r1' }] },
      { id: 'r2', name: 'R2', ingredients: [], steps: [{ ...step('s_hi', 1, [], ['oven']), recipeId: 'r2' }] },
      { id: 'r3', name: 'R3', ingredients: [], steps: [{ ...step('s_lo', 1, []), recipeId: 'r3' }] },
    ],
  };
  const s = buildSchedule(pack, mkPlan({ p: tag(30, 'free'), s_hi: tag(10, 'busy'), s_lo: tag(2, 'busy') }, 2));
  const at = byStep(s);
  eq(at.s_lo.startMin, 0);   // free cook is used at 0, not stalled behind the blocked s_hi
  eq(at.s_hi.startMin, 30);  // waits for the oven to clear
  eq(s.makespanMin, 40);
});

// ── Golden fixture values + invariants across cooks 1–5 ───────────────────────
const examplePack = await fetch('../fixtures/recipe-pack.example.json').then((r) => r.json());
const examplePlan = await fetch('../fixtures/plan.example.json').then((r) => r.json());
const withCooks = (n) => ({ ...examplePlan, kitchen: { ...examplePlan.kitchen, cooks: n } });

// Golden reference table from fixtures/README.md (computed from the spec, not the code).
const GOLD_MAKESPAN = { 1: 68, 2: 47, 3: 45, 4: 45, 5: 45 };
const GOLD_COOKMIN = { 1: [57], 2: [34, 23], 3: [28, 23, 6], 4: [28, 23, 2, 4], 5: [28, 23, 2, 1, 3] };

test('fixture: floorMin is 45', () => eq(buildSchedule(examplePack, examplePlan).floorMin, 45));

for (let n = 1; n <= 5; n += 1) {
  test(`fixture: makespan for ${n} cook(s) is ${GOLD_MAKESPAN[n]}`, () => {
    eq(buildSchedule(examplePack, withCooks(n)).makespanMin, GOLD_MAKESPAN[n]);
  });
  // docs/10 (Layer 1) deliberately changes WHICH cook does what to keep stations coherent, so the
  // per-index cook-minute split is no longer a golden invariant. What IS conserved is the TOTAL
  // cook-minutes (fixed by the tags, independent of assignment) — assert that against the old row.
  test(`fixture: total cook-minutes for ${n} cook(s) are conserved`, () => {
    const s = buildSchedule(examplePack, withCooks(n));
    const total = s.cooks.reduce((sum, c) => sum + c.assignments.reduce((a, r) => a + (r.endMin - r.startMin), 0), 0);
    eq(total, GOLD_COOKMIN[n].reduce((a, b) => a + b, 0));
  });
}

// Invariant 8 — adding a cook never lengthens the plan.
test('invariant 8: makespan is monotonic non-increasing in cooks', () => {
  const m = [1, 2, 3, 4, 5].map((n) => buildSchedule(examplePack, withCooks(n)).makespanMin);
  for (let i = 1; i < m.length; i += 1) eq(m[i] <= m[i - 1], true);
});

// Invariants 1–5 on the fixture, for every cook count.
for (let n = 1; n <= 5; n += 1) {
  test(`invariants 1–5 hold on the fixture with ${n} cook(s)`, () => {
    const plan = withCooks(n);
    const s = buildSchedule(examplePack, plan);
    const at = byStep(s);
    const deps = buildGraph(examplePack, plan).deps;

    // 1. Dependencies respected: a step starts no earlier than each dependency finishes.
    for (const id in at) for (const d of deps[id]) eq(at[id].startMin >= at[d].runsUntilMin, true);

    // 2. No cook double-booked: within a cook, sorted lanes never overlap.
    for (const cook of s.cooks) {
      const sorted = cook.assignments.slice().sort((a, b) => a.startMin - b.startMin);
      for (let i = 1; i < sorted.length; i += 1) eq(sorted[i].startMin >= sorted[i - 1].endMin, true);
    }

    // 3. Equipment capacity never exceeded, checked minute by minute.
    const capOf = new Map(examplePack.equipment.map((e) => [e.id, e.capacity]));
    for (let m = 0; m < s.makespanMin; m += 1) {
      const live = {};
      for (const u of s.equipmentUse) {
        if (u.startMin <= m && m < u.endMin) live[u.equipmentId] = (live[u.equipmentId] || 0) + 1;
      }
      for (const id in live) eq(live[id] <= capOf.get(id), true);
    }

    // 4. Makespan is not below the floor.
    eq(s.makespanMin >= s.floorMin, true);

    // 5. Complete: every step appears exactly once.
    let count = 0;
    for (const cook of s.cooks) for (const a of cook.assignments) if (a.kind === 'step') count += 1;
    eq(count, 17);
    eq(Object.keys(at).length, 17);
  });
}

// Invariant 6 — deterministic across repeat calls and across a shuffle of the input arrays.
test('invariant 6: byte-identical output on a repeat call', () => {
  const a = JSON.stringify(buildSchedule(examplePack, examplePlan));
  const b = JSON.stringify(buildSchedule(examplePack, examplePlan));
  eq(a, b);
});
test('invariant 6: byte-identical output after shuffling recipes, steps, and equipment', () => {
  const rev = (arr) => arr.slice().reverse();
  const shuffled = {
    ...examplePack,
    equipment: rev(examplePack.equipment),
    recipes: rev(examplePack.recipes).map((r) => ({ ...r, steps: rev(r.steps), ingredients: rev(r.ingredients) })),
  };
  eq(JSON.stringify(buildSchedule(shuffled, examplePlan)), JSON.stringify(buildSchedule(examplePack, examplePlan)));
});

// ── Station affinity (docs/10-affinity-amendment.md) ──────────────────────────
// Two-recipe builder: each recipe a chain; caller supplies steps per recipe.
const mkTwoRecipe = (r1Steps, r2Steps, equipment = [], affinityWeight) => {
  const pack = {
    packVersion: 1, packId: 'p', title: 'T', labMinutes: 50, equipment, fillerTasks: [],
    recipes: [
      { id: 'r1', name: 'R1', ingredients: [], steps: r1Steps },
      { id: 'r2', name: 'R2', ingredients: [], steps: r2Steps },
    ],
  };
  if (affinityWeight !== undefined) pack.affinityWeight = affinityWeight;
  return pack;
};
const rStep = (id, recipeId, order, dur, hands, override = null, equipmentIds = []) =>
  ({ id, recipeId, order, dependsOnOverride: override, equipmentIds, shortLabel: id, consumesBowlOf: [], _t: tag(dur, hands) });
const planFor = (steps, cooks, affinityless) => {
  const stepTags = {};
  for (const s of steps) stepTags[s.id] = s._t;
  return { planVersion: 1, packId: 'p', bowls: [], stepTags, kitchen: { cooks, cookNames: [] } };
};

// ── Case G — cook affinity is free. 2 cooks, two parallel 2-step active chains. ──
// makespan 10 (baseline-identical) AND each recipe's two steps land on the SAME cook (Layer 1).
test('Case G: affinity clusters each recipe on one cook at zero timing cost', () => {
  const r1 = [rStep('r1s1', 'r1', 1, 5, 'busy'), rStep('r1s2', 'r1', 2, 5, 'busy')];
  const r2 = [rStep('r2s1', 'r2', 1, 5, 'busy'), rStep('r2s2', 'r2', 2, 5, 'busy')];
  const pack = mkTwoRecipe(r1, r2, [], 0);
  const s = buildSchedule(pack, planFor([...r1, ...r2], 2));
  eq(s.makespanMin, 10);
  eq(s.affinityWeightUsed, 0);
  // find each step's cook
  const cookOf = {};
  for (const c of s.cooks) for (const a of c.assignments) cookOf[a.stepId] = c.index;
  eq(cookOf.r1s1, cookOf.r1s2); // R1 stays on one cook
  eq(cookOf.r2s1, cookOf.r2s2); // R2 stays on the other
});

// ── Case H — the band trades urgency for coherence. 2 cooks. ──────────────────
// At t=4 the only free cook just finished an R1 step; the higher-tail ready step is R2 (c1, tail 8)
// and an on-dish R1 step (a2, tail 5) sits `gap`=3 below. station (cap 1) blocks c1 until a1 frees
// it at t=4, and b_long keeps the other cook busy — so the two steps compete for the one free cook.
const caseHPack = (w) => mkTwoRecipe(
  [rStep('a1', 'r1', 1, 4, 'busy', null, ['station']), rStep('a2', 'r1', 2, 5, 'busy')],
  [rStep('b_long', 'r2', 1, 10, 'busy', []), rStep('c1', 'r2', 2, 8, 'busy', [], ['station'])],
  [{ id: 'station', name: 'Station', capacity: 1, checklist: true }], w,
);
const caseHSteps = [
  rStep('a1', 'r1', 1, 4, 'busy'), rStep('a2', 'r1', 2, 5, 'busy'),
  rStep('b_long', 'r2', 1, 10, 'busy'), rStep('c1', 'r2', 2, 8, 'busy'),
];
const caseHAt = (w) => {
  const s = buildSchedule(caseHPack(w), planFor(caseHSteps, 2));
  const m = {};
  for (const c of s.cooks) for (const a of c.assignments) m[a.stepId] = a.startMin;
  return m;
};
test('Case H at weight 0: the higher-tail R2 step is taken over the on-dish R1 step', () => {
  const at = caseHAt(0);
  eq(at.c1, 4);        // urgent R2 step starts at the decision minute
  eq(at.a2 > 4, true); // the on-dish R1 step is deferred
});
test('Case H at weight 3 (the tail gap): the on-dish R1 step is promoted instead', () => {
  const at = caseHAt(3);
  eq(at.a2, 4);        // on-dish R1 step promoted at the decision minute
  eq(at.c1 > 4, true); // the urgent R2 step is deferred — the bounded cost of coherence
});

// ── Case I — determinism at a nonzero weight, and independent of input order. ──
test('Case I: byte-identical output on a repeat call at affinityWeight 3', () => {
  const p = { ...examplePack, affinityWeight: 3 };
  eq(JSON.stringify(buildSchedule(p, examplePlan)), JSON.stringify(buildSchedule(p, examplePlan)));
});
test('Case I: output is unchanged after shuffling recipes, steps, and equipment at weight 3', () => {
  const rev = (arr) => arr.slice().reverse();
  const p = { ...examplePack, affinityWeight: 3 };
  const shuffled = {
    ...p,
    equipment: rev(p.equipment),
    recipes: rev(p.recipes).map((r) => ({ ...r, steps: rev(r.steps), ingredients: rev(r.ingredients) })),
  };
  eq(JSON.stringify(buildSchedule(shuffled, examplePlan)), JSON.stringify(buildSchedule(p, examplePlan)));
});

// ── Weight-0 output fields, and the invariant-8 REPORT at weight 3 (never fails). ──
test('fixture: affinity output fields at weight 0 (used=0, cost = makespan - floor)', () => {
  const s = buildSchedule(examplePack, examplePlan);
  eq(s.affinityWeightUsed, 0);
  eq(s.costOverFloorMin, s.makespanMin - s.floorMin);
});
// docs/10: above weight 0, invariant 8 (adding a cook never lengthens the plan) is a REPORTED
// observation, not an assert. Print the makespan-by-cook row at weight 3 so a tuning regression is
// visible; assert only invariant 4 (makespan >= floor), which holds at every weight.
test('report: makespan by cook count at affinityWeight 3 (invariant 8 not asserted here)', () => {
  const p = { ...examplePack, affinityWeight: 3 };
  const row = [1, 2, 3, 4, 5].map((n) => buildSchedule(p, withCooks(n)).makespanMin);
  console.log('affinityWeight=3 makespan by cooks [1..5]:', row.join(' '));
  for (const n of [1, 2, 3, 4, 5]) {
    const s = buildSchedule(p, withCooks(n));
    eq(s.makespanMin >= s.floorMin, true);
  }
});
