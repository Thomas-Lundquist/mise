// Section 5 — Your plan.
//
// Everything above this is input. This is the only section that tells the
// student something they did not already know: that the rice has to go on
// first, that their hands are free for eleven minutes in the middle, and
// whether any of it fits in the time they have.
//
// Time runs DOWN the page and lanes are columns. The board used to run
// horizontally, which is the wrong shape for portrait paper and for a 360px
// screen — a 2-minute block in a 30-minute span was about 45px wide and its
// label truncated to "Pl…". Vertically the same block gets a full column width
// for its label, its height carries the duration, and a long plan simply
// scrolls, which is exactly what a time axis wants.

import { STATIONS, MAX_COOKS } from "../config.js";
import {
  cookCount, stepsForRecipe, equipmentById, foodUpFor, claimedMinutes, ingredientsInBowl,
  stepMins, handsMins, waitingMins,
} from "../model.js";
import {
  resolveSchedule, computeConflicts, describeConflict, planSpan, resolvedFoodUp, laneForStep,
} from "../schedule.js";
import { clockToMinutes, minutesToClock, formatDuration } from "../time.js";
import { h, button } from "../dom.js";

const SNAP = 5;            // free-placement nudge, in minutes
const PX_PER_MIN = 9;
const MAX_BOARD_PX = 2000; // backstop on the drawn timeline; see renderTimeline

export function status(plan) {
  if (plan.steps.length === 0) return "";
  const ranges = resolveSchedule(plan);
  const span = planSpan(plan, ranges);
  return `${formatDuration(span.end - span.start)} long`;
}

export function render(ctx) {
  const { plan } = ctx;

  if (plan.steps.length === 0) {
    return h("p", { class: "empty-note",
      text: "Your plan appears here once you've written some steps in section 2." });
  }

  const byId = equipmentById(plan);
  const ranges = resolveSchedule(plan);
  const conflicts = computeConflicts(plan, ranges);
  const span = planSpan(plan, ranges);
  const cooks = cookCount(plan);

  // A step is drawn as its lines, not as one bar. The hands lines go on the
  // cook's lane and the waiting lines go on the station's, which is the whole
  // picture the app exists to show: the pan is on the stove for twelve minutes
  // and you are somewhere else for nine of them.
  const blocksFor = (predicate) => {
    const out = [];
    for (const step of plan.steps) {
      const range = ranges.get(step.id);
      if (!range) continue;
      for (const part of range.segments) {
        if (part.seg.mins <= 0) continue;
        if (!predicate(step, part.seg)) continue;
        out.push({ step, seg: part.seg, range: { start: part.start, end: part.end } });
      }
    }
    return out;
  };
  const handsItems = (cook) =>
    blocksFor((step, seg) => seg.hands && (step.cook || 0) === cook);

  const view = { plan, ctx, ranges, conflicts, span, cooks, byId, handsItems, blocksFor };

  return h("div", null,
    printIdentity(plan),
    renderControls(view),
    renderReadouts(view),
    renderTimeline(view),
    renderBeforeYouStart(view),
    renderConflicts(view),
    renderWhereTimeGoes(view),
    plan.schedule.mode === "guided" && renderIdle(view),
    renderNotes(view));
}

// The plan always prints on its own sheet, so it needs its own identity line —
// otherwise page two is anonymous the moment the sheets are separated.
function printIdentity(plan) {
  const parts = [
    plan.student.name,
    plan.recipes.map((r) => r.name.trim()).filter(Boolean).join(" + "),
    plan.student.date,
  ].filter((part) => part && part.trim());
  return h("p", { class: "print-identity", "aria-hidden": "true", text: parts.join(" · ") });
}

// --- Controls -------------------------------------------------------------

function renderControls(view) {
  const { plan, ctx } = view;
  const { refresh } = ctx;
  const early = plan.schedule.anchor !== "fixed";
  const free = plan.schedule.mode === "free";

  const cooksSelect = h("select", {
    id: "board-cooks",
    onChange: (e) => { plan.schedule.cooks = Number(e.target.value); refresh(); },
  }, Array.from({ length: MAX_COOKS }, (_, i) => h("option", {
    value: String(i + 1),
    selected: i + 1 === view.cooks,
    text: i === 0 ? "Just me" : `${i + 1} of us`,
  })));

  return h("div", { class: "controls no-print" },
    // The sheet a student keeps is always the solo one. Raising this changes
    // nothing in the plan — same steps, same durations, same backward pass —
    // only how many pairs of hands the scheduler may assume, which is what
    // whoever is running the kitchen that day actually needs to see.
    h("div", { class: "field field--narrow" },
      h("label", { for: "board-cooks", text: "Who's cooking?" }),
      cooksSelect),

    // The rest is for the student who wants it. Both are real capabilities and
    // neither is needed to read the board, so they fold away rather than
    // sitting above the timeline asking to be understood.
    h("details", { class: "plan-options" },
      h("summary", { text: "Plan options" }),
      h("div", { class: "plan-options__body" }, options())));

  function options() {
    return [
    // Only ever a shift. The schedule is built backward either way, so every
    // recipe still lands together; this just decides where the finished plan
    // sits on the clock.
    h("div", { class: "control-toggle" },
      h("span", { class: "control-toggle__state", text: early
        ? "Finishing as early as you can — spare time lands at the end."
        : "Timed to plate up exactly on the clock, like service." }),
      button(early ? "Plate up at a set time instead" : "Finish as early as possible instead",
        () => { plan.schedule.anchor = early ? "fixed" : "early"; refresh(); },
        { class: "btn btn--small btn--secondary" })),

    h("div", { class: "control-toggle" },
      h("span", { class: "control-toggle__state", text: free
        ? "You're placing steps yourself."
        : "Times come from your steps and how long each one takes." }),
      button(free ? "Go back to worked-out timing" : "Place steps myself", () => {
        if (free) {
          // Going back re-derives every position, which throws away hand
          // placement. Say so rather than silently rearranging their work.
          const ok = window.confirm(
            "This will work out every start time again from your steps, replacing " +
            "the positions you set by hand.\n\nSwitch back?");
          if (!ok) return;
          plan.schedule.mode = "guided";
        } else {
          // The guided pass has already written resolved starts onto every
          // step, so free placement inherits the current layout.
          plan.schedule.mode = "free";
        }
        refresh();
      }, { class: "btn btn--small btn--secondary" })),

    free && h("p", { class: "hint",
      text: "Click a block, then ← and → to move its step, or shift + ← → to change how long that line takes." }),
    ];
  }
}

// --- Readouts -------------------------------------------------------------

function renderReadouts(view) {
  const { plan, span } = view;
  const available = plan.schedule.windowMins;
  const needed = span.end - span.start;
  const slack = available - needed;
  const claimed = claimedMinutes(plan);

  const readout = (label, value, extra) =>
    h("div", { class: `readout${extra ? ` ${extra}` : ""}` },
      h("div", { class: "readout__value", text: value }),
      h("div", { class: "readout__label", text: label }));

  return h("div", null,
    h("div", { class: "readouts" },
      readout("Start cooking at", minutesToClock(span.start), "readout--primary"),
      readout("Food up at", minutesToClock(resolvedFoodUp(plan))),
      readout("Your plan takes", formatDuration(needed)),
      slack >= 0
        ? readout("Time to spare", formatDuration(slack), "readout--good")
        : readout("Over by", formatDuration(-slack), "readout--warn")),

    // Warn, never block. The plan is left exactly as it is.
    slack < 0 && h("p", { class: "board-warning",
      text: `Your plan needs ${formatDuration(needed)} but you only get ${formatDuration(available)} to cook — you're over by ${formatDuration(-slack)}. Nothing here stops you planning it this way. But look for something that could run while your hands are free.` }),

    // The recipe's own claim against the plan they just built. Printed times
    // almost always assume the mise is already done and nothing waits on
    // anything, which is the whole reason this app exists.
    claimed !== null && h("p", { class: "claim-check" },
      `The recipe says ${formatDuration(claimed)}. Your plan needs `,
      h("strong", { text: formatDuration(needed) }),
      needed > claimed
        ? ` — ${formatDuration(needed - claimed)} more. That gap is usually the prep the recipe assumed you'd already done.`
        : " — you've found time the recipe didn't claim. Check nothing has been left off your steps."));
}

// --- The timeline ---------------------------------------------------------

// Greedy interval packing: each block goes in the first sub-column whose
// previous block has finished. This is what stops two steps at the same minute
// painting over each other — which lost a step entirely from an early printout.
function packRows(items) {
  const sorted = [...items].sort((a, b) =>
    a.range.start - b.range.start || a.range.end - b.range.end);
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

function renderTimeline(view) {
  const { plan, span, cooks, byId, handsItems } = view;

  // Both edges come from the PERIOD, not from the resolved plate-up. Under an
  // "early" anchor the plan ends before the bell, and measuring the window off
  // that would slide the whole grid earlier — drawing dead space above the plan
  // and hiding the spare time below it, which is the thing finishing early
  // actually buys.
  const windowEnd = clockToMinutes(foodUpFor(plan));
  const windowStart = windowEnd - plan.schedule.windowMins;
  const top = Math.min(windowStart, span.start);
  const bottom = Math.max(windowEnd, span.end);
  const totalMins = Math.max(bottom - top, 1);

  // The cap is a backstop, not a layout choice: one block with a wild start — a
  // bad hand-placement, a plan restored from a broken backup — would otherwise
  // stretch the grid to thousands of pixels and squeeze the real plan into a
  // sliver. Compressing looks wrong, which is correct: something IS wrong.
  const pxPerMin = Math.min(PX_PER_MIN, MAX_BOARD_PX / totalMins);
  const height = totalMins * pxPerMin;

  // Hands lanes first — one when the plan is solo, one per cook otherwise. A
  // cook with nothing to do keeps their empty lane: that is real information
  // for whoever is running the kitchen, not clutter to hide.
  const lanes = cooks === 1
    ? [{ label: "You", station: null, items: handsItems(0) }]
    : Array.from({ length: cooks }, (_, i) =>
        ({ label: `Cook ${i + 1}`, station: null, items: handsItems(i) }));

  // Then one lane per station, not one per step. An earlier build gave every
  // step its own lane, so two things fighting over the oven never visually
  // collided and identical lane labels repeated down the page.
  for (const station of STATIONS) {
    const items = view.blocksFor((step, seg) =>
      !seg.hands && laneForStep(step, byId) === station.id);
    if (items.length > 0) lanes.push({ label: station.label, station, items });
  }

  const firstTick = Math.ceil(top / 10) * 10;
  const ticks = [];
  for (let t = firstTick; t <= bottom; t += 10) ticks.push(t);

  const grid = h("div", {
    class: "timeline__grid",
    style: { gridTemplateColumns: `var(--gutter) repeat(${lanes.length}, 1fr)` },
  },
  h("div", { class: "timeline__corner" }),
  lanes.map((lane) => h("div", { class: "timeline__head" },
    h("span", { class: "timeline__head-name", text: lane.label }),
    lane.station && lane.station.exclusive && h("span", { class: "timeline__flag", text: "one at a time" }))),

  // Clock gutter — a label every ten minutes, like a calendar day view.
  h("div", { class: "timeline__gutter", style: { height: `${height}px` } },
    ticks.map((t) => h("div", {
      class: "timeline__tick",
      style: { top: `${(t - top) * pxPerMin}px` },
      text: minutesToClock(t),
    }))),

  lanes.map((lane) => {
    const packed = packRows(lane.items);
    return h("div", { class: "timeline__track", style: { height: `${height}px` } },
      // Rules are drawn per lane rather than as one overlay, because the grid
      // gap breaks a single absolutely-positioned layer.
      ticks.map((t) => h("div", {
        class: "timeline__rule",
        style: { top: `${(t - top) * pxPerMin}px` },
      })),

      // Anything above the cooking window is time the student does not have,
      // and should look like it.
      span.start < windowStart && h("div", {
        class: "timeline__over",
        style: { top: "0", height: `${Math.max(0, (windowStart - top) * pxPerMin)}px` },
      }),

      packed.items.map((item) => {
        const blockHeight = Math.max(item.range.end - item.range.start, 1) * pxPerMin - 2;
        return renderBlock(view, item, {
          tiny: blockHeight < 30,
          style: {
            top: `${(item.range.start - top) * pxPerMin}px`,
            height: `${blockHeight}px`,
            left: `${(item.row / packed.rowCount) * 100}%`,
            width: `calc(${(1 / packed.rowCount) * 100}% - 2px)`,
          },
        });
      }));
  }));

  return h("div", { class: "timeline" }, grid);
}

function renderBlock(view, item, { tiny, style }) {
  const { plan, ctx, conflicts, cooks } = view;
  const { step, seg, range } = item;
  const free = plan.schedule.mode === "free";
  const reasons = conflicts.get(step.id);

  // A line's own label when it has one, the step's name when it does not —
  // which is the single-line case, and reads exactly as it did before.
  const label = seg.label.trim() || step.name;
  const mins = range.end - range.start;
  const timeText = `${minutesToClock(range.start)} · ${mins}m`;
  const detail = [
    label === step.name ? label : `${step.name}: ${label}`,
    timeText,
    seg.hands ? "hands on" : "runs by itself",
    reasons ? describeConflict(reasons, cooks) : "",
  ].filter(Boolean).join(" — ");

  const props = {
    class: [
      "block",
      seg.hands ? "block--hands" : "block--unattended",
      reasons ? "block--conflict" : "",
      tiny ? "block--tiny" : "",
    ].filter(Boolean).join(" "),
    style,
    title: detail,
  };

  // Interactive only in free placement, where the arrow keys actually do
  // something. A guided board should not advertise controls that do nothing.
  if (free) {
    Object.assign(props, {
      type: "button",
      id: `block-${seg.id}`,
      "aria-label": `${detail}. Arrow keys move it, shift and arrow keys change its length.`,
      onKeyDown: (e) => onBlockKey(e, step, seg, ctx),
    });
  } else {
    props["aria-label"] = detail;
  }

  // Short blocks clip their label, so the full story lives in the title and the
  // accessible name too.
  return h(free ? "button" : "div", props,
    h("span", { class: "block__label", text: label }),
    h("span", { class: "block__time", text: timeText }));
}

// Moving drags the whole step, because its lines are consecutive — the pan
// cannot start heating before you put it on. Resizing changes only the line you
// are standing on, which is usually the waiting one.
function onBlockKey(event, step, seg, ctx) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const delta = event.key === "ArrowRight" ? SNAP : -SNAP;
  if (event.shiftKey) seg.mins = Math.max(0, seg.mins + delta);
  else step.start += delta;
  ctx.refresh();
  // Keep focus on the block being nudged. Without preventScroll the page jumps
  // to it on every keypress.
  const again = document.getElementById(`block-${seg.id}`);
  if (again) again.focus({ preventScroll: true });
}

// --- Before you start -----------------------------------------------------

// Mise en place means the bowl exists before the step starts, so the board says
// so before anything else. The previous build collected bowls and never used
// them anywhere.
function renderBeforeYouStart(view) {
  const { plan } = view;
  const filled = plan.bowls.filter((bowl) =>
    ingredientsInBowl(plan, bowl.id).length > 0 || bowl.label.trim());
  if (filled.length === 0) return null;

  return h("div", { class: "panel" },
    h("h3", { text: "Before you start: these have to be measured out" }),
    h("div", { class: "panel__grid" }, filled.map((bowl, index) => {
      const step = bowl.stepId ? plan.steps.find((s) => s.id === bowl.stepId) : null;
      return h("div", { class: "panel__item" },
        h("div", { class: "panel__title", text: bowl.label.trim() || `Bowl ${index + 1}` }),
        h("ul", null, ingredientsInBowl(plan, bowl.id).map((ing) => h("li", { text: ing.text }))),
        step && h("div", { class: "panel__for", text: `ready before "${step.name}"` }));
    })));
}

// --- Conflicts, in words --------------------------------------------------

function renderConflicts(view) {
  const { plan, conflicts, ranges, cooks } = view;
  if (conflicts.size === 0) return null;

  const lines = [];
  const seen = new Set();
  for (const [stepId, reasons] of conflicts) {
    const step = plan.steps.find((s) => s.id === stepId);
    const range = ranges.get(stepId);
    if (!step || !range) continue;
    for (const otherId of conflicts.keys()) {
      if (otherId === stepId || seen.has(`${otherId}|${stepId}`)) continue;
      const other = ranges.get(otherId);
      if (!other || !(other.start < range.end && range.start < other.end)) continue;
      const otherStep = plan.steps.find((s) => s.id === otherId);
      if (!otherStep) continue;
      seen.add(`${stepId}|${otherId}`);
      lines.push(`"${step.name}" and "${otherStep.name}" — ${describeConflict(reasons, cooks)}.`);
    }
  }
  if (lines.length === 0) return null;

  return h("div", { class: "panel panel--warn" },
    h("h3", { text: lines.length === 1 ? "One thing to sort out" : `${lines.length} things to sort out` }),
    h("ul", null, lines.map((line) => h("li", { text: line }))),
    h("p", { class: "hint",
      text: "Nothing here stops you — a real kitchen has these problems too. Move something, or decide to do them one after the other." }));
}

// --- Where your time goes -------------------------------------------------

// Hands-on minutes, per recipe. In a solo plan the recipes share one pair of
// hands and their elapsed spans overlap almost completely, so reporting span
// per recipe made every one of them read as nearly the whole plan. What is
// actually true is the cook's own time: hands-on minutes are the thing you
// cannot be doing twice.
function renderWhereTimeGoes(view) {
  const { plan } = view;
  if (plan.recipes.length < 2) return null;

  const rows = plan.recipes
    .map((recipe) => {
      const steps = stepsForRecipe(plan, recipe.id);
      return {
        recipe,
        handsMins: steps.reduce((sum, step) => sum + handsMins(step), 0),
        aloneMins: steps.reduce((sum, step) => sum + waitingMins(step), 0),
      };
    })
    .filter((row) => row.handsMins > 0 || row.aloneMins > 0);
  if (rows.length < 2) return null;

  const busiest = Math.max(...rows.map((row) => row.handsMins));
  rows.sort((a, b) => b.handsMins - a.handsMins);

  return h("div", { class: "panel" },
    h("h3", { text: "Where your time goes" }),
    h("ul", { class: "breakdown" }, rows.map((row) =>
      h("li", { class: `breakdown__item${row.handsMins === busiest ? " breakdown__item--top" : ""}` },
        h("span", { class: "breakdown__name", text: row.recipe.name || "Untitled recipe" }),
        h("span", { class: "breakdown__value", text: formatDuration(row.handsMins) }),
        h("span", { class: "breakdown__note", text:
          (row.handsMins === busiest ? "the most hands-on" : "of your hands") +
          (row.aloneMins > 0 ? ` · ${formatDuration(row.aloneMins)} cooks by itself` : "") })))));
}

// --- Idle time ------------------------------------------------------------

// The gaps the scheduler could NOT fill. Under prep-first these are real — the
// mise is already done, so there is nothing left to pull forward — and they are
// exactly where cleaning down goes.
//
// Measured across the whole plan, not just between a cook's own first and last
// job. Bounding it to their own steps made someone with a single 3-minute task
// read as "busy throughout", which is the opposite of what a kitchen manager
// needs to see.
function renderIdle(view) {
  const { span, cooks, handsItems } = view;

  const lanes = Array.from({ length: cooks }, (_, cook) => {
    const busy = handsItems(cook).map((item) => item.range).sort((a, b) => a.start - b.start);
    const gaps = [];
    let cursor = span.start;
    for (const range of busy) {
      if (range.start > cursor) gaps.push({ start: cursor, end: range.start });
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < span.end) gaps.push({ start: cursor, end: span.end });

    return {
      label: cooks === 1 ? "You" : `Cook ${cook + 1}`,
      gaps,
      total: gaps.reduce((sum, gap) => sum + (gap.end - gap.start), 0),
      working: busy.length > 0,
    };
  });

  const total = lanes.reduce((sum, lane) => sum + lane.total, 0);

  if (total === 0) {
    return h("div", { class: "panel" },
      h("h3", { text: cooks === 1 ? "Your hands are busy the whole time" : "Nobody has a spare minute" }),
      h("p", { text: "There's no gap in this plan to clean down in. That's worth knowing before you start — you'll be washing up after the bell." }));
  }

  return h("div", { class: "panel" },
    h("h3", { text: cooks === 1
      ? `You're waiting for ${formatDuration(total)}`
      : `${formatDuration(total)} of waiting between you` }),
    h("p", { text: cooks === 1
      ? "Your hands are free in these gaps while something else cooks. This is when you wash up, wipe down and get plates ready — not at the end."
      : "Hands free in these gaps while something else cooks. This is who cleans down, and when — not everyone at the bell." }),
    h("ul", { class: "idle" }, lanes.flatMap((lane) => {
      const prefix = cooks === 1 ? "" : `${lane.label} — `;
      if (!lane.working) {
        return h("li", { class: "idle__spare", text: `${prefix}nothing to do — give them something` });
      }
      if (lane.gaps.length === 0) return h("li", { text: `${prefix}busy throughout` });
      return lane.gaps.map((gap) => h("li", {
        text: `${prefix}${minutesToClock(gap.start)} – ${minutesToClock(gap.end)} · ${formatDuration(gap.end - gap.start)}`,
      }));
    })));
}

// --- Notes ----------------------------------------------------------------

function renderNotes(view) {
  const { plan } = view;
  const withNotes = plan.steps.filter((s) => s.note && s.note.trim());
  if (withNotes.length === 0) return null;

  return h("div", { class: "panel" },
    h("h3", { text: "Don't forget" }),
    h("ul", null, withNotes.map((step) =>
      h("li", null, h("strong", { text: `${step.name}: ` }), step.note))));
}
