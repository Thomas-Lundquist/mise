// js/model.js — types, defaults, and validation for packs and plans. Pure: no DOM.
// See docs/03-data-model.md. All ids are short lowercase strings, unique within a pack;
// all times are integer minutes.

/** Every step across all recipes, in recipe then authored order.
 * @param {object} pack @returns {object[]} */
function allSteps(pack) {
  const out = [];
  for (const recipe of pack.recipes) for (const step of recipe.steps) out.push(step);
  return out;
}

/** Every ingredient across all recipes, in recipe then authored order.
 * @param {object} pack @returns {object[]} */
function allIngredients(pack) {
  const out = [];
  for (const recipe of pack.recipes) for (const ing of recipe.ingredients) out.push(ing);
  return out;
}

/** Every id declared anywhere in the pack (equipment, fillers, recipes, ingredients, steps).
 * @param {object} pack @returns {string[]} */
function allIds(pack) {
  const ids = [];
  for (const e of pack.equipment) ids.push(e.id);
  for (const f of pack.fillerTasks) ids.push(f.id);
  for (const r of pack.recipes) {
    ids.push(r.id);
    for (const i of r.ingredients) ids.push(i.id);
    for (const s of r.steps) ids.push(s.id);
  }
  return ids;
}

/** Resolve each step's effective dependency step ids.
 * `dependsOnOverride === null` → the step with `order - 1` in the same recipe (none if order 1);
 * `[]` → no dependencies; an explicit array → exactly those ids.
 * @param {object} pack @returns {Object<string,string[]>} stepId -> dependency step ids */
export function resolveDeps(pack) {
  const out = {};
  for (const recipe of pack.recipes) {
    const byOrder = new Map(recipe.steps.map((s) => [s.order, s]));
    for (const s of recipe.steps) {
      if (s.dependsOnOverride === null) {
        if (s.order === 1) {
          out[s.id] = [];
        } else {
          const prev = byOrder.get(s.order - 1);
          out[s.id] = prev ? [prev.id] : [];
        }
      } else {
        out[s.id] = s.dependsOnOverride.slice();
      }
    }
  }
  return out;
}

/** Find one dependency cycle over the existing step ids, or null if the graph is acyclic.
 * @param {object} pack @param {Set<string>} stepIds @returns {string[]|null} the ids on the cycle */
function findCycle(pack, stepIds) {
  const deps = resolveDeps(pack);
  const graph = {};
  for (const id of stepIds) graph[id] = (deps[id] || []).filter((d) => stepIds.has(d));
  const color = {}; // undefined = white, 1 = gray (on stack), 2 = black (done)
  const stack = [];
  let cycle = null;
  const dfs = (u) => {
    color[u] = 1;
    stack.push(u);
    for (const v of graph[u]) {
      if (color[v] === 1) {
        cycle = stack.slice(stack.indexOf(v));
        return true;
      }
      if (color[v] !== 2 && dfs(v)) return true;
    }
    color[u] = 2;
    stack.pop();
    return false;
  };
  for (const id of stepIds) {
    if (color[id] === undefined && dfs(id)) break;
  }
  return cycle;
}

/** Validate a teacher-authored pack.
 * @param {object} pack
 * @returns {{ ok: boolean, errors: Array<{code:string,message:string,ids:string[]}> }} */
export function validatePack(pack) {
  const errors = [];
  const steps = allSteps(pack);
  const stepIds = new Set(steps.map((s) => s.id));
  const equipById = new Map(pack.equipment.map((e) => [e.id, e]));

  // DUP_ID — any id repeated anywhere in the pack.
  const seen = new Set();
  const dups = new Set();
  for (const id of allIds(pack)) {
    if (seen.has(id)) dups.add(id);
    else seen.add(id);
  }
  if (dups.size) {
    errors.push({ code: 'DUP_ID', message: `Duplicate id(s): ${[...dups].join(', ')}.`, ids: [...dups] });
  }

  // BAD_DEP, MISSING_EQUIP, IMPOSSIBLE_EQUIP — per step.
  for (const s of steps) {
    if (Array.isArray(s.dependsOnOverride)) {
      for (const d of s.dependsOnOverride) {
        if (!stepIds.has(d)) {
          errors.push({ code: 'BAD_DEP', message: `Step ${s.id} depends on unknown step ${d}.`, ids: [s.id, d] });
        }
      }
    }
    for (const eid of s.equipmentIds || []) {
      const eq = equipById.get(eid);
      if (!eq) {
        errors.push({ code: 'MISSING_EQUIP', message: `Step ${s.id} needs unknown equipment ${eid}.`, ids: [s.id, eid] });
      } else if (eq.capacity === 0) {
        errors.push({ code: 'IMPOSSIBLE_EQUIP', message: `Step ${s.id} needs ${eid}, whose capacity is 0.`, ids: [s.id, eid] });
      }
    }
  }

  // CYCLE — only over existing step ids, so a BAD_DEP never masquerades as a loop.
  const cycle = findCycle(pack, stepIds);
  if (cycle) {
    errors.push({ code: 'CYCLE', message: 'These steps depend on each other in a loop.', ids: cycle });
  }

  // BAD_AFFINITY — optional station-coherence tuning knob (docs/10). Absent is valid (the
  // scheduler falls back to its constant); present-but-not-an-integer-≥0 is a teacher error.
  if (pack.affinityWeight !== undefined &&
      !(Number.isInteger(pack.affinityWeight) && pack.affinityWeight >= 0)) {
    errors.push({ code: 'BAD_AFFINITY', message: 'affinityWeight must be an integer >= 0.', ids: [] });
  }

  return { ok: errors.length === 0, errors };
}

/** Validate a student's plan against its pack.
 * @param {object} plan @param {object} pack
 * @returns {{ ok: boolean, errors: Array<{code:string,message:string,ids:string[]}> }} */
export function validatePlan(plan, pack) {
  const errors = [];
  const ingredientIds = allIngredients(pack).map((i) => i.id);

  const bowlCount = new Map();
  for (const b of plan.bowls || []) {
    for (const iid of b.ingredientIds) bowlCount.set(iid, (bowlCount.get(iid) || 0) + 1);
  }

  const unbowled = ingredientIds.filter((iid) => !bowlCount.has(iid));
  if (unbowled.length) {
    errors.push({ code: 'UNBOWLED', message: `${unbowled.length} ingredient(s) aren't in a bowl yet.`, ids: unbowled });
  }

  const doubled = ingredientIds.filter((iid) => (bowlCount.get(iid) || 0) > 1);
  if (doubled.length) {
    errors.push({ code: 'DOUBLE_BOWLED', message: `Ingredient(s) in more than one bowl: ${doubled.join(', ')}.`, ids: doubled });
  }

  const tags = plan.stepTags || {};
  const untagged = allSteps(pack).filter((s) => !tags[s.id]).map((s) => s.id);
  if (untagged.length) {
    errors.push({ code: 'UNTAGGED', message: 'Some steps still need a time.', ids: untagged });
  }

  const cooks = plan.kitchen ? plan.kitchen.cooks : undefined;
  if (!(Number.isInteger(cooks) && cooks >= 1 && cooks <= 5)) {
    errors.push({ code: 'BAD_COOKS', message: 'Number of cooks must be 1 to 5.', ids: [] });
  }

  return { ok: errors.length === 0, errors };
}

/** Derive the computed tag fields for a step's student tag.
 * `attentionMin` is `durationMin` for an active (busy) step and `Math.min(1, durationMin)`
 * for a passive (free) step; it is never asked in the UI.
 * @param {object} step @param {{durationMin:number,hands:string}} tag @returns {object} the derived StepTag */
export function derivedTag(step, tag) {
  const durationMin = tag.durationMin;
  const hands = tag.hands;
  const attentionMin = hands === 'busy' ? durationMin : Math.min(1, durationMin);
  return { durationMin, hands, attentionMin };
}

/** Build a blank plan: one bowl per ingredient, tags from the teacher's suggestions, 4 cooks —
 * so a student who agrees with everything can finish instantly.
 * @param {object} pack @returns {object} a valid starting Plan */
export function blankPlan(pack) {
  const bowls = allIngredients(pack).map((ing, idx) => ({
    id: `b${idx + 1}`,
    number: idx + 1,
    ingredientIds: [ing.id],
  }));

  const stepTags = {};
  for (const s of allSteps(pack)) {
    stepTags[s.id] = derivedTag(s, { durationMin: s.suggestedDurationMin, hands: s.suggestedHands });
  }

  return {
    planVersion: 1,
    packId: pack.packId,
    bowls,
    stepTags,
    kitchen: { cooks: 4, cookNames: ['', '', '', ''] },
  };
}
