// Section 3 — Equipment.
//
// A recipe lists its ingredients and it lists its method. It never lists its
// equipment: you find that by reading the method and noticing what it assumes.
// So this is a second pass over steps that already exist, not a guess made
// before any of them do — which is the order the previous build used, and the
// reason its equipment picker was usually left empty.
//
// It earns its place twice over. It produces the pull list, and it is what puts
// a step on a lane: the station belongs to the equipment, so "roast the
// vegetables" is an oven step because it uses a sheet pan, not because the app
// found the word "roast".
//
// The app does read the wording, though — and says so. Every step arrives with
// its equipment already guessed at, shown as a guess, one tap from being
// accepted and one tap from being dropped. That keeps the teaching (the student
// still sees and decides the mapping) while turning a third walk through the
// recipe into a review. Nothing is attached until they say so.

import { STATIONS, EQUIPMENT_PALETTE } from "../config.js";
import {
  addEquipment, removeEquipment, stepsForRecipe, equipmentById,
  stepMins, handsMins, waitingMins, hasWaiting, isUnestimated,
  suggestedEquipment, acceptSuggestion,
} from "../model.js";
import { formatDuration } from "../time.js";
import { laneForStep } from "../schedule.js";
import { h, button, removeButton } from "../dom.js";

export function status(plan) {
  if (plan.steps.length === 0) return "";
  const unanswered = plan.steps.filter((s) => hasWaiting(s) && !answered(s)).length;
  if (unanswered > 0) return `${unanswered} step${unanswered === 1 ? "" : "s"} with waiting time unanswered`;
  return `${plan.equipment.length} item${plan.equipment.length === 1 ? "" : "s"} to pull`;
}

// Every guess still on the table, step by step. Computed once per render and
// handed down, so the accept-everything button and the chips can never disagree
// about what was offered.
function pendingSuggestions(plan) {
  const out = new Map();
  for (const step of plan.steps) {
    const names = suggestedEquipment(plan, step);
    if (names.length > 0) out.set(step.id, names);
  }
  return out;
}

// Has this section been used at all? Drives whether it opens on its own.
export function filled(plan) {
  return plan.equipment.length > 0 || plan.steps.some((step) => step.noEquipment);
}

function answered(step) {
  return step.equipmentIds.length > 0 || step.noEquipment;
}

export function render(ctx) {
  const { plan, refresh } = ctx;

  if (plan.steps.length === 0) {
    return h("p", { class: "empty-note",
      text: "Write your method in section 2 first — then come back and read through it for the equipment it assumes." });
  }

  const suggestions = pendingSuggestions(plan);
  const guessed = [...suggestions.values()].reduce((n, names) => n + names.length, 0);

  return h("div", null,
    h("p", { class: "subsection__intro no-print",
      text: "Recipes never list equipment; you have to read the method for it. We've read your steps and guessed — check each one, keep what's right, add what we missed. For anything that runs by itself, this is what puts it on a lane: the sheet pan is what makes roasting an oven job." }),

    // The one-tap path through the whole section, for the student who agrees
    // with every guess. Still their decision, still one action, and every
    // accepted guess becomes ordinary equipment they can drop again.
    guessed > 0 && h("div", { class: "suggest-all no-print" },
      button(`Keep all ${guessed} guess${guessed === 1 ? "" : "es"}`, () => {
        for (const [stepId, names] of suggestions) {
          const step = plan.steps.find((s) => s.id === stepId);
          if (!step) continue;
          for (const name of names) acceptSuggestion(plan, step, name);
        }
        refresh();
      }, { class: "btn btn--small" }),
      h("span", { class: "hint", text: "Then correct the ones that are wrong." })),

    // One shared datalist for every step's box, so the browser does the
    // autocomplete natively — no custom dropdown to get wrong on a touchscreen.
    h("datalist", { id: "equipment-options" },
      EQUIPMENT_PALETTE.map((item) => h("option", { value: item.name }))),

    h("div", { class: "equip-pass" },
      plan.recipes.map((recipe) => {
        const steps = stepsForRecipe(plan, recipe.id);
        if (steps.length === 0) return null;
        return h("div", { class: "equip-pass__recipe" },
          plan.recipes.length > 1 && h("h3", { text: recipe.name || "Untitled recipe" }),
          h("ul", { class: "equip-list" },
            steps.map((step) => renderStep(ctx, step, suggestions.get(step.id) || []))));
      })),

    renderPullList(ctx));
}

// --- One step -------------------------------------------------------------

function renderStep(ctx, step, suggested) {
  const { plan, save, refresh } = ctx;
  const byId = equipmentById(plan);
  const addId = `equip-add-${step.id}`;

  const attach = (name) => {
    const item = addEquipment(plan, name);
    if (!item) return;
    if (!step.equipmentIds.includes(item.id)) step.equipmentIds.push(item.id);
    step.noEquipment = false;
    refresh();
  };

  const commit = (input) => {
    const value = input.value.trim();
    if (!value) return;
    input.value = "";
    attach(value);
    const again = document.getElementById(addId);
    if (again) again.focus({ preventScroll: true });
  };

  // Everything already in the plan, one tap away. After the first couple of
  // steps this is the common path — the second thing to use the sauté pan
  // should not need typing.
  const chips = plan.equipment.map((item) => {
    const selected = step.equipmentIds.includes(item.id);
    return h("button", {
      type: "button",
      class: `chip${selected ? " chip--selected" : ""}`,
      "aria-pressed": String(selected),
      title: `${item.name} — ${item.station}`,
      onClick: () => {
        step.equipmentIds = selected
          ? step.equipmentIds.filter((id) => id !== item.id)
          : [...step.equipmentIds, item.id];
        if (step.equipmentIds.length > 0) step.noEquipment = false;
        refresh();
      },
    }, item.name);
  });

  // "Nothing" is a real answer, not a gap. Resting meat on the counter or
  // letting dough relax is genuinely unattended with nothing running it. The
  // question is where the thing IS while it waits, and the counter is an
  // answer to that.
  const nothingChip = hasWaiting(step) && (() => {
    const selected = step.noEquipment && step.equipmentIds.length === 0;
    return h("button", {
      type: "button",
      class: `chip chip--nothing${selected ? " chip--selected" : ""}`,
      "aria-pressed": String(selected),
      onClick: () => {
        step.noEquipment = !selected;
        if (step.noEquipment) step.equipmentIds = [];
        refresh();
      },
    }, "Nothing — it just sits");
  })();

  // Guesses, drawn as guesses. Dashed rather than solid, and captioned, so a
  // student can never mistake one for something they chose. One tap accepts it;
  // ignoring it costs nothing, because nothing was attached.
  const guesses = suggested.map((name) => h("button", {
    type: "button",
    class: "chip chip--guess",
    "aria-pressed": "false",
    title: `We think this step uses a ${name.toLowerCase()}. Tap to keep it.`,
    onClick: () => { acceptSuggestion(plan, step, name); refresh(); },
  }, `${name}?`));

  const lane = STATIONS.find((s) => s.id === laneForStep(step, byId));
  const needsAnswer = hasWaiting(step) && !answered(step);

  return h("li", { class: `equip-list__item${needsAnswer ? " equip-list__item--todo" : ""}` },
    h("div", { class: "equip-list__step" },
      h("span", { class: "equip-list__name", text: step.name }),
      h("span", { class: "equip-list__mins",
        text: isUnestimated(step) ? "no time yet" : formatDuration(stepMins(step)) }),
      // What the step is actually made of. A step that is nine parts waiting is
      // a very different thing to pull equipment for than one that is all hands.
      handsMins(step) > 0 && h("span", { class: "tag tag--hands",
        text: `${formatDuration(handsMins(step))} hands on` }),
      waitingMins(step) > 0 && h("span", { class: "tag tag--unattended",
        text: `${formatDuration(waitingMins(step))} waiting` }),
      hasWaiting(step) && answered(step) && lane &&
        h("span", { class: "equip-list__lane", text: `→ ${lane.label} lane` })),

    h("div", { class: "equip-list__pick" },
      h("span", { class: "equip-list__prompt",
        text: hasWaiting(step)
          ? "What are you using, and where does it sit while it waits?"
          : "What are you using?" }),
      h("div", { class: "chip-row" }, chips, nothingChip, guesses),
      guesses.length > 0 && h("p", { class: "equip-list__guessed no-print",
        text: "Dashed ones are our guess from the wording of this step. Tap to keep, ignore to drop." }),
      h("div", { class: "inline-add no-print" },
        h("input", {
          id: addId,
          type: "text",
          list: "equipment-options",
          autocomplete: "off",
          placeholder: "Type something else…",
          "aria-label": `Add equipment for ${step.name}`,
          onKeyDown: (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            commit(e.target);
          },
        }),
        button("Add", () => commit(document.getElementById(addId)), { class: "btn btn--small" }))),

    // Not everything worth remembering has a duration. Anything that does —
    // preheating, filling an ice bath — belongs on the timeline as a step, so
    // this stays a small escape hatch and does not ask to be filled in. Hidden
    // until wanted, because an always-visible optional box on every single step
    // is most of what made this section look like work.
    renderNote(ctx, step));
}

// A note the student has already written stays visible; an empty one is a link
// until they ask for it.
const noteOpen = new Set();

function renderNote(ctx, step) {
  const { save, refresh } = ctx;
  if (!step.note && !noteOpen.has(step.id)) {
    return h("div", { class: "equip-list__note no-print" },
      button("+ note", () => {
        noteOpen.add(step.id);
        refresh();
        const again = document.getElementById(`step-note-${step.id}`);
        if (again) again.focus({ preventScroll: true });
      }, { class: "btn btn--tiny btn--secondary" }));
  }
  return h("div", { class: "equip-list__note" },
    h("label", { for: `step-note-${step.id}`, text: "Remember" }),
    h("input", {
      id: `step-note-${step.id}`,
      type: "text",
      autocomplete: "off",
      placeholder: "e.g. get plates down",
      value: step.note,
      onInput: (e) => { step.note = e.target.value; save(); },
    }));
}

// --- The pull list --------------------------------------------------------

// The output of the pass, and the only part of this section that is any use
// standing at a cupboard. Grouped by station, because that is how a kitchen is
// laid out, and tickable, because it is a checklist.
function renderPullList(ctx) {
  const { plan, save, refresh } = ctx;
  if (plan.equipment.length === 0) return h("div");

  const groups = STATIONS
    .map((station) => ({
      station,
      items: plan.equipment.filter((item) => item.station === station.id),
    }))
    .filter((group) => group.items.length > 0);

  const pulled = plan.equipment.filter((item) => item.pulled).length;

  return h("div", { class: "pull-list" },
    h("h3", null, "Pull list",
      h("span", { class: "pull-list__count no-print",
        text: `${pulled} of ${plan.equipment.length} pulled` })),
    h("p", { class: "subsection__intro no-print",
      text: "Everything your plan needs, from your own steps. Tick it off as it comes out of the cupboard." }),

    h("div", { class: "pull-list__groups" }, groups.map((group) =>
      h("div", { class: "pull-list__group" },
        h("h4", { text: group.station.label }),
        h("ul", null, group.items.map((item) => h("li", { class: "pull-list__item" },
          h("input", {
            id: `pulled-${item.id}`,
            type: "checkbox",
            checked: item.pulled,
            onChange: (e) => { item.pulled = e.target.checked; save(); refresh(); },
          }),
          h("label", { for: `pulled-${item.id}`, text: item.name }),
          removeButton(item.name, () => { removeEquipment(plan, item.id); refresh(); }))))))));
}
