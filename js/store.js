// js/store.js — in-memory + localStorage draft persistence. The ONLY module allowed to touch
// localStorage, keyed mise:draft:<packId> (see docs/02-conventions.md). Every access is wrapped
// in try/catch and falls back to an in-memory Map, so the app works when localStorage is
// disabled, full, or throws — a draft is a convenience, never a requirement.

/** In-memory fallback, keyed identically to localStorage. Survives within one page session even
 * when localStorage is unavailable; it simply does not persist across a real reload. */
const memory = new Map();

/** localStorage key for a pack's draft.
 * @param {string} packId @returns {string} */
function draftKey(packId) {
  return `mise:draft:${packId}`;
}

/** Load a saved draft plan for a pack, or null if none exists.
 * Prefers localStorage; falls back to the in-memory copy if storage is unavailable.
 * @param {string} packId @returns {object|null} */
export function loadDraft(packId) {
  const key = draftKey(packId);
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw);
  } catch (err) {
    // localStorage disabled/blocked, or stored JSON was corrupt — fall through to memory.
  }
  return memory.has(key) ? memory.get(key) : null;
}

/** Save a draft plan for a pack. Always keeps a memory copy so the session survives a disabled
 * or throwing localStorage; the persisted copy is best-effort.
 * @param {string} packId @param {object} plan @returns {void} */
export function saveDraft(packId, plan) {
  const key = draftKey(packId);
  memory.set(key, plan);
  try {
    localStorage.setItem(key, JSON.stringify(plan));
  } catch (err) {
    // Storage unavailable or full — the memory copy above already holds it.
  }
}

/** Discard a pack's draft from both localStorage and memory (the "Start over" affordance).
 * @param {string} packId @returns {void} */
export function clearDraft(packId) {
  const key = draftKey(packId);
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch (err) {
    // Nothing to clean up if storage is unavailable.
  }
}
