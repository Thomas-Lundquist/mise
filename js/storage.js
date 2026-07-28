// Persistence layer. Saves to localStorage keyed by recipe name so a refresh
// mid-period doesn't wipe the student's work. See build spec section 8 for the
// fallback chain — this is the first (best) tier; sessionStorage / in-memory
// fallbacks get layered in once we've verified real Canvas iframe behavior.

const PREFIX = "mise-planner:";

let memoryFallback = null; // { key: string, value: object } — used only if storage is unavailable
let storageWarningShown = false;

function keyFor(recipeName) {
  const slug = (recipeName || "untitled").trim().toLowerCase().replace(/\s+/g, "-") || "untitled";
  return PREFIX + slug;
}

function storageAvailable() {
  try {
    const testKey = "__mise_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch (err) {
    return false;
  }
}

export function saveState(recipeName, state) {
  const key = keyFor(recipeName);
  const json = JSON.stringify(state);

  if (storageAvailable()) {
    try {
      window.localStorage.setItem(key, json);
      return;
    } catch (err) {
      // fall through to memory fallback
    }
  }

  memoryFallback = { key, value: json };
  warnAboutStorage();
}

export function loadState(recipeName) {
  const key = keyFor(recipeName);

  if (storageAvailable()) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
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

function warnAboutStorage() {
  if (storageWarningShown) return;
  storageWarningShown = true;
  const banner = document.getElementById("storage-warning");
  if (banner) banner.hidden = false;
}
