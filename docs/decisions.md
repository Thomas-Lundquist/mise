# Decisions

Newest first. Each entry: what was decided, and why.

## 2026-10-22: Team scheduling with a greedy method, in v1

Steps record what they wait for ("Starts after"). A greedy scheduler gives each ready
task to whichever cook is free soonest. With 1 cook it produces a normal solo plan.

**Why:** The teacher wants plans that split work across lab teams. Recording what each
step waits for is also needed for an accurate solo plan with hands-off steps, so one
method covers both. Deciding what waits on what is itself good recipe-reading practice.

## 2026-10-22: Print-first lab guide

The printed guide is the main way students use it in class and how it's checked. The
screen is the backup. Canvas turn-in waits until the teacher thinks the app is ready.

## 2026-10-22: Static web app, no accounts, data stays in the browser

Plain HTML, CSS, and JavaScript with no build step, hosted free on GitHub Pages.
Student work is saved in their own browser's local storage.

**Why:** No personal or FERPA data is ever collected or stored. Nothing to install, it
works on any device, and it costs nothing. Plain files are the easiest for a non-programmer
to read and for us to change together.

**Trade-off:** Work lives on one device and browser. A student who starts on a Chromebook
won't see it on their phone. Printing or saving as PDF covers turning it in.

## 2026-10-22: No automatic recipe import in v1

**Why:** Typing in the recipe's details is how students practice reading it. Importing
would skip the skill the app exists to teach.
