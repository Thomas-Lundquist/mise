// Clock arithmetic, in one place.
//
// The plan is stored as durations, never as wall-clock times: "this plan is 38
// minutes long" is true in every period, on a special day, and next year.
// A period supplies one anchor, and these functions turn durations into the
// times that go on the board and the printout.

export function clockToMinutes(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToClock(mins) {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  return `${String(h).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

export function formatDuration(mins) {
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Durations on a block, where space is scarce and half-minutes are ordinary:
// flipping a cutlet is 30 seconds and belongs on the plan like anything else.
export function formatShort(mins) {
  if (mins < 1) return `${Math.round(mins * 60)}s`;
  const rounded = Math.round(mins * 2) / 2;
  return Number.isInteger(rounded) ? `${rounded}m` : `${rounded}m`;
}

export function todayISO(now = new Date()) {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

// What the recipe says, turned into a number the schedule can use.
//
// The minutes field is a READING task, not a guess: the card states its times
// and reading them off it is the skill. So this is forgiving about what a card
// actually says rather than demanding a bare integer.
//
//   ""        nothing to read — the step is carried unestimated
//   "6"       six
//   "5-7"     a range: plan for the SLOW case, which is the correct lesson
//   "about 8" eight
//
// Returns { mins, range }. `mins` is 0 when there is no number to find, which
// is how an unestimated step is carried through the whole app.
export function parseStatedMinutes(text) {
  const found = String(text == null ? "" : text).match(/\d+(?:\.\d+)?/g);
  if (!found) return { mins: 0, range: false };
  const values = found.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (values.length === 0) return { mins: 0, range: false };
  const top = Math.max(...values);
  return { mins: top, range: Math.min(...values) !== top };
}

export function tomorrowISO(now = new Date()) {
  const next = new Date(now.getTime());
  next.setDate(next.getDate() + 1);
  return todayISO(next);
}
