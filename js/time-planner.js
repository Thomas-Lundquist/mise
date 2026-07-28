// Section 04 — Time planner, scaffolded mode. Four phases:
//   0. Name the separate parts of the dish that need to be ready at the same
//      time (protein, starch, sauce...). A dish with one part skips straight
//      past this with no extra UI — see buildComponentsPhase.
//   1. Backward elicitation of major steps, once per part (this is the
//      actual time-planning skill being taught — see docs/design-brief.md
//      and the build spec). Every part's chain is built backward from the
//      same plate-up time, which is what makes "these need to finish
//      together" true by construction rather than something the app has to
//      compute or decide.
//   2. A forward pass to attach quick untimed prep reminders to each major
//      step. These are NOT scheduled — no duration, no hands/unattended
//      flag, never shown on the board. They exist so the tedious backward
//      "what happens right before X?" interrogation only has to cover the
//      steps that actually shape the timeline, not every small task.
//   3. The board (board.js).
//
// Steps are stored in forward chronological order: each new major is
// unshifted onto the front of the shared state.time.steps array, and
// because every new answer is chronologically earlier than everything
// already entered for its component, filtering that array down to one
// component's steps always yields that component's own steps in correct
// forward order too — interleaving entry order across components doesn't
// break this. See the components phase for how `component` gets assigned.

import { initBoard } from "./board.js";
import { newId } from "./time-utils.js";

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

  function activeComponent() {
    return state.time.components[state.time.activeComponentIndex] || null;
  }

  function stepsFor(componentId) {
    return state.time.steps.filter((s) => s.component === componentId);
  }

  function render() {
    container.innerHTML = "";

    if (!state.time.componentsNamingDone) {
      container.appendChild(buildComponentsPhase());
    } else if (!state.time.elicitationDone) {
      if (state.time.components.length > 1) container.appendChild(buildComponentProgress());
      container.appendChild(buildPromptForm());
      const componentSteps = stepsFor(activeComponent().id);
      if (componentSteps.length > 0) container.appendChild(buildReviewList(componentSteps));
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

  // ---------- Phase 0: name the parts ----------

  function buildComponentsPhase() {
    const wrap = document.createElement("div");
    wrap.className = "elicit-form no-print";

    const prompt = document.createElement("p");
    prompt.className = "elicit-prompt";
    prompt.textContent =
      "What are the separate parts of this dish that need to be ready at the same time?";
    wrap.appendChild(prompt);

    const sub = document.createElement("p");
    sub.className = "elicit-subtext";
    sub.textContent = "Think protein, starch, sauce, vegetable — anything that has its own steps.";
    wrap.appendChild(sub);

    const entryRow = document.createElement("div");
    entryRow.className = "inline-add";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "component-name-input";
    nameInput.placeholder = "e.g. Seared chicken";
    nameInput.setAttribute("aria-label", "Part of the dish");
    entryRow.appendChild(nameInput);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn--small";
    addBtn.textContent = "Add part";
    entryRow.appendChild(addBtn);
    wrap.appendChild(entryRow);

    function addComponent() {
      const value = nameInput.value.trim();
      if (!value) return;
      state.time.components.push({ id: newId("component"), name: value });
      persist();
      nameInput.value = "";
      withFocusPreserved(render);
    }

    addBtn.addEventListener("click", addComponent);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addComponent();
      }
    });

    if (state.time.components.length > 0) {
      const list = document.createElement("ul");
      list.className = "component-list";
      state.time.components.forEach((component, index) => {
        const li = document.createElement("li");
        li.className = "component-list__item";

        const name = document.createElement("span");
        name.textContent = component.name;
        li.appendChild(name);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "component-list__remove no-print";
        removeBtn.setAttribute("aria-label", `Remove ${component.name}`);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => {
          state.time.components.splice(index, 1);
          persist();
          render();
        });
        li.appendChild(removeBtn);

        list.appendChild(li);
      });
      wrap.appendChild(list);
    }

    const footer = document.createElement("div");
    footer.className = "elicit-footer";

    if (state.time.components.length > 0) {
      const startBtn = document.createElement("button");
      startBtn.type = "button";
      startBtn.className = "btn";
      startBtn.textContent = "Start planning";
      startBtn.addEventListener("click", () => {
        state.time.componentsNamingDone = true;
        state.time.activeComponentIndex = 0;
        persist();
        render();
      });
      footer.appendChild(startBtn);
    } else {
      const skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = "btn btn--secondary";
      skipBtn.textContent = "It's all one thing";
      skipBtn.addEventListener("click", () => {
        state.time.components.push({ id: newId("component"), name: state.meta.recipe || "The dish" });
        state.time.componentsNamingDone = true;
        state.time.activeComponentIndex = 0;
        persist();
        render();
      });
      footer.appendChild(skipBtn);
    }

    wrap.appendChild(footer);
    return wrap;
  }

  // A quiet wizard strip so a student planning several parts always knows
  // where they are, and can jump back to an earlier part without redoing
  // the "I'm done" click-through.
  function buildComponentProgress() {
    const wrap = document.createElement("nav");
    wrap.className = "component-progress no-print";
    wrap.setAttribute("aria-label", "Parts of the dish");

    state.time.components.forEach((component, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const isActive = index === state.time.activeComponentIndex;
      const isDone = index < state.time.activeComponentIndex;
      btn.className = `component-progress__item${isActive ? " component-progress__item--active" : ""}${
        isDone ? " component-progress__item--done" : ""
      }`;
      btn.textContent = component.name;
      btn.setAttribute("aria-current", isActive ? "step" : "false");
      btn.addEventListener("click", () => {
        state.time.activeComponentIndex = index;
        persist();
        render();
      });
      wrap.appendChild(btn);
    });

    return wrap;
  }

  // ---------- Phase 1: backward elicitation, one component at a time ----------

  function buildPromptForm() {
    const wrap = document.createElement("div");
    wrap.className = "elicit-form no-print";

    const component = activeComponent();
    const componentSteps = stepsFor(component.id);
    const singleComponent = state.time.components.length === 1;

    let promptText;
    if (componentSteps.length === 0) {
      promptText = singleComponent
        ? "What is the very last thing you do before it goes on the plate?"
        : `What's the last thing you do to "${component.name}" before it's ready to plate?`;
    } else {
      promptText = `And what happens right before "${componentSteps[0].name}"?`;
    }

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
    nameInput.placeholder = componentSteps.length === 0 ? "e.g. Plate and garnish" : "e.g. Rest the meat";
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

    const toggleHint = document.createElement("p");
    toggleHint.className = "toggle-hint";
    toggleHint.textContent = "This decides whether it gets a window on your board.";
    toggleField.appendChild(toggleHint);

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
        id: newId("step"),
        component: component.id,
        name: nameInput.value.trim(),
        mins: Number(minsInput.value),
        hands: handsValue,
        lane: null,
        par: null,
        prep: [],
        windowNotes: [],
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

  function buildReviewList(componentSteps) {
    const wrap = document.createElement("div");
    wrap.className = "step-review";

    const heading = document.createElement("h3");
    heading.textContent =
      state.time.components.length > 1 ? `Your plan so far — ${activeComponent().name}` : "Your plan so far";
    wrap.appendChild(heading);

    const list = document.createElement("ol");
    list.className = "step-review__list";

    componentSteps.forEach((step) => {
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

  // ---------- Phase 1.5: untimed prep reminders ----------

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

    const showComponent = state.time.components.length > 1;
    const componentsById = new Map(state.time.components.map((c) => [c.id, c]));

    state.time.steps.forEach((step, index) => {
      const row = document.createElement("div");
      row.className = "details-step";

      const header = document.createElement("div");
      header.className = "details-step__header";

      if (showComponent) {
        const componentTag = document.createElement("span");
        componentTag.className = "details-step__component";
        const component = componentsById.get(step.component);
        componentTag.textContent = component ? component.name : "";
        header.appendChild(componentTag);
      }

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

  // ---------- Footer controls, per phase ----------

  function buildFooterControls() {
    const wrap = document.createElement("div");
    wrap.className = "elicit-footer no-print";

    if (!state.time.elicitationDone) {
      const component = activeComponent();
      const componentSteps = stepsFor(component.id);
      const isLastComponent = state.time.activeComponentIndex === state.time.components.length - 1;

      if (state.time.activeComponentIndex > 0) {
        const backBtn = document.createElement("button");
        backBtn.type = "button";
        backBtn.className = "btn btn--small";
        backBtn.textContent = "Back a part";
        backBtn.addEventListener("click", () => {
          state.time.activeComponentIndex -= 1;
          persist();
          render();
        });
        wrap.appendChild(backBtn);
      }

      if (componentSteps.length > 0) {
        const doneBtn = document.createElement("button");
        doneBtn.type = "button";
        doneBtn.className = "btn btn--secondary";
        doneBtn.textContent = isLastComponent ? "I'm done adding steps" : `Done with ${component.name}`;
        doneBtn.addEventListener("click", () => {
          if (isLastComponent) {
            state.time.elicitationDone = true;
          } else {
            state.time.activeComponentIndex += 1;
          }
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
        state.time.activeComponentIndex = state.time.components.length - 1;
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
        state.time.activeComponentIndex = 0;
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
