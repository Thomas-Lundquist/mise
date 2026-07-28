// Persistence layer. Saves state on every change, keyed by recipe name, so a
// refresh mid-period doesn't wipe the student's work. Per build spec section
// 8, fallback chain (in order of preference if the browser blocks storage —
// most likely inside the nested Canvas iframe):
//   1. localStorage
//   2. sessionStorage (survives refresh, not tab close — silent fallback,
//      the main stated risk is a mid-period refresh, which this still covers)
//   3. In-memory only, plus a "download a backup" / "restore a backup" pair
//      surfaced via a visible banner, since this tier does NOT survive a
//      refresh or tab close on its own.

const PREFIX = "mise-planner:";

let memoryFallback = null; // { key: string, value: string } — last resort, lost on refresh
let activeTier = "local"; // "local" | "session" | "memory" — for UI / diagnostics
let degradedWarningShown = false;

function keyFor(recipeName) {
  const slug = (recipeName || "untitled").trim().toLowerCase().replace(/\s+/g, "-") || "untitled";
  return PREFIX + slug;
}

function tryWrite(storageObj, key, json) {
  try {
    storageObj.setItem(key, json);
    return true;
  } catch (err) {
    return false;
  }
}

function tryRead(storageObj, key) {
  try {
    return storageObj.getItem(key);
  } catch (err) {
    return null;
  }
}

export function saveState(recipeName, state) {
  const key = keyFor(recipeName);
  const json = JSON.stringify(state);

  if (tryWrite(window.localStorage, key, json)) {
    activeTier = "local";
    return;
  }
  if (tryWrite(window.sessionStorage, key, json)) {
    activeTier = "session";
    return;
  }

  memoryFallback = { key, value: json };
  activeTier = "memory";
  warnAboutDegradedStorage();
}

export function loadState(recipeName) {
  const key = keyFor(recipeName);

  const fromLocal = tryRead(window.localStorage, key);
  if (fromLocal) {
    activeTier = "local";
    try {
      return JSON.parse(fromLocal);
    } catch (err) {
      // fall through
    }
  }

  const fromSession = tryRead(window.sessionStorage, key);
  if (fromSession) {
    activeTier = "session";
    try {
      return JSON.parse(fromSession);
    } catch (err) {
      // fall through
    }
  }

  if (memoryFallback && memoryFallback.key === key) {
    try {
      return JSON.parse(memoryFallback.value);
    } catch (err) {
      return null;
    }
  }

  return null;
}

export function getActiveTier() {
  return activeTier;
}

function warnAboutDegradedStorage() {
  if (degradedWarningShown) return;
  degradedWarningShown = true;
  const banner = document.getElementById("storage-warning");
  if (banner) banner.hidden = false;
}

// Tier 3 escape hatch: a manual JSON backup the student can download and,
// on a later visit (or after the banner reappears), restore.

export function downloadDraft(recipeName, state) {
  const slug = keyFor(recipeName).replace(PREFIX, "");
  const json = JSON.stringify(state, null, 1);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}-mise-draft.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function restoreDraftFromFile(file) {
  return file.text().then((text) => {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error("That file doesn't look like a mise planner draft.");
    }
    if (!parsed || typeof parsed !== "object" || !parsed.meta || !parsed.time) {
      throw new Error("That file doesn't look like a mise planner draft.");
    }
    return parsed;
  });
}
