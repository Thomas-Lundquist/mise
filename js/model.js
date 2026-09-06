// The plan: one object the whole app reads from and writes to. Every section is
// a view onto it, never a store of its own.
//
// The shape follows the order a student actually reads a recipe — header, then
// ingredients, then the method — and then the two things a recipe never tells
// you and the student has to work out for themselves: what equipment the method
// implies, and which ingredients go in at the same moment.
//
// Nothing in this file touches the DOM.

import {
  PERIODS,
  COOKING_WINDOW_MINUTES,
  MAX_COOKS,
  EQUIPMENT_PALETTE,
  CUSTOM_EQUIPMENT_STATION,
  HANDS_ON_LEAD_MINUTES,
  EQUIPMENT_HINTS,
} from "./config.js";
import { clockToMinutes, todayISO, tomorrowISO, parseStatedMinutes } from "./time.js";

export const PLAN_VERSION = 9;

export function newId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// --- The period -----------------------------------------------------------

// Which period a student is most likely in: the next one whose food-up time
// hasn't passed. A wrong pick is the main risk of anchoring to a period, so the
// default should be right most of the time without anyone thinking about it.
//
// Only guess when the guess is reliable. Planning at home at 8pm has no
// upcoming period, and falling through to the last one of the day put a wrong
// clock time on every line of the sheet while looking authoritative. Null means
// "ask them once" — during school hours nobody is asked anything, which is the
// point.
export function defaultPeriodId(now = new Date()) {
  if (PERIODS.length === 0) return null;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const upcoming = PERIODS.find((p) => clockToMinutes(p.foodUp) >= nowMins);
  return upcoming ? upcoming.id : null;
}

// Planning the night before is the normal reason to be here outside school
// hours, so the sheet should be dated for the lab, not for the evening it was
// written. Shown in an ordinary date field they can change.
export function defaultPlanDate(now = new Date()) {
  return defaultPeriodId(now) === null ? tomorrowISO(now) : todayISO(now);
}

export function periodById(id) {
  return PERIODS.find((p) => p.id === id) || null;
}

// The one place wall-clock time enters the plan. A pinned override wins, then
// the chosen period.
export function foodUpFor(plan) {
  if (plan.schedule.foodUpOverride) return plan.schedule.foodUpOverride;
  const period = periodById(plan.schedule.periodId);
  if (period) return period.foodUp;
  return PERIODS.length > 0 ? PERIODS[0].foodUp : "12:00";
}

// --- Construction ---------------------------------------------------------

export function createPlan({ recipe = "", foodUp = "", periodId = null, mode = "guided" } = {}) {
  return {
    version: PLAN_VERSION,
    id: newId("plan"),
    createdAt: Date.now(),

    student: { name: "", kitchen: "", date: defaultPlanDate() },

    // The one thing worth confirming that the step list cannot show: that they
    // got to the END of the recipe, including the parts they have not written
    // down yet. Filling this app in while reading makes that the real risk —
    // you can type six steps and still be ambushed by step seven.
    readToEnd: false,

    // One recipe by default. A second is one button away, for the lab that
    // hands out a protein and a starch on separate cards.
    recipes: [createRecipe(recipe)],

    // Typed while reading, in recipe order. Grouping them into bowls happens
    // later, once the steps exist, because a bowl is a *moment* and moments
    // are steps.
    ingredients: [],

    // Entered forward, in the order the method is written. The schedule is
    // still built backward from plate-up — that is arithmetic the app does, and
    // it does not care which end the student typed from.
    steps: [],

    // Found by reading the method, in a pass of its own. A recipe never lists
    // its equipment.
    equipment: [],

    bowls: [],

    // A clash the student has looked at and decided to live with. The app warns
    // and never decides, so "I know — I'll do them one after the other" has to
    // be a real answer, or the readiness line would nag forever about a plan
    // that is finished.
    conflictsAccepted: false,

    schedule: {
      mode: mode === "free" ? "free" : "guided",
      // How long they actually get to cook. The plan is measured against this,
      // not against a pair of clock times that only hold in one period.
      windowMins: COOKING_WINDOW_MINUTES,
      // Which period supplies the wall-clock labels. A ?period= that names no
      // real period falls back to the default rather than being kept: an
      // unmatched id leaves the picker showing its first option while the plan
      // believes something else, so every printed time would be wrong and look
      // authoritative.
      periodId: (periodId && periodById(periodId) ? periodId : defaultPeriodId()),
      // Set by ?foodUp= on the embed URL, or by hand on a special day.
      foodUpOverride: foodUp || "",
      // Where the finished schedule sits on the clock.
      //   "early" — starts the moment the window opens, so the spare time lands
      //             at the end, for plating, eating and an unhurried clean.
      //   "fixed" — ends on the period's plate-up, which is service discipline
      //             and what a pinned ?foodUp= means.
      // Either way the schedule is built backward, so every part still lands
      // together. This only moves the anchor.
      anchor: foodUp ? "fixed" : "early",
      // One pair of hands by default. The group toggle raises it; the plan
      // itself is identical either way.
      cooks: 1,
    },
  };
}

export function createRecipe(name = "") {
  return {
    id: newId("recipe"),
    name,
    // What the recipe *claims* it takes, off its header. Worth capturing: the
    // board compares it against the plan the student just built, and recipe
    // times almost always assume the mise is already done.
    prepMins: null,
    cookMins: null,
  };
}

export function createIngredient(recipeId, text = "") {
  return { id: newId("ing"), recipeId, text, bowlId: null };
}

// One timed line inside a step. `hands` is the single most important field in
// the app — it is what lets a plan overlap at all — and it lives here rather
// than on the step because a real instruction alternates: you put the pan on,
// it heats without you, you add oil, it cooks without you. Recorded as one
// hands-on block, every free minute inside it is lost.
//
// `label` is optional. Blank means "this is just the step", which is the normal
// case, and the board falls back to the step's own name.
export function createSegment({ label = "", mins = 1, hands = true } = {}) {
  return { id: newId("seg"), label, mins, hands };
}

// The three shapes a step arrives in, chosen once on the add row.
//
// "start-then-runs" is the overwhelmingly common one and the only one that
// makes a plan overlap at all — you put the pan on, it heats without you. It
// used to exist only for a student who went back into a finished step and added
// lines by hand, which almost nobody does, so almost every plan was one
// hands-on block per step and could never overlap.
export const STEP_SHAPES = ["hands", "start-then-runs", "runs"];

function segmentsForShape(shape, mins) {
  if (shape !== "start-then-runs") {
    return [createSegment({ mins, hands: shape !== "runs" })];
  }
  const lead = HANDS_ON_LEAD_MINUTES;
  const leadLine = () => createSegment({ label: "get it going", mins: lead, hands: true });
  // Nothing read off the card yet. The shape is still worth keeping, so the
  // waiting line arrives unestimated and visibly asks to be filled in.
  if (mins <= 0) return [leadLine(), createSegment({ mins: 0, hands: false })];
  // Too short to split: a one-minute step is all hands and nothing else.
  if (mins <= lead) return [createSegment({ mins, hands: true })];
  return [leadLine(), createSegment({ mins: mins - lead, hands: false })];
}

export function createStep({
  recipeId, name = "", mins = 0, hands = true, prep = false, shape = null, stated = "",
} = {}) {
  return {
    id: newId("step"),
    recipeId,
    name,
    // What the recipe card says this takes, in the student's own words off the
    // page: "20", "5-7", or nothing at all when the card gives a cue rather
    // than a number. Kept as text because a range is what was READ, and the
    // board has to be able to say which end of it the plan was built on.
    //
    // Defaults to the number itself, so a step built in code — the demo, a
    // test — reads back exactly as one typed by hand.
    stated: stated || (mins > 0 ? String(mins) : ""),
    // What you accomplish, broken into what you actually do. One segment is the
    // normal case and reads exactly like a plain step.
    segments: shape ? segmentsForShape(shape, mins) : [createSegment({ mins, hands })],
    // Prep: cutting, measuring, portioning. Deliberately a category a student
    // recognises rather than a question about ordering — "is this prep?" is a
    // word they already use, where "can this be done earlier?" asks them to
    // reason about dependencies, which is the thing the app is meant to work
    // out for them.
    //
    // Ticking it moves the step into a block at the start of the cooking window
    // with no fixed order relative to the other prep, which is what lets a team
    // split the mise between them. A step is prep as a whole; you cannot leave
    // half a sear until later.
    prep,
    equipmentIds: [],
    // Distinguishes "answered: nothing" from "not answered yet". An unattended
    // step should be asked where it sits, but "it just sits" is a real answer.
    noEquipment: false,
    note: "",
    // Resolved minutes-from-midnight. Derived in guided mode, authoritative in
    // free mode.
    start: 0,
    // Which pair of hands does this, 0-based. Derived by the scheduler and
    // meaningless when the plan is solo.
    cook: 0,
  };
}

const PALETTE_BY_NAME = new Map(EQUIPMENT_PALETTE.map((item) => [item.name.toLowerCase(), item]));

export function createEquipment(name) {
  const known = PALETTE_BY_NAME.get(name.trim().toLowerCase());
  return {
    id: newId("equip"),
    name: known ? known.name : name.trim(),
    station: known ? known.station : CUSTOM_EQUIPMENT_STATION,
    custom: !known,
    // Ticked off on the pull list as it comes out of the cupboard.
    pulled: false,
  };
}

// --- Reading the method for its equipment ---------------------------------
//
// A recipe never lists its equipment; you find it by reading the method for
// what it assumes. That reading is the lesson of section 3, and sending a
// student at an empty dropdown teaches it worse than showing them the mapping
// and letting them disagree with it. So the app guesses, out loud, and nothing
// is attached to a step until the student taps it.

// Whole words, allowing the ordinary endings, so "roast" catches "roasting"
// without "cut" catching "cutlet". A plain substring match got both wrong.
const WORD_END = "(?:s|es|d|ed|ing|en)?(?![a-z])";

function mentions(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z])${escaped}${WORD_END}`).test(text);
}

// Everything the step says, in one lowercase string: its name and the labels of
// its lines, because "then it simmers" often only exists on a line.
function stepText(step) {
  return [step.name, ...step.segments.map((seg) => seg.label)]
    .filter(Boolean).join(" ").toLowerCase();
}

// Equipment names this step's wording implies, minus anything already on it.
// Names, not equipment objects — nothing enters the plan until it is accepted.
export function suggestedEquipment(plan, step) {
  const text = stepText(step);
  if (!text.trim()) return [];
  const attached = new Set(step.equipmentIds
    .map((id) => plan.equipment.find((e) => e.id === id))
    .filter(Boolean)
    .map((item) => item.name.toLowerCase()));

  const out = [];
  for (const hint of EQUIPMENT_HINTS) {
    if (attached.has(hint.equipment.toLowerCase())) continue;
    if (out.includes(hint.equipment)) continue;
    if (hint.words.some((word) => mentions(text, word))) out.push(hint.equipment);
  }
  return out;
}

// Take a guess the student has agreed with. Adding the equipment to the plan
// and attaching it to the step is one action, because accepting is one tap.
export function acceptSuggestion(plan, step, name) {
  const item = addEquipment(plan, name);
  if (!item) return null;
  if (!step.equipmentIds.includes(item.id)) step.equipmentIds.push(item.id);
  step.noEquipment = false;
  return item;
}

export function createBowl(label = "") {
  // `stepId` is what makes a bowl mean something: it is ready *before* that
  // step. Null while the student has not said yet.
  return { id: newId("bowl"), label, stepId: null };
}

// --- Lookups --------------------------------------------------------------

export function cookCount(plan) {
  return Math.max(1, Math.min(MAX_COOKS, plan.schedule.cooks || 1));
}

export function stepsForRecipe(plan, recipeId) {
  return plan.steps.filter((s) => s.recipeId === recipeId);
}

export function ingredientsForRecipe(plan, recipeId) {
  return plan.ingredients.filter((i) => i.recipeId === recipeId);
}

export function ingredientsInBowl(plan, bowlId) {
  return plan.ingredients.filter((i) => i.bowlId === bowlId);
}

// A step's total length, and what it is made of. Everything downstream asks
// these rather than reaching into segments itself.
export function stepMins(step) {
  return step.segments.reduce((total, seg) => total + seg.mins, 0);
}

// A step the recipe never put a number on. "Sauté until golden brown" gives a
// cue, not a time, and a student with nothing to read must not be stuck — so
// the step goes in with no minutes and is counted somewhere visible instead.
export function isUnestimated(step) {
  return step.segments.some((seg) => !(seg.mins > 0));
}

export function unestimatedSteps(plan) {
  return plan.steps.filter(isUnestimated);
}

// Everything the student's own steps add up to. Held against the recipe's own
// header claim, a total well under it means something on the card never made it
// onto the list.
export function statedTotalMinutes(plan) {
  return plan.steps.reduce((total, step) => total + stepMins(step), 0);
}

// Apply what was read off the card to a step. One place, because the add row,
// the step row and any test all have to agree on which end of a range is used.
export function setStatedMinutes(step, text) {
  const { mins, range } = parseStatedMinutes(text);
  step.stated = String(text == null ? "" : text);
  if (step.segments.length === 1) step.segments[0].mins = mins;
  return { mins, range };
}

export function handsMins(step) {
  return step.segments.reduce((total, seg) => total + (seg.hands ? seg.mins : 0), 0);
}

export function waitingMins(step) {
  return step.segments.reduce((total, seg) => total + (seg.hands ? 0 : seg.mins), 0);
}

export function hasWaiting(step) {
  return step.segments.some((seg) => !seg.hands);
}

// Each segment with its offset from the start of the step. Segments are
// contiguous — the pan starts heating the moment you put it on — so this is a
// running total, and it is what turns one step start into a set of blocks.
export function segmentOffsets(step) {
  const out = [];
  let from = 0;
  for (const seg of step.segments) {
    out.push({ seg, from, to: from + seg.mins });
    from += seg.mins;
  }
  return out;
}

export function equipmentById(plan) {
  return new Map(plan.equipment.map((item) => [item.id, item]));
}

export function stepById(plan, stepId) {
  return plan.steps.find((s) => s.id === stepId) || null;
}

export function recipeById(plan, recipeId) {
  return plan.recipes.find((r) => r.id === recipeId) || null;
}

// What the recipes themselves claim, added up. Null when nobody filled it in,
// so the board can stay quiet rather than compare against zero.
export function claimedMinutes(plan) {
  let total = 0;
  let stated = false;
  for (const recipe of plan.recipes) {
    for (const value of [recipe.prepMins, recipe.cookMins]) {
      if (Number.isFinite(value) && value > 0) {
        total += value;
        stated = true;
      }
    }
  }
  return stated ? total : null;
}

// Has the student done anything worth warning them about losing?
export function hasWork(plan) {
  return (
    plan.steps.length > 0 ||
    plan.ingredients.length > 0 ||
    plan.equipment.length > 0 ||
    plan.readToEnd ||
    Boolean(plan.student.name.trim()) ||
    plan.recipes.some((r) => r.name.trim())
  );
}

// --- Mutations ------------------------------------------------------------
//
// Nothing in a plan is write-once. Deleting something other parts point at
// clears the reference and keeps the rest — losing a step because you tidied
// the equipment list is never the right outcome.

// Steps are entered forward, so a new one begins where its recipe currently
// ends. Guided mode overwrites this on the next render; free mode never does,
// and without the seed a step added in free mode would sit at midnight and
// stretch the board across the whole night.
export function appendStep(plan, step) {
  const siblings = stepsForRecipe(plan, step.recipeId);
  step.start = siblings.length > 0
    ? Math.max(...siblings.map((s) => s.start + stepMins(s)))
    : windowOpens(plan);
  plan.steps.push(step);
  return step;
}

// Inserting between two steps is how a forgotten preheat or rest gets back in
// without retyping everything after it.
export function insertStepBefore(plan, step, beforeStepId) {
  const index = plan.steps.findIndex((s) => s.id === beforeStepId);
  if (index === -1) return appendStep(plan, step);
  step.start = plan.steps[index].start;
  plan.steps.splice(index, 0, step);
  return step;
}

export function windowOpens(plan) {
  return clockToMinutes(foodUpFor(plan)) - plan.schedule.windowMins;
}

export function removeStep(plan, stepId) {
  const index = plan.steps.findIndex((s) => s.id === stepId);
  if (index === -1) return;
  plan.steps.splice(index, 1);
  for (const bowl of plan.bowls) {
    if (bowl.stepId === stepId) bowl.stepId = null;
  }
}

// Reordering only ever means "move it relative to its own recipe", so this
// swaps with the adjacent sibling rather than shuffling the whole array.
export function moveStep(plan, stepId, direction) {
  const step = stepById(plan, stepId);
  if (!step) return false;
  const siblings = stepsForRecipe(plan, step.recipeId);
  const target = siblings[siblings.indexOf(step) + direction];
  if (!target) return false;
  const i = plan.steps.indexOf(step);
  const j = plan.steps.indexOf(target);
  [plan.steps[i], plan.steps[j]] = [plan.steps[j], plan.steps[i]];
  return true;
}

// Segments can be added anywhere, at any time — including into a step typed ten
// minutes ago, which is when a student usually realises the pan had to heat up
// first. `afterSegmentId` is null to append.
export function addSegment(plan, stepId, { afterSegmentId = null, mins = 1, hands = true } = {}) {
  const step = stepById(plan, stepId);
  if (!step) return null;
  const segment = createSegment({ mins, hands });
  const index = afterSegmentId
    ? step.segments.findIndex((seg) => seg.id === afterSegmentId)
    : -1;
  if (index === -1) step.segments.push(segment);
  else step.segments.splice(index + 1, 0, segment);
  return segment;
}

// A step is always at least one line. Removing the last one would leave a step
// with no duration at all, which is not a step.
export function removeSegment(plan, stepId, segmentId) {
  const step = stepById(plan, stepId);
  if (!step || step.segments.length <= 1) return false;
  step.segments = step.segments.filter((seg) => seg.id !== segmentId);
  return true;
}

export function moveSegment(plan, stepId, segmentId, direction) {
  const step = stepById(plan, stepId);
  if (!step) return false;
  const i = step.segments.findIndex((seg) => seg.id === segmentId);
  const j = i + direction;
  if (i === -1 || j < 0 || j >= step.segments.length) return false;
  [step.segments[i], step.segments[j]] = [step.segments[j], step.segments[i]];
  return true;
}

export function addRecipe(plan, name = "") {
  const recipe = createRecipe(name);
  plan.recipes.push(recipe);
  return recipe;
}

// Deleting a recipe is never silent — the caller decides whether its steps and
// ingredients move to another recipe or go with it.
export function removeRecipe(plan, recipeId, { moveTo = null } = {}) {
  if (plan.recipes.length <= 1) return;

  if (moveTo) {
    for (const step of stepsForRecipe(plan, recipeId)) step.recipeId = moveTo;
    for (const ing of ingredientsForRecipe(plan, recipeId)) ing.recipeId = moveTo;
  } else {
    for (const step of stepsForRecipe(plan, recipeId)) removeStep(plan, step.id);
    for (const ing of ingredientsForRecipe(plan, recipeId)) removeIngredient(plan, ing.id);
  }
  plan.recipes = plan.recipes.filter((r) => r.id !== recipeId);
}

export function addIngredient(plan, recipeId, text) {
  const ingredient = createIngredient(recipeId, text);
  plan.ingredients.push(ingredient);
  return ingredient;
}

export function removeIngredient(plan, ingredientId) {
  plan.ingredients = plan.ingredients.filter((i) => i.id !== ingredientId);
}

export function addEquipment(plan, name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = plan.equipment.find((e) => e.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const item = createEquipment(trimmed);
  plan.equipment.push(item);
  return item;
}

export function removeEquipment(plan, equipmentId) {
  plan.equipment = plan.equipment.filter((e) => e.id !== equipmentId);
  for (const step of plan.steps) {
    step.equipmentIds = step.equipmentIds.filter((id) => id !== equipmentId);
  }
}

export function addBowl(plan, label = "") {
  const bowl = createBowl(label);
  plan.bowls.push(bowl);
  return bowl;
}

export function removeBowl(plan, bowlId) {
  plan.bowls = plan.bowls.filter((b) => b.id !== bowlId);
  for (const ingredient of plan.ingredients) {
    if (ingredient.bowlId === bowlId) ingredient.bowlId = null;
  }
}
