// Shared clock/duration arithmetic and station guessing, used by both the
// scaffolded board (board.js) and open mode (open-mode.js). Pure functions,
// no DOM.

import { STATIONS, STATION_KEYWORDS } from "./config.js";

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
