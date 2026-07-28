import { EQUIPMENT_PALETTE, DEFAULT_BOWL_COUNT, DEFAULT_SERVICE_TIME, DEFAULT_TIMER_MINUTES } from "./config.js";
import { saveState, loadState, downloadDraft, restoreDraftFromFile } from "./storage.js";
import { initTimePlanner } from "./time-planner.js";
import { initOpenMode } from "./open-mode.js";
import { newId } from "./time-utils.js";

// --- State -------------------------------------------------------------

function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function emptyBowl() {
  return { label: "", items: [] };
}

function defaultState(recipePrefill, servicePrefill) {
  return {
    meta: { name: "", kitchen: "", date: todayISO(), role: "", recipe: recipePrefill || "" },
    read: { done: false, hardest: "" },
    equipment: [],
    bowls: Array.from({ length: DEFAULT_BOWL_COUNT }, emptyBowl),
    time: {
      service: servicePrefill || DEFAULT_SERVICE_TIME,
      components: [],
      componentsNamingDone: false,
      activeComponentIndex: 0,
      steps: [],
      elicitationDone: false,
      detailsDone: false,
      openBlocks: [],
    },
  };
}

const urlParams = new URLSearchParams(window.location.search);
const recipePrefill = urlParams.get("recipe") || "";
const serviceParam = urlParams.get("service") || "";
const servicePrefill = /^\d{1,2}:\d{2}$/.test(serviceParam) ? serviceParam : "";
const mode = urlParams.get("mode") === "open" ? "open" : "scaffold";
const timerParam = urlParams.get("timer");
const timerMinutes = timerParam === null || timerParam === "" ? DEFAULT_TIMER_MINUTES : Number(timerParam);

// Storage key is fixed for the session once determined — see storage.js comment.
const storageKey = recipePrefill || "untitled";

let state = loadState(storageKey) || defaultState(recipePrefill, servicePrefill);

// Defensive defaults for state saved by an earlier version of the app.
if (!Array.isArray(state.time.steps)) state.time.steps = [];
if (typeof state.time.elicitationDone !== "boolean") state.time.elicitationDone = false;
if (typeof state.time.detailsDone !== "boolean") state.time.detailsDone = false;
if (!Array.isArray(state.time.openBlocks)) state.time.openBlocks = [];
for (const step of state.time.steps) {
  if (!Array.isArray(step.prep)) step.prep = [];
  if (!Array.isArray(step.windowNotes)) step.windowNotes = [];
}

// Migrate drafts saved before "components" existed: a draft with steps but
// no components list was a single implicit component. Give it one so
// existing in-progress plans keep working, and skip straight past the new
// naming phase since the student already answered it implicitly.
if (!Array.isArray(state.time.components)) state.time.components = [];
if (typeof state.time.componentsNamingDone !== "boolean") state.time.componentsNamingDone = false;
if (typeof state.time.activeComponentIndex !== "number") state.time.activeComponentIndex = 0;
if (state.time.components.length === 0 && state.time.steps.length > 0) {
  state.time.components = [{ id: newId("component"), name: "The dish" }];
  state.time.componentsNamingDone = true;
}
for (const step of state.time.steps) {
  if (!step.component && state.time.components[0]) step.component = state.time.components[0].id;
}

function persist() {
  saveState(storageKey, state);
}

function withFocusPreserved(fn) {
  const active = document.activeElement;
  const id = active && active.id;
  const selStart = active && "selectionStart" in active ? active.selectionStart : null;
  fn();
  if (id) {
    const el = document.getElementById(id);
    if (el) {
      el.focus();
      if (selStart !== null && "setSelectionRange" in el) {
        try { el.setSelectionRange(selStart, selStart); } catch (err) { /* not a text-selectable input */ }
      }
    }
  }
}

// --- Identity strip ------------------------------------------------------

function initIdentityStrip() {
  const fields = [
    ["meta-name", "name"],
    ["meta-kitchen", "kitchen"],
    ["meta-date", "date"],
    ["meta-role", "role"],
    ["meta-recipe", "recipe"],
  ];
  for (const [id, key] of fields) {
    const el = document.getElementById(id);
    el.value = state.meta[key];
    el.addEventListener("input", () => {
      state.meta[key] = el.value;
      persist();
    });
  }
}

// --- Section 01: Read ------------------------------------------------------

function initRead() {
  const done = document.getElementById("read-done");
  const hardest = document.getElementById("read-hardest");

  done.checked = state.read.done;
  hardest.value = state.read.hardest;

  done.addEventListener("change", () => {
    state.read.done = done.checked;
    persist();
  });
  hardest.addEventListener("input", () => {
    state.read.hardest = hardest.value;
    persist();
  });
}

// --- Section 02: Pull (equipment) ------------------------------------------

function initEquipment() {
  const search = document.getElementById("equipment-search");
  const paletteEl = document.getElementById("equipment-palette");
  const trayEl = document.getElementById("equipment-tray");
  const customInput = document.getElementById("equipment-custom");
  const customAddBtn = document.getElementById("equipment-custom-add");

  function isSelected(item) {
    return state.equipment.includes(item);
  }

  function toggleItem(item) {
    const idx = state.equipment.indexOf(item);
    if (idx === -1) state.equipment.push(item);
    else state.equipment.splice(idx, 1);
    persist();
    renderPalette();
    renderTray();
  }

  function renderPalette() {
    const filter = search.value.trim().toLowerCase();
    paletteEl.innerHTML = "";

    for (const [group, items] of Object.entries(EQUIPMENT_PALETTE)) {
      const matches = items.filter((item) => item.toLowerCase().includes(filter));
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
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.textContent = item;
        btn.setAttribute("aria-pressed", String(isSelected(item)));
        if (isSelected(item)) btn.classList.add("chip--selected");
        btn.addEventListener("click", () => toggleItem(item));
        list.appendChild(btn);
      }
      groupEl.appendChild(list);
      paletteEl.appendChild(groupEl);
    }
  }

  function renderTray() {
    trayEl.innerHTML = "";
    for (const item of state.equipment) {
      const li = document.createElement("li");
      li.className = "tray__item";

      const label = document.createElement("span");
      label.textContent = item;
      li.appendChild(label);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "tray__remove no-print";
      removeBtn.setAttribute("aria-label", `Remove ${item}`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => toggleItem(item));
      li.appendChild(removeBtn);

      trayEl.appendChild(li);
    }
  }

  search.addEventListener("input", renderPalette);

  function addCustom() {
    const value = customInput.value.trim();
    if (!value) return;
    if (!state.equipment.includes(value)) {
      state.equipment.push(value);
      persist();
      renderTray();
      renderPalette();
    }
    customInput.value = "";
    customInput.focus();
  }

  customAddBtn.addEventListener("click", addCustom);
  customInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustom();
    }
  });

  renderPalette();
  renderTray();
}

// --- Section 03: Group (bowls) ---------------------------------------------

function initBowls() {
  const grid = document.getElementById("bowl-grid");
  const addBtn = document.getElementById("bowl-add");

  function renderBowls() {
    grid.innerHTML = "";
    state.bowls.forEach((bowl, index) => {
      const card = document.createElement("div");
      card.className = "bowl-card";

      const labelWrap = document.createElement("div");
      labelWrap.className = "bowl-card__label-wrap";
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.className = "bowl-card__label";
      labelInput.id = `bowl-label-${index}`;
      labelInput.placeholder = "Label";
      labelInput.value = bowl.label;
      labelInput.setAttribute("aria-label", `Bowl ${index + 1} label`);
      labelInput.addEventListener("input", () => {
        bowl.label = labelInput.value;
        persist();
      });
      labelWrap.appendChild(labelInput);

      if (state.bowls.length > 1) {
        const removeBowlBtn = document.createElement("button");
        removeBowlBtn.type = "button";
        removeBowlBtn.className = "bowl-card__remove no-print";
        removeBowlBtn.setAttribute("aria-label", `Remove bowl ${index + 1}`);
        removeBowlBtn.textContent = "×";
        removeBowlBtn.addEventListener("click", () => {
          state.bowls.splice(index, 1);
          persist();
          renderBowls();
        });
        labelWrap.appendChild(removeBowlBtn);
      }

      card.appendChild(labelWrap);

      const list = document.createElement("ul");
      list.className = "bowl-card__items";
      bowl.items.forEach((item, itemIndex) => {
        const li = document.createElement("li");
        const span = document.createElement("span");
        span.textContent = item;
        li.appendChild(span);

        const removeItemBtn = document.createElement("button");
        removeItemBtn.type = "button";
        removeItemBtn.className = "bowl-card__item-remove no-print";
        removeItemBtn.setAttribute("aria-label", `Remove ${item}`);
        removeItemBtn.textContent = "×";
        removeItemBtn.addEventListener("click", () => {
          bowl.items.splice(itemIndex, 1);
          persist();
          withFocusPreserved(renderBowls);
        });
        li.appendChild(removeItemBtn);

        list.appendChild(li);
      });
      card.appendChild(list);

      const entryRow = document.createElement("div");
      entryRow.className = "bowl-card__entry no-print";
      const entryInput = document.createElement("input");
      entryInput.type = "text";
      entryInput.id = `bowl-ingredient-input-${index}`;
      entryInput.placeholder = "Add ingredient, press Enter";
      entryInput.setAttribute("aria-label", `Add ingredient to bowl ${index + 1}`);
      entryInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const value = entryInput.value.trim();
          if (!value) return;
          bowl.items.push(value);
          persist();
          entryInput.value = "";
          withFocusPreserved(renderBowls);
        }
      });
      entryRow.appendChild(entryInput);
      card.appendChild(entryRow);

      grid.appendChild(card);
    });
  }

  addBtn.addEventListener("click", () => {
    state.bowls.push(emptyBowl());
    persist();
    renderBowls();
  });

  renderBowls();
}

// --- Timer ---------------------------------------------------------------

function initTimer() {
  const el = document.getElementById("timer");
  if (!el || !Number.isFinite(timerMinutes) || timerMinutes <= 0) return;

  el.hidden = false;
  let remaining = timerMinutes * 60;

  function render() {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    el.textContent = `${m}:${String(s).padStart(2, "0")}`;
  }

  render();
  const interval = setInterval(() => {
    remaining -= 1;
    render();
    if (remaining <= 0) clearInterval(interval);
  }, 1000);
}

// --- Print -------------------------------------------------------------

function initPrint() {
  document.getElementById("print-btn").addEventListener("click", () => {
    window.print();
  });
}

function initStorageWarningLink() {
  const link = document.getElementById("storage-warning-link");
  if (link) link.href = window.location.href;
}

function initDraftControls() {
  const downloadBtn = document.getElementById("download-draft-btn");
  const restoreInput = document.getElementById("restore-draft-input");
  const status = document.getElementById("restore-draft-status");

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      downloadDraft(state.meta.recipe, state);
    });
  }

  if (restoreInput) {
    restoreInput.addEventListener("change", () => {
      const file = restoreInput.files && restoreInput.files[0];
      if (!file) return;
      restoreDraftFromFile(file)
        .then((parsed) => {
          saveState(storageKey, parsed);
          window.location.reload();
        })
        .catch((err) => {
          if (status) status.textContent = err.message;
          restoreInput.value = "";
        });
    });
  }
}

// --- Boot ----------------------------------------------------------------

initIdentityStrip();
initRead();
initEquipment();
initBowls();

if (mode === "open") {
  initOpenMode(state, persist, document.getElementById("time-planner"));
} else {
  initTimePlanner(state, persist);
}

initPrint();
initStorageWarningLink();
initDraftControls();
initTimer();
