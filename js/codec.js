// js/codec.js — pack/plan <-> URL-safe string. Pure: no DOM. See docs/03-data-model.md.
// Real logic lands in T3. decodePack/decodePlan must never throw on bad input once implemented.

/** Encode a pack to a URL-safe fragment string.
 * @param {object} pack @returns {string} */
export function encodePack(pack) {
  throw new Error('codec: not implemented');
}

/** Decode a pack from a URL-safe string. Never throws on bad input.
 * @param {string} str @returns {{ ok: true, pack: object } | { ok: false, error: string }} */
export function decodePack(str) {
  throw new Error('codec: not implemented');
}

/** Encode a plan to a URL-safe string.
 * @param {object} plan @returns {string} */
export function encodePlan(plan) {
  throw new Error('codec: not implemented');
}

/** Decode a plan from a URL-safe string. Never throws on bad input.
 * @param {string} str @returns {{ ok: true, plan: object } | { ok: false, error: string }} */
export function decodePlan(str) {
  throw new Error('codec: not implemented');
}
