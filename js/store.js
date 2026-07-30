// js/store.js — in-memory + localStorage draft persistence. The ONLY module allowed to touch
// localStorage, keyed mise:draft:<packId>. Wrap every access in try/catch and fall back to
// memory. Real export surface defined in T9.

/** Load a saved draft plan for a pack, or null if none exists.
 * @param {string} packId @returns {object|null} */
export function loadDraft(packId) {
  throw new Error('store: not implemented');
}

/** Save a draft plan for a pack. Falls back to memory if localStorage is unavailable.
 * @param {string} packId @param {object} plan @returns {void} */
export function saveDraft(packId, plan) {
  throw new Error('store: not implemented');
}
