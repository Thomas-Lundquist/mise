// Section 04 — Time planner, scaffolded mode, phase 1 (backward elicitation).
// Phase 2 (the board) is a separate pass; this module currently renders a
// read-only summary list once elicitation is marked done.
//
// Steps are stored in forward chronological order: each new answer is
// unshifted onto the front of the array, and because every new answer is
// chronologically earlier than everything already entered, the array is
// always in correct forward order, growing earlier at index 0 as the
// conversation continues. state.time.steps[0] is therefore always "the step
// most recently entered" — the thing the next prompt asks about.

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function handsLabel(hands) {
  return hands ? "Hands on it" : "Runs by itself";
}

export function initTimePlanner(state, persist) {
  const container = document.getElementById("time-planner");

  function render() {
    container.innerHTML = "";

    if (!state.time.elicitationDone) {
      container.appendChild(buildPromptForm());
    }

    if (state.time.steps.length > 0) {
      container.appendChild(buildReviewList());
    }

    container.appendChild(buildFooterControls());
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
    handsOnBtn.className = "hands-toggle__btn";
    handsOnBtn.textContent = "Hands on it (chopping, stirring, searing)";
    handsOnBtn.setAttribute("aria-pressed", "false");

    const unattendedBtn = document.createElement("button");
    unattendedBtn.type = "button";
    unattendedBtn.className = "hands-toggle__btn";
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
      tag.className = "step-review__tag";
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

  function buildFooterControls() {
    const wrap = document.createElement("div");
    wrap.className = "elicit-footer no-print";

    if (!state.time.elicitationDone) {
      if (state.time.steps.length > 0) {
        const doneBtn = document.createElement("button");
        doneBtn.type = "button";
        doneBtn.className = "btn btn--secondary";
        doneBtn.textContent = "That's my first step — build my board";
        doneBtn.addEventListener("click", () => {
          state.time.elicitationDone = true;
          persist();
          render();
        });
        wrap.appendChild(doneBtn);
      }
    } else {
      const note = document.createElement("p");
      note.className = "placeholder-note";
      note.textContent = "Board view coming next.";
      wrap.appendChild(note);

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--small";
      editBtn.textContent = "Edit steps";
      editBtn.addEventListener("click", () => {
        state.time.elicitationDone = false;
        persist();
        render();
      });
      wrap.appendChild(editBtn);
    }

    return wrap;
  }

  render();
}
