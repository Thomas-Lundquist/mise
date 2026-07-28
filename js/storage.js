// Persistence. Students do this weekly, so the app keeps a list of recent plans
// rather than a single slot — the previous build keyed everything to one
// "untitled" bucket with no way to clear it, so a second recipe silently opened
// on top of the first.
//
// Three tiers, in order of preference, because the app runs in a nested iframe
// (Canvas -> github.io) and storage may simply be refused:
//   1. localStorage  — survives everything
//   2. sessionStorage — survives a refresh, not a tab close
//   3. in-memory      — survives nothing; the backup banner becomes the story
//
// Whatever tier we land on, downloading a backup is always offered, not just
// when storage fails (spec §10).

import { PLAN_VERSION } from "./plan.js";

const PREFIX = "mise-planner:";
const INDEX_KEY = `${PREFIX}index`;
const PLAN_KEY = (id) => `${PREFIX}plan:${id}`;
const MAX_PLANS = 12;

// --- Tier selection -------------------------------------------------------

function makeMemoryStore() {
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
  } catch (err) {
    return null;
  }
}

let tier = "memory";
let store = makeMemoryStore();

const session = probe(() => window.sessionStorage);
if (session) {
  tier = "session";
  store = session;
}

export function getStorageTier() {
  return tier;
}

// "Persistent" now means survives a refresh — sessionStorage is the intended
// tier. Only falls to false when the iframe blocks storage entirely.
export function isStoragePersistent() {
  return tier === "session";
}

// --- Legacy cleanup -------------------------------------------------------

// The app had not been used with students when the plan shape changed, so
// anything from before is development leftovers. Discard rather than migrate —
// writing migration code for data that does not exist is waste. Once real
// student plans exist (v1.0), shape changes need a migration path instead.
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

// --- Index ----------------------------------------------------------------

function readJSON(key) {
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

// [{ id, recipe, date, updatedAt }], most recently touched first.
export function listPlans() {
  const index = readJSON(INDEX_KEY);
  if (!Array.isArray(index)) return [];
  return index.filter((entry) => entry && typeof entry.id === "string");
}

function writeIndex(entries) {
  writeJSON(INDEX_KEY, entries.slice(0, MAX_PLANS));
}

function entryFor(plan) {
  return {
    id: plan.id,
    recipe: (plan.meta.recipe || "").trim(),
    date: plan.meta.date || "",
    updatedAt: Date.now(),
  };
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
  const ok = writeJSON(PLAN_KEY(plan.id), plan);
  if (!ok) return false;

  const entries = listPlans().filter((entry) => entry.id !== plan.id);
  entries.unshift(entryFor(plan));

  // Trim the oldest plans out of storage too, not just off the list, so a
  // student who has been at this all term doesn't fill their quota.
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

// --- Backup / restore -----------------------------------------------------

function slugFor(plan) {
  const base = (plan.meta.recipe || "untitled").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return base.replace(/^-|-$/g, "") || "untitled";
}

export function downloadPlan(plan) {
  const blob = new Blob([JSON.stringify(plan, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugFor(plan)}-mise-plan.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function restorePlanFromFile(file) {
  return file.text().then((text) => {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error("That file doesn't look like a mise plan.");
    }
    if (!parsed || typeof parsed !== "object" || !parsed.meta || !Array.isArray(parsed.steps)) {
      throw new Error("That file doesn't look like a mise plan.");
    }
    if (parsed.version !== PLAN_VERSION) {
      throw new Error("That plan was saved by an older version of this app.");
    }
    return parsed;
  });
}
