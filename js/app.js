// Boot, plan lifecycle, and the order the five sections appear in.
//
// The order is the whole point, and it is the order a student actually reads a
// recipe in: the header block, then the ingredients, then the method — and then
// the two things a recipe never tells you and they have to work out themselves.
//
//   1  Today        who you are, which period, when food is up
//   2  The recipe   name, its own claimed times, ingredients, steps
//   3  Equipment    read back through the method; a recipe never lists this
//   4  Mise         which ingredients go in at the same moment
//   5  The plan     the board
//
// The printed sheet is not one of them. It is a document of its own, composed
// by views/printout.js from the same plan, because printing this page with its
// chrome hidden produced a half-filled worksheet that said everything twice.
//
// One scrolling page, one navigation model. The previous build had a flat
// scroll for sections 1-3 and a three-view tabbed mini-app for section 4, which
// meant two different ideas of "where am I" on the same screen.

import { DEFAULT_TIMER_MINUTES } from "./config.js";
import { createPlan, hasWork } from "./model.js";
import {
  purgeLegacy, listPlans, loadPlan, savePlan, mostRecentPlanId,
  downloadPlan, restorePlanFromFile, isStoragePersistent, entryFor, planLabels,
} from "./storage.js";
import { h, button } from "./dom.js";

import * as today from "./views/today.js";
import * as recipes from "./views/recipes.js";
import * as equipment from "./views/equipment.js";
import * as mise from "./views/mise.js";
import * as board from "./views/board.js";
import * as printout from "./views/printout.js";

// --- Teacher configuration, off the embed URL -----------------------------

const params = new URLSearchParams(window.location.search);

const timeParam = (name) => {
  const value = params.get(name) || "";
  return /^\d{1,2}:\d{2}$/.test(value) ? value : "";
};

const config = {
  recipe: params.get("recipe") || "",
  // Pins plate-up. Only needed when each period has its own Canvas page, or on
  // a special day — otherwise the student picks a period.
  foodUp: timeParam("foodUp"),
  periodId: params.get("period") || null,
  mode: params.get("mode") === "free" ? "free" : "guided",
};

const timerParam = params.get("timer");
const timerMinutes = timerParam === null || timerParam === ""
  ? DEFAULT_TIMER_MINUTES
  : Number(timerParam);

// --- State ----------------------------------------------------------------

purgeLegacy();

function freshPlan() {
  return createPlan(config);
}

// A teacher link naming a recipe should reopen that recipe's plan if the
// student already has one this session, rather than resuming whatever they last
// touched — one Canvas page, one plan.
function openingPlan() {
  if (config.recipe) {
    const wanted = config.recipe.trim().toLowerCase();
    const match = listPlans().find((entry) => entry.title.toLowerCase() === wanted);
    if (match) return loadPlan(match.id) || freshPlan();
    return freshPlan();
  }
  const recent = mostRecentPlanId();
  return (recent && loadPlan(recent)) || freshPlan();
}

// ?demo loads a worked example instead of a blank slate — for showing a class
// what a finished plan looks like, and for not retyping a recipe on every
// reload while working on the app. Imported dynamically, so the example costs
// nothing when it is not asked for.
let plan = params.has("demo")
  ? (await import("./demo.js")).buildDemoPlan()
  : openingPlan();
savePlan(plan);

// --- The sections ---------------------------------------------------------

// Three of these are the spine: who you are, what you are cooking, and the plan
// that falls out of it. That is a ten-minute activity on its own, and it is the
// only path that has to be walked to get a board.
//
// The other two make the plan better and neither is required to get one, so
// they fold away until they are wanted or used. Every capability stays; what
// changes is how much of the app is in the way at 7:40am with a recipe in one
// hand. A student who opens them once never sees them closed again.
const SECTIONS = [
  { id: "today", title: "Today", view: today },
  { id: "recipe", title: "The recipe", view: recipes },
  {
    id: "equipment",
    title: "Equipment",
    view: equipment,
    adds: "Puts each step on the right lane — the sheet pan is what makes roasting an oven job — and gives you a pull list.",
  },
  {
    id: "mise",
    title: "Mise en place",
    view: mise,
    adds: "Groups your ingredients into the bowls you measure out first, so the plan can open with what has to be ready before you start.",
  },
  { id: "plan", title: "Your plan", view: board },
];

// Sections the student has opened by hand this session. Not persisted: it is
// where they are looking, not part of their plan.
const opened = new Set();

// Writes the plan to storage without touching the DOM. Text fields use this on
// every keystroke; anything that changes the *shape* of the page calls refresh.
function save() {
  savePlan(plan);
}

// Full re-render, with the caret put back where it was. Rebuilding the page on
// a structural change is cheap at this size, and it is the only way to keep
// five interdependent sections honest — pull an ingredient and it has to vanish
// from the bowl picker, the board and the printout at once.
function refresh() {
  save();
  const focus = snapshotFocus();
  renderSections();
  renderPrintout();
  renderPlanBar();
  restoreFocus(focus);
}

// Kept up to date with everything else rather than built on beforeprint. That
// event does not fire everywhere — iOS Safari's share-sheet print is the case
// that matters here — and an empty sheet at the printer is not a risk worth
// taking to save a few milliseconds a keystroke.
function renderPrintout() {
  const target = document.getElementById("printout");
  if (target) target.replaceChildren(printout.render(plan));
}

const ctx = { get plan() { return plan; }, save, refresh };

function snapshotFocus() {
  const el = document.activeElement;
  if (!el || !el.id) return null;
  const snap = { id: el.id };
  if (typeof el.selectionStart === "number") {
    snap.start = el.selectionStart;
    snap.end = el.selectionEnd;
  }
  return snap;
}

function restoreFocus(snap) {
  if (!snap) return;
  const el = document.getElementById(snap.id);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (snap.start === undefined || typeof el.setSelectionRange !== "function") return;
  // Throws on number, date and time inputs, which have no selection to restore.
  try {
    el.setSelectionRange(snap.start, snap.end);
  } catch {
    /* nothing to restore */
  }
}

function renderSections() {
  const main = document.getElementById("sections");
  main.replaceChildren(...SECTIONS.map((section, index) => renderSection(section, index)));
}

function renderSection(section, index) {
  const status = section.view.status ? section.view.status(plan) : "";
  const heading = [
    h("span", { class: "card__num", text: String(index + 1) }),
    h("span", { class: "card__title", text: section.title }),
    status && h("span", { class: "card__status no-print", text: status }),
  ];

  if (!section.adds) {
    return h("section", { class: `card card--${section.id}`, id: `section-${section.id}` },
      h("h2", null, heading),
      section.view.render(ctx));
  }

  // Open once it holds anything, or once they have asked for it. <details> is
  // used rather than a hand-rolled toggle because it is keyboard-reachable and
  // findable by the browser's own in-page search for free.
  const isOpen = opened.has(section.id) || (section.view.filled && section.view.filled(plan));

  return h("details", {
    class: `card card--${section.id} card--optional`,
    id: `section-${section.id}`,
    open: isOpen,
    onToggle: (e) => { if (e.target.open) opened.add(section.id); else opened.delete(section.id); },
  },
  h("summary", null,
    h("h2", null, heading, h("span", { class: "card__optional no-print", text: "optional" })),
    !isOpen && h("p", { class: "card__adds no-print", text: section.adds })),
  section.view.render(ctx));
}

function renderNav() {
  const nav = document.getElementById("section-nav");
  nav.replaceChildren(...SECTIONS.map((section, index) =>
    h("a", { class: "section-nav__link", href: `#section-${section.id}` },
      h("span", { class: "section-nav__num", text: String(index + 1) }),
      section.title)));
}

// --- The plan bar ---------------------------------------------------------

function switchTo(next, message = "") {
  plan = next;
  savePlan(plan);
  renderSections();
  renderPrintout();
  renderPlanBar(message);
}

function renderPlanBar(message = "") {
  const bar = document.getElementById("plan-bar");
  const entries = listPlans();
  if (!entries.some((entry) => entry.id === plan.id)) entries.unshift(entryFor(plan));

  // Labels come from storage, which guarantees they are distinct. Two plans for
  // the same recipe on the same day are the NORMAL case behind a Canvas link,
  // and resuming the wrong one with no way to tell them apart loses work.
  const labels = planLabels(entries);

  const picker = h("select", {
    id: "plan-picker",
    disabled: entries.length < 2,
    onChange: (e) => {
      const next = loadPlan(e.target.value);
      if (next) switchTo(next);
    },
  }, entries.map((entry, index) => h("option", {
    value: entry.id,
    selected: entry.id === plan.id,
    text: labels[index],
  })));

  bar.replaceChildren(
    h("div", { class: "field field--wide" },
      h("label", { for: "plan-picker", text: "Plan" }),
      picker),

    h("div", { class: "plan-bar__actions" },
      button("New plan", () => {
        if (hasWork(plan) && !window.confirm("Start a new plan? This one stays in the list.")) return;
        switchTo(freshPlan(), "Started a new plan.");
      }, { class: "btn btn--small" }),

      // An ordinary pair, not an emergency exit. Work lives in sessionStorage,
      // so it does not survive closing the tab and it does not follow you to
      // another machine — which makes saving a file the normal way to carry a
      // plan home, not a thing you do once the browser has already failed.
      // There is no backend and there should not be one for this.
      button("Save a copy", () => {
        downloadPlan(plan);
        renderPlanBar("Saved to your downloads. Load it back here on any machine.");
      }, { class: "btn btn--small btn--secondary" }),

      h("label", { class: "btn btn--small btn--secondary", for: "restore-input" },
        "Load a copy",
        h("input", {
          type: "file", id: "restore-input", accept: "application/json", hidden: true,
          onChange: (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            restorePlanFromFile(file)
              .then((restored) => switchTo(restored, "Plan loaded."))
              .catch((err) => renderPlanBar(err.message))
              .finally(() => { e.target.value = ""; });
          },
        }))),

    h("p", { class: "plan-bar__status", "aria-live": "polite",
      text: message || "Your work is kept in this tab only. Save a copy to carry it to another machine." }),
  );
}

// --- Chrome ---------------------------------------------------------------

function initStorageWarning() {
  if (isStoragePersistent()) return;
  const banner = document.getElementById("storage-warning");
  const link = document.getElementById("storage-warning-link");
  if (link) link.href = window.location.href;
  if (banner) banner.hidden = false;
}

const TIMER_KEY = "mise-planner:timer";

// Counts down to a stored wall-clock deadline rather than decrementing a
// counter, so a refresh resumes where it left off and a backgrounded tab
// (whose timers get throttled) does not drift.
function initTimer() {
  const el = document.getElementById("timer");
  const valueEl = document.getElementById("timer-value");
  if (!el || !valueEl || !Number.isFinite(timerMinutes) || timerMinutes <= 0) return;

  let deadline = null;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(TIMER_KEY) || "null");
    // Only resume a countdown started for this same duration — changing ?timer=
    // should start fresh rather than inherit an old deadline.
    if (saved && saved.minutes === timerMinutes && typeof saved.deadline === "number") {
      deadline = saved.deadline;
    }
  } catch {
    /* storage blocked; fall through to a fresh countdown */
  }

  if (deadline === null) {
    deadline = Date.now() + timerMinutes * 60000;
    try {
      window.sessionStorage.setItem(TIMER_KEY, JSON.stringify({ minutes: timerMinutes, deadline }));
    } catch {
      /* not persistable — the countdown still runs for this page view */
    }
  }
  el.hidden = false;

  const tick = () => {
    const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    if (remaining === 0) {
      valueEl.textContent = "Time's up";
      el.classList.add("timer--expired");
      return true;
    }
    valueEl.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
    return false;
  };

  if (tick()) return;
  const interval = setInterval(() => {
    if (tick()) clearInterval(interval);
  }, 1000);
}

// --- Boot -----------------------------------------------------------------

renderNav();
renderSections();
renderPrintout();
renderPlanBar();
initStorageWarning();
initTimer();

document.getElementById("print-btn").addEventListener("click", () => window.print());

// Work lives in sessionStorage, so closing the tab loses it. Say so first.
window.addEventListener("beforeunload", (event) => {
  if (!hasWork(plan)) return;
  event.preventDefault();
  event.returnValue = "";
});
