// Stub just enough browser for storage.js, which picks its tier at import time.
function fakeStorage({ blocked = false } = {}) {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i],
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (blocked) throw new Error("blocked"); map.set(k, String(v)); },
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

// Both are available and working. The app should still choose sessionStorage.
const localStore = fakeStorage();
const sessionStore = fakeStorage();
globalThis.window = { localStorage: localStore, sessionStorage: sessionStore };

const S = await import("../js/storage.js");
const { createPlan } = await import("../js/model.js");

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL  ${label}\n      got      ${a}\n      expected ${e}`); }
  else console.log(`ok    ${label}  ${a}`);
}

// --- Tier choice -----------------------------------------------------------
//
// sessionStorage on purpose, not localStorage. These are shared district
// Chromebooks: one student's name and plan must not still be sitting in the
// browser for whoever uses the machine next. The cost is that work doesn't
// survive closing the tab, which is why app.js warns on beforeunload.
check("chooses sessionStorage even when localStorage works", S.getStorageTier(), "session");
check("session counts as persistent — it survives a refresh", S.isStoragePersistent(), true);

// --- Legacy purge ----------------------------------------------------------
sessionStore.setItem("mise-planner:untitled", '{"old":"shape"}');
sessionStore.setItem("mise-planner:chicken-piccata", '{"old":"shape"}');
sessionStore.setItem("mise-planner:timer", '{"minutes":10}');
sessionStore.setItem("unrelated-app-key", "keep me");
check("purges old single-slot drafts", S.purgeLegacy(), 2);
check("but keeps the timer", sessionStore.getItem("mise-planner:timer") !== null, true);
check("and doesn't touch other apps", sessionStore.getItem("unrelated-app-key"), "keep me");

// --- Save / load / list ----------------------------------------------------
const a = createPlan({ recipe: "Chicken Piccata" });
const b = createPlan({ recipe: "Risotto" });
S.savePlan(a);
S.savePlan(b);

check("lists both, most recent first", S.listPlans().map((e) => e.title), ["Risotto", "Chicken Piccata"]);
check("most recent id is the last saved", S.mostRecentPlanId(), b.id);
check("round-trips a plan", S.loadPlan(a.id).recipes[0].name, "Chicken Piccata");
check("unknown id loads as null", S.loadPlan("nope"), null);

// Re-saving moves a plan back to the top rather than duplicating it.
a.recipes[0].name = "Chicken Piccata (v2)";
S.savePlan(a);
check("re-saving reorders instead of duplicating",
  S.listPlans().map((e) => e.title), ["Chicken Piccata (v2)", "Risotto"]);

// Nothing above should have leaked into localStorage — that's the entire point
// of the tier choice, so guard it rather than trusting it.
check("never writes to localStorage at all", localStore._map.size, 0);

// --- Version guard ---------------------------------------------------------
const stale = createPlan({ recipe: "Stale" });
S.savePlan(stale);
const raw = JSON.parse(sessionStore.getItem(`mise-planner:plan:${stale.id}`));
raw.version = 1;
sessionStore.setItem(`mise-planner:plan:${stale.id}`, JSON.stringify(raw));
check("refuses to load a plan from an older shape", S.loadPlan(stale.id), null);

// --- Cap -------------------------------------------------------------------
for (let i = 0; i < 15; i++) S.savePlan(createPlan({ recipe: `Recipe ${i}` }));
check("caps the list at 12", S.listPlans().length, 12);
const planKeys = [...sessionStore._map.keys()].filter((k) => k.startsWith("mise-planner:plan:"));
check("and evicts the dropped plans from storage too", planKeys.length <= 12, true);

// --- Delete ----------------------------------------------------------------
const keep = S.listPlans()[0].id;
S.deletePlan(keep);
check("delete removes it from the list", S.listPlans().some((e) => e.id === keep), false);
check("delete removes the stored plan", S.loadPlan(keep), null);

// --- Two plans are never indistinguishable ---------------------------------
//
// Recipe plus date is what a student recognises, so it stays the label wherever
// it is unambiguous. Clicking "New plan" on a ?recipe=X Canvas link makes it
// ambiguous immediately: the second plan inherits the same prefilled recipe and
// the same date, and the picker offered two identical rows with no way to tell
// which one held the work.
{
  const at = (h, m) => new Date(2026, 6, 29, h, m).getTime();
  const entry = (id, title, date, name, updatedAt) => ({ id, title, date, name, updatedAt });

  check("distinct plans keep the label a student recognises",
    S.planLabels([entry("a", "One", "2026-07-29", "", at(9, 0)), entry("b", "Two", "2026-07-29", "", at(9, 0))]),
    ["One — 2026-07-29", "Two — 2026-07-29"]);

  check("the name separates them when there is one",
    S.planLabels([entry("a", "One", "2026-07-29", "Ana", at(9, 0)), entry("b", "One", "2026-07-29", "Ben", at(9, 0))]),
    ["One — 2026-07-29 · Ana", "One — 2026-07-29 · Ben"]);

  check("otherwise the time it was last saved does",
    S.planLabels([entry("a", "One", "2026-07-29", "", at(9, 5)), entry("b", "One", "2026-07-29", "", at(11, 40))]),
    ["One — 2026-07-29 · saved 09:05", "One — 2026-07-29 · saved 11:40"]);

  // The exact case that was verified broken: same recipe, same day, nothing
  // else filled in yet, saved in the same minute.
  check("and an ordinal is the floor, so the list is always readable",
    S.planLabels([entry("a", "One", "2026-07-29", "", at(9, 5)), entry("b", "One", "2026-07-29", "", at(9, 5))]),
    ["One — 2026-07-29 · saved 09:05 (1)", "One — 2026-07-29 · saved 09:05 (2)"]);
}

// The name is carried on the index entry for exactly that reason.
{
  const plan = createPlan({ recipe: "Piccata" });
  plan.student.name = "Ana";
  S.savePlan(plan);
  check("the index remembers whose plan it is",
    S.listPlans().find((e) => e.id === plan.id).name, "Ana");
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
