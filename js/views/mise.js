// Section 4 — Mise en place.
//
// The thing the app is named for, and the only section that could not have come
// earlier: a bowl is a *moment*, and moments are steps. Until the method exists
// there is nothing to group ingredients around.
//
// Assignment is a dropdown per ingredient rather than anything dragged. It is
// keyboard-reachable, it works on a touchscreen Chromebook with a trackpad, and
// it never loses an ingredient to a dropped drag.

import {
  addBowl, removeBowl, ingredientsForRecipe, ingredientsInBowl, stepById,
} from "../model.js";
import { h, field, button, removeButton } from "../dom.js";

const NEW_BOWL = "__new";
const LOOSE = "";

export function status(plan) {
  if (plan.ingredients.length === 0) return "";
  const loose = plan.ingredients.filter((i) => !i.bowlId).length;
  const bowls = plan.bowls.length;
  return `${bowls} bowl${bowls === 1 ? "" : "s"} · ${loose} straight from the container`;
}

export function filled(plan) {
  return plan.bowls.length > 0 || plan.ingredients.some((i) => i.bowlId);
}

export function render(ctx) {
  const { plan } = ctx;

  if (plan.ingredients.length === 0) {
    return h("p", { class: "empty-note",
      text: "List your ingredients in section 2 first, then come back and sort them into bowls." });
  }

  return h("div", null,
    h("p", { class: "subsection__intro no-print",
      text: "Which of these go in at the same moment? Put those in a bowl together. Not everything needs one — oil straight from the bottle is fine, and saying so is an answer." }),

    h("div", { class: "mise" },
      h("div", { class: "mise__ingredients" },
        h("h3", { text: "Your ingredients" }),
        plan.recipes.map((recipe) => {
          const items = ingredientsForRecipe(plan, recipe.id);
          if (items.length === 0) return null;
          return h("div", null,
            plan.recipes.length > 1 && h("h4", { text: recipe.name || "Untitled recipe" }),
            h("ul", { class: "assign-list" }, items.map((ing) => renderAssignRow(ctx, ing))));
        })),

      h("div", { class: "mise__bowls" },
        h("h3", null, "Bowls",
          button("+ Add bowl", () => { addBowl(ctx.plan); ctx.refresh(); },
            { class: "btn btn--small no-print" })),
        plan.bowls.length === 0
          ? h("p", { class: "empty-note no-print",
              text: "No bowls yet. Send an ingredient to a new bowl using the dropdown beside it." })
          : h("div", { class: "bowl-grid" }, plan.bowls.map((bowl) => renderBowl(ctx, bowl))))));
}

// --- One ingredient -------------------------------------------------------

function renderAssignRow(ctx, ingredient) {
  const { plan, refresh } = ctx;

  const onChange = (e) => {
    if (e.target.value === NEW_BOWL) {
      const bowl = addBowl(plan);
      ingredient.bowlId = bowl.id;
      refresh();
      // Straight into naming it — an unnamed bowl helps nobody at the bench.
      const label = document.getElementById(`bowl-label-${bowl.id}`);
      if (label) label.focus({ preventScroll: true });
      return;
    }
    ingredient.bowlId = e.target.value || null;
    refresh();
  };

  return h("li", { class: `assign-list__item${ingredient.bowlId ? " assign-list__item--placed" : ""}` },
    h("span", { class: "assign-list__text", text: ingredient.text }),
    h("select", {
      id: `assign-${ingredient.id}`,
      class: "assign-list__select no-print",
      "aria-label": `Which bowl for ${ingredient.text}?`,
      onChange,
    },
    h("option", { value: LOOSE, selected: !ingredient.bowlId, text: "No bowl needed" }),
    plan.bowls.map((bowl, index) => h("option", {
      value: bowl.id,
      selected: ingredient.bowlId === bowl.id,
      text: bowl.label.trim() || `Bowl ${index + 1}`,
    })),
    h("option", { value: NEW_BOWL, text: "+ New bowl…" })));
}

// --- One bowl -------------------------------------------------------------

function renderBowl(ctx, bowl) {
  const { plan, save, refresh } = ctx;
  const contents = ingredientsInBowl(plan, bowl.id);
  const index = plan.bowls.indexOf(bowl);

  // A bowl attached to a step is what lets the board open with "before you
  // start, these have to be prepped" — the actual definition of mise en place,
  // and the thing the previous build collected but never used.
  const stepSelect = h("select", {
    id: `bowl-step-${bowl.id}`,
    onChange: (e) => { bowl.stepId = e.target.value || null; refresh(); },
  },
  h("option", { value: "", selected: !bowl.stepId, text: "Not sure yet" }),
  plan.steps.map((step) => h("option", {
    value: step.id,
    selected: bowl.stepId === step.id,
    text: step.name,
  })));

  const orphaned = bowl.stepId && !stepById(plan, bowl.stepId);

  return h("div", { class: "bowl" },
    h("div", { class: "bowl__head" },
      h("input", {
        id: `bowl-label-${bowl.id}`,
        type: "text",
        class: "bowl__label",
        autocomplete: "off",
        placeholder: `Bowl ${index + 1}`,
        "aria-label": `Label for bowl ${index + 1}`,
        value: bowl.label,
        onInput: (e) => { bowl.label = e.target.value; save(); },
        onChange: refresh,
      }),
      removeButton(bowl.label || `bowl ${index + 1}`, () => { removeBowl(plan, bowl.id); refresh(); })),

    contents.length === 0
      ? h("p", { class: "bowl__empty", text: "Nothing in it yet." })
      : h("ul", { class: "bowl__items" }, contents.map((ing) =>
          h("li", null,
            h("span", { text: ing.text }),
            removeButton(`${ing.text} from this bowl`, () => { ing.bowlId = null; refresh(); },
              "icon-btn icon-btn--quiet")))),

    plan.steps.length > 0 && field("Ready before", stepSelect, { class: "field field--wide" }),
    orphaned && h("p", { class: "hint", text: "That step was deleted — pick another." }));
}
