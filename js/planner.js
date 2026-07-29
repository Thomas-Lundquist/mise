// Step 4 — Time.
//
// Three views, all reachable from each other at any time: Parts, Steps, Board.
// The previous build was a one-way wizard — once you clicked "Start planning"
// the parts screen never rendered again, so a student who forgot the vegetable
// had no way back. Nothing here is write-once (spec §4.3).
//
// The backward elicitation ("what happens right before that?") is kept as-is.
// It's the thing that actually teaches, and it worked.

import { STATIONS, NO_EQUIPMENT_STATION } from "./config.js";
import { renderBoard } from "./board.js";
import {
  newId, createStep, removeStep, removeComponent, moveStepWithinComponent,
  stepsForComponent, equipmentById, laneForStep,
} from "./plan.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function handsLabel(hands) {
  return hands ? "Hands on it" : "Runs by itself";
}

export function initPlanner(plan, persist, container) {
  // Transient UI state — deliberately not persisted.
  let pendingDeleteComponentId = null;

  function rerender(after) {
    const activeId = document.activeElement && document.activeElement.id;
    render();
    if (after) {
      after();
    } else if (activeId) {
      const again = document.getElementById(activeId);
      if (again) again.focus({ preventScroll: true });
    }
  }

  function go(view) {
    plan.flow.view = view;
    persist();
    rerender();
  }

  function render() {
    container.innerHTML = "";
    container.appendChild(buildNav());

    const view = plan.flow.view;
    if (view === "board" && plan.steps.length > 0) {
      const mount = el("div");
      container.appendChild(mount);
      renderBoard(plan, { persist, rerender }, mount);
    } else if (view === "steps" && plan.components.length > 0) {
      container.appendChild(buildStepsView());
    } else {
      container.appendChild(buildPartsView());
    }
  }

  // ---------- Navigation ----------

  function buildNav() {
    const nav = el("nav", "planner-nav no-print");
    nav.setAttribute("aria-label", "Time planner sections");

    const hasParts = plan.components.length > 0;
    const hasSteps = plan.steps.length > 0;
    const current = plan.flow.view;

    const views = [
      { id: "parts", label: "Parts", enabled: true, hint: "Name the parts of the dish" },
      { id: "steps", label: "Steps", enabled: hasParts, hint: "Work backward from plate-up" },
      { id: "board", label: "Board", enabled: hasSteps, hint: "See it on a timeline" },
    ];

    for (const view of views) {
      const active = current === view.id && (view.enabled || view.id === "parts");
      const btn = el("button", `planner-nav__item${active ? " planner-nav__item--active" : ""}`, view.label);
      btn.type = "button";
      btn.disabled = !view.enabled;
      btn.title = view.enabled ? view.hint : `Add ${view.id === "steps" ? "a part" : "some steps"} first`;
      btn.setAttribute("aria-current", active ? "page" : "false");
      btn.addEventListener("click", () => go(view.id));
      nav.appendChild(btn);
    }
    return nav;
  }

  // ---------- Parts ----------

  function buildPartsView() {
    const wrap = el("div", "elicit-form no-print");

    wrap.appendChild(el("p", "elicit-prompt",
      "What are the separate parts of this dish that need to be ready at the same time?"));
    wrap.appendChild(el("p", "elicit-subtext",
      "Think protein, starch, sauce, vegetable — anything that has its own steps. " +
      "If it's all one thing, just add one."));

    if (plan.components.length > 0) {
      const list = el("ul", "component-list");
      plan.components.forEach((component, index) => {
        list.appendChild(buildPartRow(component, index));
      });
      wrap.appendChild(list);
    }

    const row = el("div", "inline-add");
    const input = document.createElement("input");
    input.type = "text";
    input.id = "part-name-input";
    input.placeholder = plan.components.length === 0 ? "e.g. Seared chicken, or just the dish name" : "Another part…";
    input.setAttribute("aria-label", "Name a part of the dish");
    row.appendChild(input);

    const addBtn = el("button", "btn btn--small", "Add part");
    addBtn.type = "button";
    row.appendChild(addBtn);
    wrap.appendChild(row);

    function addPart() {
      const value = input.value.trim() || (plan.components.length === 0 ? (plan.meta.recipe || "The dish") : "");
      if (!value) return;
      plan.components.push({ id: newId("component"), name: value });
      persist();
      input.value = "";
      rerender(() => {
        const again = document.getElementById("part-name-input");
        if (again) again.focus({ preventScroll: true });
      });
    }
    addBtn.addEventListener("click", addPart);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addPart();
      }
    });

    if (plan.components.length > 0) {
      const footer = el("div", "elicit-footer");
      const next = el("button", "btn", "Next: build the steps");
      next.type = "button";
      next.addEventListener("click", () => go("steps"));
      footer.appendChild(next);
      wrap.appendChild(footer);
    }

    return wrap;
  }

  function buildPartRow(component, index) {
    const li = el("li", "component-list__item");

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "component-list__name";
    nameInput.id = `part-name-${component.id}`;
    nameInput.value = component.name;
    nameInput.setAttribute("aria-label", `Name of part ${index + 1}`);
    nameInput.addEventListener("input", () => {
      component.name = nameInput.value;
      persist();
    });
    li.appendChild(nameInput);

    const count = stepsForComponent(plan, component.id).length;
    li.appendChild(el("span", "component-list__count", count === 1 ? "1 step" : `${count} steps`));

    const removeBtn = el("button", "component-list__remove no-print", "×");
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", `Remove ${component.name}`);
    removeBtn.addEventListener("click", () => {
      if (count === 0) {
        removeComponent(plan, component.id);
        persist();
        rerender();
        return;
      }
      pendingDeleteComponentId = component.id;
      rerender();
    });
    li.appendChild(removeBtn);

    if (pendingDeleteComponentId === component.id) {
      li.appendChild(buildDeleteConfirm(component, count));
    }
    return li;
  }

  // Deleting a part that has steps offers both exits rather than just
  // destroying work or refusing (spec §4.3).
  function buildDeleteConfirm(component, count) {
    const panel = el("div", "confirm-panel");
    panel.appendChild(el("p", null,
      `"${component.name}" has ${count === 1 ? "1 step" : `${count} steps`}. What should happen to ${count === 1 ? "it" : "them"}?`));

    const actions = el("div", "confirm-panel__actions");

    const others = plan.components.filter((c) => c.id !== component.id);
    if (others.length > 0) {
      const select = document.createElement("select");
      select.id = `move-target-${component.id}`;
      select.setAttribute("aria-label", "Move the steps to");
      for (const other of others) {
        const opt = document.createElement("option");
        opt.value = other.id;
        opt.textContent = other.name;
        select.appendChild(opt);
      }
      actions.appendChild(select);

      const moveBtn = el("button", "btn btn--small", "Move them");
      moveBtn.type = "button";
      moveBtn.addEventListener("click", () => {
        removeComponent(plan, component.id, { moveTo: select.value });
        pendingDeleteComponentId = null;
        persist();
        rerender();
      });
      actions.appendChild(moveBtn);
    }

    const deleteBtn = el("button", "btn btn--small btn--danger", "Delete them too");
    deleteBtn.type = "button";
    deleteBtn.addEventListener("click", () => {
      removeComponent(plan, component.id);
      pendingDeleteComponentId = null;
      persist();
      rerender();
    });
    actions.appendChild(deleteBtn);

    const cancelBtn = el("button", "btn btn--small btn--secondary", "Cancel");
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", () => {
      pendingDeleteComponentId = null;
      rerender();
    });
    actions.appendChild(cancelBtn);

    panel.appendChild(actions);
    return panel;
  }

  // ---------- Steps ----------

  function activeComponent() {
    return plan.components[plan.flow.activeComponentIndex] || plan.components[0] || null;
  }

  function buildStepsView() {
    const wrap = el("div");
    const component = activeComponent();
    if (!component) return wrap;

    if (plan.components.length > 1) wrap.appendChild(buildComponentTabs());
    wrap.appendChild(buildElicitForm(component));

    const steps = stepsForComponent(plan, component.id);
    if (steps.length > 0) wrap.appendChild(buildStepList(component, steps));

    const footer = el("div", "elicit-footer no-print");
    if (plan.steps.length > 0) {
      const boardBtn = el("button", "btn", "See it on the board");
      boardBtn.type = "button";
      boardBtn.addEventListener("click", () => go("board"));
      footer.appendChild(boardBtn);
    }
    const partsBtn = el("button", "btn btn--small btn--secondary", "Edit the parts");
    partsBtn.type = "button";
    partsBtn.addEventListener("click", () => go("parts"));
    footer.appendChild(partsBtn);
    wrap.appendChild(footer);

    return wrap;
  }

  function buildComponentTabs() {
    const nav = el("nav", "component-progress no-print");
    nav.setAttribute("aria-label", "Parts of the dish");
    plan.components.forEach((component, index) => {
      const active = index === plan.flow.activeComponentIndex;
      const count = stepsForComponent(plan, component.id).length;
      const btn = el("button", `component-progress__item${active ? " component-progress__item--active" : ""}`);
      btn.type = "button";
      btn.appendChild(el("span", null, component.name));
      btn.appendChild(el("span", "component-progress__count", String(count)));
      btn.setAttribute("aria-current", active ? "step" : "false");
      btn.addEventListener("click", () => {
        plan.flow.activeComponentIndex = index;
        persist();
        rerender();
      });
      nav.appendChild(btn);
    });
    return nav;
  }

  function buildElicitForm(component) {
    const wrap = el("div", "elicit-form no-print");
    const steps = stepsForComponent(plan, component.id);
    const single = plan.components.length === 1;

    let promptText;
    if (steps.length === 0) {
      promptText = single
        ? "What is the very last thing you do before it goes on the plate?"
        : `What's the last thing you do to "${component.name}" before it's ready to plate?`;
    } else {
      promptText = `And what happens right before "${steps[0].name}"?`;
    }
    const prompt = el("p", "elicit-prompt", promptText);
    prompt.id = "elicit-prompt";
    wrap.appendChild(prompt);

    const nameField = el("div", "field");
    const nameLabel = el("label", null, "Step");
    nameLabel.setAttribute("for", "elicit-name");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "elicit-name";
    nameInput.placeholder = steps.length === 0 ? "e.g. Plate and garnish" : "e.g. Rest the meat";
    nameInput.setAttribute("aria-describedby", "elicit-prompt");
    nameField.append(nameLabel, nameInput);
    wrap.appendChild(nameField);

    const minsField = el("div", "field field--narrow");
    const minsLabel = el("label", null, "Minutes");
    minsLabel.setAttribute("for", "elicit-mins");
    const minsInput = document.createElement("input");
    minsInput.type = "number";
    minsInput.id = "elicit-mins";
    minsInput.min = "1";
    minsField.append(minsLabel, minsInput);
    wrap.appendChild(minsField);

    const toggleField = el("div", "field");
    toggleField.appendChild(el("span", null, "While this happens, are you…"));
    let handsValue = null;
    const { group, setHands } = buildHandsToggle((value) => {
      handsValue = value;
      updateAddEnabled();
    });
    toggleField.appendChild(group);
    toggleField.appendChild(el("p", "toggle-hint", "This decides whether it frees your hands for something else."));
    wrap.appendChild(toggleField);

    const addBtn = el("button", "btn", "Add step");
    addBtn.type = "button";
    addBtn.disabled = true;
    wrap.appendChild(addBtn);

    const hint = el("p", "form-hint");
    hint.setAttribute("aria-live", "polite");
    wrap.appendChild(hint);

    function updateAddEnabled() {
      const hasName = nameInput.value.trim().length > 0;
      const hasMins = Number(minsInput.value) > 0;
      const missing = [];
      if (!hasName) missing.push("name the step");
      if (!hasMins) missing.push("how many minutes");
      if (handsValue === null) missing.push("hands on it, or runs by itself");
      addBtn.disabled = missing.length > 0;
      const started = hasName || hasMins || handsValue !== null;
      hint.textContent = !started || missing.length === 0 ? "" : `Still needed: ${missing.join(", ")}.`;
    }

    nameInput.addEventListener("input", updateAddEnabled);
    minsInput.addEventListener("input", updateAddEnabled);

    function submit() {
      if (addBtn.disabled) return;
      const step = createStep({
        componentId: component.id,
        name: nameInput.value.trim(),
        mins: Number(minsInput.value),
        hands: handsValue,
      });
      // Each answer is chronologically earlier than everything already entered
      // for this part, so unshifting keeps the array in forward order.
      plan.steps.unshift(step);
      persist();
      rerender(() => {
        const again = document.getElementById("elicit-name");
        if (again) again.focus({ preventScroll: true });
      });
    }

    addBtn.addEventListener("click", submit);
    minsInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });

    setHands(null);
    updateAddEnabled();
    return wrap;
  }

  function buildHandsToggle(onChange, initial = null) {
    const group = el("div", "hands-toggle");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Hands-on or unattended");

    const handsBtn = el("button", "hands-toggle__btn hands-toggle__btn--hands", "Hands on it (chopping, stirring, searing)");
    handsBtn.type = "button";
    const freeBtn = el("button", "hands-toggle__btn hands-toggle__btn--unattended", "Runs by itself (baking, simmering, chilling, resting)");
    freeBtn.type = "button";

    function setHands(value) {
      handsBtn.setAttribute("aria-pressed", String(value === true));
      handsBtn.classList.toggle("hands-toggle__btn--selected", value === true);
      freeBtn.setAttribute("aria-pressed", String(value === false));
      freeBtn.classList.toggle("hands-toggle__btn--selected", value === false);
    }

    handsBtn.addEventListener("click", () => { setHands(true); onChange(true); });
    freeBtn.addEventListener("click", () => { setHands(false); onChange(false); });

    group.append(handsBtn, freeBtn);
    setHands(initial);
    return { group, setHands };
  }

  function buildStepList(component, steps) {
    const wrap = el("div", "step-review");
    wrap.appendChild(el("h3", null,
      plan.components.length > 1 ? `Your plan so far — ${component.name}` : "Your plan so far"));

    const list = el("ol", "step-review__list");
    steps.forEach((step, index) => {
      list.appendChild(buildStepRow(step, index, steps.length));
    });
    wrap.appendChild(list);
    return wrap;
  }

  function buildStepRow(step, index, total) {
    const li = el("li", "step-row");
    const isEditing = plan.flow.editingStepId === step.id;

    const head = el("div", "step-row__head");
    head.appendChild(el("span", "step-review__name", step.name));
    head.appendChild(el("span", "step-review__mins", `${step.mins} min`));
    head.appendChild(el("span",
      `step-review__tag ${step.hands ? "step-review__tag--hands" : "step-review__tag--unattended"}`,
      handsLabel(step.hands)));

    const controls = el("div", "step-row__controls no-print");

    const upBtn = el("button", "step-row__btn", "↑");
    upBtn.type = "button";
    upBtn.disabled = index === 0;
    upBtn.setAttribute("aria-label", `Move ${step.name} earlier`);
    upBtn.addEventListener("click", () => {
      if (moveStepWithinComponent(plan, step.id, -1)) {
        persist();
        rerender();
      }
    });
    controls.appendChild(upBtn);

    const downBtn = el("button", "step-row__btn", "↓");
    downBtn.type = "button";
    downBtn.disabled = index === total - 1;
    downBtn.setAttribute("aria-label", `Move ${step.name} later`);
    downBtn.addEventListener("click", () => {
      if (moveStepWithinComponent(plan, step.id, 1)) {
        persist();
        rerender();
      }
    });
    controls.appendChild(downBtn);

    const editBtn = el("button", "step-row__btn", isEditing ? "Done" : "Edit");
    editBtn.type = "button";
    editBtn.id = `edit-step-${step.id}`;
    editBtn.addEventListener("click", () => {
      plan.flow.editingStepId = isEditing ? null : step.id;
      persist();
      rerender();
    });
    controls.appendChild(editBtn);

    const removeBtn = el("button", "step-row__btn step-row__btn--remove", "×");
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", `Remove ${step.name}`);
    removeBtn.addEventListener("click", () => {
      removeStep(plan, step.id);
      if (plan.flow.editingStepId === step.id) plan.flow.editingStepId = null;
      persist();
      rerender();
    });
    controls.appendChild(removeBtn);

    head.appendChild(controls);
    li.appendChild(head);

    if (isEditing) li.appendChild(buildStepEditor(step));
    return li;
  }

  // Editing in place, rather than the old delete-and-retype.
  function buildStepEditor(step) {
    const wrap = el("div", "step-editor");

    const nameField = el("div", "field");
    const nameLabel = el("label", null, "Step");
    nameLabel.setAttribute("for", `step-name-${step.id}`);
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = `step-name-${step.id}`;
    nameInput.value = step.name;
    nameInput.addEventListener("input", () => {
      step.name = nameInput.value;
      persist();
    });
    nameField.append(nameLabel, nameInput);
    wrap.appendChild(nameField);

    const minsField = el("div", "field field--narrow");
    const minsLabel = el("label", null, "Minutes");
    minsLabel.setAttribute("for", `step-mins-${step.id}`);
    const minsInput = document.createElement("input");
    minsInput.type = "number";
    minsInput.min = "1";
    minsInput.id = `step-mins-${step.id}`;
    minsInput.value = String(step.mins);
    minsInput.addEventListener("input", () => {
      const value = Number(minsInput.value);
      if (value > 0) {
        step.mins = value;
        persist();
      }
    });
    minsField.append(minsLabel, minsInput);
    wrap.appendChild(minsField);

    const toggleField = el("div", "field");
    toggleField.appendChild(el("span", null, "While this happens, are you…"));
    const { group } = buildHandsToggle((value) => {
      step.hands = value;
      persist();
      rerender();
    }, step.hands);
    toggleField.appendChild(group);
    wrap.appendChild(toggleField);

    wrap.appendChild(buildAheadField(step));
    wrap.appendChild(buildEquipmentPicker(step));
    wrap.appendChild(buildBowlPicker(step));

    const noteField = el("div", "field");
    const noteLabel = el("label", null, "Anything to remember? (optional)");
    noteLabel.setAttribute("for", `step-note-${step.id}`);
    const noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.id = `step-note-${step.id}`;
    noteInput.value = step.note;
    noteInput.placeholder = "e.g. get plates down";
    noteInput.addEventListener("input", () => {
      step.note = noteInput.value;
      persist();
    });
    noteField.append(noteLabel, noteInput);
    wrap.appendChild(noteField);

    return wrap;
  }

  // The mise en place judgement itself: what can be ready before you start?
  // Ticking this pulls the step into the prep block that runs before any
  // cooking, which is what stops the schedule chopping parsley mid-sauce.
  function buildAheadField(step) {
    const wrap = el("div", "field ahead-field");
    const id = `step-ahead-${step.id}`;

    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = id;
    box.checked = Boolean(step.ahead);
    box.addEventListener("change", () => {
      step.ahead = box.checked;
      persist();
      rerender();
    });

    const label = el("label", "ahead-field__label", "Can be done ahead");
    label.setAttribute("for", id);

    const row = el("div", "ahead-field__row");
    row.append(box, label);
    wrap.appendChild(row);
    wrap.appendChild(el("p", "form-hint",
      "Tick this if it can be ready before you start cooking — chopping, measuring, " +
      "filling bowls. Leave it clear for anything that has to happen at its place in " +
      "the order, like fluffing rice just before it goes on the plate."));
    return wrap;
  }

  // Equipment comes from what they pulled in Step 2 — the station is a property
  // of the equipment, so there's nothing to guess from the step's wording.
  function buildEquipmentPicker(step) {
    const wrap = el("div", "field");
    wrap.appendChild(el("span", null, step.hands ? "What are you using?" : "Where is it while it runs?"));

    if (plan.equipment.length === 0) {
      wrap.appendChild(el("p", "toggle-hint", "Pull some equipment in Step 2 and it'll show up here."));
      return wrap;
    }

    const byId = equipmentById(plan);
    const chips = el("div", "chip-row");

    for (const item of plan.equipment) {
      const selected = step.equipmentIds.includes(item.id);
      const chip = el("button", `chip${selected ? " chip--selected" : ""}`, item.name);
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(selected));
      chip.addEventListener("click", () => {
        step.equipmentIds = selected
          ? step.equipmentIds.filter((id) => id !== item.id)
          : [...step.equipmentIds, item.id];
        if (step.equipmentIds.length > 0) step.noEquipment = false;
        persist();
        rerender();
      });
      chips.appendChild(chip);
    }

    // "Nothing" is a real answer — resting meat on the counter is genuinely
    // unattended with nothing running it (spec §4.1).
    if (!step.hands) {
      const selected = step.noEquipment && step.equipmentIds.length === 0;
      const chip = el("button", `chip${selected ? " chip--selected" : ""}`, "Nothing — it just sits");
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(selected));
      chip.addEventListener("click", () => {
        step.noEquipment = !selected;
        if (step.noEquipment) step.equipmentIds = [];
        persist();
        rerender();
      });
      chips.appendChild(chip);
    }

    wrap.appendChild(chips);

    if (!step.hands) {
      const lane = laneForStep(step, byId);
      const station = STATIONS.find((s) => s.id === lane);
      const answered = step.equipmentIds.length > 0 || step.noEquipment;
      wrap.appendChild(el("p", "toggle-hint", answered
        ? `Shows on the ${station ? station.label : lane} lane.`
        : "Pick something, or say it just sits — this is what puts it on a lane."));
    }
    return wrap;
  }

  function buildBowlPicker(step) {
    const wrap = el("div", "field");
    wrap.appendChild(el("span", null, "Which bowls need to be ready before this?"));

    const usable = plan.bowls.filter((b) => b.label.trim() || b.items.length > 0);
    if (usable.length === 0) {
      wrap.appendChild(el("p", "toggle-hint", "Fill in some bowls in Step 3 and they'll show up here."));
      return wrap;
    }

    const chips = el("div", "chip-row");
    for (const bowl of usable) {
      const selected = step.bowlIds.includes(bowl.id);
      const label = bowl.label.trim() || bowl.items.slice(0, 2).join(", ") || "Unlabelled";
      const chip = el("button", `chip${selected ? " chip--selected" : ""}`, label);
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(selected));
      chip.addEventListener("click", () => {
        step.bowlIds = selected
          ? step.bowlIds.filter((id) => id !== bowl.id)
          : [...step.bowlIds, bowl.id];
        persist();
        rerender();
      });
      chips.appendChild(chip);
    }
    wrap.appendChild(chips);
    return wrap;
  }

  render();
}
