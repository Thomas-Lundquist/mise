// js/ui-review.js — Screen 3 ("Your plan"). DOM only; reads the shared plan, never mutates it.
// See docs/05-ui-spec.md Screen 3, docs/06-print-spec.md (lane structure), docs/04-scheduler-spec.md.
//
// This screen is a pure READ of the engine: on every entry it recomputes the schedule from the
// current plan (buildSchedule -> fillGaps), lists warnings (checkPlan) in severity order, and draws
// the ticket rail on screen at 2px/min — the same lane structure the print view draws at 3mm/min.
// Errors disable printing; warns do not. It never assigns innerHTML from pack/plan content.
//
// The print URL reuses the pack portion of the address-bar hash verbatim (`p=…` inline or
// `pf=…` hosted — whichever this student loaded, so an oversize pack is never re-encoded) and
// appends the small encoded plan as `&plan=`. That hash contract is recorded in OPEN-QUESTIONS.md
// for T13's print.js to read back; the plan is small by design (docs/03), so length is not a concern.

import { buildSchedule } from './scheduler.js';
import { fillGaps } from './fillers.js';
import { checkPlan } from './warnings.js';
import { encodePlan } from './codec.js';

// On-screen scale, in PIXELS PER MINUTE — the single knob for timeline size. Blocks are positioned
// top = startMin * SCALE and height = span * SCALE (spine ticks, gridlines, floor line and equipment
// bars all derive from it), so raising this makes the whole rail taller and every block more legible;
// lowering it makes it more compact. docs/05 originally specified 2, which proved illegible on screen
// (a 45-min plan was 90px tall); raised to 10 with the teacher's sign-off (see OPEN-QUESTIONS T12).
const SCALE = 20;

/** Build a DOM node.
 * @param {string} tag @param {string} [cls] @param {string} [text] @returns {HTMLElement} */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** Mount Screen 3 (review) into a container and render the plan.
 * The returned handle's refresh() recomputes and re-renders from the current plan; app.js calls it
 * on every entry so edits made on Screens 1–2 are reflected. Nothing here mutates the plan, so there
 * is no persist. Screen 3 is the last screen (the shell hides Next), so it never gates the footer.
 * @param {HTMLElement} root the screen's <section>
 * @param {{ pack: object, plan: object }} ctx shared app context
 * @returns {{ refresh: function():void }} */
export function mount(root, ctx) {
  const { pack, plan } = ctx;

  // ── Read-only lookups from the pack ─────────────────────────────────────────────────────────
  // stepId -> full label (tap-to-reveal) and "R<recipe>·<order>" reference key (docs/06 corner ref).
  const stepInfo = new Map();
  pack.recipes.forEach((recipe, ri) => {
    for (const step of recipe.steps) {
      stepInfo.set(step.id, { fullLabel: step.label, ref: `R${ri + 1}·${step.order}` });
    }
  });
  // Equipment id -> capacity, to pick which resources appear in the strip (docs/06: capacity <= 2).
  const capById = new Map(pack.equipment.map((e) => [e.id, e.capacity]));

  // The tapped-block caption node, held so a tap updates just that line, not the whole screen.
  let captionEl = null;

  // ── Reads ───────────────────────────────────────────────────────────────────────────────────
  /** Compute the filled schedule for the current plan. buildSchedule throws on an untagged step
   * (unreachable in the normal flow — blankPlan tags every step) and returns { ok:false } on a
   * cycle; both collapse to a non-ok result here so checkPlan can still report the error.
   * @returns {object|null} a filled Schedule (ok:true), a { ok:false } cycle result, or null on throw */
  function computeSchedule() {
    let base;
    try {
      base = buildSchedule(pack, plan);
    } catch (err) {
      return null; // untagged step — checkPlan derives UNTAGGED straight from pack+plan below
    }
    return base.ok ? fillGaps(base, pack, plan) : base;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────────────────
  /** The two headline numbers, or the equal-case single line (docs/05 Screen 3, item 1).
   * @param {object} schedule an ok Schedule @returns {HTMLElement} */
  function renderNumbers(schedule) {
    if (schedule.makespanMin === schedule.floorMin) {
      return el('p', 'plan-equal', 'This is as fast as this lab can go.');
    }
    const wrap = el('div', 'plan-nums');
    wrap.appendChild(numberCard(schedule.makespanMin, 'Your plan'));
    wrap.appendChild(numberCard(schedule.floorMin, 'Fastest possible'));
    return wrap;
  }

  /** One big number over its eyebrow label. The number is data-face with tabular figures (docs/02).
   * @param {number} min @param {string} label @returns {HTMLElement} */
  function numberCard(min, label) {
    const card = el('div', 'plan-num');
    card.appendChild(el('span', 'plan-num-val', `${min} min`));
    card.appendChild(el('p', 'eyebrow', label));
    return card;
  }

  /** Warnings, most severe first (checkPlan already orders errors before warns). Errors render in
   * --alert; warns render as a quiet --paper panel and never block (docs/05 item 2).
   * @param {Array<{severity:string,message:string}>} warnings @returns {HTMLElement|null} */
  function renderWarnings(warnings) {
    if (!warnings.length) return null;
    const list = el('div', 'warns');
    for (const w of warnings) {
      const cls = w.severity === 'error' ? 'warn warn-error' : 'warn warn-note';
      list.appendChild(el('p', cls, w.message));
    }
    return list;
  }

  /** The on-screen ticket rail: a header row, then a time spine + one lane per cook + an equipment
   * strip, with the floor line drawn across at floorMin. Mirrors the print view's structure (docs/06)
   * at SCALE px/min. Tapping a block writes its full label into the caption node.
   * @param {object} schedule an ok Schedule @returns {HTMLElement} */
  function renderTimeline(schedule) {
    const height = schedule.makespanMin * SCALE;

    const timeline = el('div', 'timeline');

    // Header row: an empty spine cell, a titled cell per cook, and the equipment-strip header.
    const heads = el('div', 'tl-heads');
    heads.appendChild(el('div', 'tl-spine-head', 'MIN'));
    for (const cook of schedule.cooks) {
      heads.appendChild(el('div', 'tl-lane-head', cook.name));
    }
    heads.appendChild(el('div', 'tl-equip-head', 'EQUIP'));
    timeline.appendChild(heads);

    // Body: spine + lanes + equipment strip share one relative row so blocks and ticks align.
    const body = el('div', 'tl-body');

    const spine = el('div', 'tl-spine');
    spine.style.height = `${height}px`;
    for (let m = 0; m <= schedule.makespanMin; m += 5) {
      const tick = el('div', 'tl-tick', String(m));
      tick.style.top = `${m * SCALE}px`;
      spine.appendChild(tick);
    }
    body.appendChild(spine);

    // The lanes area carries the every-5-minute gridlines behind the lanes, then the lanes.
    const area = el('div', 'tl-area');
    area.style.height = `${height}px`;
    for (let m = 0; m <= schedule.makespanMin; m += 5) {
      const line = el('div', 'tl-grid');
      line.style.top = `${m * SCALE}px`;
      area.appendChild(line);
    }
    const lanes = el('div', 'tl-lanes');
    for (const cook of schedule.cooks) {
      lanes.appendChild(renderLane(cook, height));
    }
    area.appendChild(lanes);

    // Floor line across the lanes at floorMin — the argument the sheet exists to make (docs/06).
    const floor = el('div', 'tl-floor');
    floor.style.top = `${schedule.floorMin * SCALE}px`;
    floor.appendChild(el('span', 'tl-floor-label', `FLOOR — ${schedule.floorMin} MIN`));
    area.appendChild(floor);

    body.appendChild(area);
    body.appendChild(renderEquipStrip(schedule, height));
    timeline.appendChild(body);
    return timeline;
  }

  /** One cook lane: absolutely-positioned blocks for each assignment.
   * @param {object} cook a Schedule cook @param {number} height lane height in px @returns {HTMLElement} */
  function renderLane(cook, height) {
    const lane = el('div', 'tl-lane');
    lane.style.height = `${height}px`;
    for (const a of cook.assignments) {
      for (const node of renderBlock(a)) lane.appendChild(node);
    }
    return lane;
  }

  /** The block(s) for one assignment. An active step or a filler is a single block. A passive step
   * (hands free) that keeps cooking after the cook is released draws a short solid cook-hold marker,
   * then a dashed empty continuation to runsUntilMin labelled "↓ runs to :NN" — the passive-time
   * lesson docs/06 forbids collapsing into one block. Critical steps get a heavy left edge.
   * @param {object} a an Assignment @returns {HTMLElement[]} */
  function renderBlock(a) {
    const nodes = [];
    const kindCls = a.kind === 'filler' ? 'tl-filler' : a.hands === 'free' ? 'tl-passive' : 'tl-active';
    const block = el('div', `tl-block ${kindCls}${a.isCritical ? ' tl-critical' : ''}`);
    block.style.top = `${a.startMin * SCALE}px`;
    block.style.height = `${(a.endMin - a.startMin) * SCALE}px`;
    block.appendChild(el('span', 'tl-block-label', a.label));
    if (a.kind === 'step') block.appendChild(el('span', 'tl-block-ref', stepInfo.get(a.stepId).ref));
    // Tap shows the full label (docs/05): the full step label, or the filler's own label.
    const full = a.kind === 'step' ? stepInfo.get(a.stepId).fullLabel : a.label;
    block.tabIndex = 0;
    block.addEventListener('click', () => showCaption(full));
    nodes.push(block);

    if (a.kind === 'step' && a.hands === 'free' && a.runsUntilMin > a.endMin) {
      const run = el('div', 'tl-run');
      run.style.top = `${a.endMin * SCALE}px`;
      run.style.height = `${(a.runsUntilMin - a.endMin) * SCALE}px`;
      run.appendChild(el('span', 'tl-run-label', `↓ runs to :${a.runsUntilMin}`));
      nodes.push(run);
    }
    return nodes;
  }

  /** The rightmost equipment strip: unlabelled bars for each committed interval on a contended
   * resource (capacity <= 2), so the group can see the oven/burners are tied up (docs/06).
   * @param {object} schedule an ok Schedule @param {number} height px @returns {HTMLElement} */
  function renderEquipStrip(schedule, height) {
    const strip = el('div', 'tl-equip');
    strip.style.height = `${height}px`;
    for (const use of schedule.equipmentUse) {
      const cap = capById.get(use.equipmentId);
      if (cap == null || cap > 2) continue;
      const bar = el('div', 'tl-equip-bar');
      bar.style.top = `${use.startMin * SCALE}px`;
      bar.style.height = `${(use.endMin - use.startMin) * SCALE}px`;
      bar.title = use.equipmentId; // native tooltip only; not a rendered pack/plan string
      strip.appendChild(bar);
    }
    return strip;
  }

  /** Write a tapped block's full label into the caption line (docs/05: "Tapping a block shows the
   * full step label"). @param {string} text @returns {void} */
  function showCaption(text) {
    if (captionEl) captionEl.textContent = text;
  }

  /** Per-cook summary line: working minutes (step cook-hold) vs. minutes on side tasks (fillers),
   * e.g. "Cook A — 41 min working, 6 min on side tasks" (docs/05 item 4).
   * @param {object} schedule an ok Schedule @returns {HTMLElement} */
  function renderCookSummary(schedule) {
    const list = el('div', 'cook-summary');
    for (const cook of schedule.cooks) {
      let working = 0;
      let side = 0;
      for (const a of cook.assignments) {
        const span = a.endMin - a.startMin;
        if (a.kind === 'filler') side += span;
        else working += span;
      }
      list.appendChild(el('p', 'cook-summary-line',
        `${cook.name} — ${working} min working, ${side} min on side tasks`));
    }
    return list;
  }

  /** The action row: Print my plan (disabled while any error blocks it) and Copy plan code.
   * @param {boolean} canPrint @returns {HTMLElement} */
  function renderActions(canPrint) {
    const wrap = el('div', 'plan-actions');

    const print = el('button', 'primary', 'Print my plan');
    print.type = 'button';
    print.disabled = !canPrint;
    print.addEventListener('click', openPrint);
    wrap.appendChild(print);

    if (!canPrint) {
      wrap.appendChild(el('p', 'plan-blocked', 'Fix the errors above before you can print.'));
    }

    const copy = el('button', 'link', 'Copy plan code');
    copy.type = 'button';
    const status = el('span', 'copy-status');
    status.setAttribute('aria-live', 'polite'); // announce the copy result to screen readers
    copy.addEventListener('click', () => copyPlanCode(status));
    wrap.appendChild(copy);
    wrap.appendChild(status);

    return wrap;
  }

  // ── Actions ─────────────────────────────────────────────────────────────────────────────────
  /** Open print.html in a new tab with the pack (reused from the current hash) plus the encoded
   * plan. print.js (T13) calls window.print() on load; this only opens the tab. @returns {void} */
  function openPrint() {
    const packHash = (location.hash || '').replace(/^#/, ''); // "p=…" or "pf=…", as this student loaded it
    const url = `print.html#${packHash}&plan=${encodePlan(plan)}`;
    window.open(url, '_blank', 'noopener');
  }

  /** Copy the encoded plan string to the clipboard for a Canvas text submission (docs/05 item 6).
   * Tries the async Clipboard API, then falls back to a hidden textarea + execCommand for locked-down
   * Chromebooks where the API is blocked. Never uses alert(); status is shown inline.
   * @param {HTMLElement} status the aria-live status node @returns {void} */
  function copyPlanCode(status) {
    const code = encodePlan(plan);
    const done = () => { status.textContent = 'Copied plan code.'; };
    const fail = () => { status.textContent = 'Could not copy — select the link and copy manually.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, () => { if (legacyCopy(code)) done(); else fail(); });
    } else if (legacyCopy(code)) {
      done();
    } else {
      fail();
    }
  }

  /** Fallback clipboard copy via a temporary textarea. @param {string} text @returns {boolean} ok */
  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      return false;
    }
  }

  // ── Compose ─────────────────────────────────────────────────────────────────────────────────
  /** Recompute and rebuild the whole screen from the current plan. */
  function render() {
    root.textContent = '';
    const wrap = el('div', 'review');

    const schedule = computeSchedule();
    const ok = !!(schedule && schedule.ok);
    const warnings = checkPlan(pack, plan, schedule || undefined);
    const hasError = warnings.some((w) => w.severity === 'error');

    // 1. Two big numbers (only when there is a real schedule).
    if (ok) wrap.appendChild(renderNumbers(schedule));

    // 2. Warnings, most severe first.
    const warnNode = renderWarnings(warnings);
    if (warnNode) wrap.appendChild(warnNode);

    // 3. Timeline + the tapped-block caption line.
    if (ok) {
      wrap.appendChild(renderTimeline(schedule));
      captionEl = el('p', 'tl-caption');
      wrap.appendChild(captionEl);
    }

    // 4. Per-cook summary.
    if (ok) wrap.appendChild(renderCookSummary(schedule));

    // 5 + 6. Print my plan (blocked by errors) and Copy plan code.
    wrap.appendChild(renderActions(ok && !hasError));

    root.appendChild(wrap);
  }

  render();
  return { refresh: render };
}
