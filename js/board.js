// Time planner, scaffolded mode, phase 2 — the board.
//
// Scheduling model: `par` is the only per-step scheduling state (per the
// build spec's data model). A step with par === null is an "anchor" and
// sits in its component's own serial chain, in original chronological
// order. A step with par set to another step's id is a "guest" pulled out
// of its chain to run concurrently inside that anchor's window,
// start-aligned to the anchor's start time.
//
// Multiple components: each component (state.time.components) is backward-
// elicited independently, so each has its own serial chain of steps. Every
// component's chain is scheduled backward from the SAME plate-up time —
// that's what makes "these parts must finish together" true by
// construction, without the app ever deciding an order for the student.
// The board expresses this by placing every component's steps on one
// shared absolute clock, then merging every component's hands-on steps
// onto a single "You" lane, because it's the same one student doing all of
// it regardless of which component a step belongs to. Two hands-on steps
// from different components landing on the same minute is a real
// conflict — flagged, never auto-resolved (constraint #1 in the build
// spec: the app never decides what can overlap).
//
// Note on the data model: the build spec describes `par` as "index of step
// this runs concurrently inside." This implementation stores the target
// step's `id` instead of its array index, because indices shift when a step
// is removed while editing (see time-planner.js's remove handler) and a
// dangling numeric index would silently mispair steps. `id` is stable across
// edits. The role — "the only scheduling state, everything else derives from
// it" — is unchanged.
//
// Only unattended steps (hands === false) can be anchors that offer a
// window; only hands-on steps can be guests, since a window exists to answer
// "what could your hands be doing right now." A guest can come from any
// component — a free-hands window is exactly where cross-component overlap
// is supposed to happen.

import { STATIONS } from "./config.js";
import { clockToMinutes, minutesToClock, formatDuration, guessStation, computeConflicts } from "./time-utils.js";

function ensureStationDefaults(steps) {
  for (const step of steps) {
    if (!step.hands && !step.lane) step.lane = guessStation(step.name);
  }
}

function isWindowFilled(steps, anchorId) {
  return steps.some((s) => s.par === anchorId);
}

// Builds one component's own serial chain, then shifts it so the
// component's own end lands exactly on `serviceMinutes` — every part of the
// dish finishes at the same absolute moment by construction.
function scheduleComponent(componentSteps, serviceMinutes) {
  const anchors = componentSteps.filter((s) => s.par == null);
  const localById = new Map();

  let t = 0;
  for (const anchor of anchors) {
    localById.set(anchor.id, { start: t, end: t + anchor.mins });
    t += anchor.mins;
  }
  const currentTotal = t;
  const baselineTotal = componentSteps.reduce((sum, s) => sum + s.mins, 0);

  for (const step of componentSteps) {
    if (step.par == null) continue;
    const anchorRange = localById.get(step.par);
    if (!anchorRange) continue; // dangling reference; treat as unscheduled
    localById.set(step.id, { start: anchorRange.start, end: anchorRange.start + step.mins });
  }

  const offset = serviceMinutes - currentTotal;
  const byId = new Map();
  for (const [id, range] of localById) {
    byId.set(id, { start: offset + range.start, end: offset + range.end });
  }

  return { byId, currentTotal, baselineTotal };
}

function computeSchedule(steps, components, serviceMinutes) {
  const byId = new Map();
  let currentTotal = 0;
  let baselineTotal = 0;

  for (const component of components) {
    const componentSteps = steps.filter((s) => s.component === component.id);
    const result = scheduleComponent(componentSteps, serviceMinutes);
    for (const [id, range] of result.byId) byId.set(id, range);
    currentTotal = Math.max(currentTotal, result.currentTotal);
    baselineTotal = Math.max(baselineTotal, result.baselineTotal);
  }

  return { byId, currentTotal, baselineTotal };
}

function blockLabel(text) {
  const span = document.createElement("span");
  span.className = "block__label";
  span.textContent = text;
  return span;
}

export function initBoard(state, persist, container) {
  let openWindowId = null;
  const componentsById = new Map(state.time.components.map((c) => [c.id, c]));
  const showComponentOnLane = state.time.components.length > 1;

  function render() {
    container.innerHTML = "";
    ensureStationDefaults(state.time.steps);
    const serviceMinutes = clockToMinutes(state.time.service);
    const schedule = computeSchedule(state.time.steps, state.time.components, serviceMinutes);

    container.appendChild(buildHeader(schedule));
    container.appendChild(buildTimeline(schedule, serviceMinutes));
    container.appendChild(buildPrepList());
    container.appendChild(buildOverlapList(schedule));
  }

  // Untimed reminders attached to a step during the details phase — these
  // never get their own board block, but the printed page is the actual
  // deliverable, so they need a home somewhere on it.
  function buildPrepList() {
    const wrap = document.createElement("div");
    wrap.className = "prep-list";

    const stepsWithPrep = state.time.steps.filter((s) => Array.isArray(s.prep) && s.prep.length > 0);
    if (stepsWithPrep.length === 0) return wrap;

    const heading = document.createElement("h3");
    heading.textContent = "Before you start each step";
    wrap.appendChild(heading);

    const groups = document.createElement("div");
    groups.className = "prep-list__items";
    for (const step of stepsWithPrep) {
      const group = document.createElement("div");
      group.className = "prep-list__group";

      const label = document.createElement("div");
      label.className = "prep-list__step-name";
      label.textContent = step.name;
      group.appendChild(label);

      const ul = document.createElement("ul");
      for (const item of step.prep) {
        const li = document.createElement("li");
        li.textContent = item;
        ul.appendChild(li);
      }
      group.appendChild(ul);

      groups.appendChild(group);
    }
    wrap.appendChild(groups);
    return wrap;
  }

  function buildHeader(schedule) {
    const wrap = document.createElement("div");
    wrap.className = "board-header";

    const serviceField = document.createElement("div");
    serviceField.className = "field field--narrow no-print";
    const serviceLabel = document.createElement("label");
    serviceLabel.setAttribute("for", "service-time");
    serviceLabel.textContent = "Plate up at";
    const serviceInput = document.createElement("input");
    serviceInput.type = "time";
    serviceInput.id = "service-time";
    serviceInput.value = state.time.service;
    serviceInput.addEventListener("input", () => {
      state.time.service = serviceInput.value;
      persist();
      render();
    });
    serviceField.append(serviceLabel, serviceInput);
    wrap.appendChild(serviceField);

    const readouts = document.createElement("div");
    readouts.className = "readouts";

    const startAt = minutesToClock(clockToMinutes(state.time.service) - schedule.currentTotal);
    const savings = schedule.baselineTotal - schedule.currentTotal;

    readouts.appendChild(buildReadout("Start cooking at", startAt, "readout--primary"));
    readouts.appendChild(buildReadout("Total time", formatDuration(schedule.currentTotal)));
    readouts.appendChild(
      buildReadout(
        "Overlapping saves you",
        savings > 0 ? `${formatDuration(savings)} later start` : "Tap a dashed window to save time"
      )
    );

    wrap.appendChild(readouts);
    return wrap;
  }

  function buildReadout(label, value, extraClass) {
    const box = document.createElement("div");
    box.className = `readout ${extraClass || ""}`.trim();
    const val = document.createElement("div");
    val.className = "readout__value";
    val.textContent = value;
    const lab = document.createElement("div");
    lab.className = "readout__label";
    lab.textContent = label;
    box.append(val, lab);
    return box;
  }

  function buildAxis(leftEdge, serviceMinutes) {
    const axis = document.createElement("div");
    axis.className = "timeline__axis no-print";
    const stops = 4;
    for (let i = 0; i <= stops; i++) {
      const tick = document.createElement("span");
      tick.className = "timeline__tick";
      const minutes = leftEdge + ((serviceMinutes - leftEdge) * i) / stops;
      tick.textContent = minutesToClock(minutes);
      axis.appendChild(tick);
    }
    return axis;
  }

  function buildTimeline(schedule, serviceMinutes) {
    const wrap = document.createElement("div");
    wrap.className = "timeline";

    // Percentages are relative to the worst-case (unpaired) span so the
    // axis doesn't rescale — and jump every block around — every time a
    // student pairs something into a window.
    const denom = Math.max(schedule.baselineTotal, 1);
    const leftEdge = serviceMinutes - denom;

    wrap.appendChild(buildAxis(leftEdge, serviceMinutes));

    function placeBlock(el, id) {
      const range = schedule.byId.get(id);
      if (!range) return;
      const leftPct = ((range.start - leftEdge) / denom) * 100;
      const widthPct = Math.max((range.end - range.start) / denom, 0.01) * 100;
      // Inset by 2px on each side so adjacent blocks that touch exactly at a
      // boundary (the common case) still read as visually distinct blocks.
      el.style.left = `calc(${leftPct}% + 2px)`;
      el.style.width = `calc(${widthPct}% - 4px)`;
    }

    // Two hands-on steps can't genuinely both be in the student's hands at
    // once, even if they belong to different components running "in
    // parallel" — flag it so the student notices and resolves it
    // themselves (pick different steps to overlap, or accept doing one
    // after the other).
    function toConflictItem(step) {
      const range = schedule.byId.get(step.id);
      if (!range) return null;
      return { id: step.id, hands: step.hands, lane: step.lane, start: range.start, mins: step.mins };
    }

    const handsConflicts = computeConflicts(
      state.time.steps.filter((s) => s.hands).map(toConflictItem).filter(Boolean)
    );
    // Same idea for equipment: two unattended steps sharing a station (one
    // oven, one burner) at the same time.
    const stationConflicts = computeConflicts(
      state.time.steps.filter((s) => !s.hands).map(toConflictItem).filter(Boolean)
    );

    // You lane
    const youRow = document.createElement("div");
    youRow.className = "lane";
    const youLabel = document.createElement("div");
    youLabel.className = "lane__label";
    youLabel.textContent = "You";
    youRow.appendChild(youLabel);

    const youTrack = document.createElement("div");
    youTrack.className = "lane__track";

    for (const step of state.time.steps.filter((s) => s.hands)) {
      const block = document.createElement("div");
      const isConflicted = handsConflicts.has(step.id);
      block.className = `block block--hands${isConflicted ? " block--conflict" : ""}`;
      block.appendChild(blockLabel(step.name));
      if (isConflicted) {
        block.setAttribute("aria-label", `${step.name}, schedule conflict — overlaps another hands-on step`);
      }
      placeBlock(block, step.id);
      youTrack.appendChild(block);
    }

    let openPickerPanel = null;

    for (const anchor of state.time.steps.filter((s) => !s.hands)) {
      if (isWindowFilled(state.time.steps, anchor.id)) continue;
      const range = schedule.byId.get(anchor.id);
      if (!range) continue;

      const windowBtn = document.createElement("button");
      windowBtn.type = "button";
      windowBtn.className = "block block--window no-print";
      windowBtn.appendChild(blockLabel("Free hands?"));
      windowBtn.setAttribute(
        "aria-label",
        `${anchor.name} runs for ${anchor.mins} minutes without you. What could you be doing?`
      );
      placeBlock(windowBtn, anchor.id);
      windowBtn.addEventListener("click", () => {
        openWindowId = openWindowId === anchor.id ? null : anchor.id;
        render();
      });
      youTrack.appendChild(windowBtn);

      if (openWindowId === anchor.id) {
        openPickerPanel = buildPicker(anchor, range, schedule);
      }
    }

    youRow.appendChild(youTrack);
    if (openPickerPanel) youRow.appendChild(openPickerPanel);
    wrap.appendChild(youRow);

    // Station lanes — one row per unattended step
    for (const step of state.time.steps.filter((s) => !s.hands)) {
      const row = document.createElement("div");
      row.className = "lane";

      const label = document.createElement("div");
      label.className = "lane__label";
      label.appendChild(document.createTextNode(step.lane + " "));

      if (showComponentOnLane) {
        const componentTag = document.createElement("span");
        componentTag.className = "lane__component";
        const component = componentsById.get(step.component);
        componentTag.textContent = component ? component.name : "";
        label.appendChild(componentTag);
      }

      const stationSelect = document.createElement("select");
      stationSelect.className = "lane__station-select no-print";
      stationSelect.setAttribute("aria-label", `Station for ${step.name}`);
      for (const station of STATIONS) {
        const opt = document.createElement("option");
        opt.value = station;
        opt.textContent = station;
        opt.selected = station === step.lane;
        stationSelect.appendChild(opt);
      }
      stationSelect.addEventListener("change", () => {
        step.lane = stationSelect.value;
        persist();
        render();
      });
      label.appendChild(stationSelect);
      row.appendChild(label);

      const track = document.createElement("div");
      track.className = "lane__track";
      const block = document.createElement("div");
      const isConflicted = stationConflicts.has(step.id);
      block.className = `block block--unattended${isConflicted ? " block--conflict" : ""}`;
      block.appendChild(blockLabel(step.name));
      if (isConflicted) {
        block.setAttribute("aria-label", `${step.name}, schedule conflict — shares a station with another step`);
      }
      placeBlock(block, step.id);
      track.appendChild(block);
      row.appendChild(track);

      wrap.appendChild(row);
    }

    return wrap;
  }

  function buildPicker(anchor, anchorRange, schedule) {
    const panel = document.createElement("div");
    panel.className = "picker no-print";

    const prompt = document.createElement("p");
    prompt.className = "picker__prompt";
    prompt.textContent = `"${anchor.name}" runs for ${anchor.mins} minutes without you. What could you be doing during that window?`;
    panel.appendChild(prompt);

    const windowMins = anchorRange.end - anchorRange.start;
    // A candidate has to fit the window, still be unpaired, and — per its
    // own natural (unpaired) position on the shared clock — not already be
    // in the past relative to this window. That last check now works the
    // same way whether the candidate comes from this component or another
    // one, because every component's steps live on one absolute timeline.
    const candidates = state.time.steps.filter((s) => {
      if (!s.hands || s.par != null || s === anchor) return false;
      if (s.mins > windowMins) return false;
      const naturalRange = schedule.byId.get(s.id);
      return naturalRange && naturalRange.start >= anchorRange.start;
    });

    if (candidates.length === 0) {
      const none = document.createElement("p");
      none.className = "picker__empty";
      none.textContent = "Nothing later in your plan fits in this window.";
      panel.appendChild(none);
    } else {
      const list = document.createElement("div");
      list.className = "picker__list";
      for (const candidate of candidates) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn--small";
        const component = componentsById.get(candidate.component);
        const componentNote = showComponentOnLane && component ? ` — ${component.name}` : "";
        btn.textContent = `${candidate.name} (${candidate.mins} min)${componentNote}`;
        btn.addEventListener("click", () => {
          candidate.par = anchor.id;
          openWindowId = null;
          persist();
          render();
        });
        list.appendChild(btn);
      }
      panel.appendChild(list);
    }

    const declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.className = "btn btn--secondary btn--small";
    declineBtn.textContent = "Never mind";
    declineBtn.addEventListener("click", () => {
      openWindowId = null;
      render();
    });
    panel.appendChild(declineBtn);

    return panel;
  }

  function buildOverlapList(schedule) {
    const wrap = document.createElement("div");
    wrap.className = "overlap-list";

    const paired = state.time.steps.filter((s) => s.par != null);
    if (paired.length === 0) return wrap;

    const heading = document.createElement("h3");
    heading.textContent = "Double-check: can each of these genuinely happen at the same time?";
    wrap.appendChild(heading);

    const list = document.createElement("ul");
    for (const step of paired) {
      const anchor = state.time.steps.find((s) => s.id === step.par);
      const li = document.createElement("li");

      const text = document.createElement("span");
      text.textContent = anchor ? `"${step.name}" runs during "${anchor.name}"` : step.name;
      li.appendChild(text);

      const undoBtn = document.createElement("button");
      undoBtn.type = "button";
      undoBtn.className = "btn btn--small btn--secondary no-print";
      undoBtn.textContent = "Undo";
      undoBtn.addEventListener("click", () => {
        step.par = null;
        persist();
        render();
      });
      li.appendChild(undoBtn);

      list.appendChild(li);
    }
    wrap.appendChild(list);
    return wrap;
  }

  render();
}
