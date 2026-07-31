// js/ui-bowls.js — Screen 1 (bowls). DOM only; all state lives on the shared plan object.
// See docs/05-ui-spec.md Screen 1 and docs/03-data-model.md (Bowl).
//
// The student's job here is MERGING, not filling: blankPlan seeds one bowl per ingredient, so the
// "Not in a bowl yet" column starts empty and Next starts enabled. Combining two ingredients means
// moving one into the other's bowl; a bowl emptied by a move is pruned and the rest renumber, so the
// student ends with a tidy, contiguous set of bowls. Never assigns innerHTML from pack/plan content.

const EMPTY = new Set();

/** Build a DOM node.
 * @param {string} tag @param {string} [cls] @param {string} [text] @returns {HTMLElement} */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** True when sets a and b share no member.
 * @param {Set<string>} a @param {Set<string>} b @returns {boolean} */
function disjoint(a, b) {
  for (const x of a) if (b.has(x)) return false;
  return true;
}

/** Mount Screen 1 (bowls) into a container and wire both interaction paths.
 * The returned handle's refresh() re-renders from the current plan and re-gates Next; app.js calls
 * it when re-entering the screen. All edits mutate ctx.plan.bowls in place, persist, and re-gate.
 * @param {HTMLElement} root the screen's <section>
 * @param {{ pack: object, plan: object, persist: function():void,
 *           setNextEnabled: function(boolean, string):void }} ctx shared app context
 * @returns {{ refresh: function():void }} */
export function mount(root, ctx) {
  const { pack, plan, persist, setNextEnabled } = ctx;

  // ── Lookups derived once from the read-only pack ──────────────────────────────────────────
  // ingredientId -> display + owning recipe, for chip labels and left-column grouping.
  const ingInfo = new Map();
  // ingredientId -> set of step ids that empty its bowl (consumesBowlOf), for the "different
  // times" hint. An ingredient consumed by no step contributes no timing evidence.
  const consumers = new Map();
  for (const recipe of pack.recipes) {
    for (const ing of recipe.ingredients) {
      ingInfo.set(ing.id, { label: ing.label, recipeName: recipe.name });
    }
    for (const step of recipe.steps) {
      for (const iid of step.consumesBowlOf || []) {
        if (!consumers.has(iid)) consumers.set(iid, new Set());
        consumers.get(iid).add(step.id);
      }
    }
  }

  // Selected ingredient ids (tap path). Multi-select: tap several chips, then one bowl.
  const selected = new Set();
  // Ingredient id currently being dragged (drag path). Cleared on dragend/drop.
  let draggingId = null;

  // ── Plan mutations ────────────────────────────────────────────────────────────────────────
  /** Remove an ingredient from whatever bowl currently holds it. @param {string} id */
  function removeFromAll(id) {
    for (const b of plan.bowls) {
      const i = b.ingredientIds.indexOf(id);
      if (i !== -1) b.ingredientIds.splice(i, 1);
    }
  }

  /** Drop bowls emptied by a move, then renumber 1..n by position. */
  function prune() {
    plan.bowls = plan.bowls.filter((b) => b.ingredientIds.length > 0);
    renumber();
  }

  /** Renumber bowls contiguously so BOWL n matches their on-screen order. */
  function renumber() {
    plan.bowls.forEach((b, i) => { b.number = i + 1; });
  }

  /** First unused bowl id of the form b<N>. @returns {string} */
  function freshId() {
    const ids = new Set(plan.bowls.map((b) => b.id));
    let n = 1;
    while (ids.has(`b${n}`)) n++;
    return `b${n}`;
  }

  /** Move ingredients into a bowl (each leaves its previous bowl first). @param {string[]} ids @param {string} bowlId */
  function assign(ids, bowlId) {
    const bowl = plan.bowls.find((b) => b.id === bowlId);
    if (!bowl) return;
    for (const id of ids) {
      removeFromAll(id);
      bowl.ingredientIds.push(id);
    }
    prune();          // a source bowl that just went empty disappears
    selected.clear();
    commit();
  }

  /** Return an ingredient to the "Not in a bowl yet" column. @param {string} id */
  function takeOut(id) {
    removeFromAll(id);
    selected.delete(id);
    prune();
    commit();
  }

  /** Add an empty bowl for the student to fill (not pruned until the next move leaves it empty). */
  function newBowl() {
    plan.bowls.push({ id: freshId(), number: plan.bowls.length + 1, ingredientIds: [] });
    renumber();
    commit();
  }

  /** Remove an empty bowl (the only "Remove bowl" case). @param {string} id */
  function removeBowl(id) {
    plan.bowls = plan.bowls.filter((b) => b.id !== id);
    renumber();
    commit();
  }

  /** Toggle an ingredient's selection for the tap path. @param {string} id */
  function toggle(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    render(); // selection changes chip outlines and shows/hides "Put here"
  }

  /** Persist the draft and re-render (which re-gates Next). */
  function commit() {
    persist();
    render();
  }

  // ── Derived reads ─────────────────────────────────────────────────────────────────────────
  /** Ingredient ids not in any bowl, in pack (recipe then authored) order. @returns {string[]} */
  function unbowledIds() {
    const inBowl = new Set();
    for (const b of plan.bowls) for (const id of b.ingredientIds) inBowl.add(id);
    const out = [];
    for (const recipe of pack.recipes) {
      for (const ing of recipe.ingredients) if (!inBowl.has(ing.id)) out.push(ing.id);
    }
    return out;
  }

  /** True when two consumed ingredients in this bowl are emptied by non-overlapping steps, i.e.
   * they go into the pan at different moments. Advisory only — never blocks. @param {object} bowl */
  function bowlDifferentTimes(bowl) {
    const consumed = bowl.ingredientIds.filter((id) => (consumers.get(id) || EMPTY).size > 0);
    for (let i = 0; i < consumed.length; i++) {
      for (let j = i + 1; j < consumed.length; j++) {
        if (disjoint(consumers.get(consumed[i]), consumers.get(consumed[j]))) return true;
      }
    }
    return false;
  }

  // ── Drag-and-drop helper ────────────────────────────────────────────────────────────────────
  /** Make a node a drop target that runs onDropId(ingredientId) when a chip is dropped on it.
   * @param {HTMLElement} node @param {function(string):void} onDropId */
  function makeDropZone(node, onDropId) {
    node.addEventListener('dragover', (e) => {
      e.preventDefault();               // required so drop fires
      e.dataTransfer.dropEffect = 'move';
      node.classList.add('drop-hover'); // --steel dashed outline (docs/05)
    });
    node.addEventListener('dragleave', () => node.classList.remove('drop-hover'));
    node.addEventListener('drop', (e) => {
      e.preventDefault();
      node.classList.remove('drop-hover');
      const id = draggingId || e.dataTransfer.getData('text/plain');
      if (id) onDropId(id);
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────────────────
  /** An ingredient chip (used in both columns). Tap toggles selection; drag starts a move. */
  function makeChip(id) {
    const info = ingInfo.get(id) || { label: id };
    const btn = el('button', 'chip', info.label);
    btn.type = 'button';
    btn.draggable = true;
    if (selected.has(id)) btn.classList.add('sel');
    btn.setAttribute('aria-pressed', String(selected.has(id)));
    btn.addEventListener('click', () => toggle(id));
    btn.addEventListener('dragstart', (e) => {
      draggingId = id;
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
    });
    btn.addEventListener('dragend', () => {
      draggingId = null;
      for (const n of root.querySelectorAll('.drop-hover')) n.classList.remove('drop-hover');
    });
    return btn;
  }

  /** Left column: the counter, the "Not in a bowl yet" list grouped by recipe, and a take-out drop zone. */
  function renderLeft() {
    const col = el('section', 'bowls-left');
    const unbowled = unbowledIds();
    col.appendChild(el('p', 'bowls-counter', `${unbowled.length} left`));
    col.appendChild(el('p', 'eyebrow', 'Not in a bowl yet'));

    if (unbowled.length === 0) {
      col.appendChild(el('p', 'placeholder', 'Everything is in a bowl.'));
    } else {
      for (const recipe of pack.recipes) {
        const ids = recipe.ingredients.map((i) => i.id).filter((id) => unbowled.includes(id));
        if (!ids.length) continue;
        col.appendChild(el('p', 'bowls-recipe', recipe.name));
        const row = el('div', 'chip-row');
        for (const id of ids) row.appendChild(makeChip(id));
        col.appendChild(row);
      }
    }
    makeDropZone(col, (id) => takeOut(id)); // drop here to take an ingredient out of its bowl
    return col;
  }

  /** One bowl card: its eyebrow, removable ingredient chips, and its actions (Put here / Remove). */
  function renderBowl(bowl) {
    const card = el('div', 'bowl-card');
    card.appendChild(el('p', 'eyebrow', `Bowl ${bowl.number}`));

    const row = el('div', 'chip-row');
    for (const id of bowl.ingredientIds) {
      const holder = el('span', 'bowl-chip');
      holder.appendChild(makeChip(id));
      const out = el('button', 'link take-out', 'Take out');
      out.type = 'button';
      out.addEventListener('click', (e) => { e.stopPropagation(); takeOut(id); });
      holder.appendChild(out);
      row.appendChild(holder);
    }
    card.appendChild(row);
    if (!bowl.ingredientIds.length) card.appendChild(el('p', 'placeholder', 'Empty bowl'));

    const actions = el('div', 'bowl-actions');
    if (selected.size) {
      const put = el('button', 'bowl-put', 'Put here'); // the affordance the spec names
      put.type = 'button';
      put.addEventListener('click', () => assign([...selected], bowl.id));
      actions.appendChild(put);
    }
    if (!bowl.ingredientIds.length) {
      const rm = el('button', 'link', 'Remove bowl'); // only offered when empty (docs/05)
      rm.type = 'button';
      rm.addEventListener('click', () => removeBowl(bowl.id));
      actions.appendChild(rm);
    }
    card.appendChild(actions);

    if (bowl.ingredientIds.length >= 2 && bowlDifferentTimes(bowl)) {
      card.appendChild(el('p', 'bowl-note', 'These two go in at different times. Sure?'));
    }

    // Tap anywhere on the card (except a button) to drop the current selection here.
    card.addEventListener('click', (e) => {
      if (selected.size && !e.target.closest('button')) assign([...selected], bowl.id);
    });
    makeDropZone(card, (id) => assign([id], bowl.id));
    return card;
  }

  /** Right column: the bowl cards plus the full-width "+ New bowl" button. */
  function renderRight() {
    const col = el('section', 'bowls-right');
    col.appendChild(el('p', 'eyebrow', 'Your bowls'));
    for (const bowl of plan.bowls) col.appendChild(renderBowl(bowl));
    const add = el('button', 'bowl-new', '+ New bowl');
    add.type = 'button';
    add.addEventListener('click', () => newBowl());
    col.appendChild(add);
    return col;
  }

  /** Rebuild the whole screen from the current plan, then re-gate Next. */
  function render() {
    root.textContent = '';
    const wrap = el('div', 'bowls');
    wrap.appendChild(el('p', 'eyebrow', 'Bowls'));
    wrap.appendChild(el('p', 'bowls-guide',
      'Put ingredients in the same bowl only if they go into the pan at the same moment.'));
    const cols = el('div', 'bowls-cols');
    cols.appendChild(renderLeft());
    cols.appendChild(renderRight());
    wrap.appendChild(cols);
    root.appendChild(wrap);
    gate();
  }

  /** Enable Next only when nothing is left unbowled; otherwise show the count as the reason. */
  function gate() {
    const n = unbowledIds().length;
    const reason = n === 0 ? ''
      : `${n} ingredient${n === 1 ? '' : 's'} still need${n === 1 ? 's' : ''} a bowl.`;
    setNextEnabled(n === 0, reason);
  }

  render();
  return { refresh: render };
}
