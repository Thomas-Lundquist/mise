// Boot, plan management, and sections 1-3. Section 4 lives in planner.js.
//
// One plan object drives everything (spec §4). Equipment pulled in Step 2 is
// what steps can be assigned in Step 4; bowls grouped in Step 3 are what steps
// can require. The sections are views onto one plan, not four separate forms.

import { EQUIPMENT_PALETTE, EQUIPMENT_GROUPS, DEFAULT_TIMER_MINUTES } from "./config.js";
import {
  createPlan, createBowl, createEquipment, removeEquipment, removeBowl,
} from "./plan.js";
import {
  purgeLegacy, listPlans, loadPlan, savePlan, mostRecentPlanId,
  downloadPlan, restorePlanFromFile, isStoragePersistent,
} from "./storage.js";
import { initPlanner } from "./planner.js";

// --- URL configuration ----------------------------------------------------

const urlParams = new URLSearchParams(window.location.search);
const timeParam = (name) => {
  const value = urlParams.get(name) || "";
  return /^\d{1,2}:\d{2}$/.test(value) ? value : "";
};

const recipePrefill = urlParams.get("recipe") || "";
// Pins the plate-up time on the embed URL. Only needed when each period has its
// own Canvas page, or for a special day — otherwise the student picks a period.
const foodUpPrefill = timeParam("foodUp") || timeParam("service"); // ?service= kept as an alias
const periodPrefill = urlParams.get("period") || null;
const modePrefill = urlParams.get("mode") === "free" || urlParams.get("mode") === "open" ? "free" : "guided";
// Vertical timeline, off by default while it's being compared against the
// horizontal board. Remove the flag once one of them wins.
const orientation = urlParams.get("board") === "horizontal" ? "horizontal" : "vertical";

const timerParam = urlParams.get("timer");
const timerMinutes = timerParam === null || timerParam === "" ? DEFAULT_TIMER_MINUTES : Number(timerParam);

// --- Plan lifecycle -------------------------------------------------------

purgeLegacy();

function freshPlan() {
  return createPlan({
    recipe: recipePrefill,
    foodUp: foodUpPrefill,
    periodId: periodPrefill,
    mode: modePrefill,
  });
}

let plan = (() => {
  const recent = mostRecentPlanId();
  // A teacher link naming a recipe should open that recipe's plan if the
  // student already has one, rather than resuming whatever they last touched.
  if (recipePrefill) {
    const match = listPlans().find((entry) => entry.recipe.toLowerCase() === recipePrefill.toLowerCase());
    if (match) return loadPlan(match.id) || freshPlan();
    return freshPlan();
  }
  return (recent && loadPlan(recent)) || freshPlan();
})();

savePlan(plan);

function persist() {
  savePlan(plan);
  refreshHardestLink();
  refreshPrintIdentity();
}

function switchToPlan(next) {
  plan = next;
  savePlan(plan);
  renderAll();
}

// --- Plan bar -------------------------------------------------------------

function initPlanBar() {
  const picker = document.getElementById("plan-picker");
  const newBtn = document.getElementById("new-plan-btn");
  const downloadBtn = document.getElementById("download-plan-btn");
  const restoreInput = document.getElementById("restore-plan-input");
  const status = document.getElementById("plan-status");

  function label(entry) {
    const name = entry.recipe || "Untitled plan";
    return entry.date ? `${name} — ${entry.date}` : name;
  }

  function renderPicker() {
    picker.innerHTML = "";
    const entries = listPlans();
    // The current plan may not be in the list yet on the very first render.
    if (!entries.some((entry) => entry.id === plan.id)) {
      entries.unshift({ id: plan.id, recipe: plan.meta.recipe, date: plan.meta.date });
    }
    for (const entry of entries) {
      const opt = document.createElement("option");
      opt.value = entry.id;
      opt.textContent = label(entry);
      opt.selected = entry.id === plan.id;
      picker.appendChild(opt);
    }
    picker.disabled = entries.length < 2;
  }

  picker.addEventListener("change", () => {
    const next = loadPlan(picker.value);
    if (next) switchToPlan(next);
  });

  newBtn.addEventListener("click", () => {
    const hasWork = plan.steps.length > 0 || plan.equipment.length > 0 || plan.read.done;
    if (hasWork && !window.confirm("Start over? You'll lose everything on your current plan.")) return;
    switchToPlan(freshPlan());
    if (status) status.textContent = "Started a new plan.";
  });

  downloadBtn.addEventListener("click", () => downloadPlan(plan));

  restoreInput.addEventListener("change", () => {
    const file = restoreInput.files && restoreInput.files[0];
    if (!file) return;
    restorePlanFromFile(file)
      .then((restored) => {
        switchToPlan(restored);
        if (status) status.textContent = "Plan restored.";
      })
      .catch((err) => {
        if (status) status.textContent = err.message;
      })
      .finally(() => {
        restoreInput.value = "";
      });
  });

  renderPicker();
  return renderPicker;
}

let refreshPicker = () => {};

// --- Identity strip -------------------------------------------------------

const META_FIELDS = [
  ["meta-name", "name"],
  ["meta-kitchen", "kitchen"],
  ["meta-date", "date"],
  ["meta-recipe", "recipe"],
];

function initIdentityStrip() {
  for (const [id, key] of META_FIELDS) {
    const input = document.getElementById(id);
    input.value = plan.meta[key] || "";
    input.oninput = () => {
      plan.meta[key] = input.value;
      persist();
      if (key === "recipe" || key === "date") refreshPicker();
    };
  }
}

function refreshPrintIdentity() {
  const node = document.getElementById("print-identity");
  if (!node) return;
  const parts = [plan.meta.name, plan.meta.recipe, plan.meta.date].filter((p) => p && p.trim());
  node.textContent = parts.join(" · ");
}

// --- Step 1: Read ---------------------------------------------------------

function initRead() {
  const done = document.getElementById("read-done");
  const hardest = document.getElementById("read-hardest");

  done.checked = plan.read.done;
  hardest.value = plan.read.hardest;

  done.onchange = () => {
    plan.read.done = done.checked;
    persist();
  };
  hardest.oninput = () => {
    plan.read.hardest = hardest.value;
    persist();
  };
  refreshHardestLink();
}

// Ties Read to the board: once steps exist, the prediction can point at one and
// gets marked on the timeline and the printout (spec §4.5). Free text stays,
// because they answer this before any steps exist.
function refreshHardestLink() {
  const mount = document.getElementById("read-hardest-link");
  if (!mount) return;
  mount.innerHTML = "";
  if (plan.steps.length === 0 || !plan.read.hardest.trim()) return;

  const field = document.createElement("div");
  field.className = "field no-print";
  const label = document.createElement("label");
  label.setAttribute("for", "hardest-step-select");
  label.textContent = "Which of your steps is that? (optional — it gets flagged on your board)";
  const select = document.createElement("select");
  select.id = "hardest-step-select";

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "— not one of my steps —";
  none.selected = !plan.read.hardestStepId;
  select.appendChild(none);

  for (const step of plan.steps) {
    const opt = document.createElement("option");
    opt.value = step.id;
    opt.textContent = step.name;
    opt.selected = plan.read.hardestStepId === step.id;
    select.appendChild(opt);
  }

  select.addEventListener("change", () => {
    plan.read.hardestStepId = select.value || null;
    savePlan(plan);
    renderPlanner();
  });

  field.append(label, select);
  mount.appendChild(field);
}

// --- Step 2: Pull ---------------------------------------------------------

function initEquipment() {
  const search = document.getElementById("equipment-search");
  const paletteEl = document.getElementById("equipment-palette");
  const trayEl = document.getElementById("equipment-tray");
  const customInput = document.getElementById("equipment-custom");
  const customAddBtn = document.getElementById("equipment-custom-add");

  const owned = () => new Map(plan.equipment.map((item) => [item.name, item]));

  function toggle(name) {
    const existing = owned().get(name);
    if (existing) {
      removeEquipment(plan, existing.id);
    } else {
      plan.equipment.push(createEquipment(name));
    }
    persist();
    renderPalette();
    renderTray();
    renderPlanner();
  }

  function renderPalette() {
    const filter = search.value.trim().toLowerCase();
    const have = owned();
    paletteEl.innerHTML = "";

    for (const group of EQUIPMENT_GROUPS) {
      const matches = EQUIPMENT_PALETTE.filter(
        (item) => item.group === group && item.name.toLowerCase().includes(filter)
      );
      if (matches.length === 0) continue;

      const groupEl = document.createElement("div");
      groupEl.className = "palette__group";
      const heading = document.createElement("h3");
      heading.className = "palette__group-heading";
      heading.textContent = group;
      groupEl.appendChild(heading);

      const list = document.createElement("div");
      list.className = "palette__items";
      for (const item of matches) {
        const selected = have.has(item.name);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `chip${selected ? " chip--selected" : ""}`;
        btn.textContent = item.name;
        btn.title = `${item.name} — ${item.station}`;
        btn.setAttribute("aria-pressed", String(selected));
        btn.addEventListener("click", () => toggle(item.name));
        list.appendChild(btn);
      }
      groupEl.appendChild(list);
      paletteEl.appendChild(groupEl);
    }
  }

  function renderTray() {
    trayEl.innerHTML = "";
    for (const item of plan.equipment) {
      const li = document.createElement("li");
      li.className = "tray__item";
      li.appendChild(Object.assign(document.createElement("span"), { textContent: item.name }));

      const station = document.createElement("span");
      station.className = "tray__station";
      station.textContent = item.station;
      li.appendChild(station);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "tray__remove no-print";
      removeBtn.setAttribute("aria-label", `Remove ${item.name}`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        removeEquipment(plan, item.id);
        persist();
        renderPalette();
        renderTray();
        renderPlanner();
      });
      li.appendChild(removeBtn);
      trayEl.appendChild(li);
    }
  }

  search.oninput = renderPalette;

  function addCustom() {
    const value = customInput.value.trim();
    if (!value) return;
    if (!owned().has(value)) {
      plan.equipment.push(createEquipment(value, { custom: true }));
      persist();
      renderPalette();
      renderTray();
      renderPlanner();
    }
    customInput.value = "";
    customInput.focus({ preventScroll: true });
  }

  customAddBtn.onclick = addCustom;
  customInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustom();
    }
  };

  renderPalette();
  renderTray();
}

// --- Step 3: Group --------------------------------------------------------

function initBowls() {
  const grid = document.getElementById("bowl-grid");
  const addBtn = document.getElementById("bowl-add");

  function renderBowls(focusId) {
    grid.innerHTML = "";
    plan.bowls.forEach((bowl, index) => {
      const card = document.createElement("div");
      card.className = "bowl-card";

      const labelWrap = document.createElement("div");
      labelWrap.className = "bowl-card__label-wrap";
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.className = "bowl-card__label";
      labelInput.id = `bowl-label-${bowl.id}`;
      labelInput.placeholder = "Label";
      labelInput.value = bowl.label;
      labelInput.setAttribute("aria-label", `Bowl ${index + 1} label`);
      labelInput.addEventListener("input", () => {
        bowl.label = labelInput.value;
        persist();
      });
      labelWrap.appendChild(labelInput);

      if (plan.bowls.length > 1) {
        const removeBowlBtn = document.createElement("button");
        removeBowlBtn.type = "button";
        removeBowlBtn.className = "bowl-card__remove no-print";
        removeBowlBtn.setAttribute("aria-label", `Remove bowl ${index + 1}`);
        removeBowlBtn.textContent = "×";
        removeBowlBtn.addEventListener("click", () => {
          removeBowl(plan, bowl.id);
          persist();
          renderBowls();
          renderPlanner();
        });
        labelWrap.appendChild(removeBowlBtn);
      }
      card.appendChild(labelWrap);

      const list = document.createElement("ul");
      list.className = "bowl-card__items";
      bowl.items.forEach((item, itemIndex) => {
        const li = document.createElement("li");
        li.appendChild(Object.assign(document.createElement("span"), { textContent: item }));
        const removeItemBtn = document.createElement("button");
        removeItemBtn.type = "button";
        removeItemBtn.className = "bowl-card__item-remove no-print";
        removeItemBtn.setAttribute("aria-label", `Remove ${item}`);
        removeItemBtn.textContent = "×";
        removeItemBtn.addEventListener("click", () => {
          bowl.items.splice(itemIndex, 1);
          persist();
          renderBowls(`bowl-ingredient-${bowl.id}`);
        });
        li.appendChild(removeItemBtn);
        list.appendChild(li);
      });
      card.appendChild(list);

      const entryRow = document.createElement("div");
      entryRow.className = "bowl-card__entry no-print";
      const entryInput = document.createElement("input");
      entryInput.type = "text";
      entryInput.id = `bowl-ingredient-${bowl.id}`;
      entryInput.placeholder = "Add ingredient, press Enter";
      entryInput.setAttribute("aria-label", `Add ingredient to bowl ${index + 1}`);
      entryInput.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const value = entryInput.value.trim();
        if (!value) return;
        bowl.items.push(value);
        persist();
        renderBowls(entryInput.id);
        renderPlanner();
      });
      entryRow.appendChild(entryInput);
      card.appendChild(entryRow);

      grid.appendChild(card);
    });

    if (focusId) {
      const again = document.getElementById(focusId);
      if (again) again.focus({ preventScroll: true });
    }
  }

  addBtn.onclick = () => {
    plan.bowls.push(createBowl());
    persist();
    renderBowls();
  };

  renderBowls();
}

// --- Step 4 ---------------------------------------------------------------

function renderPlanner() {
  initPlanner(plan, persist, document.getElementById("time-planner"), { orientation });
}

// --- Chrome ---------------------------------------------------------------

function initPrint() {
  document.getElementById("print-btn").addEventListener("click", () => window.print());
}

function initStorageWarning() {
  if (isStoragePersistent()) return;
  const banner = document.getElementById("storage-warning");
  const link = document.getElementById("storage-warning-link");
  if (link) link.href = window.location.href;
  if (banner) banner.hidden = false;
}

const TIMER_KEY = "mise-planner:timer";

function readTimerDeadline() {
  try {
    const raw = window.sessionStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // Only resume a countdown started for this same duration — changing
    // ?timer= should start fresh, not inherit an old deadline.
    if (saved && saved.minutes === timerMinutes && typeof saved.deadline === "number") {
      return saved.deadline;
    }
  } catch (err) {
    // Storage blocked or unparseable; fall through to a fresh countdown.
  }
  return null;
}

// Counts down to a stored wall-clock deadline rather than decrementing a
// counter, so a refresh resumes where it left off and a backgrounded tab
// (throttled timers) doesn't drift.
function initTimer() {
  const el = document.getElementById("timer");
  const valueEl = document.getElementById("timer-value");
  if (!el || !valueEl || !Number.isFinite(timerMinutes) || timerMinutes <= 0) return;

  let deadline = readTimerDeadline();
  if (deadline === null) {
    deadline = Date.now() + timerMinutes * 60000;
    try {
      window.sessionStorage.setItem(TIMER_KEY, JSON.stringify({ minutes: timerMinutes, deadline }));
    } catch (err) {
      // Not persistable — the countdown still runs for this page view.
    }
  }
  el.hidden = false;

  function render() {
    const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    if (remaining === 0) {
      valueEl.textContent = "Time's up";
      el.classList.add("timer--expired");
      return true;
    }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    valueEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
    return false;
  }

  if (render()) return;
  const interval = setInterval(() => {
    if (render()) clearInterval(interval);
  }, 1000);
}

// --- Boot -----------------------------------------------------------------

function renderAll() {
  initIdentityStrip();
  initRead();
  initEquipment();
  initBowls();
  renderPlanner();
  refreshPicker();
  refreshPrintIdentity();
}

refreshPicker = initPlanBar();
renderAll();
initPrint();
initStorageWarning();
initTimer();

window.addEventListener("beforeunload", (e) => {
  const hasWork = plan.steps.length > 0 || plan.equipment.length > 0 || plan.read.done;
  if (hasWork) {
    e.preventDefault();
    e.returnValue = "";
  }
});
