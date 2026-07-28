// Section 04 — Time planner, scaffolded mode. Three phases:
//   1. Backward elicitation of major steps (this is the actual time-planning
//      skill being taught — see docs/design-brief.md and the build spec).
//   2. A forward pass to attach quick untimed prep reminders to each major
//      step. These are NOT scheduled — no duration, no hands/unattended
//      flag, never shown on the board. They exist so the tedious backward
//      "what happens right before X?" interrogation only has to cover the
//      steps that actually shape the timeline, not every small task.
//   3. The board (board.js).
//
// Steps are stored in forward chronological order: each new major is
// unshifted onto the front of the array, and because every new answer is
// chronologically earlier than everything already entered, the array is
// always in correct forward order, growing earlier at index 0 as the
// conversation continues. state.time.steps[0] is therefore always "the step
// most recently entered" — the thing the next prompt asks about.

import { initBoard } from "./board.js";

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function handsLabel(hands) {
  return hands ? "Hands on it" : "Runs by itself";
}

function withFocusPreserved(fn) {
  const active = document.activeElement;
  const id = active && active.id;
  fn();
  if (id) {
    const el = document.getElementById(id);
    if (el) el.focus();
  }
}

export function initTimePlanner(state, persist) {
  const container = document.getElementById("time-planner");

  function render() {
    container.innerHTML = "";

    if (!state.time.elicitationDone) {
      container.appendChild(buildPromptForm());
      if (state.time.steps.length > 0) container.appendChild(buildReviewList());
      container.appendChild(buildFooterControls());
    } else if (!state.time.detailsDone) {
      container.appendChild(buildDetailsPhase());
      container.appendChild(buildFooterControls());
    } else {
      const boardMount = document.createElement("div");
      container.appendChild(boardMount);
      initBoard(state, persist, boardMount);
      container.appendChild(buildFooterControls());
    }
  }

  function buildPromptForm() {
    const wrap = document.createElement("div");
    wrap.className = "elicit-form no-print";

    const steps = state.time.steps;
    const promptText = steps.length === 0
      ? "What is the very last thing you do before it goes on the plate?"
      : `And what happens right before "${steps[0].name}"?`;

    const prompt = document.createElement("p");
    prompt.className = "elicit-prompt";
    prompt.id = "elicit-prompt";
    prompt.textContent = promptText;
    wrap.appendChild(prompt);

    const nameField = document.createElement("div");
    nameField.className = "field";
    const nameLabel = document.createElement("label");
    nameLabel.setAttribute("for", "elicit-name");
    nameLabel.textContent = "Step";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "elicit-name";
    nameInput.setAttribute("aria-describedby", "elicit-prompt");
    nameField.append(nameLabel, nameInput);
    wrap.appendChild(nameField);

    const minsField = document.createElement("div");
    minsField.className = "field field--narrow";
    const minsLabel = document.createElement("label");
    minsLabel.setAttribute("for", "elicit-mins");
    minsLabel.textContent = "Minutes";
    const minsInput = document.createElement("input");
    minsInput.type = "number";
    minsInput.id = "elicit-mins";
    minsInput.min = "1";
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

    function selectHands(value) {
      handsValue = value;
      handsOnBtn.setAttribute("aria-pressed", String(value === true));
      handsOnBtn.classList.toggle("hands-toggle__btn--selected", value === true);
      unattendedBtn.setAttribute("aria-pressed", String(value === false));
      unattendedBtn.classList.toggle("hands-toggle__btn--selected", value === false);
      updateAddEnabled();
    }

    handsOnBtn.addEventListener("click", () => selectHands(true));
    unattendedBtn.addEventListener("click", () => selectHands(false));

    toggleGroup.append(handsOnBtn, unattendedBtn);
    toggleField.appendChild(toggleGroup);
    wrap.appendChild(toggleField);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn";
    addBtn.textContent = "Add step";
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
      state.time.steps.unshift({
        id: newId(),
        name: nameInput.value.trim(),
        mins: Number(minsInput.value),
        hands: handsValue,
        lane: null,
        par: null,
        prep: [],
      });
      persist();
      render();
      const freshNameInput = document.getElementById("elicit-name");
      if (freshNameInput) freshNameInput.focus();
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

  function buildReviewList() {
    const wrap = document.createElement("div");
    wrap.className = "step-review";

    const heading = document.createElement("h3");
    heading.textContent = "Your plan so far";
    wrap.appendChild(heading);

    const list = document.createElement("ol");
    list.className = "step-review__list";

    state.time.steps.forEach((step) => {
      const li = document.createElement("li");

      const name = document.createElement("span");
      name.className = "step-review__name";
      name.textContent = step.name;
      li.appendChild(name);

      const mins = document.createElement("span");
      mins.className = "step-review__mins";
      mins.textContent = `${step.mins} min`;
      li.appendChild(mins);

      const tag = document.createElement("span");
      tag.className = `step-review__tag ${step.hands ? "step-review__tag--hands" : "step-review__tag--unattended"}`;
      tag.textContent = handsLabel(step.hands);
      li.appendChild(tag);

      if (!state.time.elicitationDone) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "step-review__remove no-print";
        removeBtn.setAttribute("aria-label", `Remove ${step.name}`);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => {
          const idx = state.time.steps.indexOf(step);
          if (idx !== -1) state.time.steps.splice(idx, 1);
          // Clear any pairing that pointed at the step we just removed —
          // its window no longer exists.
          for (const other of state.time.steps) {
            if (other.par === step.id) other.par = null;
          }
          persist();
          render();
        });
        li.appendChild(removeBtn);
      }

      list.appendChild(li);
    });

    wrap.appendChild(list);
    return wrap;
  }

  function buildDetailsPhase() {
    const wrap = document.createElement("div");
    wrap.className = "details-phase";

    const heading = document.createElement("p");
    heading.className = "elicit-prompt no-print";
    heading.textContent =
      "Anything else you need to do to get ready for each step? Add quick reminders — these don't get their own time slot.";
    wrap.appendChild(heading);

    const list = document.createElement("div");
    list.className = "details-list";

    state.time.steps.forEach((step, index) => {
      const row = document.createElement("div");
      row.className = "details-step";

      const header = document.createElement("div");
      header.className = "details-step__header";

      const name = document.createElement("span");
      name.className = "details-step__name";
      name.textContent = step.name;
      header.appendChild(name);

      const tag = document.createElement("span");
      tag.className = `step-review__tag ${step.hands ? "step-review__tag--hands" : "step-review__tag--unattended"}`;
      tag.textContent = handsLabel(step.hands);
      header.appendChild(tag);

      row.appendChild(header);

      if (step.prep.length > 0) {
        const prepList = document.createElement("ul");
        prepList.className = "details-step__prep-list";
        step.prep.forEach((item, itemIndex) => {
          const li = document.createElement("li");

          const span = document.createElement("span");
          span.textContent = item;
          li.appendChild(span);

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "details-step__prep-remove no-print";
          removeBtn.setAttribute("aria-label", `Remove ${item}`);
          removeBtn.textContent = "×";
          removeBtn.addEventListener("click", () => {
            step.prep.splice(itemIndex, 1);
            persist();
            render();
          });
          li.appendChild(removeBtn);

          prepList.appendChild(li);
        });
        row.appendChild(prepList);
      }

      const entryRow = document.createElement("div");
      entryRow.className = "details-step__entry no-print";
      const entryInput = document.createElement("input");
      entryInput.type = "text";
      entryInput.id = `prep-input-${index}`;
      entryInput.placeholder = "Add a reminder, press Enter";
      entryInput.setAttribute("aria-label", `Add prep reminder for ${step.name}`);
      entryInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const value = entryInput.value.trim();
          if (!value) return;
          step.prep.push(value);
          persist();
          entryInput.value = "";
          withFocusPreserved(render);
        }
      });
      entryRow.appendChild(entryInput);
      row.appendChild(entryRow);

      list.appendChild(row);
    });

    wrap.appendChild(list);
    return wrap;
  }

  function buildFooterControls() {
    const wrap = document.createElement("div");
    wrap.className = "elicit-footer no-print";

    if (!state.time.elicitationDone) {
      if (state.time.steps.length > 0) {
        const doneBtn = document.createElement("button");
        doneBtn.type = "button";
        doneBtn.className = "btn btn--secondary";
        doneBtn.textContent = "I'm done adding steps";
        doneBtn.addEventListener("click", () => {
          state.time.elicitationDone = true;
          persist();
          render();
        });
        wrap.appendChild(doneBtn);
      }
    } else if (!state.time.detailsDone) {
      const backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "btn btn--small";
      backBtn.textContent = "Back to steps";
      backBtn.addEventListener("click", () => {
        state.time.elicitationDone = false;
        persist();
        render();
      });
      wrap.appendChild(backBtn);

      const boardBtn = document.createElement("button");
      boardBtn.type = "button";
      boardBtn.className = "btn btn--secondary";
      boardBtn.textContent = "Build my board";
      boardBtn.addEventListener("click", () => {
        state.time.detailsDone = true;
        persist();
        render();
      });
      wrap.appendChild(boardBtn);
    } else {
      const editStepsBtn = document.createElement("button");
      editStepsBtn.type = "button";
      editStepsBtn.className = "btn btn--small";
      editStepsBtn.textContent = "Edit steps";
      editStepsBtn.addEventListener("click", () => {
        state.time.elicitationDone = false;
        persist();
        render();
      });
      wrap.appendChild(editStepsBtn);

      const editPrepBtn = document.createElement("button");
      editPrepBtn.type = "button";
      editPrepBtn.className = "btn btn--small";
      editPrepBtn.textContent = "Edit prep list";
      editPrepBtn.addEventListener("click", () => {
        state.time.detailsDone = false;
        persist();
        render();
      });
      wrap.appendChild(editPrepBtn);
    }

    return wrap;
  }

  render();
}
