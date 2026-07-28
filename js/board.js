// The board — one renderer for both guided and free placement (spec §4.4).
//
// Open mode used to be a second app: its own data model (openBlocks), its own
// timeline renderer, its own inspector, and no way to carry work between them.
// It's now a toggle on this board. Guided derives every step's start from the
// backward chains; free lets the student set starts directly. Same blocks, same
// lanes, same conflicts, same print path.
//
// Layout note: overlapping blocks are packed into sub-rows rather than drawn on
// top of each other. The previous build absolutely positioned everything on one
// track, so two steps at the same minute painted over one another — labels
// became unreadable on screen and a step vanished entirely from the printout.

import { STATIONS, PERIODS } from "./config.js";
import {
  resolveSchedule, computeConflicts, describeConflict, planSpan,
  equipmentById, laneForStep, stepsForComponent, foodUpFor,
  clockToMinutes, minutesToClock, formatDuration,
} from "./plan.js";

const ROW_H = 32;      // px per stacked sub-row within a lane
const SNAP = 5;        // free-mode nudge, minutes

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Greedy interval packing: each item goes in the first sub-row whose previous
// block has already finished. This is what stops blocks from overlapping.
function packRows(items) {
  const sorted = [...items].sort((a, b) => a.range.start - b.range.start || a.range.end - b.range.end);
  const rowEnds = [];
  for (const item of sorted) {
    let row = rowEnds.findIndex((end) => end <= item.range.start);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(-Infinity);
    }
    rowEnds[row] = item.range.end;
    item.row = row;
  }
  return { items: sorted, rowCount: Math.max(1, rowEnds.length) };
}

export function renderBoard(plan, ctx, mount) {
  const { persist, rerender } = ctx;
  const vertical = ctx.orientation === "vertical";
  mount.innerHTML = "";

  const byId = equipmentById(plan);
  const ranges = resolveSchedule(plan);
  const conflicts = computeConflicts(plan, ranges);
  const span = planSpan(plan, ranges);

  const foodUp = clockToMinutes(foodUpFor(plan));
  const leftEdge = Math.min(span.start, foodUp) - 2;
  const rightEdge = Math.max(span.end, foodUp) + 2;
  const denom = Math.max(rightEdge - leftEdge, 1);

  function place(node, range) {
    const leftPct = ((range.start - leftEdge) / denom) * 100;
    const widthPct = Math.max((range.end - range.start) / denom, 0.005) * 100;
    node.style.left = `${leftPct}%`;
    node.style.width = `calc(${widthPct}% - 2px)`;
  }

  mount.appendChild(buildHeader());
  mount.appendChild(vertical ? buildVerticalTimeline() : buildTimeline());
  mount.appendChild(buildPartBreakdown());
  mount.appendChild(buildConflictSummary());
  mount.appendChild(buildBeforeYouStart());
  mount.appendChild(buildNotesSummary());
  if (plan.schedule.mode === "guided") mount.appendChild(buildOverlapList());

  // ---------- Header: times and readouts ----------

  function buildHeader() {
    const wrap = el("div", "board-header");

    wrap.appendChild(buildWhenControls());

    const readouts = el("div", "readouts");
    readouts.appendChild(readout("Start cooking at", minutesToClock(span.start), "readout--primary"));
    readouts.appendChild(readout("Your plan takes", formatDuration(span.end - span.start)));

    // Slack against the real deadline. The old readout reported
    // "overlapping saves you X" as a max across components, so overlapping
    // inside any component that wasn't the longest changed nothing at all —
    // the student did the thing the app is built to teach and every number
    // stayed identical. Measuring against kitchen time always moves.
    // Measured against the cooking window, not against a pair of clock times.
    // Same number in every period, so the plan means the same thing wherever
    // and whenever it's cooked.
    const available = plan.schedule.windowMins;
    const needed = span.end - span.start;
    const slack = available - needed;

    if (plan.steps.length === 0) {
      readouts.appendChild(readout("You get", formatDuration(Math.max(available, 0))));
    } else if (slack >= 0) {
      readouts.appendChild(readout("Time to spare", formatDuration(slack), "readout--good"));
    } else {
      readouts.appendChild(readout("Over by", formatDuration(-slack), "readout--warn"));
    }
    wrap.appendChild(readouts);

    if (plan.steps.length > 0 && slack < 0) {
      // Warn, never block (spec §6). The plan is left exactly as it is.
      const warn = el("p", "board-warning",
        `Your plan needs ${formatDuration(needed)} but you only get ` +
        `${formatDuration(available)} to cook — you're over by ${formatDuration(-slack)}. ` +
        `You can still plan it this way; nothing here stops you. But look for something ` +
        `that could run while your hands are free.`);
      wrap.appendChild(warn);
    }

    wrap.appendChild(buildModeToggle());
    return wrap;
  }

  // The plan is stored as durations; this is the only thing that turns it into
  // wall-clock times. Getting it wrong makes every printed time wrong while
  // looking authoritative, so the period is named on the board and on the
  // printout — a wrong pick should be visible, not silent.
  function buildWhenControls() {
    const wrap = el("div", "board-header__times");

    const custom = Boolean(plan.schedule.foodUpOverride);

    const field = el("div", "field field--narrow no-print");
    const label = el("label", null, "Which period?");
    label.setAttribute("for", "board-period");
    const select = document.createElement("select");
    select.id = "board-period";
    for (const period of PERIODS) {
      const opt = document.createElement("option");
      opt.value = period.id;
      opt.textContent = `${period.label} — food up ${period.foodUp}`;
      opt.selected = !custom && period.id === plan.schedule.periodId;
      select.appendChild(opt);
    }
    const otherOpt = document.createElement("option");
    otherOpt.value = "__other";
    otherOpt.textContent = "Another time (special day)";
    otherOpt.selected = custom;
    select.appendChild(otherOpt);

    select.addEventListener("change", () => {
      if (select.value === "__other") {
        plan.schedule.foodUpOverride = foodUpFor(plan);
      } else {
        plan.schedule.foodUpOverride = "";
        plan.schedule.periodId = select.value;
      }
      persist();
      rerender();
    });
    field.append(label, select);
    wrap.appendChild(field);

    if (custom) {
      const overrideField = el("div", "field field--narrow no-print");
      const overrideLabel = el("label", null, "Food up by");
      overrideLabel.setAttribute("for", "board-food-up");
      const input = document.createElement("input");
      input.type = "time";
      input.id = "board-food-up";
      input.value = plan.schedule.foodUpOverride;
      input.addEventListener("change", () => {
        plan.schedule.foodUpOverride = input.value;
        persist();
        rerender();
      });
      overrideField.append(overrideLabel, input);
      wrap.appendChild(overrideField);
    }

    // Prints, so a separated sheet still says which period it was for.
    const summary = el("div", "when-summary");
    const period = PERIODS.find((p) => p.id === plan.schedule.periodId);
    const periodName = custom ? "Special day" : (period ? period.label : "");
    summary.textContent =
      `${periodName ? periodName + " · " : ""}${formatDuration(plan.schedule.windowMins)} to cook, ` +
      `food up by ${minutesToClock(foodUp)}`;
    wrap.appendChild(summary);

    return wrap;
  }

  function readout(labelText, value, extraClass) {
    const box = el("div", `readout ${extraClass || ""}`.trim());
    box.appendChild(el("div", "readout__value", value));
    box.appendChild(el("div", "readout__label", labelText));
    return box;
  }

  // ---------- Guided / free toggle ----------

  function buildModeToggle() {
    const wrap = el("div", "mode-toggle no-print");
    const isFree = plan.schedule.mode === "free";

    wrap.appendChild(el("span", "mode-toggle__label",
      isFree ? "You're placing steps yourself." : "Times come from your backward plan."));

    const btn = el("button", "btn btn--small btn--secondary",
      isFree ? "Go back to guided timing" : "Place steps myself");
    btn.type = "button";
    btn.addEventListener("click", () => {
      if (isFree) {
        // Going back re-derives positions, which throws away hand placement.
        // Say so rather than silently rearranging their work.
        const ok = window.confirm(
          "Guided timing will re-calculate every start time from your backward plan, " +
          "replacing the positions you set by hand.\n\nSwitch back?"
        );
        if (!ok) return;
        plan.schedule.mode = "guided";
      } else {
        // Guided has already written resolved starts onto every step, so free
        // mode inherits the current layout instead of starting from nothing.
        plan.schedule.mode = "free";
      }
      persist();
      rerender();
    });
    wrap.appendChild(btn);

    if (isFree) {
      wrap.appendChild(el("p", "toggle-hint",
        "Click a step, then use ← and → to move it, or shift + ← → to change how long it takes."));
    }
    return wrap;
  }

  // ---------- Timeline ----------

  function buildTimeline() {
    const wrap = el("div", "timeline");
    if (plan.steps.length === 0) {
      wrap.appendChild(el("p", "placeholder-note", "Add some steps and your plan will appear here."));
      return wrap;
    }

    wrap.appendChild(buildAxis());

    // "You" lane: every hands-on step, from every part of the dish, because
    // it's the same one student doing all of it.
    wrap.appendChild(buildLane("You", null, handsItems()));

    // One row per station, not one per step. The previous build gave every
    // step its own row, so two things fighting over the oven never visually
    // collided and identical lane labels repeated down the page.
    for (const station of STATIONS) {
      const items = stationItems(station);
      if (items.length === 0) continue;
      wrap.appendChild(buildLane(station.label, station, items));
    }

    return wrap;
  }

  function buildAxis() {
    const axis = el("div", "timeline__axis");
    const stops = 4;
    for (let i = 0; i <= stops; i++) {
      axis.appendChild(el("span", "timeline__tick", minutesToClock(leftEdge + (denom * i) / stops)));
    }
    return axis;
  }

  function buildLane(labelText, station, items) {
    const lane = el("div", "lane");

    const label = el("div", "lane__label");
    label.appendChild(el("span", "lane__name", labelText));
    if (station && station.exclusive) {
      label.appendChild(el("span", "lane__flag", "one at a time"));
    }
    lane.appendChild(label);

    const track = el("div", "lane__track");
    const packed = packRows(items);
    track.style.height = `${packed.rowCount * ROW_H + 4}px`;

    for (const item of packed.items) {
      track.appendChild(buildBlock(item));
    }
    lane.appendChild(track);
    return lane;
  }

  function buildBlock({ step, range, row }, opts = {}) {
    const isFree = plan.schedule.mode === "free";
    const reasons = conflicts.get(step.id);
    const isHardest = plan.read.hardestStepId === step.id;

    // Interactive in free mode (arrow keys move it); a plain div otherwise, so
    // guided-mode boards don't advertise controls that do nothing.
    const node = document.createElement(isFree ? "button" : "div");
    if (isFree) node.type = "button";
    node.className = [
      "block",
      step.hands ? "block--hands" : "block--unattended",
      reasons ? "block--conflict" : "",
      isHardest ? "block--hardest" : "",
      opts.vertical ? "block--vertical" : "",
      opts.tiny ? "block--tiny" : "",
    ].filter(Boolean).join(" ");
    // Vertical positions come from the caller, which has the pixels-per-minute
    // scale; horizontal packs into fixed-height sub-rows.
    if (!opts.vertical) {
      node.style.top = `${row * ROW_H + 2}px`;
      node.style.height = `${ROW_H - 4}px`;
    }

    const timeText = `${minutesToClock(range.start)} · ${step.mins}m`;
    node.appendChild(el("span", "block__label", step.name));
    node.appendChild(el("span", "block__time", timeText));

    // Labels get clipped on short blocks, so the full story lives in the
    // title and the accessible name too.
    const detail = [step.name, timeText, isHardest ? "you flagged this as the hardest step" : "",
      reasons ? describeConflict(reasons) : ""].filter(Boolean).join(" — ");
    node.title = detail;
    if (isFree) {
      node.setAttribute("aria-label", `${detail}. Arrow keys move it, shift and arrow keys change its length.`);
      node.id = `block-${step.id}`;
      node.addEventListener("keydown", (e) => onBlockKey(e, step));
    } else {
      node.setAttribute("aria-label", detail);
    }

    if (!opts.vertical) place(node, range);
    return node;
  }

  function onBlockKey(e, step) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? SNAP : -SNAP;
    if (e.shiftKey) {
      step.mins = Math.max(SNAP, step.mins + delta);
    } else {
      step.start += delta;
    }
    persist();
    // Keep focus on the block being nudged; without preventScroll the page
    // jumps to it on every keypress.
    rerender(() => {
      const again = document.getElementById(`block-${step.id}`);
      if (again) again.focus({ preventScroll: true });
    });
  }

  // ---------- Vertical timeline ----------
  //
  // Time runs down the page and lanes become columns. Portrait paper is tall
  // and narrow, which is the wrong shape for a horizontal time axis: a 2-minute
  // block in a 30-minute span is ~45px wide and its label truncates to "Pl…".
  // Vertically that same block gets a full column width for its label and its
  // height carries the duration instead. It also makes narrow screens work
  // properly rather than as a compromise — unlimited scroll height is exactly
  // what a long time axis wants.
  //
  // The packing algorithm is unchanged; sub-rows simply become sub-columns.
  function buildVerticalTimeline() {
    const wrap = el("div", "vtimeline");
    if (plan.steps.length === 0) {
      wrap.appendChild(el("p", "placeholder-note", "Add some steps and your plan will appear here."));
      return wrap;
    }

    // A fixed cooking window means every plan is the same height, so students
    // learn to read the shape instead of re-orienting each time. The window is
    // the floor; a plan that overruns it grows past it, visibly.
    const windowStart = foodUp - plan.schedule.windowMins;
    const top = Math.min(windowStart, span.start);
    const bottom = Math.max(foodUp, span.end);
    const totalMins = Math.max(bottom - top, 1);
    const PX_PER_MIN = 9;
    const height = totalMins * PX_PER_MIN;

    const lanes = [{ label: "You", station: null, items: handsItems() }];
    for (const station of STATIONS) {
      const items = stationItems(station);
      if (items.length > 0) lanes.push({ label: station.label, station, items });
    }

    const grid = el("div", "vtimeline__grid");
    grid.style.gridTemplateColumns = `var(--vtime-gutter) repeat(${lanes.length}, 1fr)`;

    // Header row
    grid.appendChild(el("div", "vtimeline__corner"));
    for (const lane of lanes) {
      const head = el("div", "vtimeline__head");
      head.appendChild(el("span", "vtimeline__head-name", lane.label));
      if (lane.station && lane.station.exclusive) {
        head.appendChild(el("span", "lane__flag", "one at a time"));
      }
      grid.appendChild(head);
    }

    // Clock gutter — a label every 10 minutes, like a calendar day view.
    const gutter = el("div", "vtimeline__gutter");
    gutter.style.height = `${height}px`;
    const firstTick = Math.ceil(top / 10) * 10;
    for (let t = firstTick; t <= bottom; t += 10) {
      const tick = el("div", "vtimeline__tick", minutesToClock(t));
      tick.style.top = `${(t - top) * PX_PER_MIN}px`;
      gutter.appendChild(tick);
    }
    grid.appendChild(gutter);

    for (const lane of lanes) {
      const track = el("div", "vtimeline__track");
      track.style.height = `${height}px`;

      // Hour lines, so a block's position is readable without tracing to the
      // gutter. Drawn per lane because the grid gap breaks a single overlay.
      for (let t = firstTick; t <= bottom; t += 10) {
        const rule = el("div", "vtimeline__rule");
        rule.style.top = `${(t - top) * PX_PER_MIN}px`;
        track.appendChild(rule);
      }

      // Anything outside the cooking window is over budget, and should look it.
      if (span.start < windowStart) {
        const over = el("div", "vtimeline__over");
        over.style.top = "0";
        over.style.height = `${Math.max(0, (windowStart - top) * PX_PER_MIN)}px`;
        track.appendChild(over);
      }

      const packed = packRows(lane.items);
      for (const item of packed.items) {
        const blockHeight = Math.max(item.range.end - item.range.start, 1) * PX_PER_MIN - 2;
        const node = buildBlock(item, { vertical: true, tiny: blockHeight < 30 });
        node.style.top = `${(item.range.start - top) * PX_PER_MIN}px`;
        node.style.height = `${blockHeight}px`;
        node.style.left = `${(item.row / packed.rowCount) * 100}%`;
        node.style.width = `calc(${(1 / packed.rowCount) * 100}% - 2px)`;
        track.appendChild(node);
      }
      grid.appendChild(track);
    }

    wrap.appendChild(grid);
    return wrap;
  }

  function handsItems() {
    return plan.steps
      .filter((s) => s.hands)
      .map((s) => ({ step: s, range: ranges.get(s.id) }))
      .filter((item) => item.range);
  }

  function stationItems(station) {
    return plan.steps
      .filter((s) => !s.hands && laneForStep(s, byId) === station.id)
      .map((s) => ({ step: s, range: ranges.get(s.id) }))
      .filter((item) => item.range);
  }

  // ---------- Which part sets the start time ----------
  //
  // Without this, overlapping something inside a part that isn't the longest
  // changes no visible number at all: the plan still starts when the longest
  // part says it does. The student does the exact thing the app is built to
  // teach and gets no feedback. Per-part give always moves, and it teaches the
  // more useful idea — that one part is deciding your whole start time.
  function buildPartBreakdown() {
    const wrap = el("div", "part-breakdown");
    if (plan.components.length < 2 || plan.steps.length === 0) return wrap;

    const parts = [];
    for (const component of plan.components) {
      const steps = stepsForComponent(plan, component.id)
        .map((s) => ranges.get(s.id))
        .filter(Boolean);
      if (steps.length === 0) continue;
      const start = Math.min(...steps.map((r) => r.start));
      const end = Math.max(...steps.map((r) => r.end));
      parts.push({ component, length: end - start });
    }
    if (parts.length < 2) return wrap;

    const longest = Math.max(...parts.map((p) => p.length));
    wrap.appendChild(el("h3", null, "Where your time goes"));

    const list = el("ul", "part-breakdown__list");
    for (const part of parts.sort((a, b) => b.length - a.length)) {
      const give = longest - part.length;
      const li = el("li", give === 0 ? "part-breakdown__item part-breakdown__item--critical" : "part-breakdown__item");
      li.appendChild(el("span", "part-breakdown__name", part.component.name));
      li.appendChild(el("span", "part-breakdown__length", formatDuration(part.length)));
      li.appendChild(el("span", "part-breakdown__note", give === 0
        ? "your longest part — this is what decides when you start"
        : `${formatDuration(give)} of give`));
      list.appendChild(li);
    }
    wrap.appendChild(list);
    return wrap;
  }

  // ---------- Conflicts, in words ----------

  function buildConflictSummary() {
    const wrap = el("div", "conflict-summary");
    if (conflicts.size === 0) return wrap;

    const lines = [];
    const seen = new Set();
    for (const [stepId, reasons] of conflicts) {
      const step = plan.steps.find((s) => s.id === stepId);
      if (!step) continue;
      const range = ranges.get(stepId);
      const partners = [...conflicts.keys()].filter((otherId) => {
        if (otherId === stepId || seen.has(`${otherId}|${stepId}`)) return false;
        const other = ranges.get(otherId);
        return other && other.start < range.end && range.start < other.end;
      });
      for (const otherId of partners) {
        const other = plan.steps.find((s) => s.id === otherId);
        if (!other) continue;
        seen.add(`${stepId}|${otherId}`);
        lines.push(`"${step.name}" and "${other.name}" — ${describeConflict(reasons)}.`);
      }
    }
    if (lines.length === 0) return wrap;

    wrap.appendChild(el("h3", null,
      lines.length === 1 ? "One thing to sort out" : `${lines.length} things to sort out`));
    const list = el("ul");
    for (const line of lines) list.appendChild(el("li", null, line));
    wrap.appendChild(list);
    wrap.appendChild(el("p", "conflict-summary__hint",
      "Nothing here stops you — a real kitchen has these problems too. Move something, " +
      "or decide to do them one after the other."));
    return wrap;
  }

  // ---------- Bowls and notes ----------

  // Mise en place means the bowl is ready before the step starts, so the board
  // opens with what has to exist before anything else happens.
  function buildBeforeYouStart() {
    const wrap = el("div", "prep-list");
    const bowlsById = new Map(plan.bowls.map((b) => [b.id, b]));
    const used = [];
    for (const step of plan.steps) {
      for (const bowlId of step.bowlIds) {
        const bowl = bowlsById.get(bowlId);
        if (bowl && !used.some((u) => u.bowl.id === bowl.id)) used.push({ bowl, step });
      }
    }
    if (used.length === 0) return wrap;

    wrap.appendChild(el("h3", null, "Before you start: these bowls must be prepped"));
    const groups = el("div", "prep-list__items");
    for (const { bowl, step } of used) {
      const group = el("div", "prep-list__group");
      group.appendChild(el("div", "prep-list__step-name", bowl.label || "Unlabelled bowl"));
      const ul = el("ul");
      for (const item of bowl.items) ul.appendChild(el("li", null, item));
      group.appendChild(ul);
      group.appendChild(el("div", "prep-list__for", `for "${step.name}"`));
      groups.appendChild(group);
    }
    wrap.appendChild(groups);
    return wrap;
  }

  function buildNotesSummary() {
    const wrap = el("div", "prep-list");
    const withNotes = plan.steps.filter((s) => s.note && s.note.trim());
    if (withNotes.length === 0) return wrap;

    wrap.appendChild(el("h3", null, "Don't forget"));
    const groups = el("div", "prep-list__items");
    for (const step of withNotes) {
      const group = el("div", "prep-list__group");
      group.appendChild(el("div", "prep-list__step-name", step.name));
      group.appendChild(el("p", null, step.note));
      groups.appendChild(group);
    }
    wrap.appendChild(groups);
    return wrap;
  }

  // ---------- Free-hands windows (guided only) ----------

  function buildOverlapList() {
    const wrap = el("div", "overlap-list no-print");

    const windows = plan.steps.filter((s) => !s.hands && !plan.steps.some((o) => o.par === s.id));
    const paired = plan.steps.filter((s) => s.par != null);

    if (windows.length > 0) {
      wrap.appendChild(el("h3", null, "Free hands"));
      wrap.appendChild(el("p", "overlap-list__intro",
        "While these run by themselves your hands are free. Anything you could be doing then?"));
      const list = el("div", "window-list");
      for (const anchor of windows) {
        const range = ranges.get(anchor.id);
        if (!range) continue;
        const btn = el("button", "btn btn--small window-list__btn",
          `${anchor.name} — ${anchor.mins} min free`);
        btn.type = "button";
        btn.addEventListener("click", () => openPicker(anchor, range, wrap));
        list.appendChild(btn);
      }
      wrap.appendChild(list);
    }

    if (paired.length > 0) {
      wrap.appendChild(el("h3", null, "Double-check: can each of these genuinely happen at the same time?"));
      const list = el("ul");
      for (const step of paired) {
        const anchor = plan.steps.find((s) => s.id === step.par);
        const li = el("li");
        li.appendChild(el("span", null,
          anchor ? `"${step.name}" runs during "${anchor.name}"` : step.name));
        const undo = el("button", "btn btn--small btn--secondary", "Undo");
        undo.type = "button";
        undo.addEventListener("click", () => {
          step.par = null;
          persist();
          rerender();
        });
        li.appendChild(undo);
        list.appendChild(li);
      }
      wrap.appendChild(list);
    }

    return wrap;
  }

  function openPicker(anchor, anchorRange, container) {
    const existing = container.querySelector(".picker");
    if (existing) existing.remove();

    const panel = el("div", "picker no-print");
    panel.appendChild(el("p", "picker__prompt",
      `"${anchor.name}" runs for ${anchor.mins} minutes without you. What could you be doing?`));

    const windowMins = anchorRange.end - anchorRange.start;
    const candidates = plan.steps.filter((s) => {
      if (!s.hands || s.par != null || s.id === anchor.id) return false;
      if (s.mins > windowMins) return false;
      const natural = ranges.get(s.id);
      return natural && natural.start >= anchorRange.start;
    });

    if (candidates.length === 0) {
      panel.appendChild(el("p", "picker__empty", "Nothing later in your plan fits in this window."));
    } else {
      const list = el("div", "picker__list");
      const componentName = new Map(plan.components.map((c) => [c.id, c.name]));
      for (const candidate of candidates) {
        const suffix = plan.components.length > 1 ? ` — ${componentName.get(candidate.component) || ""}` : "";
        const btn = el("button", "btn btn--small", `${candidate.name} (${candidate.mins} min)${suffix}`);
        btn.type = "button";
        btn.addEventListener("click", () => {
          candidate.par = anchor.id;
          persist();
          rerender();
        });
        list.appendChild(btn);
      }
      panel.appendChild(list);
    }

    const close = el("button", "btn btn--small btn--secondary", "Never mind");
    close.type = "button";
    close.addEventListener("click", () => panel.remove());
    panel.appendChild(close);

    container.appendChild(panel);
  }
}

export function stepsSummary(plan) {
  return plan.components.map((c) => ({ component: c, steps: stepsForComponent(plan, c.id) }));
}
