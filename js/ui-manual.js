// js/ui-manual.js — Manual mode (docs/01 "Deferred to Phase 4", docs/07 T14). DOM-facing, but the
// placement + validation logic is pure and exported so it can be checked without a browser.
//
// Later in the semester the auto-scheduler is switched off and the student arranges the day
// themselves: they drag (or tap) each step block into a cook's lane, and the app ONLY validates —
// it flags dependency violations and equipment over-capacity with the specific rule broken, and
// shows the student's makespan next to the algorithm's. No auto-placement; same data model.
//
// This screen occupies Screen 3 when the student flips the toggle on Screen 3 (T16); app.js tracks
// viewMode and mounts this instead of ui-review. It reuses model.resolveDeps so dependency semantics match the scheduler exactly, and runs
// the real buildSchedule/fillGaps once to get the algorithm's makespan to compare against.
//
// Placement model (recorded in OPEN-QUESTIONS.md, T14): each cook lane is an ordered stack of
// blocks; a block starts when the previous block in that lane ends, so its window is
// [start, start + durationMin]. A cook does one block at a time. Blocks are uniform-height CARDS
// (the duration is printed on them), NOT to-scale bars — this is a touch board, so a 44px tap
// target beats pixel-accurate height. Placement is in-memory only; it is not written to the plan
// or the draft, because docs/03 defines no field for it. Never assigns innerHTML from pack/plan.
//
// Printing (T18): a Print button synthesizes a Schedule-shaped object from the lane stacks and opens
// the EXISTING print.html with it as `sched=` in the hash, so the student prints their own board, not
// the algorithm's. print.js reads `sched=` and skips the scheduler; the auto print path is unchanged.

import { resolveDeps } from './model.js';
import { buildSchedule } from './scheduler.js';
import { fillGaps } from './fillers.js';
import { encodePlan } from './codec.js';

const COOK_LETTERS = ['A', 'B', 'C', 'D', 'E'];

// On-screen scale in pixels per minute — matches ui-review.js SCALE so the manual board and the
// auto-review rail use the same visual language (T17). Block height = max(44, dur * SCALE).
const SCALE = 20;

// ── Pure logic (no DOM) — exported for Node verification ─────────────────────────────────────

/** Index every step in the pack by id. @param {object} pack @returns {Map<string,object>} */
export function stepIndex(pack) {
  const m = new Map();
  for (const recipe of pack.recipes) {
    for (const step of recipe.steps) m.set(step.id, step);
  }
  return m;
}

/** Compute each placed block's time window from the lane stacks. Within a lane, blocks run
 * back-to-back starting at 0; a block's end is start + its tagged durationMin (the cook holds the
 * whole duration, so end === the step's runsUntilMin). Unplaced steps are absent from the result.
 * @param {object} pack @param {object} plan
 * @param {string[][]} placement lane index -> ordered step ids
 * @returns {Map<string,{start:number,end:number,cook:number,dur:number}>} */
export function computeBlocks(pack, plan, placement) {
  const blocks = new Map();
  placement.forEach((ids, cook) => {
    let t = 0;
    for (const id of ids) {
      const tag = plan.stepTags[id];
      const dur = tag ? tag.durationMin : 0;
      blocks.set(id, { start: t, end: t + dur, cook, dur });
      t += dur;
    }
  });
  return blocks;
}

/** The student's makespan: the latest end among placed blocks (0 when the board is empty). This is
 * the length of the arrangement as it currently stands, complete or not.
 * @param {Map<string,{end:number}>} blocks @returns {number} */
export function studentMakespan(blocks) {
  let m = 0;
  for (const b of blocks.values()) if (b.end > m) m = b.end;
  return m;
}

/** Return the overlapping intervals at the first instant where more than `cap` of them run at once,
 * or null if capacity is always respected. Concurrency peaks can only begin at an interval start,
 * so checking each distinct start instant is sufficient and deterministic.
 * @param {{id:string,start:number,end:number}[]} intervals @param {number} cap
 * @returns {{id:string,start:number,end:number}[]|null} */
function overCapacity(intervals, cap) {
  const starts = [...new Set(intervals.map((i) => i.start))].sort((a, b) => a - b);
  for (const t of starts) {
    const running = intervals.filter((i) => i.start <= t && i.end > t);
    if (running.length > cap) return running;
  }
  return null;
}

/** Validate a placement and return one plain-language message per rule broken, naming the steps and
 * the specific rule. Two rules are checked (docs/01 manual mode): (1) a step is placed before a
 * dependency is placed, or before that dependency finishes; (2) more steps use one equipment entry
 * at the same time than its capacity allows. Empty array = valid.
 * @param {object} pack @param {object} plan @param {string[][]} placement @returns {string[]} */
export function findViolations(pack, plan, placement) {
  const out = [];
  const blocks = computeBlocks(pack, plan, placement);
  const steps = stepIndex(pack);
  const short = (id) => (steps.has(id) ? steps.get(id).shortLabel : id);
  const deps = resolveDeps(pack, plan);

  // Rule 1 — dependencies. Walk placed blocks in a stable order (by start, then id) so the message
  // list is deterministic regardless of lane iteration.
  const placedOrder = [...blocks.entries()].sort((a, b) =>
    a[1].start - b[1].start || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [id, b] of placedOrder) {
    for (const d of deps[id] || []) {
      if (!blocks.has(d)) {
        out.push(`Place "${short(d)}" before "${short(id)}" — "${short(id)}" needs it done first.`);
      } else if (blocks.get(d).end > b.start) {
        out.push(`"${short(id)}" starts before "${short(d)}" finishes — move it later.`);
      }
    }
  }

  // Rule 2 — equipment capacity. Gather each contended resource's placed intervals, then flag the
  // first over-capacity instant. An id missing from pack.equipment is a pack error (validatePack's
  // MISSING_EQUIP), not this screen's to raise, so it is treated as uncontended here.
  const capById = new Map(pack.equipment.map((e) => [e.id, e.capacity]));
  const nameById = new Map(pack.equipment.map((e) => [e.id, e.name]));
  const byEquip = new Map();
  for (const [id, b] of blocks) {
    for (const eid of steps.get(id).equipmentIds || []) {
      if (!byEquip.has(eid)) byEquip.set(eid, []);
      byEquip.get(eid).push({ id, start: b.start, end: b.end });
    }
  }
  for (const eid of [...byEquip.keys()].sort()) {
    const cap = capById.has(eid) ? capById.get(eid) : Infinity;
    const clash = overCapacity(byEquip.get(eid), cap);
    if (clash) {
      const names = clash.map((i) => `"${short(i.id)}"`).join(', ');
      out.push(`Too many steps use the ${nameById.get(eid) || eid} at once ` +
        `(only ${cap} in the kitchen): ${names}.`);
    }
  }
  return out;
}

// ── DOM ───────────────────────────────────────────────────────────────────────────────────────

/** Build a DOM node. @param {string} tag @param {string} [cls] @param {string} [text] @returns {HTMLElement} */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** Mount manual mode into a container. The returned handle's refresh() re-reads cook count and
 * re-renders; app.js calls it on re-entry. Placement is held in this closure (in-memory only).
 * @param {HTMLElement} root the screen's <section>
 * @param {{ pack: object, plan: object }} ctx shared app context
 * @returns {{ refresh: function():void }} */
export function mount(root, ctx) {
  const { pack, plan, switchToAuto } = ctx;
  const steps = stepIndex(pack);
  const allStepIds = [...steps.keys()];

  // sessionStorage key unique per pack so different lab days don't collide.
  // localStorage is confined to store.js by docs/02; sessionStorage is the compliant option here —
  // it survives screen navigation but is cleared on browser close, exactly what T17 specifies.
  const ssKey = `mise:manual:${pack.packId}`;

  /** Load the saved lane stacks for n cooks. Returns null if nothing is stored, the cook count has
   * changed, or the stored JSON is malformed. @param {number} n @returns {string[][]|null} */
  function loadBoard(n) {
    try {
      const raw = sessionStorage.getItem(ssKey);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length !== n) return null;
      if (!saved.every((lane) => Array.isArray(lane) && lane.every((id) => typeof id === 'string'))) return null;
      return saved;
    } catch (e) {
      return null;
    }
  }

  /** Persist the current placement. Silent on failure — sessionStorage may be unavailable.
   * @param {string[][]} p @returns {void} */
  function saveBoard(p) {
    try { sessionStorage.setItem(ssKey, JSON.stringify(p)); } catch (e) {}
  }

  // Lane index -> ordered step ids. Rebuilt when the cook count changes so lanes match the kitchen.
  // sessionStorage wins on re-entry (T17): auto-seed fires only when no stored state exists.
  // "Clear board" in the UI resets to emptyLanes and saves the empty state over the stored board.
  let placement = loadBoard(plan.kitchen.cooks) || seedPlacement(plan.kitchen.cooks);
  // The step selected for tap-to-move (docs/02: every drag has a tap equivalent), or null.
  let selected = null;

  /** @param {number} n @returns {string[][]} n empty lanes */
  function emptyLanes(n) {
    return Array.from({ length: n }, () => []);
  }

  /** Seed lane stacks from the auto-scheduler's step assignments so the student has a starting point.
   * Fillers are excluded — the manual board has no concept of them (teacher decision, 2026-08-01).
   * Falls back to empty lanes if the schedule can't be computed (cycle, untagged step, etc.).
   * @param {number} n number of cook lanes @returns {string[][]} */
  function seedPlacement(n) {
    try {
      const base = buildSchedule(pack, plan);
      if (!base.ok) return emptyLanes(n);
      const lanes = emptyLanes(n);
      base.cooks.forEach((cook, i) => {
        if (i >= n) return;
        lanes[i] = cook.assignments
          .filter((a) => a.kind === 'step')
          .sort((a, b) => a.startMin - b.startMin)
          .map((a) => a.stepId);
      });
      return lanes;
    } catch (err) {
      return emptyLanes(n);
    }
  }

  /** Cook display name: the typed name, or "Cook A".."Cook E". @param {number} i @returns {string} */
  function cookName(i) {
    const typed = (plan.kitchen.cookNames || [])[i];
    return typed && typed.trim() ? typed : `Cook ${COOK_LETTERS[i]}`;
  }

  /** The algorithm's makespan for the same pack+plan, or null if it can't schedule (cycle/untagged).
   * Computed fresh each render so it reflects any Screen 1/2 edits. @returns {number|null} */
  function algorithmMakespan() {
    try {
      const base = buildSchedule(pack, plan);
      if (!base.ok) return null;
      return fillGaps(base, pack, plan).makespanMin;
    } catch (err) {
      return null; // untagged step — unreachable in the normal flow (blankPlan tags everything)
    }
  }

  /** Build a Schedule-shaped object (docs/03) from the current lane stacks so the EXISTING print view
   * renders the student's own arrangement (T18). It carries the exact fields print.js reads from a
   * schedule: cooks[].assignments, equipmentUse, equipmentChecklist, bowlCount, floorMin, makespanMin.
   * A manual plan has no fillers, so none are added; the equipment strip and the Page-1 checklist come
   * from placed steps only. floorMin and criticalStepIds come from the AUTO scheduler — the floor is a
   * property of the pack+plan, not the arrangement, so the printed floor line still shows the fastest
   * possible time and critical steps still get their heavy edge. In manual placement a cook holds the
   * whole duration, so endMin === runsUntilMin === block end (the manual model, OPEN-QUESTIONS.md T14).
   * @returns {object} a Schedule with ok:true */
  function synthesizeSchedule() {
    const blocks = computeBlocks(pack, plan, placement);
    const makespanMin = studentMakespan(blocks);

    // Floor + critical set from the auto scheduler; both describe the pack+plan, not the board.
    let floorMin = 0;
    let criticalSet = new Set();
    try {
      const base = buildSchedule(pack, plan);
      if (base.ok) { floorMin = base.floorMin; criticalSet = new Set(base.criticalStepIds); }
    } catch (err) { /* untagged step — unreachable in the normal flow (blankPlan tags everything) */ }

    const cooks = placement.map((ids, i) => {
      const assignments = ids
        .map((id) => {
          const b = blocks.get(id);
          const step = steps.get(id);
          const tag = plan.stepTags[id];
          return {
            kind: 'step',
            stepId: id,
            recipeId: step.recipeId,
            label: step.shortLabel,
            startMin: b.start,
            endMin: b.end,
            runsUntilMin: b.end,
            hands: tag ? tag.hands : 'busy',
            isCritical: criticalSet.has(id),
            equipmentIds: (step.equipmentIds || []).slice(),
          };
        })
        .sort((x, y) => x.startMin - y.startMin || (x.stepId < y.stepId ? -1 : 1));
      let busy = 0;
      for (const r of assignments) busy += r.endMin - r.startMin;
      return {
        index: i,
        name: cookName(i),
        assignments,
        idleMin: makespanMin - busy,
        utilizationPct: makespanMin === 0 ? 0 : Math.round((busy / makespanMin) * 100),
      };
    });

    // Equipment strip intervals — every placed step's equipment, [start, end]. print.js filters to
    // the contended resources (capacity <= 2). Sorted to mirror scheduler.js's deterministic output.
    const equipmentUse = [];
    for (const [id, b] of blocks) {
      for (const eid of (steps.get(id).equipmentIds || [])) {
        equipmentUse.push({ equipmentId: eid, startMin: b.start, endMin: b.end, stepId: id });
      }
    }
    equipmentUse.sort((a, b) =>
      a.startMin - b.startMin ||
      (a.equipmentId < b.equipmentId ? -1 : a.equipmentId > b.equipmentId ? 1 : 0) ||
      (a.stepId < b.stepId ? -1 : 1));

    // Page-1 checklist — checklist:true equipment used by a placed step, sorted by id (as the scheduler).
    const usedEquip = new Set(equipmentUse.map((u) => u.equipmentId));
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
      criticalStepIds: [...criticalSet],
      bowlCount: (plan.bowls || []).length,
      equipmentChecklist,
      warnings: [],
    };
  }

  /** Open print.html in a new tab with the manual arrangement. It reuses the pack part of the current
   * hash verbatim (`p=`/`pf=`), exactly as ui-review does, then adds the small plan (Page 1 draws the
   * bowls table from plan.bowls) and the synthesized schedule as `sched=` (URI-encoded JSON). print.js
   * reads `sched=` and renders it directly, skipping the scheduler. @returns {void} */
  function openPrint() {
    const packHash = (location.hash || '').replace(/^#/, ''); // "p=…" or "pf=…", as this student loaded it
    const sched = encodeURIComponent(JSON.stringify(synthesizeSchedule()));
    const url = `print.html#${packHash}&plan=${encodePlan(plan)}&sched=${sched}`;
    window.open(url, '_blank', 'noopener');
  }

  /** Move a step to the end of a lane, removing it from wherever it currently sits.
   * @param {string} id @param {number} cook @returns {void} */
  function placeInLane(id, cook) {
    removeFromBoard(id);
    placement[cook].push(id);
  }

  /** Return a step to the tray (remove it from every lane). @param {string} id @returns {void} */
  function removeFromBoard(id) {
    for (const lane of placement) {
      const idx = lane.indexOf(id);
      if (idx !== -1) lane.splice(idx, 1);
    }
  }

  /** Which step ids are not on any lane, in pack order. @returns {string[]} */
  function unplacedIds() {
    const placed = new Set(placement.flat());
    return allStepIds.filter((id) => !placed.has(id));
  }

  /** Select a step for tap-to-move, or clear it if already selected. @param {string} id @returns {void} */
  function toggleSelect(id) {
    selected = selected === id ? null : id;
    render();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────────────────
  /** The two headline makespan numbers: the student's board vs the algorithm's (docs/07 T14).
   * @param {number} yours @param {number|null} algo @returns {HTMLElement} */
  function renderNumbers(yours, algo) {
    const wrap = el('div', 'plan-nums');
    wrap.appendChild(numberCard(`${yours} min`, 'Your plan'));
    wrap.appendChild(numberCard(algo == null ? '—' : `${algo} min`, 'Algorithm'));
    return wrap;
  }

  /** One big number over an eyebrow label. @param {string} value @param {string} label @returns {HTMLElement} */
  function numberCard(value, label) {
    const card = el('div', 'plan-num');
    card.appendChild(el('span', 'plan-num-val', value));
    card.appendChild(el('p', 'eyebrow', label));
    return card;
  }

  /** The validation panel: one --alert line per rule broken, or a quiet "valid" note. When steps
   * are still in the tray, a note says so (the board isn't finished, but nothing is wrong yet).
   * @param {string[]} violations @param {number} leftover count still in the tray @returns {HTMLElement} */
  function renderFlags(violations, leftover) {
    const box = el('div', 'warns');
    for (const msg of violations) box.appendChild(el('p', 'warn warn-error', msg));
    if (!violations.length) {
      const okMsg = leftover
        ? `No rule broken yet — ${leftover} step${leftover === 1 ? '' : 's'} still to place.`
        : 'Every step is placed and every rule holds. Nice arrangement.';
      box.appendChild(el('p', 'warn warn-note', okMsg));
    }
    return box;
  }

  /** The tray of not-yet-placed steps. Tapping a chip selects it; it is also a drop target that
   * returns a dragged block to the tray. @param {string[]} ids @returns {HTMLElement} */
  function renderTray(ids) {
    const tray = el('div', 'man-tray');
    tray.appendChild(el('p', 'eyebrow', `Not placed yet — ${ids.length}`));
    const row = el('div', 'chip-row');
    for (const id of ids) row.appendChild(renderChip(id));
    if (!ids.length) row.appendChild(el('p', 'man-empty', 'All steps are on the board.'));
    tray.appendChild(row);

    // Drop here to take a block off the board.
    tray.addEventListener('dragover', (e) => { e.preventDefault(); tray.classList.add('drop-hover'); });
    tray.addEventListener('dragleave', () => tray.classList.remove('drop-hover'));
    tray.addEventListener('drop', (e) => {
      e.preventDefault();
      tray.classList.remove('drop-hover');
      const id = e.dataTransfer.getData('text/plain');
      if (id) { removeFromBoard(id); selected = null; render(); }
    });
    // Tap path: if a placed block is selected, tapping the tray takes it out.
    tray.addEventListener('click', () => {
      if (selected && !unplacedIds().includes(selected)) { removeFromBoard(selected); selected = null; render(); }
    });
    return tray;
  }

  /** An unplaced step as a draggable / tappable chip. @param {string} id @returns {HTMLElement} */
  function renderChip(id) {
    const step = steps.get(id);
    const chip = el('button', `chip${selected === id ? ' sel' : ''}`, step.shortLabel);
    chip.type = 'button';
    chip.draggable = true;
    chip.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', id));
    chip.addEventListener('click', (e) => { e.stopPropagation(); toggleSelect(id); });
    return chip;
  }

  /** The lanes row: one drop-target column per cook, each a stack of placed block cards.
   * @returns {HTMLElement} */
  function renderLanes() {
    const lanes = el('div', 'man-lanes');
    placement.forEach((ids, cook) => lanes.appendChild(renderLane(ids, cook)));
    return lanes;
  }

  /** One cook lane. Tapping it moves the selected step here; it also accepts a dropped block. Shows
   * a "Put here" affordance while a step is selected (the tap equivalent of drop, docs/02).
   * @param {string[]} ids @param {number} cook @returns {HTMLElement} */
  function renderLane(ids, cook) {
    const lane = el('div', 'man-lane');
    lane.appendChild(el('p', 'eyebrow', cookName(cook)));

    const stack = el('div', 'man-stack');
    for (const id of ids) stack.appendChild(renderBlock(id));
    if (!ids.length) stack.appendChild(el('p', 'man-empty', 'Empty'));
    lane.appendChild(stack);

    if (selected) {
      const put = el('button', 'bowl-put', 'Put here');
      put.type = 'button';
      put.addEventListener('click', (e) => { e.stopPropagation(); placeInLane(selected, cook); selected = null; render(); });
      lane.appendChild(put);
    }

    lane.addEventListener('dragover', (e) => { e.preventDefault(); lane.classList.add('drop-hover'); });
    lane.addEventListener('dragleave', () => lane.classList.remove('drop-hover'));
    lane.addEventListener('drop', (e) => {
      e.preventDefault();
      lane.classList.remove('drop-hover');
      const id = e.dataTransfer.getData('text/plain');
      if (id) { placeInLane(id, cook); selected = null; render(); }
    });
    lane.addEventListener('click', () => { if (selected) { placeInLane(selected, cook); selected = null; render(); } });
    return lane;
  }

  /** A placed step as a to-scale bar (T17): height = max(44, durationMin × SCALE) so the block
   * height reflects the step's duration while staying touchable. Styled active/passive so the kind
   * survives grayscale (docs/02). Tapping selects it for a move; a Take out button returns it to the
   * tray. Draggable to another lane or the tray. @param {string} id @returns {HTMLElement} */
  function renderBlock(id) {
    const step = steps.get(id);
    const tag = plan.stepTags[id];
    const dur = tag ? tag.durationMin : 1;
    const kind = tag && tag.hands === 'free' ? 'man-passive' : 'man-active';
    const block = el('div', `man-block ${kind}${selected === id ? ' sel' : ''}`);
    block.style.height = `${Math.max(44, dur * SCALE)}px`;
    block.draggable = true;
    block.addEventListener('dragstart', (e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', id); });

    const label = el('span', 'man-block-label', step.shortLabel);
    label.tabIndex = 0;
    label.addEventListener('click', (e) => { e.stopPropagation(); toggleSelect(id); });
    block.appendChild(label);

    const meta = tag ? `${tag.durationMin} min · ${tag.hands === 'free' ? 'hands free' : 'hands busy'}` : 'untagged';
    block.appendChild(el('span', 'man-block-meta', meta));

    const out = el('button', 'link man-out', 'Take out');
    out.type = 'button';
    out.addEventListener('click', (e) => { e.stopPropagation(); removeFromBoard(id); selected = null; render(); });
    block.appendChild(out);
    return block;
  }

  /** Show an inline confirmation before discarding the manual arrangement and returning to auto.
   * No window.confirm() — forbidden by docs/02. Appends a fixed overlay to root; clicking outside
   * is not a confirm (students on Chromebooks tap things accidentally), so explicit buttons only.
   * @returns {void} */
  function showConfirm() {
    if (root.querySelector('.confirm-overlay')) return; // already showing — no stacking
    const overlay = el('div', 'confirm-overlay');
    const box = el('div', 'confirm-box');
    box.appendChild(el('p', 'confirm-msg',
      'Your manual arrangement will be discarded. Switch to the auto plan?'));
    const row = el('div', 'confirm-btns');
    const yes = el('button', 'primary', 'Yes, switch to auto');
    yes.type = 'button';
    yes.addEventListener('click', () => { overlay.remove(); if (switchToAuto) switchToAuto(); });
    const no = el('button', 'link', 'Keep editing');
    no.type = 'button';
    no.addEventListener('click', () => overlay.remove());
    row.appendChild(yes);
    row.appendChild(no);
    box.appendChild(row);
    overlay.appendChild(box);
    root.appendChild(overlay);
  }

  /** Recompute and rebuild the whole screen from the current placement. @returns {void} */
  function render() {
    // Re-seed when the cook count changes (a different N produces a different schedule, so the
    // old lane arrangement is invalid). Save to sessionStorage after any adjustment so the new
    // state survives navigation back from an earlier screen.
    if (placement.length !== plan.kitchen.cooks) placement = seedPlacement(plan.kitchen.cooks);
    saveBoard(placement);

    root.textContent = '';
    const wrap = el('div', 'review manual');

    wrap.appendChild(el('p', 'eyebrow', 'Your plan'));
    wrap.appendChild(el('p', 'man-intro',
      'Drag each step into a cook’s lane — or tap a step, then tap a lane. ' +
      'The app checks your order and equipment; it will not fix them for you.'));

    const toolRow = el('div', 'man-toolrow');
    if (switchToAuto) {
      const toggle = el('button', 'link mode-toggle', '← Back to auto plan');
      toggle.type = 'button';
      toggle.addEventListener('click', showConfirm);
      toolRow.appendChild(toggle);
    }
    const clear = el('button', 'link man-clear', 'Clear board');
    clear.type = 'button';
    clear.addEventListener('click', () => { placement = emptyLanes(plan.kitchen.cooks); selected = null; render(); });
    toolRow.appendChild(clear);
    wrap.appendChild(toolRow);

    const blocks = computeBlocks(pack, plan, placement);
    const violations = findViolations(pack, plan, placement);
    const leftover = unplacedIds().length;

    wrap.appendChild(renderNumbers(studentMakespan(blocks), algorithmMakespan()));
    wrap.appendChild(renderFlags(violations, leftover));
    wrap.appendChild(renderTray(unplacedIds()));
    wrap.appendChild(renderLanes());

    // Print the student's own arrangement (T18). Enabled only when the board is complete and every
    // rule holds — the same gate ui-review uses for errors — so a printed manual sheet is always valid.
    const canPrint = leftover === 0 && violations.length === 0;
    const printRow = el('div', 'man-print-row');
    const print = el('button', 'primary man-print', 'Print my plan');
    print.type = 'button';
    print.disabled = !canPrint;
    print.addEventListener('click', openPrint);
    printRow.appendChild(print);
    if (!canPrint) {
      const reason = leftover
        ? `Place every step first — ${leftover} to go.`
        : 'Fix the flagged rules first.';
      printRow.appendChild(el('p', 'man-print-reason', reason));
    }
    wrap.appendChild(printRow);

    root.appendChild(wrap);
  }

  render();
  return { refresh: render };
}
