// Same module, but with storage refused the way a locked-down iframe does it.
function blockedStorage(mode) {
  if (mode === "throws-on-access") {
    return new Proxy({}, { get() { throw new Error("SecurityError"); } });
  }
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i],
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: () => { throw new Error("QuotaExceededError"); },
    removeItem: (k) => map.delete(k),
  };
}

function workingStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i],
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL  ${label}\n      got      ${a}\n      expected ${e}`); }
  else console.log(`ok    ${label}  ${a}`);
}

// 1. localStorage refuses writes, sessionStorage works -> session tier
globalThis.window = { localStorage: blockedStorage("throws-on-write"), sessionStorage: workingStorage() };
const S1 = await import("../js/storage.js?case=session");
const { createPlan } = await import("../js/plan.js");
check("falls back to sessionStorage", S1.getStorageTier(), "session");
check("session tier is not treated as persistent", S1.isStoragePersistent(), false);
const p1 = createPlan({ recipe: "Fallback" });
check("still saves", S1.savePlan(p1), true);
check("still loads", S1.loadPlan(p1.id).meta.recipe, "Fallback");

// 2. Both blocked, and touching them even throws -> memory tier, still usable
globalThis.window = {
  get localStorage() { throw new Error("SecurityError"); },
  get sessionStorage() { throw new Error("SecurityError"); },
};
const S2 = await import("../js/storage.js?case=memory");
check("falls back to memory when storage throws on access", S2.getStorageTier(), "memory");
const p2 = createPlan({ recipe: "In memory only" });
check("memory tier still saves without throwing", S2.savePlan(p2), true);
check("memory tier round-trips within the page view", S2.loadPlan(p2.id).meta.recipe, "In memory only");
check("memory tier lists plans", S2.listPlans().map((e) => e.recipe), ["In memory only"]);
check("purgeLegacy is safe on memory tier", typeof S2.purgeLegacy(), "number");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
