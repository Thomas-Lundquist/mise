# Roadmap

## v1: a real, usable first version

- [x] The student flow: four entry screens and the lab guide (see design.md)
- [x] Lab guide: equipment, mise en place bowls, time plan with overrun warning
- [x] Smoother student workflow: equipment from
      the steps, one open step at a time, the team table time plan, "Before you print"
      check, clickable progress bar, keyboard-first entry, undo, optional cook names
- [x] Automatic setup and cleanup tasks
- [x] Team scheduling: split the plan between 1–5 cooks (see data-model.md)
- [x] Auto-save in the browser; "start a new recipe" button
- [ ] Print-first lab guide (print or save as PDF), readable in black and white: the paper
      report (station sheet + run sheets). Checked as PDFs from Chrome; needs a real test print
- [ ] Works well on phone and Chromebook (checked in Chrome down to 360px wide and by keyboard only; needs a real phone and Chromebook)
- [x] Hosted free on GitHub Pages: https://thomas-lundquist.github.io/mise/ (updates
      whenever `master` is pushed)

## Later ideas (not v1)

- Turn in through Canvas, once the teacher thinks the app is ready
- Shared equipment limits (only one oven, one stand mixer). Steps now record their tools,
  which is the groundwork.
- Several saved recipes per student
- Share a guide with the teacher by link (data in the link itself, so there's still no server)
- Paste recipe text to help fill fields (only if it doesn't undercut the reading)
- Teacher-made recipe templates for a lab
- Scaling servings up or down
- Class start time: what to show when it's left blank (times like "0:05" read oddly)
- Redo (Ctrl+Shift+Z)

## Open questions

(None right now.)

## Answered

- A paper-first printed report: **yes, it replaces printing the guide page**: a station
  sheet plus run sheets (2026-10-26).
- Team size: **1 to 5 cooks**.
- Minutes to fill a bowl: **the app suggests a default; students can change it**.
- Auto-add setup and cleanup: **yes**.
- How work is checked: **printed guide**, with the screen as backup. Canvas later.
- Name line on the printout: **no student name line**. For teams, optional cook names may
  be typed on the guide for printing; they're never saved (2026-10-25).
- Default class period: **90 minutes**.
- Where students work: **mostly school-issued Chromebooks**, so keyboard use matters most.
- Teams: **every student makes their own plan**; the team uses that day's manager's plan.
