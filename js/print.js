// js/print.js — boots print.html. DOM only; all scheduling/decoding is done by the pure modules.
// See docs/06-print-spec.md. Reads the pack + plan from the URL hash, recomputes the schedule,
// renders Page 1 (bowls + equipment) and Page 2 (the ticket-rail time sheet), then window.print()s.
//
// HASH CONTRACT (fixed in OPEN-QUESTIONS.md, T12 entry — must match ui-review.js:openPrint):
//   print.html#<pack-part>&plan=<encoded-plan>
// where <pack-part> is the SAME form index.html loads — `p=<encoded>` inline or `pf=<file>.json`
// hosted — reused verbatim so the large pack is never re-encoded. This module parses that shape:
// it splits the hash on '&', loads the pack part exactly as app.js's loadPackFromHash does, and
// decodePlan()s the plan part. If this layout ever changes, change it in BOTH files at once.
//
// Never assigns innerHTML from pack/plan content: every node is built with createElement/textContent.

import { decodePack, decodePlan } from './codec.js';
import { validatePack } from './model.js';
import { buildSchedule } from './scheduler.js';
import { fillGaps } from './fillers.js';
import { checkPlan } from './warnings.js';

// ── Measurements (docs/06). All page geometry is in mm/pt; only the timeline scale is a knob. ──
const MM_PER_MIN_NORMAL = 3;   // 1 minute = 3mm: a 50-min lab is 150mm and fits one page.
const MM_PER_MIN_COMPACT = 2;  // dropped to 2mm/min once a plan is too tall for 3mm.
const COMPACT_OVER_MIN = 70;   // makespanMin > 70 → compact scale (docs/06 measurements).
const MIN_BLOCK_MM = 5;        // a 1-min step still prints readably (docs/06 block rendering).
const SPINE_MM = 14;           // time-spine width.
const EQUIP_MM = 22;           // equipment strip width.
const MIN_LANE_MM = 30;        // below this, drop to compact rather than narrow lanes further.
const CONTENT_MM = 190;        // printable content width at 12mm margins on letter.

/** Build a DOM node. @param {string} tag @param {string} [cls] @param {string} [text] @returns {HTMLElement} */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// ── Hash parsing ───────────────────────────────────────────────────────────────────────────────
/** Split the location hash into its pack part and its encoded-plan part. The pack part is the one
 * `key=value` segment that is not `plan=…`; base64url payloads never contain '&', so a plain split
 * on '&' is safe. @param {string} hash location.hash including '#' @returns {{packPart:string|null, planStr:string|null}} */
function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  let packPart = null;
  let planStr = null;
  for (const seg of raw.split('&')) {
    if (!seg) continue;
    if (seg.startsWith('plan=')) planStr = seg.slice('plan='.length);
    else if (packPart === null) packPart = seg;
  }
  return { packPart, planStr };
}

/** Load the pack from the pack part of the hash, mirroring index.html's loadPackFromHash so both
 * load paths (`p=` inline, `pf=` hosted under /fixtures/) behave identically. Never throws.
 * @param {string|null} packPart e.g. "p=<encoded>" or "pf=<file>.json"
 * @returns {Promise<object|{ok:false,error:string}>} */
async function loadPack(packPart) {
  if (!packPart) return { ok: false, error: 'missing pack in link' };
  const eq = packPart.indexOf('=');
  if (eq === -1) return { ok: false, error: 'missing pack in link' };
  const key = packPart.slice(0, eq);
  const value = packPart.slice(eq + 1);

  if (key === 'p') return decodePack(value);

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

/** True when a hash result cannot become a usable, valid pack. @param {*} r @returns {boolean} */
function isDamagedPack(r) {
  return !r || r.ok === false || !validatePack(r).ok;
}

/** True when a decoded plan is unusable. decodePlan returns the plan object or { ok:false }.
 * @param {*} p @returns {boolean} */
function isDamagedPlan(p) {
  return !p || p.ok === false || typeof p !== 'object' || !p.bowls || !p.stepTags || !p.kitchen;
}

// ── Scale ────────────────────────────────────────────────────────────────────────────────────
/** Choose mm-per-minute: 3mm normally, 2mm once a plan is over 70 min or its lanes would be
 * narrower than 30mm (docs/06). @param {number} makespanMin @param {number} cooksN @returns {number} */
function pickScale(makespanMin, cooksN) {
  const laneMm = (CONTENT_MM - SPINE_MM - EQUIP_MM) / cooksN;
  if (makespanMin > COMPACT_OVER_MIN || laneMm < MIN_LANE_MM) return MM_PER_MIN_COMPACT;
  return MM_PER_MIN_NORMAL;
}

// ── Page 1: bowls and equipment ────────────────────────────────────────────────────────────────
/** Render Page 1: header line, name blank, the bowls table, and the equipment checklist.
 * @param {object} pack @param {object} plan @param {object} schedule @returns {HTMLElement} */
function renderPage1(pack, plan, schedule) {
  const sheet = el('section', 'sheet sheet-1');

  // Header: title left, "Cooks: N" right, then a hairline rule.
  const head = el('div', 'p1-head');
  head.appendChild(el('span', 'p1-title', pack.title));
  head.appendChild(el('span', 'p1-cooks data', `Cooks: ${schedule.cooks.length}`));
  sheet.appendChild(head);
  sheet.appendChild(el('hr', 'rule'));

  // Name blank — handwritten, because the app has no accounts (docs/06).
  sheet.appendChild(el('p', 'name-blank', 'Name ____________________   Kitchen ____'));

  // BOWLS — a two-column table with a tick box per row.
  sheet.appendChild(el('p', 'eyebrow', 'BOWLS'));
  const ingLabel = new Map();
  for (const r of pack.recipes) for (const ing of r.ingredients) ingLabel.set(ing.id, ing.label);
  const table = el('table', 'bowls');
  const tbody = el('tbody');
  for (const bowl of plan.bowls) {
    const tr = el('tr');
    const boxTd = el('td', 'bowl-box');
    boxTd.appendChild(el('span', 'checkbox'));
    tr.appendChild(boxTd);
    tr.appendChild(el('td', 'bowl-num data', String(bowl.number)));
    const contents = bowl.ingredientIds.map((id) => ingLabel.get(id) || id).join(' · ');
    tr.appendChild(el('td', 'bowl-in', contents));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  sheet.appendChild(table);

  // EQUIPMENT — checklist:true equipment actually used (from the schedule), plus the bowls entry,
  // alphabetical, in three columns. equipmentChecklist.count is NOT shown; only bowls carry a count
  // (docs/06; see OPEN-QUESTIONS.md T13 entry resolving the T5 `count` ambiguity).
  sheet.appendChild(el('p', 'eyebrow', 'EQUIPMENT'));
  const names = schedule.equipmentChecklist.map((e) => e.name);
  names.push(`Mixing bowls x${schedule.bowlCount}`);
  names.sort((a, b) => a.localeCompare(b));
  const list = el('div', 'equip-list');
  for (const name of names) {
    const item = el('div', 'equip-item');
    item.appendChild(el('span', 'checkbox'));
    item.appendChild(el('span', 'equip-name', name));
    list.appendChild(item);
  }
  sheet.appendChild(list);
  return sheet;
}

// ── Page 2: the time sheet ───────────────────────────────────────────────────────────────────
/** Render Page 2: the ticket rail (header row, spine + lanes + equipment strip, floor line) and
 * the footer (numbers line, notes, printed-by line). @param {object} pack @param {object} plan
 * @param {object} schedule @param {Array} warns warn-severity warnings only @returns {HTMLElement} */
function renderPage2(pack, plan, schedule, warns) {
  const sheet = el('section', 'sheet sheet-2');
  const scale = pickScale(schedule.makespanMin, schedule.cooks.length);
  const heightMm = schedule.makespanMin * scale;

  // Per-step reference key "R<recipe>·<order>" (docs/06 corner ref).
  const stepRef = new Map();
  pack.recipes.forEach((recipe, ri) => {
    for (const step of recipe.steps) stepRef.set(step.id, `R${ri + 1}·${step.order}`);
  });
  const capById = new Map(pack.equipment.map((e) => [e.id, e.capacity]));

  const rail = el('div', 'timeline');

  // Header row: MIN | one cell per cook | equipment header.
  const heads = el('div', 'tl-head-row');
  heads.appendChild(el('div', 'tl-spine-head', 'MIN'));
  for (const cook of schedule.cooks) heads.appendChild(el('div', 'tl-lane-head', cook.name));
  heads.appendChild(el('div', 'tl-equip-head', 'OVEN/BURNERS'));
  rail.appendChild(heads);

  // Body: spine + area (gridlines behind lanes, lanes, floor line) + equipment strip.
  const body = el('div', 'tl-body');
  body.style.height = `${heightMm}mm`;

  // Spine: a tick every minute, a right-aligned number + gridline every 5 minutes.
  const spine = el('div', 'tl-spine');
  for (let m = 0; m <= schedule.makespanMin; m += 1) {
    const cls = m % 5 === 0 ? 'tl-tick tl-tick-5' : 'tl-tick';
    const tick = el('div', cls);
    tick.style.top = `${m * scale}mm`;
    spine.appendChild(tick);
  }
  for (let m = 0; m <= schedule.makespanMin; m += 5) {
    const label = el('div', 'tl-num data', String(m));
    label.style.top = `${m * scale}mm`;
    spine.appendChild(label);
  }
  body.appendChild(spine);

  // Gridlines "all the way across" lanes + equipment strip, behind everything.
  for (let m = 0; m <= schedule.makespanMin; m += 5) {
    const grid = el('div', 'tl-grid');
    grid.style.top = `${m * scale}mm`;
    body.appendChild(grid);
  }

  // Lanes area: one lane per cook, each with absolutely-positioned blocks.
  const area = el('div', 'tl-area');
  for (const cook of schedule.cooks) {
    const lane = el('div', 'tl-lane');
    for (const a of cook.assignments) {
      for (const node of renderBlock(a, scale, stepRef)) lane.appendChild(node);
    }
    area.appendChild(lane);
  }
  // Floor line across the lanes at floorMin — the argument the sheet exists to make (docs/06).
  const floor = el('div', 'tl-floor');
  floor.style.top = `${schedule.floorMin * scale}mm`;
  floor.appendChild(el('span', 'tl-floor-label', `FLOOR — ${schedule.floorMin} MIN`));
  area.appendChild(floor);
  body.appendChild(area);

  // Equipment strip: unlabelled bars for each committed interval on a contended resource
  // (capacity <= 2), so the group can see the oven/burners are tied up (docs/06).
  const strip = el('div', 'tl-equip');
  for (const use of schedule.equipmentUse) {
    const cap = capById.get(use.equipmentId);
    if (cap == null || cap > 2) continue;
    const bar = el('div', 'tl-equip-bar');
    bar.style.top = `${use.startMin * scale}mm`;
    bar.style.height = `${(use.endMin - use.startMin) * scale}mm`;
    strip.appendChild(bar);
  }
  body.appendChild(strip);

  rail.appendChild(body);
  sheet.appendChild(rail);

  // Footer, below the last lane (docs/06).
  const footer = el('div', 'tl-footer');
  footer.appendChild(el('p', 'plan-line data',
    `Your plan: ${schedule.makespanMin} min · Fastest possible: ${schedule.floorMin} min · ` +
    `Period: ${pack.labMinutes} min`));
  for (const w of warns) footer.appendChild(el('p', 'note', `Note: ${w.message}`));
  footer.appendChild(el('hr', 'rule'));
  footer.appendChild(el('p', 'printed data', `Printed from Mise Planner · ${pack.packId}`));
  sheet.appendChild(footer);

  return sheet;
}

/** The block(s) for one assignment. An active step or filler is one block. A passive step whose
 * food keeps cooking after the cook is released draws a short solid cook-hold marker (startMin→
 * endMin) then a dashed empty continuation to runsUntilMin labelled "↓ runs to :NN" — the
 * passive-time lesson docs/06 forbids collapsing into one block. Critical steps get a heavy left
 * edge. @param {object} a an Assignment @param {number} scale mm/min @param {Map} stepRef @returns {HTMLElement[]} */
function renderBlock(a, scale, stepRef) {
  const nodes = [];
  const kindCls = a.kind === 'filler' ? 'block-filler' : a.hands === 'free' ? 'block-passive' : 'block-active';
  const block = el('div', `block ${kindCls}${a.isCritical ? ' block-critical' : ''}`);
  block.style.top = `${a.startMin * scale}mm`;
  block.style.height = `${Math.max(MIN_BLOCK_MM, (a.endMin - a.startMin) * scale)}mm`;
  block.appendChild(el('span', 'block-label', a.label));
  if (a.kind === 'step') block.appendChild(el('span', 'block-ref data', stepRef.get(a.stepId)));
  nodes.push(block);

  if (a.kind === 'step' && a.hands === 'free' && a.runsUntilMin > a.endMin) {
    const run = el('div', 'block-run');
    run.style.top = `${a.endMin * scale}mm`;
    run.style.height = `${(a.runsUntilMin - a.endMin) * scale}mm`;
    run.appendChild(el('span', 'run-label', `↓ runs to :${a.runsUntilMin}`));
    nodes.push(run);
  }
  return nodes;
}

/** Show a single centred message (damaged link, or an error-blocked plan) and do NOT print.
 * Errors never print, because errors block printing (docs/06). @param {string} text @returns {void} */
function showMessage(text) {
  document.body.textContent = '';
  const wrap = el('div', 'message');
  wrap.appendChild(el('p', null, text));
  document.body.appendChild(wrap);
}

// ── Boot ───────────────────────────────────────────────────────────────────────────────────────
/** Boot the print view: read pack + plan from the hash, recompute the schedule, render both pages,
 * then window.print() once (docs/06). @returns {Promise<void>} */
export async function boot() {
  const { packPart, planStr } = parseHash(location.hash);

  const packResult = await loadPack(packPart);
  if (isDamagedPack(packResult)) {
    showMessage('This link is damaged. Ask your teacher for a new one.');
    return;
  }
  const pack = packResult;
  const plan = planStr ? decodePlan(planStr) : { ok: false };
  if (isDamagedPlan(plan)) {
    showMessage('This link is damaged. Ask your teacher for a new one.');
    return;
  }

  // Recompute the schedule from the plan (the plan is small; the pack is the heavy part reused
  // from the hash). buildSchedule throws on an untagged step and returns { ok:false } on a cycle;
  // both collapse to a non-ok result so checkPlan can still report the structural error.
  let base;
  try {
    base = buildSchedule(pack, plan);
  } catch (err) {
    base = null;
  }
  const schedule = base && base.ok ? fillGaps(base, pack, plan) : base;
  const warnings = checkPlan(pack, plan, schedule && schedule.ok ? schedule : undefined);
  const hasError = warnings.some((w) => w.severity === 'error');

  if (!schedule || !schedule.ok || hasError) {
    // Errors block printing (docs/06); there is nothing safe to tape up, so show a message instead.
    showMessage('This plan has an error and cannot be printed. Open it again and fix the error first.');
    return;
  }

  // Build the printable document.
  const main = el('main', 'print-doc');
  main.appendChild(renderPage1(pack, plan, schedule));
  main.appendChild(renderPage2(pack, plan, schedule, warnings.filter((w) => w.severity === 'warn')));

  const again = el('a', 'print-again', 'Print again');
  again.href = '#';
  again.addEventListener('click', (e) => { e.preventDefault(); window.print(); });

  document.body.textContent = '';
  document.body.appendChild(again);
  document.body.appendChild(main);

  window.print();
}
