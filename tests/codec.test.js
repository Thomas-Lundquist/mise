// tests/codec.test.js — round-trip, oversize, and malformed-input handling.
// See docs/03-data-model.md (URL encoding) and docs/09-test-plan.md Part 3.
import { test, eq } from './assert.js';
import { encodePack, decodePack, encodePlan, decodePlan, MAX_ENCODED_CHARS } from '../js/codec.js';

// Load the real example fixtures so the round-trip is against "the example pack", not a clone.
// Top-level await: the harness waits for this module before calling report().
const examplePack = await fetch('../fixtures/recipe-pack.example.json').then((r) => r.json());
const examplePlan = await fetch('../fixtures/plan.example.json').then((r) => r.json());

// ── Round-trip deep-equality ─────────────────────────────────────────────────
test('round-trip: decodePack(encodePack(pack)) deep-equals the pack', () => {
  eq(decodePack(encodePack(examplePack)), examplePack);
});
test('round-trip: decodePlan(encodePlan(plan)) deep-equals the plan', () => {
  eq(decodePlan(encodePlan(examplePlan)), examplePlan);
});

// ── Encoded output is URL-safe ───────────────────────────────────────────────
test('encoded string uses no +, /, or = characters', () => {
  const s = encodePack(examplePack);
  eq(/[+/=]/.test(s), false);
});

// ── Oversize reporting (length past MAX_ENCODED_CHARS) ────────────────────────
// NB: the full example pack (2 recipes) already encodes to ~11.7k chars — well over the
// limit — so a real lab day triggers author.html's hosted-file fallback. Test the boundary
// with a deliberately tiny pack on one side and an inflated one on the other.
test('a tiny pack encodes under the size limit', () => {
  const tiny = {
    packVersion: 1, packId: 'p_tiny', title: 'T', labMinutes: 50,
    equipment: [], fillerTasks: [], recipes: [],
  };
  eq(encodePack(tiny).length <= MAX_ENCODED_CHARS, true);
});
test('an oversized pack encodes past the size limit', () => {
  const big = { ...examplePack, title: 'x'.repeat(9000) };
  eq(encodePack(big).length > MAX_ENCODED_CHARS, true);
});

// ── Malformed input: never throws, returns { ok: false } ─────────────────────
test('truncated string returns { ok: false }', () => {
  const truncated = encodePack(examplePack).slice(0, 20);
  eq(decodePack(truncated).ok, false);
});
test('illegal base64 returns { ok: false }', () => {
  eq(decodePack('!!! not base64 !!!').ok, false);
});
test('empty string returns { ok: false }', () => {
  eq(decodePack('').ok, false);
});
test('undefined returns { ok: false } without throwing', () => {
  eq(decodePack(undefined).ok, false);
});
test('decodePlan is equally defensive on garbage', () => {
  eq(decodePlan('%%%').ok, false);
});
