// js/scheduler.js — critical-path list scheduler. Pure, deterministic, no DOM, integer minutes.
// See docs/04-scheduler-spec.md, amended by docs/10-affinity-amendment.md (Stages 3b–3c).
// buildGraph lands in T4, buildSchedule in T5.
import { resolveDeps } from './model.js';

// Station-coherence knob, in minutes of tail-slack (docs/10). 0 = affinity only breaks genuine
// ties, so the makespan is byte-identical to the no-affinity baseline (the safe default). A
// pack may override this with an integer >= 0; higher = stickier stations at a possible time cost.
export const AFFINITY_WEIGHT = 0;

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
  // Pass `plan` so a student's Screen-2 dependsOnOverride (plan.stepTags[id]) wins over the pack.
  const resolved = resolveDeps(pack, plan);
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
 * Stage 3 of docs/04-scheduler-spec.md — critical-path list scheduling. At each minute it
 * builds the ready set, sorts it by the fixed tie-break order, and greedily assigns candidates
 * to free cooks, skipping (not stalling on) any blocked by equipment capacity, then advances the
 * clock to the next event. Pure and deterministic. On a dependency cycle it propagates
 * buildGraph's { ok: false, warnings }.
 * @param {object} pack @param {object} plan @returns {object} a Schedule (see docs/03-data-model.md) */
export function buildSchedule(pack, plan) {
  const graph = buildGraph(pack, plan);
  if (graph.ok === false) return graph; // cycle — nothing to simulate.
  const { deps, tail, floorMin, criticalStepIds } = graph;
  const criticalSet = new Set(criticalStepIds);

  // Per-step lookups. dur drives elapsed time and equipment holds; cookHold is how long the
  // cook is occupied — the whole duration when hands are busy, one minute when free (Stage 1.3).
  const stepById = {};
  for (const recipe of pack.recipes) for (const s of recipe.steps) stepById[s.id] = s;
  const tags = plan.stepTags || {};
  const dur = {};
  const cookHold = {};
  const hands = {};
  for (const id in stepById) {
    const tag = tags[id];
    if (!tag) throw new Error(`scheduler: step ${id} has no tag`);
    dur[id] = tag.durationMin;
    hands[id] = tag.hands;
    cookHold[id] = tag.hands === 'busy' ? tag.durationMin : Math.min(1, tag.durationMin);
  }
  const equipById = new Map(pack.equipment.map((e) => [e.id, e]));
  const total = Object.keys(stepById).length;

  // Effective affinity weight (docs/10): a pack integer overrides the constant; a negative value
  // clamps to 0; anything else (absent, float, non-number) falls back to the constant.
  const w = Number.isInteger(pack.affinityWeight) ? Math.max(0, pack.affinityWeight) : AFFINITY_WEIGHT;

  const cooksN = plan.kitchen.cooks;
  let t = 0;
  const cookFreeAt = new Array(cooksN).fill(0);
  const lastRecipeId = new Array(cooksN).fill(null); // recipeId of each cook's last STEP (docs/10)
  const stepEnd = {};                 // stepId -> runsUntilMin, once scheduled
  const scheduled = new Set();
  const assigned = [];                // { cook, record }
  const equipBusy = [];               // { equipmentId, startMin, endMin, stepId }

  // Equipment is free for a step at t if every id it needs has a live-interval count below capacity.
  // Same instantaneous check as 04 Stage 3c — a freshly-pushed interval (endMin > t) already counts.
  const equipFreeAt = (step, at) => {
    for (const eid of step.equipmentIds || []) {
      let count = 0;
      for (const busy of equipBusy) {
        if (busy.equipmentId === eid && busy.startMin <= at && busy.endMin > at) count += 1;
      }
      const equip = equipById.get(eid);
      // Fail loud (02-conventions) instead of a raw TypeError if a step names equipment the pack
      // does not define. validatePack reports this as MISSING_EQUIP and the UI gates scheduling
      // behind validation, so this only fires when buildSchedule runs on an unvalidated pack.
      if (!equip) throw new Error('scheduler: step ' + step.id + ' needs unknown equipment ' + eid);
      if (count >= equip.capacity) return false;
    }
    return true;
  };

  while (scheduled.size < total) {
    if (t > 600) throw new Error('scheduler: exceeded 600 minutes at ' + t);

    // Stages 3b–3c per docs/10: assign one (cook, step) pair at a time, re-evaluating after each,
    // until no free cook or no feasible ready step remains this minute. cookHold >= 1 already
    // excludes a just-assigned cook from the next pass; assignedCooks makes that explicit and exact.
    const assignedCooks = new Set();
    for (;;) {
      // 1 — free cooks: available by t and not already assigned this minute.
      const freeCooks = [];
      for (let i = 0; i < cooksN; i += 1) {
        if (cookFreeAt[i] <= t && !assignedCooks.has(i)) freeCooks.push(i);
      }
      if (freeCooks.length === 0) break;

      // 2 — feasible ready steps: deps cleared by t AND equipment free at t. A step blocked only
      // by equipment simply isn't ready this pass; it reappears when the equipment frees (Case F).
      const ready = [];
      for (const id in stepById) {
        if (scheduled.has(id)) continue;
        if (!deps[id].every((d) => scheduled.has(d) && stepEnd[d] <= t)) continue;
        if (!equipFreeAt(stepById[id], t)) continue;
        ready.push(id);
      }
      if (ready.length === 0) break;

      // 3 — the band: steps whose tail is within w of the best. At w = 0 this is exactly the
      // steps tied for the highest tail, so affinity can only relabel a tie, never change timing.
      let bestTail = -Infinity;
      for (const id of ready) if (tail[id] > bestTail) bestTail = tail[id];
      const band = ready.filter((id) => tail[id] >= bestTail - w);

      // 4 — choose the single best (cook, step) pair by the ordered key (docs/10). On-dish is a
      // property of the PAIR, so we score pairs, not steps: a lower-tail on-dish band step can beat
      // a higher-tail off-dish one. Keys, all ascending: on-dish, -tail, passive, -dur, cook, stepId.
      let best = null;
      for (const c of freeCooks) {
        for (const id of band) {
          const cand = {
            cook: c,
            id,
            onDish: lastRecipeId[c] === stepById[id].recipeId ? 0 : 1,
            tail: tail[id],
            passive: hands[id] === 'free' ? 0 : 1,
            dur: dur[id],
          };
          if (best === null || betterPair(cand, best)) best = cand;
        }
      }

      // 5 — assign it exactly as 04 Stage 3c, then record the cook's dish for the next pass.
      const id = best.id;
      const cook = best.cook;
      const step = stepById[id];
      const startMin = t;
      const runsUntilMin = t + dur[id];
      const endMin = t + cookHold[id];
      cookFreeAt[cook] = endMin;
      stepEnd[id] = runsUntilMin;
      scheduled.add(id);
      lastRecipeId[cook] = step.recipeId;
      assignedCooks.add(cook);
      for (const eid of step.equipmentIds || []) {
        equipBusy.push({ equipmentId: eid, startMin, endMin: runsUntilMin, stepId: id });
      }
      assigned.push({
        cook,
        record: {
          kind: 'step',
          stepId: id,
          recipeId: step.recipeId,
          label: step.shortLabel,
          startMin,
          endMin,
          runsUntilMin,
          hands: hands[id],
          isCritical: criticalSet.has(id),
          equipmentIds: (step.equipmentIds || []).slice(),
        },
      });
    }

    // 3d — advance to the next event strictly after t; a stall with steps left is a graph bug.
    let next = Infinity;
    for (const v of cookFreeAt) if (v > t && v < next) next = v;
    for (const busy of equipBusy) if (busy.endMin > t && busy.endMin < next) next = busy.endMin;
    for (const id in stepEnd) if (stepEnd[id] > t && stepEnd[id] < next) next = stepEnd[id];
    if (next === Infinity) {
      if (scheduled.size < total) throw new Error('scheduler: deadlock at minute ' + t);
      break;
    }
    t = next;
  }

  let makespanMin = 0;
  for (const id in stepEnd) if (stepEnd[id] > makespanMin) makespanMin = stepEnd[id];

  // Per-cook lanes. busy is the sum of cook-held time; idle is whatever is left in [0, makespan].
  const cooks = [];
  for (let i = 0; i < cooksN; i += 1) {
    const assignments = assigned
      .filter((a) => a.cook === i)
      .map((a) => a.record)
      .sort((x, y) => x.startMin - y.startMin || (x.stepId < y.stepId ? -1 : 1));
    let busy = 0;
    for (const r of assignments) busy += r.endMin - r.startMin;
    const idleMin = makespanMin - busy;
    const utilizationPct = makespanMin === 0 ? 0 : Math.round((busy / makespanMin) * 100);
    cooks.push({ index: i, name: cookName(plan.kitchen, i), assignments, idleMin, utilizationPct });
  }

  // Deterministic sort so JSON is byte-identical regardless of input array order.
  const equipmentUse = equipBusy
    .map((b) => ({ equipmentId: b.equipmentId, startMin: b.startMin, endMin: b.endMin, stepId: b.stepId }))
    .sort((a, b) =>
      a.startMin - b.startMin ||
      (a.equipmentId < b.equipmentId ? -1 : a.equipmentId > b.equipmentId ? 1 : 0) ||
      (a.stepId < b.stepId ? -1 : 1));

  // equipmentChecklist — the checklist:true equipment actually used, sorted by id.
  // NB: the `count` semantics are unspecified in docs 03/04; see OPEN-QUESTIONS.md. Provisionally
  // capacity, the only value consistent with 03's single example. Bowls are counted separately.
  const usedEquip = new Set(equipBusy.map((b) => b.equipmentId));
  const equipmentChecklist = pack.equipment
    .filter((e) => e.checklist && usedEquip.has(e.id))
    .map((e) => ({ id: e.id, name: e.name, count: e.capacity }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    ok: true,
    floorMin,
    makespanMin,
    cooks,
    equipmentUse,
    criticalStepIds,
    bowlCount: (plan.bowls || []).length,
    equipmentChecklist,
    // docs/10 — surface the tuning so it's observable without reading the timeline. costOverFloorMin
    // is the number to watch while raising the weight: how many minutes coherence is costing.
    affinityWeightUsed: w,
    costOverFloorMin: makespanMin - floorMin,
    warnings: [],
  };
}

/** True if pair a sorts strictly before pair b under docs/10's ordered key (all keys ascending):
 * on-dish first, then higher tail, then passive first, then longer dur, then lower cook, then
 * lower stepId. Keys 5–6 are a total order, so no two distinct pairs ever tie — determinism holds.
 * @param {{onDish:number,tail:number,passive:number,dur:number,cook:number,id:string}} a
 * @param {{onDish:number,tail:number,passive:number,dur:number,cook:number,id:string}} b
 * @returns {boolean} */
function betterPair(a, b) {
  if (a.onDish !== b.onDish) return a.onDish < b.onDish;   // 1. on-dish (0) beats off-dish (1)
  if (a.tail !== b.tail) return a.tail > b.tail;           // 2. -tail asc → higher tail first
  if (a.passive !== b.passive) return a.passive < b.passive; // 3. passive (free) first
  if (a.dur !== b.dur) return a.dur > b.dur;               // 4. -dur asc → longer step first
  if (a.cook !== b.cook) return a.cook < b.cook;           // 5. cook index ascending
  return a.id < b.id;                                      // 6. stepId ascending, string compare
}

/** A cook's display name: the plan's name if set, else "Cook A".."Cook E".
 * @param {object} kitchen @param {number} i zero-based cook index @returns {string} */
function cookName(kitchen, i) {
  const names = (kitchen && kitchen.cookNames) || [];
  const n = names[i];
  if (n && n.trim()) return n;
  return 'Cook ' + String.fromCharCode(65 + i);
}
