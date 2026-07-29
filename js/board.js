// The board — one renderer for both guided and free placement (spec §4.4).
//
// Open mode used to be a second app: its own data model (openBlocks), its own
// timeline renderer, its own inspector, and no way to carry work between them.
// It's now a toggle on this board. Guided derives every step's start from the
// backward chains; free lets the student set starts directly. Same blocks, same
// lanes, same conflicts, same print path.
//
// Layout note: overlapping blocks are packed into sub-columns rather than drawn
// on top of each other. An earlier build absolutely positioned everything on one
// track, so two steps at the same minute painted over one another — labels
// became unreadable on screen and a step vanished entirely from the printout.

import { STATIONS, PERIODS, MAX_COOKS } from "./config.js";
import {
  resolveSchedule, computeConflicts, describeConflict, planSpan,
  equipmentById, laneForStep, stepsForComponent, foodUpFor, resolvedFoodUp, cookCount,
  clockToMinutes, minutesToClock, formatDuration,
} from "./plan.js";

const SNAP = 5;        // free-mode nudge, minutes

// Fit the time-plan board to one printed page by re-rendering at a compressed
// PX_PER_MIN rather than scaling the whole element with zoom. Zoom shrinks
// text along with geometry; a lower px/min keeps fonts at native size and only
// compresses the row heights. State is stored by renderBoard on every normal
// render so the handlers here can re-invoke it at print density.
let _printRenderState = null;

(function () {
  window.addEventListener("beforeprint", () => {
    if (!_printRenderState) return;
    const { plan, ctx, mount, totalMins, naturalPxPerMin } = _printRenderState;
    const page = document.querySelector(".board-page");
    if (!page) return;
    // Letter paper (11") at 96 css-px/in, 0.5in margins → 960px printable
    // height, less a small safety margin for rounding and borders.
    const PRINTABLE_H = 960;
    const SAFETY = 24;
    // The board is more than the timeline tracks: header readouts, lane labels,
    // warnings and gaps all take vertical space, and that space varies by plan.
    // Measure it live rather than guessing a constant — derive it as the page
    // height minus the track pixels, then subtract the .no-print controls that
    // print CSS removes (they're still laid out now, during beforeprint). What
    // remains is the chrome that will actually print above/around the tracks.
    const tracksH = totalMins * naturalPxPerMin;
    const noPrintH = [...page.querySelectorAll(".no-print")]
      .reduce((sum, el) => sum + el.offsetHeight, 0);
    const chromeH = Math.max(0, page.scrollHeight - tracksH - noPrintH);
    const availableH = PRINTABLE_H - chromeH - SAFETY;
    if (tracksH > availableH && availableH > 0) {
      const fitPxPerMin = Math.max(3, availableH / totalMins);
      renderBoard(plan, ctx, mount, fitPxPerMin);
    }
  });
  window.addEventListener("afterprint", () => {
    if (!_printRenderState) return;
    const { plan, ctx, mount } = _printRenderState;
    renderBoard(plan, ctx, mount);
  });
}());

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Greedy interval packing: each item goes in the first sub-column whose previous
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

export function renderBoard(plan, ctx, mount, forcePxPerMin) {
  const { persist, rerender } = ctx;
  mount.innerHTML = "";

  const byId = equipmentById(plan);
  const ranges = resolveSchedule(plan);
  const conflicts = computeConflicts(plan, ranges);
  const span = planSpan(plan, ranges);

  // Where the food actually goes up. Under an "early" anchor that's wherever
  // the plan ends, not the period's bell — so it has to come from the resolved
  // schedule rather than the period table. Already in minutes, unlike foodUpFor.
  const foodUp = resolvedFoodUp(plan);

  const boardPage = el("div", "board-page");
  boardPage.appendChild(buildHeader());
  boardPage.appendChild(buildTimeline());
  mount.appendChild(boardPage);

  const boardSupport = el("div", "board-support");
  boardSupport.appendChild(buildPartBreakdown());
  boardSupport.appendChild(buildConflictSummary());
  boardSupport.appendChild(buildBeforeYouStart());
  boardSupport.appendChild(buildNotesSummary());
  if (plan.schedule.mode === "guided") boardSupport.appendChild(buildIdleList());
  mount.appendChild(boardSupport);

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

    wrap.appendChild(buildCooksField());
    wrap.appendChild(buildAnchorToggle());

    // Prints, so a separated sheet still says which period it was for.
    const summary = el("div", "when-summary");
    const period = PERIODS.find((p) => p.id === plan.schedule.periodId);
    const periodName = custom ? "Special day" : (period ? period.label : "");
    summary.textContent =
      `${periodName ? periodName + " · " : ""}${formatDuration(plan.schedule.windowMins)} to cook, ` +
      `food up at ${minutesToClock(foodUp)}`;
    wrap.appendChild(summary);

    return wrap;
  }

  // How many pairs of hands the scheduler may assume. The plan underneath is
  // identical either way — same steps, same durations, same backward pass — so
  // this is a view of one plan, not a second plan. A student keeps the solo
  // version; whoever is managing the kitchen flips it up for the day.
  function buildCooksField() {
    const wrap = el("div", "field field--narrow no-print");
    const label = el("label", null, "Who's cooking?");
    label.setAttribute("for", "board-cooks");

    const select = document.createElement("select");
    select.id = "board-cooks";
    for (let n = 1; n <= MAX_COOKS; n++) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = n === 1 ? "Just me" : `${n} of us`;
      opt.selected = n === cookCount(plan);
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      plan.schedule.cooks = Number(select.value);
      persist();
      rerender();
    });

    wrap.append(label, select);
    return wrap;
  }

  // Where the finished schedule sits on the clock. It is only ever a shift —
  // the plan is built backward either way, so every part still lands together
  // and nothing is left sitting. Getting out early and cooking well were never
  // actually in tension; only the anchor moves.
  function buildAnchorToggle() {
    const wrap = el("div", "anchor-toggle no-print");
    const early = plan.schedule.anchor !== "fixed";

    wrap.appendChild(el("span", "anchor-toggle__label",
      early
        ? "Finishing as early as you can — spare time lands at the end."
        : "Timed to plate up exactly on the clock, like service."));

    const btn = el("button", "btn btn--small btn--secondary",
      early ? "Plate up at a set time instead" : "Finish as early as possible instead");
    btn.type = "button";
    btn.addEventListener("click", () => {
      plan.schedule.anchor = early ? "fixed" : "early";
      persist();
      rerender();
    });
    wrap.appendChild(btn);
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

  // ---------- Blocks ----------

  function buildBlock({ step, range }, opts = {}) {
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
      opts.tiny ? "block--tiny" : "",
    ].filter(Boolean).join(" ");
    // Position and size come from the caller, which has the pixels-per-minute
    // scale.

    const timeText = `${minutesToClock(range.start)} · ${step.mins}m`;
    node.appendChild(el("span", "block__label", step.name));
    node.appendChild(el("span", "block__time", timeText));

    // Labels get clipped on short blocks, so the full story lives in the
    // title and the accessible name too.
    const detail = [step.name, timeText, isHardest ? "you flagged this as the hardest step" : "",
      reasons ? describeConflict(reasons, cookCount(plan)) : ""].filter(Boolean).join(" — ");
    node.title = detail;
    if (isFree) {
      node.setAttribute("aria-label", `${detail}. Arrow keys move it, shift and arrow keys change its length.`);
      node.id = `block-${step.id}`;
      node.addEventListener("keydown", (e) => onBlockKey(e, step));
    } else {
      node.setAttribute("aria-label", detail);
    }

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

  // ---------- Timeline ----------
  //
  // Time runs down the page and lanes are columns. This used to be a horizontal
  // board with time as the x-axis, which was the wrong shape for portrait paper
  // and narrow screens: a 2-minute block in a 30-minute span was ~45px wide and
  // its label truncated to "Pl…". Vertically that same block gets a full column
  // width for its label and its height carries the duration instead, and a long
  // plan simply scrolls — unlimited height is exactly what a time axis wants.
  function buildTimeline() {
    const wrap = el("div", "vtimeline");
    if (plan.steps.length === 0) {
      wrap.appendChild(el("p", "placeholder-note", "Add some steps and your plan will appear here."));
      return wrap;
    }

    // A fixed cooking window means every plan is the same height, so students
    // learn to read the shape instead of re-orienting each time. The window is
    // the floor; a plan that overruns it grows past it, visibly.
    //
    // Both edges come from the PERIOD, not from the resolved plate-up. Under an
    // "early" anchor the plan ends before the bell, and measuring the window off
    // that would slide the whole grid earlier — drawing dead space above the
    // plan and hiding the spare time below it, which is the thing finishing
    // early actually buys.
    const windowEnd = clockToMinutes(foodUpFor(plan));
    const windowStart = windowEnd - plan.schedule.windowMins;
    const top = Math.min(windowStart, span.start);
    const bottom = Math.max(windowEnd, span.end);
    const totalMins = Math.max(bottom - top, 1);
    // Ensure the shortest step always gets at least 44px on screen — enough
    // for a stacked label + time line without clipping. Print uses a separate
    // compressed density computed in the beforeprint handler.
    const shortestMins = plan.steps.reduce((min, s) => Math.min(min, s.mins), Infinity);
    const naturalPxPerMin = Math.max(9, Math.ceil(44 / shortestMins));
    const PX_PER_MIN = forcePxPerMin != null ? forcePxPerMin : naturalPxPerMin;
    if (forcePxPerMin == null) {
      _printRenderState = { plan, ctx, mount, totalMins, naturalPxPerMin };
    }
    const height = totalMins * PX_PER_MIN;

    // Hands lanes first — one when the plan is solo, one per cook otherwise.
    // Then one lane per station, not one per step: an earlier build gave every
    // step its own lane, so two things fighting over the oven never visually
    // collided and identical lane labels repeated across the page.
    const lanes = cookLanes();
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
        head.appendChild(el("span", "vtimeline__flag", "one at a time"));
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
        const node = buildBlock(item, { tiny: blockHeight < 30 });
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

  // Solo, this is the one "You" lane. With a group it splits into one lane per
  // pair of hands, which is the manager's actual output: who is doing what.
  function handsItems(cook) {
    return plan.steps
      .filter((s) => s.hands && (s.cook || 0) === cook)
      .map((s) => ({ step: s, range: ranges.get(s.id) }))
      .filter((item) => item.range);
  }

  function cookLanes() {
    const cooks = cookCount(plan);
    if (cooks === 1) return [{ label: "You", station: null, items: handsItems(0) }];
    // Empty lanes stay in. A cook with nothing to do is real information for
    // whoever is running the kitchen, not clutter to hide.
    return Array.from({ length: cooks }, (_, i) =>
      ({ label: `Cook ${i + 1}`, station: null, items: handsItems(i) }));
  }

  function stationItems(station) {
    return plan.steps
      .filter((s) => !s.hands && laneForStep(s, byId) === station.id)
      .map((s) => ({ step: s, range: ranges.get(s.id) }))
      .filter((item) => item.range);
  }

  // ---------- Which part costs you the most ----------
  //
  // This used to report each part's elapsed span and name the longest as "what
  // decides when you start" — true only while parts ran concurrently. They no
  // longer do: there is one cook, so the parts share a single pair of hands and
  // their spans overlap, which made every part read as nearly the whole plan.
  //
  // What's true in a serial plan is the cook's own time. Hands-on minutes add
  // up — they are the thing you cannot be doing twice — and they total to the
  // plan minus the waiting, which is the number in the idle list below.
  function buildPartBreakdown() {
    const wrap = el("div", "part-breakdown");
    if (plan.components.length < 2 || plan.steps.length === 0) return wrap;

    const parts = [];
    for (const component of plan.components) {
      const steps = stepsForComponent(plan, component.id);
      if (steps.length === 0) continue;
      let handsMins = 0;
      let alongMins = 0;
      for (const step of steps) {
        if (step.hands) handsMins += step.mins;
        else alongMins += step.mins;
      }
      parts.push({ component, handsMins, alongMins });
    }
    if (parts.length < 2) return wrap;

    const busiest = Math.max(...parts.map((p) => p.handsMins));
    wrap.appendChild(el("h3", null, "Where your time goes"));

    const list = el("ul", "part-breakdown__list");
    for (const part of parts.sort((a, b) => b.handsMins - a.handsMins)) {
      const heaviest = part.handsMins === busiest;
      const li = el("li", heaviest
        ? "part-breakdown__item part-breakdown__item--critical"
        : "part-breakdown__item");
      li.appendChild(el("span", "part-breakdown__name", part.component.name));
      li.appendChild(el("span", "part-breakdown__length", formatDuration(part.handsMins)));
      li.appendChild(el("span", "part-breakdown__note",
        (heaviest ? "the most hands-on part" : "of your hands") +
        (part.alongMins > 0 ? ` · ${formatDuration(part.alongMins)} cooks by itself` : "")));
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
        lines.push(`"${step.name}" and "${other.name}" — ${describeConflict(reasons, cookCount(plan))}.`);
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

  // ---------- Idle time ----------
  //
  // This replaces the old "free hands" picker, which asked the student to hunt
  // for overlaps by hand and then parked steps inside each other. The scheduler
  // does the interleaving now, so the useful thing to surface is the opposite:
  // the gaps it could NOT fill. Under prep-first those gaps are real — the mise
  // is already done, so there is nothing to pull forward — and they are exactly
  // where cleaning down happens.
  // Measured across the whole plan, not just between a cook's own first and
  // last job. Bounding it to their own steps made someone with a single 3-minute
  // task read as "busy throughout" — the exact opposite of what a manager needs
  // to see, and it hides the person who has been given nothing to do.
  function gapsFor(cook) {
    const busy = handsItems(cook)
      .map((item) => item.range)
      .sort((a, b) => a.start - b.start);

    const gaps = [];
    let cursor = span.start;
    for (const range of busy) {
      if (range.start > cursor) gaps.push({ start: cursor, end: range.start });
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < span.end) gaps.push({ start: cursor, end: span.end });
    return gaps;
  }

  function buildIdleList() {
    const wrap = el("div", "idle-list");
    if (plan.steps.length === 0) return wrap;
    const cooks = cookCount(plan);

    const lanes = [];
    for (let i = 0; i < cooks; i++) {
      const gaps = gapsFor(i);
      lanes.push({
        label: cooks === 1 ? "You" : `Cook ${i + 1}`,
        gaps,
        total: gaps.reduce((sum, g) => sum + (g.end - g.start), 0),
        working: handsItems(i).length > 0,
      });
    }
    if (lanes.length === 0) return wrap;

    const total = lanes.reduce((sum, l) => sum + l.total, 0);
    if (total === 0) {
      wrap.appendChild(el("h3", null, cooks === 1
        ? "Your hands are busy the whole time"
        : "Nobody has a spare minute"));
      wrap.appendChild(el("p", "idle-list__intro",
        "There's no gap in this plan to clean down in. That's worth knowing before " +
        "you start — you'll be washing up after the bell."));
      return wrap;
    }

    wrap.appendChild(el("h3", null, cooks === 1
      ? `You're waiting for ${formatDuration(total)}`
      : `${formatDuration(total)} of waiting between you`));
    wrap.appendChild(el("p", "idle-list__intro",
      cooks === 1
        ? "Your hands are free in these gaps while something else cooks. This is when " +
          "you wash up, wipe down and get plates ready — not at the end."
        : "Hands free in these gaps while something else cooks. This is who cleans " +
          "down, and when — not everyone at the bell."));

    const list = el("ul", "idle-list__items");
    for (const lane of lanes) {
      const prefix = cooks === 1 ? "" : `${lane.label} — `;
      if (!lane.working) {
        list.appendChild(el("li", "idle-list__spare",
          `${prefix}nothing to do — give them something`));
        continue;
      }
      if (lane.gaps.length === 0) {
        list.appendChild(el("li", null, `${prefix}busy throughout`));
        continue;
      }
      for (const gap of lane.gaps) {
        list.appendChild(el("li", null,
          `${prefix}${minutesToClock(gap.start)} – ${minutesToClock(gap.end)} · ` +
          formatDuration(gap.end - gap.start)));
      }
    }
    wrap.appendChild(list);
    return wrap;
  }
}

export function stepsSummary(plan) {
  return plan.components.map((c) => ({ component: c, steps: stepsForComponent(plan, c.id) }));
}
