// Section 2 — The recipe.
//
// Filled in while reading, in the order a recipe is written: the header block,
// then the ingredients, then the method. Steps are typed FORWARD, exactly as
// they appear on the card. The app schedules them backward from plate-up, which
// is arithmetic it does on its own and does not care which end they were typed
// from — so the student never has to stop reading and flip their thinking round.
//
// Two questions get asked about each step. How long it takes is a READING task
// — the card states it, and reading it off the page is the skill, so the app
// asks what the recipe says rather than inviting a guess, and never refuses a
// step because the card was silent.
//
// The shape of the step is the question the recipe does not answer, and it is
// the hinge of the entire app: "starts, then runs by itself" is what lets
// anything overlap at all.

import {
  createStep, appendStep, insertStepBefore, removeStep, moveStep,
  addSegment, removeSegment, moveSegment, stepMins, isUnestimated, setStatedMinutes,
  stepsForRecipe, ingredientsForRecipe, addIngredient, removeIngredient,
  addRecipe, removeRecipe,
} from "../model.js";
import { formatDuration, parseStatedMinutes } from "../time.js";
import { h, field, button, removeButton } from "../dom.js";

// Draft rows, one per recipe. Deliberately not persisted and deliberately not
// in the plan: a half-typed step is not a step. Kept across re-renders so that
// editing something else on the page does not throw away what is being typed.
const drafts = new Map();

const emptyDraft = () => ({ name: "", mins: "", shape: null, prep: false });

function draftFor(recipeId) {
  if (!drafts.has(recipeId)) drafts.set(recipeId, emptyDraft());
  return drafts.get(recipeId);
}

// Confirmation of a delete that would take steps with it. Transient.
let pendingDeleteRecipeId = null;

export function status(plan) {
  const steps = plan.steps.length;
  const ingredients = plan.ingredients.length;
  if (steps === 0 && ingredients === 0) return "";
  return `${ingredients} ingredient${ingredients === 1 ? "" : "s"} · ${steps} step${steps === 1 ? "" : "s"}`;
}

export function render(ctx) {
  const { plan } = ctx;
  return h("div", null,
    plan.recipes.map((recipe) => renderRecipe(ctx, recipe)),
    button("+ Another recipe", () => { addRecipe(ctx.plan); ctx.refresh(); },
      { class: "btn btn--small btn--secondary no-print" }),
    renderReadCheck(ctx));
}

// --- One recipe card ------------------------------------------------------

function renderRecipe(ctx, recipe) {
  const { plan, save, refresh } = ctx;
  const only = plan.recipes.length === 1;

  const header = h("div", { class: "recipe__header" },
    field("Recipe", h("input", {
      id: `recipe-name-${recipe.id}`,
      type: "text",
      autocomplete: "off",
      placeholder: "What are you making?",
      value: recipe.name,
      onInput: (e) => { recipe.name = e.target.value; save(); },
    }), { class: "field field--wide" }),

    // Straight off the recipe header. The board holds it up against the plan
    // the student actually builds, which is the moment the lesson lands:
    // printed times assume the mise is already done.
    claimField(ctx, recipe, "prepMins", "Recipe says prep"),
    claimField(ctx, recipe, "cookMins", "Recipe says cook"),

    !only && removeButton(recipe.name || "this recipe", () => {
      const owned = stepsForRecipe(plan, recipe.id).length + ingredientsForRecipe(plan, recipe.id).length;
      if (owned === 0) {
        removeRecipe(plan, recipe.id);
      } else {
        pendingDeleteRecipeId = recipe.id;
      }
      refresh();
    }));

  return h("article", { class: "recipe" },
    header,
    pendingDeleteRecipeId === recipe.id && renderDeleteConfirm(ctx, recipe),
    renderIngredients(ctx, recipe),
    renderMethod(ctx, recipe));
}

function claimField(ctx, recipe, key, label) {
  const id = `recipe-${key}-${recipe.id}`;
  return field(label, h("input", {
    id,
    type: "number",
    min: "0",
    inputMode: "numeric",
    placeholder: "min",
    value: recipe[key] === null ? "" : String(recipe[key]),
    onInput: (e) => {
      const value = Number(e.target.value);
      recipe[key] = e.target.value === "" || !Number.isFinite(value) ? null : value;
      ctx.save();
    },
    onChange: ctx.refresh,
  }), { class: "field field--tiny" });
}

// Deleting a recipe that has work in it is never silent — both exits are
// offered, because losing steps to a tidy-up is never the right outcome.
function renderDeleteConfirm(ctx, recipe) {
  const { plan, refresh } = ctx;
  const steps = stepsForRecipe(plan, recipe.id).length;
  const ingredients = ingredientsForRecipe(plan, recipe.id).length;
  const others = plan.recipes.filter((r) => r.id !== recipe.id);
  const selectId = `move-target-${recipe.id}`;

  const finish = (moveTo) => {
    removeRecipe(plan, recipe.id, { moveTo });
    pendingDeleteRecipeId = null;
    refresh();
  };

  return h("div", { class: "confirm no-print" },
    h("p", { text: `"${recipe.name || "This recipe"}" has ${steps} step${steps === 1 ? "" : "s"} and ${ingredients} ingredient${ingredients === 1 ? "" : "s"}. What should happen to them?` }),
    h("div", { class: "confirm__actions" },
      others.length > 0 && h("select", { id: selectId, "aria-label": "Move them to" },
        others.map((other) => h("option", { value: other.id, text: other.name || "Untitled recipe" }))),
      others.length > 0 && button("Move them", () => {
        finish(document.getElementById(selectId).value);
      }, { class: "btn btn--small" }),
      button("Delete them too", () => finish(null), { class: "btn btn--small btn--danger" }),
      button("Cancel", () => { pendingDeleteRecipeId = null; refresh(); },
        { class: "btn btn--small btn--secondary" })));
}

// --- Ingredients ----------------------------------------------------------

function renderIngredients(ctx, recipe) {
  const { plan, save, refresh } = ctx;
  const items = ingredientsForRecipe(plan, recipe.id);
  const addId = `ing-add-${recipe.id}`;

  const commit = (input) => {
    const value = input.value.trim();
    if (!value) return;
    addIngredient(plan, recipe.id, value);
    input.value = "";
    refresh();
  };

  return h("div", { class: "subsection" },
    h("h3", { text: "Ingredients" }),
    h("p", { class: "subsection__intro no-print",
      text: "Type them out as you read them — quantities and all. You'll sort them into bowls in section 4, and having them listed here means you won't be typing them twice." }),

    items.length > 0 && h("ol", { class: "ingredient-list" },
      items.map((ingredient) => h("li", { class: "ingredient-list__item" },
        h("input", {
          id: `ing-${ingredient.id}`,
          type: "text",
          class: "ingredient-list__text",
          "aria-label": "Ingredient",
          value: ingredient.text,
          onInput: (e) => { ingredient.text = e.target.value; save(); },
        }),
        removeButton(ingredient.text || "ingredient", () => {
          removeIngredient(plan, ingredient.id);
          refresh();
        })))),

    h("div", { class: "inline-add no-print" },
      h("input", {
        id: addId,
        type: "text",
        autocomplete: "off",
        placeholder: items.length === 0 ? "e.g. 2 tbsp butter" : "Next ingredient…",
        "aria-label": "Add an ingredient",
        onKeyDown: (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          commit(e.target);
        },
      }),
      button("Add", () => commit(document.getElementById(addId)), { class: "btn btn--small" })));
}

// --- The method -----------------------------------------------------------

function renderMethod(ctx, recipe) {
  const { plan } = ctx;
  const steps = stepsForRecipe(plan, recipe.id);

  return h("div", { class: "subsection" },
    h("h3", { text: "Method" }),
    h("p", { class: "subsection__intro no-print",
      text: "Type each step as you read it, in the recipe's own order. The times come off the card — read them, don't guess them. The one thing the card won't tell you is whether your hands are busy the whole time, which is the answer that lets anything overlap." }),

    steps.length > 0 && h("ol", { class: "step-list" },
      steps.map((step, index) => renderStepRow(ctx, step, index, steps.length))),

    renderAddStep(ctx, recipe),
    steps.length >= 3 && renderReviewNudge());
}

// A step is what you accomplish; its timed lines are what you actually do.
//
// One line is the normal case and reads exactly like a plain step, with the
// duration and the hands question on the step's own row. The moment there are
// two, those move down into the list and the step row carries the total — which
// is the shape a recipe blog already uses, and the shape a real instruction
// actually has.
function renderStepRow(ctx, step, index, total) {
  const { plan, save, refresh } = ctx;
  const single = step.segments.length === 1;

  const addLine = (afterSegmentId) => {
    const seg = addSegment(plan, step.id, { afterSegmentId, mins: 1, hands: !afterSegmentId });
    refresh();
    const again = document.getElementById(`seg-mins-${seg.id}`);
    if (again) again.focus({ preventScroll: true });
  };

  const row = h("div", { class: "step-row" },
    h("input", {
      id: `step-name-${step.id}`,
      type: "text",
      class: "step-row__name",
      "aria-label": `Step ${index + 1}`,
      value: step.name,
      onInput: (e) => { step.name = e.target.value; save(); },
    }),

    single
      ? statedField(ctx, step, `How long the recipe says for ${step.name}`)
      : h("span", { class: "step-row__total", text: `${formatDuration(stepMins(step))} total` }),

    single
      ? handsToggle(step.segments[0].hands, (value) => { step.segments[0].hands = value; refresh(); },
          `hands-${step.segments[0].id}`, `Are your hands on "${step.name}"?`)
      : h("span"),

    prepCheck(step, refresh),

    h("div", { class: "step-row__controls no-print" },
      iconButton("↑", `Move ${step.name} earlier`, index === 0,
        () => { if (moveStep(plan, step.id, -1)) refresh(); }),
      iconButton("↓", `Move ${step.name} later`, index === total - 1,
        () => { if (moveStep(plan, step.id, 1)) refresh(); }),
      iconButton("+", `Insert a step before ${step.name}`, false, () => {
        insertStepBefore(plan, createStep({ recipeId: step.recipeId, name: "", mins: 1, hands: true }), step.id);
        refresh();
      }),
      // Most steps are one thing and never need this, so it is an affordance
      // rather than a button taking up a row of its own under every step.
      single && iconButton("⋮", `Break "${step.name}" into separate timings`, false, () => addLine(null)),
      removeButton(step.name || "step", () => { removeStep(plan, step.id); refresh(); })));

  return h("li", { class: `step-list__item${isUnestimated(step) ? " step-list__item--untimed" : ""}` },
    row,
    // Which number a range was planned on, and the fact that a step still has
    // no time. Both have to be visible: the app plans for the slow end, and a
    // student is entitled to know that is what it did.
    statedNote(step, single),
    !single && h("ol", { class: "segment-list" },
      step.segments.map((seg, i) => renderSegmentRow(ctx, step, seg, i))),
    !single && h("div", { class: "step-row__more no-print" },
      button("+ then…", () => addLine(null),
        { class: "btn btn--tiny btn--secondary", id: `add-seg-${step.id}` })));
}

// One line inside a step. The label is optional — a lot of them are obvious
// from the step name and the hands answer, and forcing a name on "it cooks"
// would be typing for its own sake.
function renderSegmentRow(ctx, step, seg, index) {
  const { plan, save, refresh } = ctx;
  const only = step.segments.length <= 1;

  return h("li", { class: `segment-row${seg.hands ? "" : " segment-row--waiting"}` },
    h("span", { class: "segment-row__num", text: String(index + 1) }),

    h("input", {
      id: `seg-label-${seg.id}`,
      type: "text",
      class: "segment-row__label",
      placeholder: seg.hands ? "what you do" : "what's happening",
      "aria-label": `Line ${index + 1} of ${step.name}`,
      value: seg.label,
      onInput: (e) => { seg.label = e.target.value; save(); },
    }),

    minsField(ctx, seg, `Minutes for line ${index + 1} of ${step.name}`),

    handsToggle(seg.hands, (value) => { seg.hands = value; refresh(); },
      `hands-${seg.id}`, `Are your hands on this?`),

    h("div", { class: "segment-row__controls no-print" },
      iconButton("↑", "Move this line earlier", index === 0,
        () => { if (moveSegment(plan, step.id, seg.id, -1)) refresh(); }),
      iconButton("↓", "Move this line later", index === step.segments.length - 1,
        () => { if (moveSegment(plan, step.id, seg.id, 1)) refresh(); }),
      iconButton("+", "Add a line after this one", false, () => {
        const added = addSegment(plan, step.id, { afterSegmentId: seg.id, mins: 1, hands: !seg.hands });
        refresh();
        const again = document.getElementById(`seg-mins-${added.id}`);
        if (again) again.focus({ preventScroll: true });
      }),
      !only && removeButton("this line", () => { removeSegment(plan, step.id, seg.id); refresh(); })));
}

// What the card says, for a step that is still one line. Text, not a number
// box, because "5-7" is what is printed on the page and retyping it as one
// number is the student doing the app's arithmetic. Blank is allowed and means
// the recipe never said — the step is carried unestimated rather than blocked.
function statedField(ctx, step, label) {
  const { save, refresh } = ctx;
  return h("div", { class: "mins-field" },
    h("input", {
      id: `step-stated-${step.id}`,
      type: "text",
      class: "mins-field__stated",
      inputMode: "numeric",
      autocomplete: "off",
      placeholder: "—",
      "aria-label": label,
      value: step.stated || "",
      onInput: (e) => { setStatedMinutes(step, e.target.value); save(); },
      onChange: refresh,
    }),
    h("span", { class: "mins-field__unit", text: "min" }));
}

// The inference, shown. A range is planned on its slow end, and saying so is
// the lesson — plan for the slow case. A step with nothing read off the card
// says that too, rather than passing as though it took no time.
function statedNote(step, single) {
  const stated = (step.stated || "").trim();
  const { mins, range } = parseStatedMinutes(stated);
  const parts = [];
  if (range) {
    parts.push(single
      ? `Recipe says ${stated} — planning for ${formatDuration(mins)}, the slow case.`
      : `Recipe says ${stated} for this step.`);
  } else if (!single && stated) {
    parts.push(`Recipe says ${stated} for this step.`);
  }
  if (isUnestimated(step)) {
    parts.push(single
      ? "No time yet — the recipe may only give a cue. Put a number on it when you know one."
      : "One of these lines still has no time.");
  }
  if (parts.length === 0) return null;
  return h("p", { class: "step-row__note", text: parts.join(" ") });
}

function minsField(ctx, seg, label) {
  const { save, refresh } = ctx;
  return h("div", { class: "mins-field" },
    h("input", {
      id: `seg-mins-${seg.id}`,
      type: "number",
      // One minute is the floor for anything the student has put a number on.
      // Half-minutes are real in a kitchen — a cutlet is flipped in about ten
      // seconds — but they are fiddly to type, they inflate nothing when
      // rounded up, and rounding up buys a little honest slack in a plan built
      // by a fifteen-year-old.
      //
      // Zero is not a duration, it is the absence of one: the line is carried
      // unestimated and counted on the board, rather than the field refusing to
      // be emptied.
      min: "0",
      step: "1",
      inputMode: "numeric",
      "aria-label": label,
      value: String(seg.mins),
      onInput: (e) => {
        const value = Number(e.target.value);
        if (e.target.value === "") { seg.mins = 0; save(); return; }
        if (Number.isFinite(value) && value >= 0) { seg.mins = value; save(); }
      },
      onChange: refresh,
    }),
    h("span", { class: "mins-field__unit", text: "min" }));
}

function iconButton(glyph, label, disabled, onClick) {
  return h("button", {
    type: "button", class: "icon-btn", disabled, onClick,
    "aria-label": label, title: label,
  }, glyph);
}

// The one question the app exists to make students answer. Two buttons rather
// than a checkbox, because there is no sensible default — "unticked" would
// quietly mean "hands free" and let a plan overlap things it shouldn't.
function handsToggle(value, onChange, idPrefix, groupLabel) {
  const option = (isHands, label) => h("button", {
    type: "button",
    id: `${idPrefix}-${isHands ? "on" : "off"}`,
    class: `hands__btn hands__btn--${isHands ? "on" : "off"}${value === isHands ? " hands__btn--selected" : ""}`,
    "aria-pressed": String(value === isHands),
    onClick: () => onChange(isHands),
  }, label);

  return h("div", {
    class: `hands${value === null ? " hands--unanswered" : ""}`,
    role: "group",
    "aria-label": groupLabel,
  }, option(true, "Hands on"), option(false, "Runs itself"));
}

// One word, no hint. "Is this prep?" is a word a culinary student already
// uses; asking whether a step could be done earlier would make them reason
// about ordering, which is the app's job rather than theirs.
function prepCheck(step, refresh) {
  const id = `step-prep-${step.id}`;
  return h("div", { class: "prep-check" },
    h("input", {
      id,
      type: "checkbox",
      checked: Boolean(step.prep),
      onChange: (e) => { step.prep = e.target.checked; refresh(); },
    }),
    h("label", { for: id, text: "Prep", title: "Cutting, measuring, portioning — anything you get ready before you cook" }));
}

// What a draft step still needs before it can be added. One definition, used by
// the render, by the live hint, and by submit itself. Each entry carries the
// control it refers to, so saying what is missing and going there are the same
// piece of information.
// Minutes are deliberately NOT in here. Recipes are sometimes silent — "sauté
// until golden brown" gives a cue, not a number — and a student with nothing to
// read must not be stuck mid-flow. A step with no time goes in, is carried
// unestimated, and is counted on the board where they will see it.
function missingFrom(draft, recipeId) {
  const missing = [];
  if (!draft.name.trim()) missing.push({ text: "what the step is", focus: `add-name-${recipeId}` });
  if (draft.shape === null) {
    missing.push({ text: "whether your hands are on it", focus: `add-shape-${recipeId}-hands` });
  }
  return missing;
}

function sayMissing(missing) {
  const words = missing.map((m) => m.text);
  const list = words.length === 1
    ? words[0]
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return `Still needed: ${list}.`;
}

// What is still needed, or — once nothing is — what the app is about to do with
// what was typed. Reading "5-7" back as "planning for 7 min, the slow case" is
// where the student learns the rule, so it is said before the step is added and
// not only after.
function hintFor(draft) {
  const gaps = missingFrom(draft, "");
  if (gaps.length > 0) return sayMissing(gaps);
  const { mins, range } = parseStatedMinutes(draft.mins);
  if (range) return `Planning for ${formatDuration(mins)} — the slow end of ${draft.mins.trim()}.`;
  if (mins === 0) return "No time on this one. It'll go in unestimated — the board will remind you.";
  return "";
}

// The shape of a step, asked once, at the moment it is typed.
//
// This used to be a hands on / hands off binary, which meant the alternating
// shape a real instruction has — you put the pan on, it heats without you —
// existed only for a student who reopened a finished step and added lines by
// hand. Almost nobody did, so almost every plan was one hands-on block per step
// and could not overlap anything. Overlapping is the entire point of the
// scheduler, so the app quietly failed at the thing it was built for.
//
// Same number of clicks as the binary, so it costs the student nothing.
const SHAPES = [
  { id: "hands", label: "Hands on the whole time", short: "Hands on" },
  { id: "start-then-runs", label: "Starts, then runs by itself", short: "Start it, then it runs" },
  { id: "runs", label: "Runs by itself", short: "Runs itself" },
];

function shapeChoice(value, onChange, idPrefix, groupLabel) {
  return h("div", {
    class: `shape${value === null ? " shape--unanswered" : ""}`,
    role: "group",
    "aria-label": groupLabel,
  }, SHAPES.map((shape) => h("button", {
    type: "button",
    id: `${idPrefix}-${shape.id}`,
    class: `shape__btn shape__btn--${shape.id}${value === shape.id ? " shape__btn--selected" : ""}`,
    "aria-pressed": String(value === shape.id),
    title: shape.label,
    onClick: () => onChange(shape.id),
  }, shape.short)));
}

function renderAddStep(ctx, recipe) {
  const { plan, refresh } = ctx;
  const draft = draftFor(recipe.id);
  const steps = stepsForRecipe(plan, recipe.id);

  // Recomputed on demand, never captured. Typing into the draft does not
  // re-render — that is what keeps the caret steady — so a `missing` array read
  // at render time is stale the moment the first character is typed, and a
  // submit that checked it silently did nothing.
  const missing = () => missingFrom(draft, recipe.id);

  const submit = () => {
    // Never blocked, only told. A disabled button that does nothing when
    // clicked is indistinguishable from a broken one, and the rest of this app
    // warns rather than refuses — the board lets you build a plan that does not
    // fit. This should behave the same way.
    const gaps = missing();
    if (gaps.length > 0) {
      showHint(sayMissing(gaps));
      const target = document.getElementById(gaps[0].focus);
      if (target) target.focus({ preventScroll: true });
      return;
    }
    appendStep(plan, createStep({
      recipeId: recipe.id,
      name: draft.name.trim(),
      // The top of a range, so the plan is built on the slow case.
      mins: parseStatedMinutes(draft.mins).mins,
      stated: draft.mins.trim(),
      shape: draft.shape,
      prep: draft.prep,
    }));
    drafts.set(recipe.id, emptyDraft());
    refresh();
    const again = document.getElementById(`add-name-${recipe.id}`);
    if (again) again.focus({ preventScroll: true });
  };

  const onEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    submit();
  };

  return h("div", { class: "add-step no-print" },
    h("input", {
      id: `add-name-${recipe.id}`,
      type: "text",
      class: "add-step__name",
      autocomplete: "off",
      placeholder: steps.length === 0 ? "First thing the recipe tells you to do…" : "Next step…",
      "aria-label": "What is the step?",
      value: draft.name,
      onInput: (e) => { draft.name = e.target.value; toggleAdd(); },
      onKeyDown: onEnter,
    }),

    // Not "how many minutes?" — that invites invention. The card states its
    // times and reading them off it is the skill, so the question sends them
    // back to the page. Text, not a number box, because "5-7" is what is
    // printed there and the app can plan on the slow end itself.
    h("div", { class: "add-step__mins" },
      h("input", {
        id: `add-mins-${recipe.id}`,
        type: "text",
        inputMode: "numeric",
        autocomplete: "off",
        placeholder: "5-7",
        "aria-label": "How long does the recipe say?",
        title: "How long does the recipe say? Leave it empty if the card only gives a cue.",
        value: draft.mins,
        onInput: (e) => { draft.mins = e.target.value; toggleAdd(); },
        onKeyDown: onEnter,
      }),
      h("span", { class: "step-list__unit", text: "min" })),

    shapeChoice(draft.shape, (value) => { draft.shape = value; refresh(); },
      `add-shape-${recipe.id}`, "What shape is this step?"),

    h("div", { class: "prep-check" },
      h("input", {
        id: `add-prep-${recipe.id}`,
        type: "checkbox",
        checked: draft.prep,
        onChange: (e) => { draft.prep = e.target.checked; },
      }),
      h("label", { for: `add-prep-${recipe.id}`, text: "Prep" })),

    h("button", {
      type: "button",
      id: `add-step-${recipe.id}`,
      class: "btn btn--small",
      onClick: submit,
    }, "Add step"),

    h("p", {
      id: `add-hint-${recipe.id}`,
      class: "add-step__hint",
      "aria-live": "polite",
      // Silent until they have started, so an untouched row is not nagging.
      text: draft.name || draft.mins || draft.shape !== null ? hintFor(draft) : "",
    }));

  // The draft lives outside the plan, so typing must not force a re-render —
  // that is what keeps the caret steady. Only the Add button and its hint
  // depend on the draft, so they are the only things updated in place.
  function showHint(text) {
    const hint = document.getElementById(`add-hint-${recipe.id}`);
    if (hint) hint.textContent = text;
  }

  // Typing does not re-render, so the hint is updated in place. Nothing else on
  // the row depends on the draft.
  function toggleAdd() {
    showHint(hintFor(draft));
  }
}

// Forward entry is easy to read off the page and easy to leave holes in — the
// recipe says "add the rested chicken" without ever telling you to rest it, and
// almost no recipe puts "preheat the oven" where it actually has to happen.
// One backward read catches most of that, and costs nothing to offer.
function renderReviewNudge() {
  return h("div", { class: "nudge no-print" },
    h("h4", { text: "Before you move on" }),
    h("p", { text: "Read your list from the bottom up. Between any two steps, is there something the recipe assumes you already did? Preheating the oven, resting meat, bringing water to the boil, chilling dough — those take real minutes, so they belong on the list. Use the + on a step to slot one in above it." }));
}

// --- Read confirmation ----------------------------------------------------

// The one thing worth confirming that the step list cannot already show. The
// old build asked students to tick that they had read the recipe "before
// planning it", which this flow deliberately tells them not to do — they fill
// this in while reading. What is still worth asking is whether they got to the
// END, because typing six steps and being ambushed by step seven is exactly the
// failure mode that filling in while reading introduces.
function renderReadCheck(ctx) {
  const { plan, save } = ctx;
  return h("div", { class: "subsection subsection--read" },
    h("label", { class: "check-row" },
      h("input", {
        id: "read-to-end",
        type: "checkbox",
        checked: plan.readToEnd,
        onChange: (e) => { plan.readToEnd = e.target.checked; save(); },
      }),
      "I read this recipe all the way to the end — including anything I haven't written down yet."));
}
