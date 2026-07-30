// js/scheduler.js — critical-path list scheduler. Pure, deterministic, no DOM, integer minutes.
// See docs/04-scheduler-spec.md. buildGraph lands in T4, buildSchedule in T5.

/** Build the dependency graph, tails, and floor for a pack and plan.
 * @param {object} pack @param {object} plan
 * @returns {{ order:string[], deps:Object<string,string[]>, succ:Object<string,string[]>, tail:Object<string,number>, floorMin:number, criticalStepIds:string[] }} */
export function buildGraph(pack, plan) {
  throw new Error('scheduler: not implemented');
}

/** Compute the full schedule: cooks, assignments, equipment use, and derived counts.
 * @param {object} pack @param {object} plan @returns {object} a Schedule (see docs/03-data-model.md) */
export function buildSchedule(pack, plan) {
  throw new Error('scheduler: not implemented');
}
