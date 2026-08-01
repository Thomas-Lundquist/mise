// tests/model.test.js — validation, resolveDeps, derivedTag, blankPlan. See docs/03-data-model.md.
import { test, eq } from './assert.js';
import { validatePack, validatePlan, resolveDeps, derivedTag, blankPlan } from '../js/model.js';

// A minimal, fully valid pack. Two chained steps in one recipe, two ingredients.
function basePack() {
  return {
    packVersion: 1, packId: 'p_t', title: 'T', labMinutes: 50,
    equipment: [{ id: 'oven', name: 'Oven', capacity: 1, checklist: true }],
    fillerTasks: [{ id: 'f1', label: 'Wipe', durationMin: 3, equipmentId: null, repeatable: false }],
    recipes: [{
      id: 'r1', name: 'R1',
      ingredients: [
        { id: 'i1', recipeId: 'r1', label: 'A', shortLabel: 'a' },
        { id: 'i2', recipeId: 'r1', label: 'B', shortLabel: 'b' },
      ],
      steps: [
        { id: 's1', recipeId: 'r1', order: 1, label: 'one', shortLabel: 'one', suggestedDurationMin: 5, suggestedHands: 'busy', equipmentIds: ['oven'], consumesBowlOf: [], dependsOnOverride: null, teachHint: null },
        { id: 's2', recipeId: 'r1', order: 2, label: 'two', shortLabel: 'two', suggestedDurationMin: 3, suggestedHands: 'free', equipmentIds: [], consumesBowlOf: ['i1'], dependsOnOverride: null, teachHint: null },
      ],
    }],
  };
}

// A valid plan for basePack.
function basePlan() {
  return {
    planVersion: 1, packId: 'p_t',
    bowls: [
      { id: 'b1', number: 1, ingredientIds: ['i1'] },
      { id: 'b2', number: 2, ingredientIds: ['i2'] },
    ],
    stepTags: {
      s1: { durationMin: 5, hands: 'busy', attentionMin: 5 },
      s2: { durationMin: 3, hands: 'free', attentionMin: 1 },
    },
    kitchen: { cooks: 4, cookNames: ['', '', '', ''] },
  };
}

const hasCode = (res, code) => res.errors.some((e) => e.code === code);

// ── validatePack: a clean pack passes every check ────────────────────────────
test('validatePack: base pack is ok', () => eq(validatePack(basePack()).ok, true));

// DUP_ID
test('DUP_ID triggers on a repeated id', () => {
  const p = basePack();
  p.recipes[0].ingredients[1].id = 'i1';
  eq(hasCode(validatePack(p), 'DUP_ID'), true);
});
test('DUP_ID does not trigger on unique ids', () => eq(hasCode(validatePack(basePack()), 'DUP_ID'), false));

// BAD_DEP
test('BAD_DEP triggers on override to a missing step', () => {
  const p = basePack();
  p.recipes[0].steps[1].dependsOnOverride = ['s_nope'];
  eq(hasCode(validatePack(p), 'BAD_DEP'), true);
});
test('BAD_DEP does not trigger on valid override', () => {
  const p = basePack();
  p.recipes[0].steps[1].dependsOnOverride = ['s1'];
  eq(hasCode(validatePack(p), 'BAD_DEP'), false);
});

// CYCLE
test('CYCLE triggers on mutual dependency', () => {
  const p = basePack();
  p.recipes[0].steps[0].dependsOnOverride = ['s2'];
  p.recipes[0].steps[1].dependsOnOverride = ['s1'];
  eq(hasCode(validatePack(p), 'CYCLE'), true);
});
test('CYCLE does not trigger on the acyclic base pack', () => eq(hasCode(validatePack(basePack()), 'CYCLE'), false));

// MISSING_EQUIP
test('MISSING_EQUIP triggers on an unknown equipment id', () => {
  const p = basePack();
  p.recipes[0].steps[0].equipmentIds = ['griddle'];
  eq(hasCode(validatePack(p), 'MISSING_EQUIP'), true);
});
test('MISSING_EQUIP does not trigger when all equipment exists', () => eq(hasCode(validatePack(basePack()), 'MISSING_EQUIP'), false));

// IMPOSSIBLE_EQUIP
test('IMPOSSIBLE_EQUIP triggers on capacity 0', () => {
  const p = basePack();
  p.equipment.push({ id: 'broken', name: 'Broken', capacity: 0, checklist: false });
  p.recipes[0].steps[0].equipmentIds = ['broken'];
  eq(hasCode(validatePack(p), 'IMPOSSIBLE_EQUIP'), true);
});
test('IMPOSSIBLE_EQUIP does not trigger when capacity >= 1', () => eq(hasCode(validatePack(basePack()), 'IMPOSSIBLE_EQUIP'), false));

// BAD_AFFINITY — optional tuning knob (docs/10): absent is fine, integer >= 0 is fine.
test('BAD_AFFINITY triggers on a negative weight', () => {
  const p = basePack();
  p.affinityWeight = -1;
  eq(hasCode(validatePack(p), 'BAD_AFFINITY'), true);
});
test('BAD_AFFINITY triggers on a non-integer weight', () => {
  const p = basePack();
  p.affinityWeight = 2.5;
  eq(hasCode(validatePack(p), 'BAD_AFFINITY'), true);
});
test('BAD_AFFINITY does not trigger on a valid integer weight', () => {
  const p = basePack();
  p.affinityWeight = 3;
  eq(hasCode(validatePack(p), 'BAD_AFFINITY'), false);
});
test('BAD_AFFINITY does not trigger when the field is absent', () => eq(hasCode(validatePack(basePack()), 'BAD_AFFINITY'), false));

// ── validatePlan ─────────────────────────────────────────────────────────────
test('validatePlan: base plan is ok', () => eq(validatePlan(basePlan(), basePack()).ok, true));

// UNBOWLED
test('UNBOWLED triggers when an ingredient has no bowl', () => {
  const pl = basePlan();
  pl.bowls = [pl.bowls[0]]; // drop i2's bowl
  eq(hasCode(validatePlan(pl, basePack()), 'UNBOWLED'), true);
});
test('UNBOWLED does not trigger when every ingredient is bowled', () => eq(hasCode(validatePlan(basePlan(), basePack()), 'UNBOWLED'), false));

// DOUBLE_BOWLED
test('DOUBLE_BOWLED triggers when an ingredient is in two bowls', () => {
  const pl = basePlan();
  pl.bowls[1].ingredientIds.push('i1'); // i1 now in b1 and b2
  eq(hasCode(validatePlan(pl, basePack()), 'DOUBLE_BOWLED'), true);
});
test('DOUBLE_BOWLED does not trigger when each ingredient is in one bowl', () => eq(hasCode(validatePlan(basePlan(), basePack()), 'DOUBLE_BOWLED'), false));

// UNTAGGED
test('UNTAGGED triggers when a step has no tag', () => {
  const pl = basePlan();
  delete pl.stepTags.s2;
  eq(hasCode(validatePlan(pl, basePack()), 'UNTAGGED'), true);
});
test('UNTAGGED does not trigger when every step is tagged', () => eq(hasCode(validatePlan(basePlan(), basePack()), 'UNTAGGED'), false));

// BAD_COOKS
test('BAD_COOKS triggers when cooks is out of 1..5', () => {
  const pl = basePlan();
  pl.kitchen.cooks = 6;
  eq(hasCode(validatePlan(pl, basePack()), 'BAD_COOKS'), true);
});
test('BAD_COOKS does not trigger for cooks in 1..5', () => eq(hasCode(validatePlan(basePlan(), basePack()), 'BAD_COOKS'), false));

// ── resolveDeps: the three override modes ────────────────────────────────────
test('resolveDeps: null follows order-1, order 1 has none', () => {
  eq(resolveDeps(basePack()), { s1: [], s2: ['s1'] });
});
test('resolveDeps: empty array means no dependency', () => {
  const p = basePack();
  p.recipes[0].steps[1].dependsOnOverride = [];
  eq(resolveDeps(p).s2, []);
});
test('resolveDeps: explicit array is used verbatim', () => {
  const p = basePack();
  p.recipes[0].steps[1].dependsOnOverride = ['s1'];
  eq(resolveDeps(p).s2, ['s1']);
});

// ── resolveDeps: a student's plan-side override reaches the scheduler ─────────
test('resolveDeps: plan-side override wins over the pack default', () => {
  const plan = basePlan();
  plan.stepTags.s2.dependsOnOverride = []; // student breaks the s1→s2 chain
  eq(resolveDeps(basePack(), plan).s2, []); // pack default is ['s1']; plan [] wins
});
test('resolveDeps: plan-side override wins over a pack explicit override', () => {
  const p = basePack();
  p.recipes[0].steps[1].dependsOnOverride = []; // pack says s2 is independent
  const plan = basePlan();
  plan.stepTags.s2.dependsOnOverride = ['s1']; // student says it depends on s1
  eq(resolveDeps(p, plan).s2, ['s1']); // plan wins
});
test('resolveDeps: absent plan-side override leaves the pack result unchanged', () => {
  // basePlan's tags carry no dependsOnOverride, so passing plan must not move anything —
  // this is the property that keeps every existing plan fixture's schedule byte-identical.
  eq(resolveDeps(basePack(), basePlan()), resolveDeps(basePack()));
});

// ── derivedTag: the attentionMin rule ────────────────────────────────────────
test('derivedTag: active step holds the cook the whole time', () => {
  eq(derivedTag({}, { durationMin: 10, hands: 'busy' }), { durationMin: 10, hands: 'busy', attentionMin: 10 });
});
test('derivedTag: passive step needs one minute of attention', () => {
  eq(derivedTag({}, { durationMin: 20, hands: 'free' }), { durationMin: 20, hands: 'free', attentionMin: 1 });
});

// ── blankPlan ────────────────────────────────────────────────────────────────
test('blankPlan: one bowl per ingredient, numbered from 1', () => {
  const pl = blankPlan(basePack());
  eq(pl.bowls, [
    { id: 'b1', number: 1, ingredientIds: ['i1'] },
    { id: 'b2', number: 2, ingredientIds: ['i2'] },
  ]);
});
test('blankPlan: tags come from the teacher suggestions', () => {
  const pl = blankPlan(basePack());
  eq(pl.stepTags, {
    s1: { durationMin: 5, hands: 'busy', attentionMin: 5 },
    s2: { durationMin: 3, hands: 'free', attentionMin: 1 },
  });
});
test('blankPlan: 4 cooks and matching packId', () => {
  const pl = blankPlan(basePack());
  eq(pl.kitchen.cooks, 4);
  eq(pl.packId, 'p_t');
});
test('blankPlan produces a plan that validates clean', () => {
  eq(validatePlan(blankPlan(basePack()), basePack()).ok, true);
});
