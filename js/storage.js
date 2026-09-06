// Persistence.
//
// Storage is sessionStorage, deliberately — not localStorage. These are shared
// district Chromebooks, and one student's name and plan must not still be
// sitting in the browser for whoever uses the machine next. That privacy
// concern outranks the convenience of surviving a tab close.
//
// The cost is real: work does not survive closing the tab. "Download backup" is
// always offered, not only when storage fails, and `beforeunload` warns first.
//
// The app runs in a nested iframe (Canvas -> github.io) and storage may simply
// be refused, so there is a fallback: sessionStorage, then memory.

import { PLAN_VERSION } from "./model.js";
import { minutesToClock } from "./time.js";

const PREFIX = "mise-planner:";
const INDEX_KEY = `${PREFIX}index`;
const PLAN_KEY = (id) => `${PREFIX}plan:${id}`;
const MAX_PLANS = 12;

// --- Tier selection -------------------------------------------------------

function memoryStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
  };
}

function wrap(store) {
  return {
    getItem: (k) => store.getItem(k),
    setItem: (k, v) => store.setItem(k, v),
    removeItem: (k) => store.removeItem(k),
    keys: () => {
      const out = [];
      for (let i = 0; i < store.length; i++) out.push(store.key(i));
      return out;
    },
  };
}

function probe(getStore) {
  try {
    const store = getStore();
    if (!store) return null;
    const key = `${PREFIX}probe`;
    store.setItem(key, "1");
    store.removeItem(key);
    return wrap(store);
  } catch {
    return null;
  }
}

const session = probe(() => window.sessionStorage);
const tier = session ? "session" : "memory";
const store = session || memoryStore();

export function getStorageTier() {
  return tier;
}

// "Persistent" here means survives a refresh. Only false when the iframe blocks
// storage entirely, which is when the backup banner becomes the whole story.
export function isStoragePersistent() {
  return tier === "session";
}

// --- Reading and writing --------------------------------------------------

function readJSON(key) {
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Anything saved under an older plan shape is development leftovers — the app
// has not been used with students yet, so it is discarded rather than migrated.
// That freedom ends at v1.0, after which saved plans are real student work.
export function purgeLegacy() {
  let removed = 0;
  for (const key of store.keys()) {
    if (!key.startsWith(PREFIX)) continue;
    if (key === INDEX_KEY || key.startsWith(`${PREFIX}plan:`) || key === `${PREFIX}timer`) continue;
    store.removeItem(key);
    removed++;
  }
  return removed;
}

// --- The index ------------------------------------------------------------

// [{ id, title, date, updatedAt }], most recently touched first.
export function listPlans() {
  const index = readJSON(INDEX_KEY);
  if (!Array.isArray(index)) return [];
  return index.filter((entry) => entry && typeof entry.id === "string");
}

function writeIndex(entries) {
  writeJSON(INDEX_KEY, entries.slice(0, MAX_PLANS));
}

// A plan is named by its recipes, so a student with two of them on the go can
// tell which is which. Two plans made the same day for the same recipe would
// otherwise be indistinguishable in the picker.
export function planTitle(plan) {
  const names = plan.recipes.map((r) => r.name.trim()).filter(Boolean);
  return names.length > 0 ? names.join(" + ") : "Untitled plan";
}

export function entryFor(plan) {
  return {
    id: plan.id,
    title: planTitle(plan),
    date: plan.student.date || "",
    // Only ever used to tell two otherwise identical entries apart. A plan is
    // named by its recipe, and a Canvas link that prefills one makes "same
    // recipe, same day" the normal case rather than the odd one.
    name: (plan.student.name || "").trim(),
    updatedAt: Date.now(),
  };
}

// Labels for the plan picker, guaranteed distinct.
//
// Recipe plus date is what a student recognises, so it stays the label wherever
// it is unambiguous. It stops being unambiguous the moment they click "New
// plan" on a ?recipe=X Canvas link: the second plan inherits the same prefilled
// recipe and the same date, and the picker then offered two identical rows with
// no way to tell which one held their work.
//
// So detail is added only where it is needed, cheapest first: their name, then
// the time it was last saved, then a bare ordinal — which cannot collide, so
// the list is always readable even if it ends up ugly.
export function planLabels(entries) {
  const labels = entries.map((entry) => (entry.date ? `${entry.title} — ${entry.date}` : entry.title));

  const tally = () => {
    const counts = new Map();
    for (const label of labels) counts.set(label, (counts.get(label) || 0) + 1);
    return counts;
  };

  for (const detail of [byName, bySaveTime]) {
    const counts = tally();
    for (let i = 0; i < entries.length; i++) {
      if ((counts.get(labels[i]) || 0) < 2) continue;
      const extra = detail(entries[i]);
      if (extra) labels[i] = `${labels[i]} · ${extra}`;
    }
  }

  const counts = tally();
  const seen = new Map();
  for (let i = 0; i < labels.length; i++) {
    if ((counts.get(labels[i]) || 0) < 2) continue;
    const nth = (seen.get(labels[i]) || 0) + 1;
    seen.set(labels[i], nth);
    labels[i] = `${labels[i]} (${nth})`;
  }
  return labels;
}

function byName(entry) {
  return (entry.name || "").trim();
}

function bySaveTime(entry) {
  const at = Number(entry.updatedAt);
  if (!Number.isFinite(at) || at <= 0) return "";
  const when = new Date(at);
  return `saved ${minutesToClock(when.getHours() * 60 + when.getMinutes())}`;
}

// --- Plans ----------------------------------------------------------------

export function loadPlan(id) {
  const plan = readJSON(PLAN_KEY(id));
  if (!plan || typeof plan !== "object") return null;
  // A plan from an older shape is not worth guessing at.
  if (plan.version !== PLAN_VERSION) return null;
  return plan;
}

export function savePlan(plan) {
  if (!writeJSON(PLAN_KEY(plan.id), plan)) return false;

  const entries = listPlans().filter((entry) => entry.id !== plan.id);
  entries.unshift(entryFor(plan));

  // Trim the oldest plans out of storage too, not just off the list, so a
  // student who has been at this all term does not fill their quota.
  for (const dropped of entries.slice(MAX_PLANS)) store.removeItem(PLAN_KEY(dropped.id));
  writeIndex(entries);
  return true;
}

export function deletePlan(id) {
  store.removeItem(PLAN_KEY(id));
  writeIndex(listPlans().filter((entry) => entry.id !== id));
}

export function mostRecentPlanId() {
  const entries = listPlans();
  return entries.length > 0 ? entries[0].id : null;
}

// --- Backup and restore ---------------------------------------------------

function slugFor(plan) {
  const base = planTitle(plan).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return base.replace(/^-|-$/g, "") || "untitled";
}

export function downloadPlan(plan) {
  const blob = new Blob([JSON.stringify(plan, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugFor(plan)}-mise-plan.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function restorePlanFromFile(file) {
  return file.text().then((text) => {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("That file doesn't look like a mise plan.");
    }
    const looksRight = parsed && typeof parsed === "object" &&
      Array.isArray(parsed.recipes) && Array.isArray(parsed.steps) && parsed.student;
    if (!looksRight) throw new Error("That file doesn't look like a mise plan.");
    if (parsed.version !== PLAN_VERSION) {
      throw new Error("That plan was saved by an older version of this app.");
    }
    return parsed;
  });
}
