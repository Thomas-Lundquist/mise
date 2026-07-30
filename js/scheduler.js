// js/scheduler.js — critical-path list scheduler. Pure, deterministic, no DOM, integer minutes.
// See docs/04-scheduler-spec.md. buildGraph lands in T4, buildSchedule in T5.
import { resolveDeps } from './model.js';

/** Build the dependency graph, tails, and floor for a pack and plan.
 * Stages 1–2 of docs/04-scheduler-spec.md: resolve deps, topologically sort, then walk that
 * order in reverse to compute each step's tail (longest remaining elapsed time from its start
 * to the end of the lab) and floorMin (the critical path — the fastest the lab can possibly run).
 * On a dependency cycle it returns { ok: false, warnings: [...] } rather than looping forever.
 * @param {object} pack @param {object} plan
 * @returns {{ order:string[], deps:Object<string,string[]>, succ:Object<string,string[]>, tail:Object<string,number>, floorMin:number, criticalStepIds:string[] }
 *   | { ok:false, warnings:Array<{code:string,severity:string,message:string,stepIds:string[]}> }} */
export function buildGraph(pack, plan) {
  const stepIds = [];
  for (const recipe of pack.recipes) for (const step of recipe.steps) stepIds.push(step.id);
  const stepSet = new Set(stepIds);

  // Stage 1.1 — effective dependencies, restricted to real step ids (model.resolveDeps).
  const resolved = resolveDeps(pack);
  const deps = {};
  const succ = {};
  for (const id of stepIds) {
    deps[id] = (resolved[id] || []).filter((d) => stepSet.has(d));
    succ[id] = [];
  }
  for (const id of stepIds) for (const d of deps[id]) succ[d].push(id);

  // Stage 1.1 — dur per step from the plan's tag. dur drives the floor even for passive steps.
  const tags = plan.stepTags || {};
  const dur = {};
  for (const id of stepIds) {
    const tag = tags[id];
    if (!tag) throw new Error(`scheduler: step ${id} has no tag`);
    dur[id] = tag.durationMin;
  }

  // Stage 1.2 — topological sort (Kahn's). Tie-break is lowest stepId ascending: the order
  // array feeds no spec'd output, so any valid order is correct; this only pins determinism.
  const indegree = {};
  for (const id of stepIds) indegree[id] = deps[id].length;
  const ready = stepIds.filter((id) => indegree[id] === 0).sort();
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const s of succ[id]) {
      indegree[s] -= 1;
      if (indegree[s] === 0) insertSorted(ready, s);
    }
  }
  if (order.length !== stepIds.length) {
    const looped = stepIds.filter((id) => indegree[id] > 0);
    return {
      ok: false,
      warnings: [{ code: 'CYCLE', severity: 'error', message: 'These steps depend on each other in a loop.', stepIds: looped }],
    };
  }

  // Stage 2 — tails, in reverse topological order: tail[s] = dur[s] + max(0, max succ tail).
  const tail = {};
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const id = order[i];
    let best = 0;
    for (const s of succ[id]) if (tail[s] > best) best = tail[s];
    tail[id] = dur[id] + best;
  }

  // floorMin is the longest tail — the unavoidable critical chain.
  let floorMin = 0;
  for (const id of stepIds) if (tail[id] > floorMin) floorMin = tail[id];

  // criticalStepIds — start from the tail === floorMin step (lowest id on a tie), then repeatedly
  // step to the successor with the largest tail (lowest id on a tie) until there are none.
  const criticalStepIds = [];
  let cur = lowestIdWhere(stepIds, (id) => tail[id] === floorMin);
  while (cur) {
    criticalStepIds.push(cur);
    const next = lowestIdWhere(succ[cur], () => true, tail);
    cur = next;
  }

  return { order, deps, succ, tail, floorMin, criticalStepIds };
}

/** Insert id into an ascending-sorted array, keeping it sorted. Keeps Kahn's output deterministic.
 * @param {string[]} arr @param {string} id @returns {void} */
function insertSorted(arr, id) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < id) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, id);
}

/** The lowest-id member of ids that passes pred; among the highest tail if a tail map is given.
 * With no tail map: lowest id where pred is true. With a tail map: highest tail, lowest id on ties.
 * @param {string[]} ids @param {(id:string)=>boolean} pred @param {Object<string,number>} [byTail]
 * @returns {string|null} */
function lowestIdWhere(ids, pred, byTail) {
  let winner = null;
  for (const id of ids) {
    if (!pred(id)) continue;
    if (winner === null) { winner = id; continue; }
    if (byTail) {
      if (byTail[id] > byTail[winner] || (byTail[id] === byTail[winner] && id < winner)) winner = id;
    } else if (id < winner) {
      winner = id;
    }
  }
  return winner;
}

/** Compute the full schedule: cooks, assignments, equipment use, and derived counts.
 * @param {object} pack @param {object} plan @returns {object} a Schedule (see docs/03-data-model.md) */
export function buildSchedule(pack, plan) {
  throw new Error('scheduler: not implemented');
}
