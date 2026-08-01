// tests/ui-bowls.test.js — bowlTimingConflicts: the "…go in at different times" advisory (Screen 1).
// See docs/05-ui-spec.md and docs/OPEN-QUESTIONS.md (T10: the note names the conflicting chips
// instead of a vague "these two", so a student/teacher never has to guess which ingredients clash).
import { test, eq } from './assert.js';
import { bowlTimingConflicts } from '../js/ui-bowls.js';

// consumers: ingredientId -> Set of step ids that empty its bowl.
const cons = (obj) => new Map(Object.entries(obj).map(([k, v]) => [k, new Set(v)]));

test('bowlTimingConflicts: same-step ingredients do not conflict', () => {
  // A and B are both emptied by s1 — they enter the pan together, so no note fires.
  eq(bowlTimingConflicts(cons({ A: ['s1'], B: ['s1'] }), ['A', 'B']), []);
});

test('bowlTimingConflicts: different-step ingredients conflict and are both named', () => {
  eq(bowlTimingConflicts(cons({ A: ['s1'], B: ['s2'] }), ['A', 'B']), ['A', 'B']);
});

test('bowlTimingConflicts: names only the ingredients in a disjoint pair, in bowl order', () => {
  // A:{s1} and B:{s3} are disjoint (conflict); C:{s1,s3} overlaps both, so C is NOT named — this is
  // the N>2 case the old vague copy could not express.
  eq(bowlTimingConflicts(cons({ A: ['s1'], B: ['s3'], C: ['s1', 's3'] }), ['A', 'B', 'C']), ['A', 'B']);
});

test('bowlTimingConflicts: an ingredient no step consumes gives no evidence and is never named', () => {
  eq(bowlTimingConflicts(cons({ A: ['s1'], B: ['s2'], D: [] }), ['A', 'B', 'D']), ['A', 'B']);
});

test('bowlTimingConflicts: three mutually different-time ingredients are all named', () => {
  eq(bowlTimingConflicts(cons({ A: ['s1'], B: ['s2'], C: ['s3'] }), ['A', 'B', 'C']), ['A', 'B', 'C']);
});
