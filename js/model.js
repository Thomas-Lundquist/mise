// js/model.js — types, defaults, and validation for packs and plans. Pure: no DOM.
// See docs/03-data-model.md. Real logic lands in T2.

/** Validate a teacher-authored pack.
 * @param {object} pack @returns {{ ok: boolean, errors: Array<{code:string,message:string,ids:string[]}> }} */
export function validatePack(pack) {
  throw new Error('model: not implemented');
}

/** Validate a student's plan against its pack.
 * @param {object} plan @param {object} pack @returns {{ ok: boolean, errors: Array<{code:string,message:string,ids:string[]}> }} */
export function validatePlan(plan, pack) {
  throw new Error('model: not implemented');
}

/** Resolve each step's effective dependency step ids.
 * @param {object} pack @returns {Object<string,string[]>} stepId -> dependency step ids */
export function resolveDeps(pack) {
  throw new Error('model: not implemented');
}

/** Derive the computed tag fields (e.g. attentionMin) for a step and its student tag.
 * @param {object} step @param {object} tag @returns {object} the derived StepTag */
export function derivedTag(step, tag) {
  throw new Error('model: not implemented');
}

/** Build a blank plan: one bowl per ingredient, tags from the teacher's suggestions, 4 cooks.
 * @param {object} pack @returns {object} a valid starting Plan */
export function blankPlan(pack) {
  throw new Error('model: not implemented');
}
