// js/ui-steps.js — Screen 2 (steps). DOM only; all state lives on the shared plan object.
// See docs/05-ui-spec.md Screen 2 and docs/03-data-model.md (StepTag).
//
// The teacher pre-fills every field (blankPlan seeds a tag per step from suggestedDurationMin /
// suggestedHands), so a student who agrees taps nothing and each disagreement costs one tap. Every
// edit overwrites ONE field of plan.stepTags[stepId], re-derives attentionMin via model.derivedTag,
// persists the draft, and updates the sticky "hands-on" total in place. Never assigns innerHTML from
// pack/plan content, and never asks the student to build a dependency graph — the collapsed
// "needs something else first" list is the rare escape hatch, not the default path.

import { derivedTag } from './model.js';

// The only durations offered (docs/03). No free text: typing produces 0- and 999-minute tags that
// wreck the schedule. Single-select, pre-selected from the tag's durationMin.
const DURATION_CHIPS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];

// Helper copy under the hands toggle (docs/05, verbatim). Shown for the currently selected mode so
// the compact card stays compact (the spec aims for six cards visible on a Chromebook screen).
const HANDS_HELP = {
  busy: "You're standing there doing it — chopping, stirring, searing.",
  free: 'You start it and walk away — simmering, baking, chilling, resting.',
};

/** Build a DOM node.
 * @param {string} tag @param {string} [cls] @param {string} [text] @returns {HTMLElement} */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** Mount Screen 2 (steps) into a container and wire per-step tagging.
 * The returned handle's refresh() rebuilds from the current plan; app.js calls it on re-entry. All
 * edits mutate ctx.plan.stepTags in place and persist. Screen 2 never gates Next (docs/05: "enabled
 * always"), so setNextEnabled is left to the shell and not called here.
 * @param {HTMLElement} root the screen's <section>
 * @param {{ pack: object, plan: object, persist: function():void }} ctx shared app context
 * @returns {{ refresh: function():void }} */
export function mount(root, ctx) {
  const { pack, plan, persist } = ctx;

  // ── Read-only derivations from the pack ────────────────────────────────────────────────────
  // Every step with its recipe name, in recipe then authored order (the render order).
  const stepsInOrder = [];
  // Every step's id + shortLabel, for the "needs something else first" list ("all other steps").
  const allStepRefs = [];
  for (const recipe of pack.recipes) {
    for (const step of recipe.steps) {
      stepsInOrder.push({ step, recipeName: recipe.name });
      allStepRefs.push({ id: step.id, shortLabel: step.shortLabel });
    }
  }

  // The sticky total node, held across in-place edits so a tap can refresh just the number.
  let totalEl = null;

  // ── Reads ───────────────────────────────────────────────────────────────────────────────────
  /** Sum of durationMin over steps the student tagged hands-busy — the minutes a cook is actually
   * working with their hands. Passive steps contribute 0 (see OPEN-QUESTIONS T11: reading A). This
   * is a student-facing teaching number only; it is not the scheduler's cook-load. @returns {number} */
  function handsOnTotal() {
    let sum = 0;
    for (const { step } of stepsInOrder) {
      const tag = plan.stepTags[step.id];
      if (tag && tag.hands === 'busy') sum += tag.durationMin;
    }
    return sum;
  }

  /** Refresh only the sticky total's text from the current plan. */
  function updateTotal() {
    if (totalEl) totalEl.textContent = `Total hands-on time: ${handsOnTotal()} min`;
  }

  // ── Plan mutations ────────────────────────────────────────────────────────────────────────
  /** Rewrite a step's tag with new duration/hands, re-deriving attentionMin and PRESERVING any
   * dependency override (derivedTag returns only the three timing fields, so the override would
   * otherwise be dropped by a chip or hands tap). @param {object} step @param {number} durationMin
   * @param {string} hands "busy" | "free" */
  function writeTag(step, durationMin, hands) {
    const prev = plan.stepTags[step.id] || {};
    const next = derivedTag(step, { durationMin, hands });
    if (Array.isArray(prev.dependsOnOverride)) next.dependsOnOverride = prev.dependsOnOverride;
    plan.stepTags[step.id] = next;
  }

  /** Write the student's dependency override from the checked boxes. One or more checked → that
   * array of step ids (in document = recipe order). None checked → remove the field, back to the
   * default (follow the previous step in the recipe); the student never expresses "[] independent",
   * which stays an authoring-only state (docs/03). @param {object} step @param {HTMLElement} list */
  function writeDeps(step, list) {
    const ids = [...list.querySelectorAll('input:checked')].map((c) => c.value);
    const tag = plan.stepTags[step.id];
    if (ids.length) tag.dependsOnOverride = ids;
    else delete tag.dependsOnOverride;
    persist();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────────────────
  /** The duration chip row: single-select 1..60, pre-selected from the tag. */
  function renderDurations(step) {
    const row = el('div', 'dur-row');
    const tag = plan.stepTags[step.id];
    for (const n of DURATION_CHIPS) {
      const btn = el('button', 'dur-chip', String(n));
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(tag.durationMin === n));
      btn.addEventListener('click', () => {
        writeTag(step, n, plan.stepTags[step.id].hands);
        for (const c of row.querySelectorAll('.dur-chip')) {
          c.setAttribute('aria-pressed', String(c === btn));
        }
        persist();
        updateTotal();
      });
      row.appendChild(btn);
    }
    return row;
  }

  /** The Hands busy / Hands free toggle plus its single contextual helper line. */
  function renderHands(step) {
    const wrap = el('div', 'hands');
    const row = el('div', 'hands-row');
    const busy = el('button', 'hands-btn', 'Hands busy');
    const free = el('button', 'hands-btn', 'Hands free');
    busy.type = 'button';
    free.type = 'button';
    const help = el('p', 'hands-help');

    const reflect = () => {
      const h = plan.stepTags[step.id].hands;
      busy.setAttribute('aria-pressed', String(h === 'busy'));
      free.setAttribute('aria-pressed', String(h === 'free'));
      help.textContent = HANDS_HELP[h] || '';
    };
    const set = (hands) => {
      writeTag(step, plan.stepTags[step.id].durationMin, hands);
      reflect();
      persist();
      updateTotal();
    };
    busy.addEventListener('click', () => set('busy'));
    free.addEventListener('click', () => set('free'));

    row.appendChild(busy);
    row.appendChild(free);
    wrap.appendChild(row);
    wrap.appendChild(help);
    reflect();
    return wrap;
  }

  /** The collapsed "This needs something else first" disclosure (docs/05). Stays collapsed by
   * default; checkboxes pre-reflect a stored override so a restored draft is preserved. */
  function renderDeps(step) {
    const details = el('details', 'dep'); // no `open` attribute → collapsed by default
    details.appendChild(el('summary', 'dep-summary', 'This needs something else first'));

    const stored = plan.stepTags[step.id].dependsOnOverride;
    const checked = new Set(Array.isArray(stored) ? stored : []);
    const list = el('div', 'dep-list');
    for (const ref of allStepRefs) {
      if (ref.id === step.id) continue; // "all OTHER steps"
      const item = el('label', 'dep-item');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = ref.id;
      box.checked = checked.has(ref.id);
      box.addEventListener('change', () => writeDeps(step, list));
      item.appendChild(box);
      item.appendChild(el('span', 'dep-item-label', ref.shortLabel));
      list.appendChild(item);
    }
    details.appendChild(list);
    return details;
  }

  /** One step card: number + labels, duration chips, hands toggle, optional teach hint, and the
   * collapsed dependency disclosure. @param {object} step */
  function renderCard(step) {
    const card = el('div', 'step-card');

    const head = el('div', 'step-head');
    head.appendChild(el('span', 'step-num', String(step.order)));
    const labels = el('div', 'step-labels');
    labels.appendChild(el('p', 'step-short', step.shortLabel));
    labels.appendChild(el('p', 'step-label', step.label));
    head.appendChild(labels);
    card.appendChild(head);

    card.appendChild(el('p', 'eyebrow step-q', 'How long?'));
    card.appendChild(renderDurations(step));

    card.appendChild(el('p', 'eyebrow step-q', 'While this happens, are your hands busy?'));
    card.appendChild(renderHands(step));

    if (step.teachHint) card.appendChild(el('p', 'teach-hint', step.teachHint));

    card.appendChild(renderDeps(step));
    return card;
  }

  /** Rebuild the whole screen from the current plan (mount + refresh). In-screen edits update nodes
   * in place instead of calling this, so an open disclosure and the scroll position survive a tap. */
  function render() {
    root.textContent = '';
    const wrap = el('div', 'steps');

    let lastRecipe = null;
    for (const { step, recipeName } of stepsInOrder) {
      if (recipeName !== lastRecipe) {
        wrap.appendChild(el('p', 'steps-recipe', recipeName)); // recipe-name divider
        lastRecipe = recipeName;
      }
      wrap.appendChild(renderCard(step));
    }
    root.appendChild(wrap);

    // Sticky running total — the first place the student feels the model respond to them (docs/05).
    const bar = el('div', 'steps-total');
    totalEl = el('p', 'steps-total-text');
    bar.appendChild(totalEl);
    root.appendChild(bar);
    updateTotal();
  }

  render();
  return { refresh: render };
}
