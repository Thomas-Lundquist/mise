// Time planner, open mode (spring semester). No elicitation, no prompts —
// students place blocks directly on the same lane/timeline concept as the
// scaffolded board. Positioning is keyboard-driven: Chromebook trackpad
// dragging is miserable, and pure drag-and-drop would exclude keyboard
// users entirely, so arrow keys are the primary interaction, not a bonus.
//
// Unlike the scaffolded board, each block carries an explicit `start` —
// there's no backward-elicited chronological array to derive it from.
// Blocks snap to 5-minute increments. Overlap is allowed and only flagged,
// never blocked: two hands-on blocks sharing time on the You lane, or two
// blocks sharing time in the same station lane, are conflicts a real
// kitchen would have too (only one oven) — flag, don't block, per spec.

import { STATIONS } from "./config.js";
import { clockToMinutes, minutesToClock, formatDuration, guessStation, newId, computeConflicts } from "./time-utils.js";

const SNAP = 5;
const MIN_DURATION = 5;

function snap(mins) {
  return Math.max(MIN_DURATION, Math.round(mins / SNAP) * SNAP);
}

function blockLabel(text) {
  const span = document.createElement("span");
  span.className = "block__label";
  span.textContent = text;
  return span;
}

export function initOpenMode(state, persist, container) {
  if (!Array.isArray(state.time.openBlocks)) state.time.openBlocks = [];
  let selectedId = null;

  const blocks = () => state.time.openBlocks;

  function render() {
    container.innerHTML = "";
    container.appendChild(buildAddForm());
    container.appendChild(buildHeader());
    container.appendChild(buildTimeline());
    container.appendChild(buildInspector());

    if (selectedId) {
      const el = document.getElementById(`open-block-${selectedId}`);
      if (el) el.focus();
    }
  }

  function select(id) {
    selectedId = id;
    render();
  }

  function buildAddForm() {
    const wrap = document.createElement("div");
    wrap.className = "elicit-form no-print";

    const nameField = document.createElement("div");
    nameField.className = "field";
    const nameLabel = document.createElement("label");
    nameLabel.setAttribute("for", "open-name");
    nameLabel.textContent = "Step";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "open-name";
    nameField.append(nameLabel, nameInput);
    wrap.appendChild(nameField);

    const minsField = document.createElement("div");
    minsField.className = "field field--narrow";
    const minsLabel = document.createElement("label");
    minsLabel.setAttribute("for", "open-mins");
    minsLabel.textContent = "Minutes";
    const minsInput = document.createElement("input");
    minsInput.type = "number";
    minsInput.id = "open-mins";
    minsInput.min = String(MIN_DURATION);
    minsInput.step = String(SNAP);
    minsField.append(minsLabel, minsInput);
    wrap.appendChild(minsField);

    const toggleField = document.createElement("div");
    toggleField.className = "field";
    const toggleLabel = document.createElement("span");
    toggleLabel.textContent = "While this happens, are you...";
    toggleField.appendChild(toggleLabel);

    const toggleGroup = document.createElement("div");
    toggleGroup.className = "hands-toggle";
    toggleGroup.setAttribute("role", "group");
    toggleGroup.setAttribute("aria-label", "Hands-on or unattended");

    let handsValue = null;

    const handsOnBtn = document.createElement("button");
    handsOnBtn.type = "button";
    handsOnBtn.className = "hands-toggle__btn hands-toggle__btn--hands";
    handsOnBtn.textContent = "Hands on it (chopping, stirring, searing)";
    handsOnBtn.setAttribute("aria-pressed", "false");

    const unattendedBtn = document.createElement("button");
    unattendedBtn.type = "button";
    unattendedBtn.className = "hands-toggle__btn hands-toggle__btn--unattended";
    unattendedBtn.textContent = "Runs by itself (baking, simmering, chilling, resting)";
    unattendedBtn.setAttribute("aria-pressed", "false");

    const stationField = document.createElement("div");
    stationField.className = "field field--narrow";
    stationField.hidden = true;
    const stationLabel = document.createElement("label");
    stationLabel.setAttribute("for", "open-station");
    stationLabel.textContent = "Station";
    const stationSelect = document.createElement("select");
    stationSelect.id = "open-station";
    for (const station of STATIONS) {
      const opt = document.createElement("option");
      opt.value = station;
      opt.textContent = station;
      stationSelect.appendChild(opt);
    }
    stationField.append(stationLabel, stationSelect);

    function selectHands(value) {
      handsValue = value;
      handsOnBtn.setAttribute("aria-pressed", String(value === true));
      handsOnBtn.classList.toggle("hands-toggle__btn--selected", value === true);
      unattendedBtn.setAttribute("aria-pressed", String(value === false));
      unattendedBtn.classList.toggle("hands-toggle__btn--selected", value === false);
      stationField.hidden = value !== false;
      if (value === false && nameInput.value.trim()) {
        stationSelect.value = guessStation(nameInput.value);
      }
      updateAddEnabled();
    }

    handsOnBtn.addEventListener("click", () => selectHands(true));
    unattendedBtn.addEventListener("click", () => selectHands(false));

    toggleGroup.append(handsOnBtn, unattendedBtn);
    toggleField.appendChild(toggleGroup);
    wrap.appendChild(toggleField);
    wrap.appendChild(stationField);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn";
    addBtn.textContent = "Add block";
    addBtn.disabled = true;
    wrap.appendChild(addBtn);

    function updateAddEnabled() {
      const nameOk = nameInput.value.trim().length > 0;
      const minsOk = Number(minsInput.value) > 0;
      addBtn.disabled = !(nameOk && minsOk && handsValue !== null);
    }

    nameInput.addEventListener("input", updateAddEnabled);
    minsInput.addEventListener("input", updateAddEnabled);

    function submit() {
      if (addBtn.disabled) return;
      const mins = snap(Number(minsInput.value));
      const lane = handsValue ? null : stationSelect.value || guessStation(nameInput.value);
      const laneBlocks = blocks().filter((b) => (handsValue ? b.hands : !b.hands && b.lane === lane));
      const start = laneBlocks.length > 0 ? Math.max(...laneBlocks.map((b) => b.start + b.mins)) : 0;

      const block = { id: newId("block"), name: nameInput.value.trim(), mins, start, hands: handsValue, lane };
      blocks().push(block);
      persist();
      selectedId = block.id;
      render();
    }

    addBtn.addEventListener("click", submit);
    minsInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });

    return wrap;
  }

  function buildHeader() {
    const wrap = document.createElement("div");
    wrap.className = "board-header";

    const serviceField = document.createElement("div");
    serviceField.className = "field field--narrow no-print";
    const serviceLabel = document.createElement("label");
    serviceLabel.setAttribute("for", "open-service-time");
    serviceLabel.textContent = "Plate up at";
    const serviceInput = document.createElement("input");
    serviceInput.type = "time";
    serviceInput.id = "open-service-time";
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
    const total = blocks().length > 0 ? Math.max(...blocks().map((b) => b.start + b.mins)) : 0;
    const startAt = minutesToClock(clockToMinutes(state.time.service) - total);

    readouts.appendChild(buildReadout("Start cooking at", startAt, "readout--primary"));
    readouts.appendChild(buildReadout("Total time", formatDuration(total)));
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

  function buildTimeline() {
    const wrap = document.createElement("div");
    wrap.className = "timeline";

    const hint = document.createElement("p");
    hint.className = "placeholder-note no-print";
    hint.textContent = "Click a block, then use the arrow keys to move it and shift + arrow keys to resize it.";
    wrap.appendChild(hint);

    if (blocks().length === 0) return wrap;

    const denom = Math.max(...blocks().map((b) => b.start + b.mins), 30);
    const conflicts = computeConflicts(blocks());

    function placeBlock(el, block) {
      const leftPct = (block.start / denom) * 100;
      const widthPct = (block.mins / denom) * 100;
      el.style.left = `calc(${leftPct}% + 2px)`;
      el.style.width = `calc(${widthPct}% - 4px)`;
    }

    function makeBlockEl(block) {
      const el = document.createElement("button");
      el.type = "button";
      el.id = `open-block-${block.id}`;
      el.className = `block block--open ${block.hands ? "block--hands" : "block--unattended"}`;
      const isConflicted = conflicts.has(block.id);
      if (isConflicted) el.classList.add("block--conflict");
      el.tabIndex = 0;
      el.appendChild(blockLabel(block.name));
      el.setAttribute(
        "aria-label",
        `${block.name}, ${block.mins} minutes${isConflicted ? ", schedule conflict" : ""}. Selected: use arrow keys to move, shift and arrow keys to resize.`
      );
      placeBlock(el, block);
      el.addEventListener("click", () => select(block.id));
      el.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        selectedId = block.id;
        const delta = e.key === "ArrowRight" ? SNAP : -SNAP;
        if (e.shiftKey) {
          block.mins = Math.max(MIN_DURATION, block.mins + delta);
        } else {
          block.start = Math.max(0, block.start + delta);
        }
        persist();
        render();
      });
      return el;
    }

    const youRow = document.createElement("div");
    youRow.className = "lane";
    const youLabel = document.createElement("div");
    youLabel.className = "lane__label";
    youLabel.textContent = "You";
    youRow.appendChild(youLabel);
    const youTrack = document.createElement("div");
    youTrack.className = "lane__track";
    for (const block of blocks().filter((b) => b.hands)) {
      youTrack.appendChild(makeBlockEl(block));
    }
    youRow.appendChild(youTrack);
    wrap.appendChild(youRow);

    const usedStations = STATIONS.filter((station) => blocks().some((b) => !b.hands && b.lane === station));
    for (const station of usedStations) {
      const row = document.createElement("div");
      row.className = "lane";
      const label = document.createElement("div");
      label.className = "lane__label";
      label.textContent = station;
      row.appendChild(label);
      const track = document.createElement("div");
      track.className = "lane__track";
      for (const block of blocks().filter((b) => !b.hands && b.lane === station)) {
        track.appendChild(makeBlockEl(block));
      }
      row.appendChild(track);
      wrap.appendChild(row);
    }

    return wrap;
  }

  function buildInspector() {
    const wrap = document.createElement("div");
    wrap.className = "picker no-print";
    const block = selectedId && blocks().find((b) => b.id === selectedId);
    if (!block) {
      wrap.hidden = true;
      return wrap;
    }

    const heading = document.createElement("p");
    heading.className = "picker__prompt";
    heading.textContent = `"${block.name}" — ${block.mins} min`;
    wrap.appendChild(heading);

    if (!block.hands) {
      const stationField = document.createElement("div");
      stationField.className = "field field--narrow";
      const label = document.createElement("label");
      label.setAttribute("for", "inspector-station");
      label.textContent = "Station";
      const select_ = document.createElement("select");
      select_.id = "inspector-station";
      for (const station of STATIONS) {
        const opt = document.createElement("option");
        opt.value = station;
        opt.textContent = station;
        opt.selected = station === block.lane;
        select_.appendChild(opt);
      }
      select_.addEventListener("change", () => {
        block.lane = select_.value;
        persist();
        render();
      });
      stationField.append(label, select_);
      wrap.appendChild(stationField);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--small btn--secondary";
    removeBtn.textContent = "Remove block";
    removeBtn.addEventListener("click", () => {
      const idx = blocks().indexOf(block);
      if (idx !== -1) blocks().splice(idx, 1);
      selectedId = null;
      persist();
      render();
    });
    wrap.appendChild(removeBtn);

    return wrap;
  }

  render();
}
