// Section 1 — Today.
//
// Who you are, and the one piece of arithmetic everything downstream hangs on:
// when food has to be up. The plan itself is stored as durations, so this is
// the only thing that turns it into times you can read off a clock — which
// makes a wrong period silently wrong everywhere. It is therefore stated back
// in words, and it prints.

import { PERIODS } from "../config.js";
import { foodUpFor, periodById } from "../model.js";
import { formatDuration } from "../time.js";
import { h, field } from "../dom.js";

export function status(plan) {
  const period = periodById(plan.schedule.periodId);
  if (plan.schedule.foodUpOverride) return `food up ${plan.schedule.foodUpOverride}`;
  return period ? period.label : "no period picked yet";
}

export function render(ctx) {
  const { plan, save, refresh } = ctx;

  const textField = (label, key, { id, type = "text", className = "field" }) =>
    field(label, h("input", {
      id,
      type,
      autocomplete: "off",
      value: plan.student[key] || "",
      onInput: (e) => { plan.student[key] = e.target.value; save(); },
    }), { class: className });

  const custom = Boolean(plan.schedule.foodUpOverride);

  const period = periodById(plan.schedule.periodId);
  // Nothing has been picked, and nothing sensible could be guessed — which is
  // what happens when a student plans at home in the evening, with no period
  // left in the day. The app used to fall through to the last period of the
  // day, which put a wrong clock time on every line of the sheet and looked
  // authoritative. So it asks, once, rather than guessing.
  const unset = !custom && !period;

  const periodSelect = h("select", {
    id: "period-picker",
    onChange: (e) => {
      if (e.target.value === "__unset") return;
      if (e.target.value === "__other") {
        // Seed the box with the time it already resolves to, so the student is
        // editing a real number rather than 00:00.
        plan.schedule.foodUpOverride = foodUpFor(plan);
      } else {
        plan.schedule.foodUpOverride = "";
        plan.schedule.periodId = e.target.value;
      }
      refresh();
    },
  },
  // Only present while nothing has been chosen. Without it the browser shows
  // the first period as though it had been picked.
  unset && h("option", { value: "__unset", selected: true, text: "Which period are you cooking in?" }),
  PERIODS.map((option) => h("option", {
    value: option.id,
    selected: !custom && option.id === plan.schedule.periodId,
    text: `${option.label} — food up ${option.foodUp}`,
  })),
  h("option", { value: "__other", selected: custom, text: "Another time (special day)" }));

  const overrideField = custom && field("Food up by", h("input", {
    id: "food-up-override",
    type: "time",
    value: plan.schedule.foodUpOverride,
    onChange: (e) => { plan.schedule.foodUpOverride = e.target.value; refresh(); },
  }), { class: "field field--narrow" });

  const periodName = custom ? "Special day" : (period ? period.label : "No period set");

  return h("div", null,
    h("div", { class: "row" },
      textField("Your name", "name", { id: "student-name", className: "field field--wide" }),
      textField("Kitchen #", "kitchen", { id: "student-kitchen", className: "field field--narrow" }),
      textField("Date", "date", { id: "student-date", type: "date", className: "field field--narrow" })),

    h("div", { class: "row no-print" },
      field("Which period?", periodSelect, { class: "field" }),
      overrideField),

    // Prints. Once the sheets are separated, page two needs to say which period
    // it was planned for, or a wrong pick is invisible. Unset, it has to read
    // as a question rather than as confirmation of something nobody chose.
    unset
      ? h("p", { class: "stated-back stated-back--unset" },
          h("strong", { text: "Pick your period above." }),
          " Until you do, every clock time in this plan is a placeholder.")
      : h("p", { class: "stated-back" },
          `${periodName} · ${formatDuration(plan.schedule.windowMins)} to cook · `,
          h("strong", { text: `food up at ${foodUpFor(plan)}` })),

    // Planning the night before is the usual reason to be here with no period
    // left in the day, so the sheet is dated for the lab rather than for the
    // evening it was written. Said out loud, in an ordinary date field they can
    // change — the app infers, and shows the inference.
    unset && h("p", { class: "hint no-print",
      text: "Planning ahead? We've dated this sheet for tomorrow. Change the date above if that's not right." }));
}
