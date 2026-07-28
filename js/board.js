// Time planner, scaffolded mode, phase 2 — the board.
//
// Scheduling model: `par` is the only scheduling state (per the build spec's
// data model). A step with par === null is an "anchor" and sits in the main
// serial chain, in original chronological order. A step with par set to
// another step's id is a "guest" pulled out of the serial chain to run
// concurrently inside that anchor's window, start-aligned to the anchor's
// start time. Everything else (start/end times, totals, the free-hands
// windows on the You lane) is derived fresh from that on every render.
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
// "what could your hands be doing right now."

import { STATIONS, STATION_KEYWORDS } from "./config.js";

function clockToMinutes(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToClock(mins) {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDuration(mins) {
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function guessStation(name) {
  const lower = (name || "").toLowerCase();
  for (const station of STATIONS) {
    const keywords = STATION_KEYWORDS[station] || [];
    if (keywords.some((kw) => lower.includes(kw))) return station;
  }
  return "Prep";
}

function ensureStationDefaults(steps) {
  for (const step of steps) {
    if (!step.hands && !step.lane) step.lane = guessStation(step.name);
  }
}

function computeSchedule(steps) {
  const anchors = steps.filter((s) => s.par == null);
  const byId = new Map();

  let t = 0;
  for (const anchor of anchors) {
    byId.set(anchor.id, { start: t, end: t + anchor.mins });
    t += anchor.mins;
  }
  const currentTotal = t;
  const baselineTotal = steps.reduce((sum, s) => sum + s.mins, 0);

  for (const step of steps) {
    if (step.par == null) continue;
    const anchorRange = byId.get(step.par);
    if (!anchorRange) continue; // dangling reference; treat as unscheduled
    byId.set(step.id, { start: anchorRange.start, end: anchorRange.start + step.mins });
  }

  return { byId, currentTotal, baselineTotal };
}

function isWindowFilled(steps, anchorId) {
  return steps.some((s) => s.par === anchorId);
}

function blockLabel(text) {
  const span = document.createElement("span");
  span.className = "block__label";
  span.textContent = text;
  return span;
}

export function initBoard(state, persist, container) {
  let openWindowId = null;

  function render() {
    container.innerHTML = "";
    ensureStationDefaults(state.time.steps);
    const schedule = computeSchedule(state.time.steps);

    container.appendChild(buildHeader(schedule));
    container.appendChild(buildTimeline(schedule));
    container.appendChild(buildOverlapList(schedule));
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

  function buildTimeline(schedule) {
    const wrap = document.createElement("div");
    wrap.className = "timeline";
    const denom = Math.max(schedule.baselineTotal, 1);

    function placeBlock(el, id) {
      const range = schedule.byId.get(id);
      if (!range) return;
      const leftPct = (range.start / denom) * 100;
      const widthPct = Math.max((range.end - range.start) / denom, 0.01) * 100;
      // Inset by 2px on each side so adjacent blocks that touch exactly at a
      // boundary (the common case) still read as visually distinct blocks.
      el.style.left = `calc(${leftPct}% + 2px)`;
      el.style.width = `calc(${widthPct}% - 4px)`;
    }

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
      block.className = "block block--hands";
      block.appendChild(blockLabel(step.name));
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
        openPickerPanel = buildPicker(anchor, range);
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
      block.className = "block block--unattended";
      block.appendChild(blockLabel(step.name));
      placeBlock(block, step.id);
      track.appendChild(block);
      row.appendChild(track);

      wrap.appendChild(row);
    }

    return wrap;
  }

  function buildPicker(anchor, anchorRange) {
    const panel = document.createElement("div");
    panel.className = "picker no-print";

    const prompt = document.createElement("p");
    prompt.className = "picker__prompt";
    prompt.textContent = `"${anchor.name}" runs for ${anchor.mins} minutes without you. What could you be doing during that window?`;
    panel.appendChild(prompt);

    const anchorIndex = state.time.steps.indexOf(anchor);
    const windowMins = anchorRange.end - anchorRange.start;
    const candidates = state.time.steps.filter(
      (s, idx) => s.hands && s.par == null && idx > anchorIndex && s.mins <= windowMins
    );

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
        btn.textContent = `${candidate.name} (${candidate.mins} min)`;
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
