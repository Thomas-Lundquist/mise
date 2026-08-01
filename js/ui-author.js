// js/ui-author.js — teacher pack builder UI. DOM only; imports the pure engine but adds no
// pure logic of its own. See docs/05-ui-spec.md (teacher section) and docs/03-data-model.md.
//
// One long form in five sections (Day, Equipment, Filler tasks, Recipes, Check & publish),
// saved as-you-type to localStorage under mise:author:<packId>, with Download / Load pack
// JSON and a Section 5 feasibility preview that runs the reference plan through the scheduler.

import { validatePack, blankPlan } from './model.js';
import { encodePack, MAX_ENCODED_CHARS } from './codec.js';
import { buildSchedule } from './scheduler.js';

/** The ten duration chips a student may pick from (docs/03). The teacher's suggestion
 * pre-fills one of these, so it must be a member of the set. */
const DURATION_CHIPS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];

/** Default kitchen the teacher can trim (docs/05 §5.2). capacity/checklist per docs/03. */
const DEFAULT_EQUIPMENT = [
  { id: 'oven', name: 'Oven', capacity: 1, checklist: true },
  { id: 'burners', name: 'Burners', capacity: 4, checklist: true },
  { id: 'sink', name: 'Sink', capacity: 1, checklist: true },
  { id: 'stand_mixer', name: 'Stand mixer', capacity: 1, checklist: true },
  { id: 'food_processor', name: 'Food processor', capacity: 1, checklist: true },
  { id: 'cutting_board', name: 'Cutting board', capacity: 5, checklist: true },
  { id: 'chef_knife', name: 'Chef knife', capacity: 5, checklist: true },
  { id: 'sheet_pan', name: 'Sheet pan', capacity: 2, checklist: true },
  { id: 'saute_pan', name: 'Saute pan', capacity: 2, checklist: true },
  { id: 'saucepan', name: 'Saucepan', capacity: 2, checklist: true },
  { id: 'mixing_spoon', name: 'Mixing spoon', capacity: 5, checklist: true },
  { id: 'scale', name: 'Scale', capacity: 2, checklist: true },
];

/** Default filler tasks (docs/05 §5.3). Order is the tie-break priority (docs/03). */
const DEFAULT_FILLERS = [
  { id: 'f_wipe', label: 'Wipe down your station', durationMin: 3, equipmentId: null, repeatable: false },
  { id: 'f_sweep', label: 'Sweep your kitchen floor', durationMin: 4, equipmentId: null, repeatable: false },
  { id: 'f_sanitizer', label: 'Refill the sanitizer bucket', durationMin: 2, equipmentId: null, repeatable: false },
  { id: 'f_readnext', label: 'Reread the next step out loud to your group', durationMin: 1, equipmentId: null, repeatable: false },
  { id: 'f_oventemp', label: 'Check the oven temperature', durationMin: 1, equipmentId: null, repeatable: false },
  { id: 'f_putaway', label: "Put away tools you're done with", durationMin: 3, equipmentId: null, repeatable: false },
];

let pack;          // the Pack being edited — the single source of truth for the form
let rootEl;        // the <main> we render into
let loadStatusEl;  // a status line for Load-pack-JSON errors (created in mount)

/** Mount the teacher pack builder into a container. Restores the last draft from
 * localStorage if one exists, otherwise starts from a default pack.
 * @param {HTMLElement} root the element to render the whole form into @returns {void} */
export function mount(root) {
  rootEl = root;
  loadStatusEl = document.createElement('p');
  pack = loadDraft() || newPack();
  renderAll();
}

// ── DOM + id helpers ──────────────────────────────────────────────────────────

/** Tiny element factory. Never assigns innerHTML; text goes through textContent.
 * @param {string} tag @param {object} [attrs] @param {Array|Node|string} [kids] @returns {HTMLElement} */
function el(tag, attrs, kids) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'value') node.value = v;
      else if (k === 'checked' || k === 'selected') node[k] = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
  }
  const list = kids == null ? [] : [].concat(kids);
  for (const kid of list) {
    if (kid == null) continue;
    node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return node;
}

/** A labelled control: <label><span>text</span>control</label>. */
function field(labelText, control) {
  return el('label', {}, [el('span', { text: labelText }), control]);
}

/** A <select>; single-select matches selected against a scalar, multi against an array. */
function makeSelect(options, selected, onchange, multiple) {
  const sel = el('select', multiple ? { multiple: true } : {});
  for (const o of options) {
    const isSel = multiple ? selected.indexOf(o.value) !== -1 : selected === o.value;
    sel.appendChild(el('option', { value: o.value, text: o.label, selected: isSel }));
  }
  sel.addEventListener('change', () => onchange(sel));
  return sel;
}

/** The currently selected option values of a multi-select. */
function selectedValues(sel) {
  return Array.prototype.map.call(sel.selectedOptions, (o) => o.value);
}

/** Lowercase alphanumeric slug with underscore separators. */
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Every id currently used anywhere in the pack. */
function collectIds(p) {
  const ids = [];
  for (const e of p.equipment) ids.push(e.id);
  for (const f of p.fillerTasks) ids.push(f.id);
  for (const r of p.recipes) {
    ids.push(r.id);
    for (const i of r.ingredients) ids.push(i.id);
    for (const s of r.steps) ids.push(s.id);
  }
  return ids;
}

/** Return `base`, or `base_2`, `base_3`… so it is not already in `used`. Adds the result. */
function uniqueId(base, used) {
  let id = base || 'x';
  let n = 2;
  while (used.has(id)) { id = `${base}_${n}`; n += 1; }
  used.add(id);
  return id;
}

/** Suggest a <=14 char shortLabel from an ingredient line by dropping the leading quantity. */
function suggestShort(line) {
  const cleaned = String(line).replace(/^[\d\s./,'-]+/, '').replace(/,.*$/, '').trim();
  const base = cleaned || String(line).trim();
  return base.length > 14 ? base.slice(0, 14).trim() : base;
}

// ── State + persistence ───────────────────────────────────────────────────────

/** A fresh pack seeded with the default kitchen and filler list. */
function newPack() {
  return {
    packVersion: 1,
    packId: 'p_new_lab',
    title: '',
    labMinutes: 50,
    equipment: JSON.parse(JSON.stringify(DEFAULT_EQUIPMENT)),
    fillerTasks: JSON.parse(JSON.stringify(DEFAULT_FILLERS)),
    recipes: [],
  };
}

/** Save-as-you-type. Storage may be disabled; the form still works in memory. */
function persist() {
  try {
    localStorage.setItem('mise:author:' + pack.packId, JSON.stringify(pack));
    localStorage.setItem('mise:author:last', pack.packId);
  } catch (e) { /* localStorage unavailable — ignore, memory state is authoritative */ }
}

/** Restore the most recently edited draft, or null if none / storage disabled. */
function loadDraft() {
  try {
    const last = localStorage.getItem('mise:author:last');
    if (!last) return null;
    const raw = localStorage.getItem('mise:author:' + last);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderAll() {
  rootEl.textContent = '';
  rootEl.appendChild(el('p', { class: 'eyebrow', text: 'Mise Planner' }));
  rootEl.appendChild(el('h1', { text: 'Author a lab day' }));
  rootEl.appendChild(renderFileBar());
  rootEl.appendChild(renderDay());
  rootEl.appendChild(renderEquipment());
  rootEl.appendChild(renderFillers());
  rootEl.appendChild(renderRecipes());
  rootEl.appendChild(renderPublish());
}

function renderFileBar() {
  const fileInput = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  fileInput.addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (f) loadPackFile(f);
    fileInput.value = '';
  });
  const row = el('div', { class: 'row' }, [
    el('button', { text: 'Download pack JSON', onclick: downloadPack }),
    el('button', { text: 'Load pack JSON', onclick: () => fileInput.click() }),
    fileInput,
  ]);
  loadStatusEl.textContent = '';
  loadStatusEl.className = '';
  return el('section', {}, [el('h2', { text: 'File' }), row, loadStatusEl]);
}

function renderDay() {
  const packIdInput = el('input', { type: 'text', value: pack.packId });
  packIdInput.addEventListener('input', () => { pack.packId = packIdInput.value.trim(); persist(); });
  const titleInput = el('input', { type: 'text', value: pack.title });
  titleInput.addEventListener('input', () => { pack.title = titleInput.value; persist(); });
  const labInput = el('input', { type: 'number', min: '1', value: String(pack.labMinutes) });
  labInput.addEventListener('input', () => { pack.labMinutes = parseInt(labInput.value, 10) || 0; persist(); });

  return el('section', {}, [
    el('h2', { text: '1 · Day' }),
    field('Pack id (used as the draft key)', packIdInput),
    field('Title', titleInput),
    field('Usable minutes in the period', labInput),
  ]);
}

function renderEquipment() {
  const rows = el('tbody');
  pack.equipment.forEach((eq) => rows.appendChild(equipmentRow(eq)));
  const table = el('table', {}, [
    el('thead', {}, el('tr', {}, [
      el('th', { text: 'Name' }), el('th', { text: 'Id' }), el('th', { text: 'Capacity' }),
      el('th', { text: 'On checklist' }), el('th', { text: '' }),
    ])),
    rows,
  ]);
  const add = el('button', {
    text: '+ Add equipment',
    onclick: () => {
      pack.equipment.push({ id: uniqueId('e_new', new Set(collectIds(pack))), name: '', capacity: 1, checklist: true });
      persist(); renderAll();
    },
  });
  return el('section', {}, [el('h2', { text: '2 · Equipment' }), table, add]);
}

function equipmentRow(eq) {
  const name = el('input', { type: 'text', value: eq.name });
  name.addEventListener('input', () => { eq.name = name.value; persist(); });
  const id = el('input', { type: 'text', value: eq.id });
  id.addEventListener('input', () => { eq.id = id.value.trim(); persist(); });
  const cap = el('input', { type: 'number', min: '0', value: String(eq.capacity) });
  cap.addEventListener('input', () => { eq.capacity = parseInt(cap.value, 10); persist(); });
  const check = el('input', { type: 'checkbox', checked: eq.checklist });
  check.addEventListener('change', () => { eq.checklist = check.checked; persist(); });
  const remove = el('button', {
    class: 'link danger', text: 'Remove',
    onclick: () => { pack.equipment = pack.equipment.filter((x) => x !== eq); persist(); renderAll(); },
  });
  return el('tr', {}, [
    el('td', {}, name), el('td', {}, id), el('td', {}, cap), el('td', {}, check), el('td', {}, remove),
  ]);
}

function renderFillers() {
  const rows = el('tbody');
  pack.fillerTasks.forEach((f) => rows.appendChild(fillerRow(f)));
  const table = el('table', {}, [
    el('thead', {}, el('tr', {}, [
      el('th', { text: 'Label' }), el('th', { text: 'Minutes' }), el('th', { text: 'Equipment' }),
      el('th', { text: 'Repeatable' }), el('th', { text: '' }),
    ])),
    rows,
  ]);
  const add = el('button', {
    text: '+ Add filler task',
    onclick: () => {
      pack.fillerTasks.push({ id: uniqueId('f_new', new Set(collectIds(pack))), label: '', durationMin: 1, equipmentId: null, repeatable: false });
      persist(); renderAll();
    },
  });
  return el('section', {}, [el('h2', { text: '3 · Filler tasks' }), table, add]);
}

function fillerRow(f) {
  const label = el('input', { type: 'text', value: f.label });
  label.addEventListener('input', () => { f.label = label.value; persist(); });
  const mins = el('input', { type: 'number', min: '1', value: String(f.durationMin) });
  mins.addEventListener('input', () => { f.durationMin = parseInt(mins.value, 10) || 0; persist(); });
  const equipOpts = [{ value: '', label: '(no equipment)' }].concat(pack.equipment.map((e) => ({ value: e.id, label: e.name || e.id })));
  const equip = makeSelect(equipOpts, f.equipmentId || '', (sel) => { f.equipmentId = sel.value || null; persist(); }, false);
  const rep = el('input', { type: 'checkbox', checked: f.repeatable });
  rep.addEventListener('change', () => { f.repeatable = rep.checked; persist(); });
  const remove = el('button', {
    class: 'link danger', text: 'Remove',
    onclick: () => { pack.fillerTasks = pack.fillerTasks.filter((x) => x !== f); persist(); renderAll(); },
  });
  return el('tr', {}, [
    el('td', {}, label), el('td', {}, mins), el('td', {}, equip), el('td', {}, rep), el('td', {}, remove),
  ]);
}

function renderRecipes() {
  const wrap = el('section', {}, [el('h2', { text: '4 · Recipes' })]);
  pack.recipes.forEach((r) => wrap.appendChild(recipeBlock(r)));
  wrap.appendChild(el('button', {
    text: '+ Add recipe',
    onclick: () => {
      pack.recipes.push({ id: uniqueId('r_new', new Set(collectIds(pack))), name: '', ingredients: [], steps: [] });
      persist(); renderAll();
    },
  }));
  return wrap;
}

function recipeBlock(recipe) {
  const name = el('input', { type: 'text', value: recipe.name });
  name.addEventListener('input', () => { recipe.name = name.value; persist(); });
  const removeRecipe = el('button', {
    class: 'link danger', text: 'Remove recipe',
    onclick: () => { pack.recipes = pack.recipes.filter((x) => x !== recipe); persist(); renderAll(); },
  });

  // Ingredients: a textarea of one label per line, plus an editable shortLabel table.
  const textarea = el('textarea', { value: recipe.ingredients.map((i) => i.label).join('\n') });
  textarea.addEventListener('change', () => { reparseIngredients(recipe, textarea.value); persist(); renderAll(); });
  const ingTable = el('tbody');
  recipe.ingredients.forEach((ing) => {
    const short = el('input', { type: 'text', value: ing.shortLabel });
    short.addEventListener('input', () => { ing.shortLabel = short.value; persist(); });
    ingTable.appendChild(el('tr', {}, [
      el('td', { text: ing.label }), el('td', {}, short), el('td', { text: ing.id }),
    ]));
  });
  const ingHead = el('table', {}, [
    el('thead', {}, el('tr', {}, [el('th', { text: 'Line' }), el('th', { text: 'Short label' }), el('th', { text: 'Id' })])),
    ingTable,
  ]);

  const steps = el('div');
  recipe.steps.forEach((s) => steps.appendChild(stepBlock(recipe, s)));
  const addStep = el('button', {
    text: '+ Add step',
    onclick: () => { appendStep(recipe); persist(); renderAll(); },
  });

  return el('div', { class: 'recipe' }, [
    el('div', { class: 'row' }, [field('Recipe name', name), removeRecipe]),
    field('Ingredients (one per line)', textarea),
    recipe.ingredients.length ? ingHead : null,
    el('p', { class: 'eyebrow', text: 'Steps' }),
    steps,
    addStep,
  ]);
}

function stepBlock(recipe, step) {
  const label = el('input', { type: 'text', value: step.label });
  label.addEventListener('input', () => { step.label = label.value; persist(); });
  const short = el('input', { type: 'text', value: step.shortLabel });
  short.addEventListener('input', () => { step.shortLabel = short.value; persist(); });

  const durOpts = DURATION_CHIPS.map((m) => ({ value: String(m), label: String(m) }));
  const dur = makeSelect(durOpts, String(step.suggestedDurationMin), (sel) => { step.suggestedDurationMin = parseInt(sel.value, 10); persist(); }, false);
  const hands = makeSelect(
    [{ value: 'busy', label: 'Hands busy (active)' }, { value: 'free', label: 'Hands free (passive)' }],
    step.suggestedHands, (sel) => { step.suggestedHands = sel.value; persist(); }, false,
  );

  const equipOpts = pack.equipment.map((e) => ({ value: e.id, label: e.name || e.id }));
  const equip = makeSelect(equipOpts, step.equipmentIds, (sel) => { step.equipmentIds = selectedValues(sel); persist(); }, true);
  const bowlOpts = recipe.ingredients.map((i) => ({ value: i.id, label: i.shortLabel || i.label }));
  const consumes = makeSelect(bowlOpts, step.consumesBowlOf, (sel) => { step.consumesBowlOf = selectedValues(sel); persist(); }, true);

  const remove = el('button', {
    class: 'link danger', text: 'Remove step',
    onclick: () => {
      recipe.steps = recipe.steps.filter((x) => x !== step);
      recipe.steps.forEach((s, i) => { s.order = i + 1; });
      persist(); renderAll();
    },
  });

  return el('div', { class: 'step' }, [
    el('p', { class: 'eyebrow', text: `Step ${step.order}` }),
    field('Full instruction', label),
    field('Short label (<= 22 chars, printed)', short),
    el('div', { class: 'row' }, [field('Suggested minutes', dur), field('Suggested hands', hands)]),
    el('div', { class: 'row' }, [field('Equipment used', equip), field('Empties the bowl of', consumes)]),
    advancedBlock(recipe, step),
    remove,
  ]);
}

function advancedBlock(recipe, step) {
  // dependsOnOverride tri-state: null = follow previous step; [] or [ids] = explicit.
  const override = el('input', { type: 'checkbox', checked: step.dependsOnOverride !== null });
  const others = [];
  for (const r of pack.recipes) for (const s of r.steps) {
    if (s === step) continue;
    others.push({ value: s.id, label: `${r.name || r.id}: ${s.shortLabel || s.id}` });
  }
  const depSel = makeSelect(others, step.dependsOnOverride || [], (sel) => {
    if (override.checked) { step.dependsOnOverride = selectedValues(sel); persist(); }
  }, true);
  depSel.disabled = step.dependsOnOverride === null;
  override.addEventListener('change', () => {
    step.dependsOnOverride = override.checked ? selectedValues(depSel) : null;
    depSel.disabled = !override.checked;
    persist();
  });

  const hint = el('input', { type: 'text', value: step.teachHint || '' });
  hint.addEventListener('input', () => { step.teachHint = hint.value.trim() ? hint.value : null; persist(); });

  return el('details', {}, [
    el('summary', { text: 'Advanced — dependencies and coaching hint' }),
    field('This step needs specific steps first (leave off to follow the previous step)', override),
    field('Depends on', depSel),
    field('Teach hint (optional)', hint),
  ]);
}

function renderPublish() {
  const results = el('div');
  const check = el('button', { class: 'primary', text: 'Check and publish', onclick: () => runCheck(results) });
  return el('section', {}, [el('h2', { text: '5 · Check and publish' }), check, results]);
}

// ── Actions: reparse, add step, check/publish, file I/O ───────────────────────

/** Rebuild a recipe's ingredient list from textarea lines, preserving edits by label. */
function reparseIngredients(recipe, text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const prevByLabel = new Map(recipe.ingredients.map((i) => [i.label, i]));
  const used = new Set(collectIds(pack));
  for (const i of recipe.ingredients) used.delete(i.id);
  recipe.ingredients = lines.map((line) => {
    const prev = prevByLabel.get(line);
    if (prev) { used.add(prev.id); return prev; }
    const short = suggestShort(line);
    return { id: uniqueId('i_' + slug(short || line), used), recipeId: recipe.id, label: line, shortLabel: short };
  });
}

/** Append a blank step to a recipe with a fresh id and the next order number. */
function appendStep(recipe) {
  const used = new Set(collectIds(pack));
  const rslug = slug(recipe.name || recipe.id).replace(/^r_/, '') || 'r';
  const order = recipe.steps.length + 1;
  recipe.steps.push({
    id: uniqueId(`s_${rslug}_${order}`, used),
    recipeId: recipe.id,
    order,
    label: '',
    shortLabel: '',
    suggestedDurationMin: 5,
    suggestedHands: 'busy',
    equipmentIds: [],
    consumesBowlOf: [],
    dependsOnOverride: null,
    teachHint: null,
  });
}

/** Section 5: validate, then run the reference plan and build the assignment URL. */
function runCheck(container) {
  container.textContent = '';
  const res = validatePack(pack);
  if (!res.ok) {
    container.appendChild(el('p', { class: 'alert', text: 'Fix these before publishing:' }));
    const ul = el('ul', { class: 'errors' });
    for (const e of res.errors) {
      const ids = e.ids && e.ids.length ? ` (${e.ids.join(', ')})` : '';
      ul.appendChild(el('li', { text: `${e.code}: ${e.message}${ids}` }));
    }
    container.appendChild(ul);
    return;
  }
  container.appendChild(el('p', { class: 'ok', text: 'Pack is valid.' }));

  let schedule;
  try { schedule = buildSchedule(pack, blankPlan(pack)); }
  catch (err) { container.appendChild(el('p', { class: 'alert', text: 'Scheduler error: ' + err.message })); return; }
  if (schedule.ok === false) {
    container.appendChild(el('p', { class: 'alert', text: 'The recipes form a dependency cycle; no schedule can be built.' }));
    return;
  }
  container.appendChild(el('div', { class: 'preview', text: `Reference plan: ${schedule.makespanMin} min, floor ${schedule.floorMin} min` }));

  const encoded = encodePack(pack);
  const base = location.href.replace(/author\.html.*$/, 'index.html');

  // Hosted file is the PRIMARY share path: a real two-recipe day encodes well past
  // MAX_ENCODED_CHARS (see docs/OPEN-QUESTIONS.md, T8), so a self-contained inline link is the
  // exception, not the rule. downloadPack saves the file as <packId>.json — exactly what #pf= loads.
  container.appendChild(el('p', { class: 'publish-lead', text: 'Publish this day — two steps:' }));
  container.appendChild(el('button', { class: 'primary', text: 'Download pack JSON', onclick: downloadPack }));
  container.appendChild(el('p', { class: 'hint', text: `Then put the downloaded ${pack.packId}.json in the app's fixtures/ folder and share this link:` }));
  container.appendChild(urlField('Assignment link (hosted)', `${base}#pf=${pack.packId}.json`));

  // Inline link is offered ONLY when the whole pack fits in the URL; then no hosting is needed.
  if (encoded.length <= MAX_ENCODED_CHARS) {
    container.appendChild(el('p', { class: 'hint', text: 'This day is also small enough to paste directly — a self-contained link that needs no hosted file:' }));
    container.appendChild(urlField('Assignment link (inline)', `${base}#p=${encoded}`));
  } else {
    container.appendChild(el('p', { class: 'hint', text: `(No self-contained inline link: this day is ${encoded.length} characters, over the ${MAX_ENCODED_CHARS} limit — share the hosted link above.)` }));
  }
}

/** A labelled read-only URL field with a Copy button beside it. @param {string} label @param {string} url */
function urlField(label, url) {
  const input = el('input', { type: 'text', class: 'url-field', value: url, readonly: true });
  input.addEventListener('focus', () => input.select());
  return el('div', { class: 'url-row' }, [
    field(label, input),
    el('button', { class: 'secondary', text: 'Copy link', onclick: () => copyText(url) }),
  ]);
}

/** Copy to clipboard where available; the field is selectable as a fallback. */
function copyText(text) {
  try { if (navigator.clipboard) navigator.clipboard.writeText(text); } catch (e) { /* ignore */ }
}

/** Download the current pack as pretty-printed JSON so it survives to next year. */
function downloadPack() {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: (pack.packId || 'pack') + '.json' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Read a pack JSON file into state. Bad files report inline, never throw. */
function loadPackFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.recipes)) throw new Error('not a pack');
      pack = parsed;
      persist();
      renderAll();
    } catch (e) {
      loadStatusEl.className = 'alert';
      loadStatusEl.textContent = 'That file is not a valid pack JSON.';
    }
  };
  reader.onerror = () => {
    loadStatusEl.className = 'alert';
    loadStatusEl.textContent = 'Could not read that file.';
  };
  reader.readAsText(file);
}
