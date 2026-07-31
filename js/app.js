// js/app.js — boots index.html and owns screen switching. DOM only; all pure logic lives in
// model.js / codec.js / scheduler.js. See docs/05-ui-spec.md (shell + Screen 0) and docs/03.
// T9 delivers the shell: Screen 0 works fully; Screens 1-3 are empty placeholder sections that
// the four-dot flow can advance through. Never assigns innerHTML from pack/plan/URL content.

import { decodePack } from './codec.js';
import { validatePack, blankPlan } from './model.js';
import { loadDraft, saveDraft, clearDraft } from './store.js';
import { mount as mountBowls } from './ui-bowls.js';

const SCREEN_COUNT = 4;
const COOK_LETTERS = ['A', 'B', 'C', 'D', 'E'];
const MAX_COOKS = 5;
const NAME_MAXLEN = 12;

/** @type {object|null} */ let pack = null;
/** @type {object|null} */ let plan = null;
let screenIndex = 0;
// Screen 1's mounted controller (from ui-bowls.mount). Held so re-entering Screen 1 refreshes
// rather than re-mounting; reset to null whenever `plan` is REPLACED (resume / start over) so the
// screen re-mounts against the new plan object instead of editing an orphaned one.
/** @type {{refresh:function():void}|null} */ let bowlsCtl = null;

/** Load the pack referenced by the location hash. Two forms are supported (docs/03):
 *   #p=<encoded>          an inline pack, for packs small enough to ride in the URL
 *   #pf=<filename>.json   a pack hosted next to the app under /fixtures/, for realistic packs
 * Returns the pack object on success, or { ok:false, error } on any failure (missing hash,
 * unknown key, decode error, unsafe filename, fetch/parse error). Never throws.
 * @param {string} hash location.hash including the leading '#'
 * @returns {Promise<object|{ok:false,error:string}>} */
async function loadPackFromHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  const eq = raw.indexOf('=');
  if (eq === -1) return { ok: false, error: 'missing pack in link' };
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);

  if (key === 'p') {
    return decodePack(value); // pack object, or { ok:false, error }
  }

  if (key === 'pf') {
    const name = decodeURIComponent(value);
    // Only a bare filename inside /fixtures/ — reject anything that could escape the directory.
    if (!/^[\w.-]+\.json$/.test(name) || name.includes('..')) {
      return { ok: false, error: 'unsafe pack filename' };
    }
    try {
      const res = await fetch(`fixtures/${name}`); // relative URL only
      if (!res.ok) return { ok: false, error: `could not load ${name}` };
      return await res.json();
    } catch (err) {
      return { ok: false, error: 'could not load hosted pack' };
    }
  }

  return { ok: false, error: 'unrecognised link' };
}

/** True when a hash result cannot become a usable, valid pack.
 * @param {object|{ok:false}} result @returns {boolean} */
function isDamaged(result) {
  return !result || result.ok === false || !validatePack(result).ok;
}

/** Normalise the plan's kitchen so five name inputs always have a slot to bind to.
 * @returns {void} */
function ensureKitchenShape() {
  if (!plan.kitchen) plan.kitchen = { cooks: 4, cookNames: [] };
  const names = plan.kitchen.cookNames || [];
  plan.kitchen.cookNames = Array.from({ length: MAX_COOKS }, (_, i) => names[i] || '');
}

/** Persist the current plan as this pack's draft. Best-effort; store.js handles failure.
 * @returns {void} */
function persist() {
  saveDraft(pack.packId, plan);
}

/** Boot the student app: read the pack from the hash, wire the screens, restore any draft.
 * @returns {Promise<void>} */
export async function boot() {
  const appEl = document.getElementById('app');
  const damagedEl = document.getElementById('damaged');

  const result = await loadPackFromHash(location.hash);
  if (isDamaged(result)) {
    // Show ONLY the damaged message — never a partial form (docs/05, Screen 0).
    appEl.hidden = true;
    damagedEl.hidden = false;
    return;
  }

  pack = result;
  damagedEl.hidden = true;
  appEl.hidden = false;

  // Start from a valid default plan (4 cooks, every step tagged from the teacher's suggestions).
  plan = blankPlan(pack);
  ensureKitchenShape();

  renderStartScreen();
  wireFooter();
  showScreen(0);
}

/** Build the dynamic parts of Screen 0 (title, recipe list, cook buttons, names, draft line)
 * and wire their interactions. Static labels live in index.html.
 * @returns {void} */
function renderStartScreen() {
  // Pack title appears both in the shell header and as the Screen 0 heading (docs/05).
  document.getElementById('pack-title').textContent = pack.title;
  document.getElementById('pack-title-h1').textContent = pack.title;

  renderRecipeList();
  renderCookButtons();
  renderNameInputs();
  renderDraftLine();

  document.getElementById('btn-start').addEventListener('click', () => {
    persist();
    showScreen(1);
  });
}

/** "Rice Pilaf — 7 ingredients, 8 steps" per recipe, built with textContent (pack is untrusted).
 * @returns {void} */
function renderRecipeList() {
  const list = document.getElementById('recipe-list');
  list.textContent = '';
  for (const recipe of pack.recipes) {
    const li = document.createElement('li');
    const ing = recipe.ingredients.length;
    const steps = recipe.steps.length;
    li.textContent = `${recipe.name} — ${ing} ingredient${ing === 1 ? '' : 's'}, ` +
      `${steps} step${steps === 1 ? '' : 's'}`;
    list.appendChild(li);
  }
}

/** Five single-select cook buttons (1-5), reflecting and writing plan.kitchen.cooks.
 * @returns {void} */
function renderCookButtons() {
  const holder = document.getElementById('cook-buttons');
  holder.textContent = '';
  for (let n = 1; n <= MAX_COOKS; n++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cook-btn';
    btn.textContent = String(n);
    btn.setAttribute('aria-pressed', String(plan.kitchen.cooks === n));
    btn.addEventListener('click', () => {
      plan.kitchen.cooks = n;
      for (const other of holder.querySelectorAll('.cook-btn')) {
        other.setAttribute('aria-pressed', String(other === btn));
      }
      renderNameInputs(); // only as many name fields as there are cooks
      persist();
    });
    holder.appendChild(btn);
  }
}

/** One optional 12-char name input per chosen cook; blanks fall back to Cook A..E when printed.
 * Values for cooks beyond the current count are kept in plan.kitchen.cookNames but not shown,
 * so raising the count again restores them.
 * @returns {void} */
function renderNameInputs() {
  const holder = document.getElementById('name-inputs');
  holder.textContent = '';
  for (let i = 0; i < plan.kitchen.cooks; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = NAME_MAXLEN;
    input.className = 'name-input';
    input.value = plan.kitchen.cookNames[i] || '';
    input.placeholder = `Cook ${COOK_LETTERS[i]}`;
    input.setAttribute('aria-label', `Name for Cook ${COOK_LETTERS[i]}`);
    input.addEventListener('input', () => {
      plan.kitchen.cookNames[i] = input.value;
      persist();
    });
    holder.appendChild(input);
  }
}

/** If a draft exists for this pack, show the resume/start-over line above Start planning.
 * @returns {void} */
function renderDraftLine() {
  const line = document.getElementById('draft-line');
  const draft = loadDraft(pack.packId);
  if (!draft) {
    line.hidden = true;
    return;
  }
  line.hidden = false;

  document.getElementById('btn-resume').onclick = () => {
    plan = draft;
    ensureKitchenShape();
    bowlsCtl = null; // plan object replaced — force Screen 1 to re-mount against the draft
    // Reflect the restored choices back into the form, then jump into the flow.
    renderCookButtons();
    renderNameInputs();
    showScreen(1);
  };

  document.getElementById('btn-startover').onclick = () => {
    clearDraft(pack.packId);
    plan = blankPlan(pack);
    ensureKitchenShape();
    bowlsCtl = null; // plan object replaced — force Screen 1 to re-mount against the fresh plan
    renderCookButtons();
    renderNameInputs();
    line.hidden = true;
  };
}

/** Wire the shell footer's Back / Next buttons and create the "why Next is disabled" slot.
 * The reason node is built here (not in index.html) so the T9 markup is untouched; screens gate
 * Next through setNextEnabled(ok, reason) rather than reaching into the footer themselves.
 * @returns {void} */
function wireFooter() {
  const next = document.getElementById('btn-next');
  const reason = document.createElement('span');
  reason.id = 'next-reason';
  reason.className = 'next-reason';
  reason.setAttribute('aria-live', 'polite'); // announce the gating reason to screen readers
  next.parentNode.insertBefore(reason, next); // sits between Back and Next in the footer

  document.getElementById('btn-back').addEventListener('click', () => {
    if (screenIndex > 0) showScreen(screenIndex - 1);
  });
  next.addEventListener('click', () => {
    if (screenIndex < SCREEN_COUNT - 1) showScreen(screenIndex + 1);
  });
}

/** Enable/disable the footer Next button and show the reason when it is blocked. This is the whole
 * contract a screen uses to gate forward progress; the shell owns the button, the screen owns the
 * rule. A disabled <button> emits no click, so this alone prevents advancing.
 * @param {boolean} ok whether the current screen permits Next
 * @param {string} reason short sentence shown beside Next when !ok (empty when ok)
 * @returns {void} */
function setNextEnabled(ok, reason) {
  document.getElementById('btn-next').disabled = !ok;
  document.getElementById('next-reason').textContent = ok ? '' : (reason || '');
}

/** Swap to screen i: toggle the four sections' hidden attribute, move the dot indicator, and
 * update footer visibility (hidden on Screen 0, which has its own Start planning button).
 * @param {number} i target screen index 0..3 @returns {void} */
function showScreen(i) {
  screenIndex = i;

  for (let s = 0; s < SCREEN_COUNT; s++) {
    document.getElementById(`screen-${s}`).hidden = s !== i;
  }

  const dots = document.querySelectorAll('#dots li');
  dots.forEach((dot, idx) => {
    const on = idx === i;
    dot.classList.toggle('on', on);
    if (on) dot.setAttribute('aria-current', 'step');
    else dot.removeAttribute('aria-current');
  });

  const footer = document.getElementById('footer');
  footer.hidden = i === 0;
  document.getElementById('btn-back').hidden = i === 0;
  document.getElementById('btn-next').hidden = i === SCREEN_COUNT - 1;

  // Every screen leaves Next enabled unless it gates itself. Screen 1 (bowls) does: it mounts on
  // first visit and refreshes on return, calling setNextEnabled to reflect whether every ingredient
  // is bowled. Reset to enabled first so leaving Screen 1 clears any stale "needs a bowl" reason.
  if (i !== 1) setNextEnabled(true, '');
  if (i === 1) {
    const screen1 = document.getElementById('screen-1');
    if (bowlsCtl) bowlsCtl.refresh();
    else bowlsCtl = mountBowls(screen1, { pack, plan, persist, setNextEnabled });
  }
}
