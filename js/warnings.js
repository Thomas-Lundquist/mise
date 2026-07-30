// js/warnings.js — plan sanity warnings. Pure: no DOM.
// See docs/04-scheduler-spec.md Stage 5. Real logic lands in T7.

/** Produce the ordered list of warnings and errors for a plan and its schedule.
 * @param {object} pack @param {object} plan @param {object} schedule
 * @returns {Array<{code:string,severity:string,message:string,stepIds:string[]}>} */
export function checkPlan(pack, plan, schedule) {
  throw new Error('warnings: not implemented');
}
