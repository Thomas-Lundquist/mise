import { EQUIPMENT_PALETTE, DEFAULT_BOWL_COUNT } from "./config.js";
import { saveState, loadState } from "./storage.js";
import { initTimePlanner } from "./time-planner.js";

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

function defaultState(recipePrefill) {
  return {
    meta: { name: "", kitchen: "", date: todayISO(), role: "", recipe: recipePrefill || "" },
    read: { done: false, hardest: "" },
    equipment: [],
    bowls: Array.from({ length: DEFAULT_BOWL_COUNT }, emptyBowl),
    time: { service: "12:35", steps: [], elicitationDone: false },
  };
}

const urlParams = new URLSearchParams(window.location.search);
const recipePrefill = urlParams.get("recipe") || "";

// Storage key is fixed for the session once determined — see storage.js comment.
const storageKey = recipePrefill || "untitled";

let state = loadState(storageKey) || defaultState(recipePrefill);

// Defensive defaults for state saved by an earlier version of the app.
if (!Array.isArray(state.time.steps)) state.time.steps = [];
if (typeof state.time.elicitationDone !== "boolean") state.time.elicitationDone = false;

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

// --- Boot ----------------------------------------------------------------

initIdentityStrip();
initRead();
initEquipment();
initBowls();
initTimePlanner(state, persist);
initPrint();
initStorageWarningLink();
