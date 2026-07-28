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
const { createPlan } = await import("../js/plan.js");

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

check("lists both, most recent first", S.listPlans().map((e) => e.recipe), ["Risotto", "Chicken Piccata"]);
check("most recent id is the last saved", S.mostRecentPlanId(), b.id);
check("round-trips a plan", S.loadPlan(a.id).meta.recipe, "Chicken Piccata");
check("unknown id loads as null", S.loadPlan("nope"), null);

// Re-saving moves a plan back to the top rather than duplicating it.
a.meta.recipe = "Chicken Piccata (v2)";
S.savePlan(a);
check("re-saving reorders instead of duplicating",
  S.listPlans().map((e) => e.recipe), ["Chicken Piccata (v2)", "Risotto"]);

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

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
