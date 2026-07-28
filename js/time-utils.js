// Shared clock/duration arithmetic, station guessing, and schedule-conflict
// detection, used by the scaffolded board (board.js), open mode
// (open-mode.js), and the elicitation flow (time-planner.js). Pure
// functions, no DOM.

import { STATIONS, STATION_KEYWORDS } from "./config.js";

export function newId(prefix) {
  return (crypto.randomUUID && crypto.randomUUID()) || `${prefix || "id"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function guessStation(name) {
  const lower = (name || "").toLowerCase();
  for (const station of STATIONS) {
    const keywords = STATION_KEYWORDS[station] || [];
    if (keywords.some((kw) => lower.includes(kw))) return station;
  }
  return "Prep";
}

export function clockToMinutes(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToClock(mins) {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDuration(mins) {
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function timeRangesOverlap(a, b) {
  return a.start < b.start + b.mins && b.start < a.start + a.mins;
}

// Two things can't genuinely happen at once: two hands-on tasks (only one
// pair of hands), or two tasks in the same station lane (only one oven).
// Flag, never block — per spec, the app surfaces conflicts, it never
// decides what a student is allowed to schedule. `items` need only
// `id`, `start`, `mins`, `hands`, and (for unattended items) `lane`.
export function computeConflicts(items) {
  const conflicted = new Set();
  function check(list) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (timeRangesOverlap(list[i], list[j])) {
          conflicted.add(list[i].id);
          conflicted.add(list[j].id);
        }
      }
    }
  }
  check(items.filter((item) => item.hands));
  for (const station of STATIONS) {
    check(items.filter((item) => !item.hands && item.lane === station));
  }
  return conflicted;
}
