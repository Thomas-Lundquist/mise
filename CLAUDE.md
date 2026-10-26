# mise

A web app that helps culinary students read a recipe *before* class and turn it into a
lab guide: a time plan, an equipment list, and mise en place bowls.

The owner is a culinary teacher, not a programmer. Claude writes the code; decisions are
made together. Explain choices in plain language, and keep the code simple enough that
it can be read and changed later without a build system or framework knowledge.

## The document set

Read the relevant doc before working on a feature, and update it when a decision changes.

| Doc | What it holds | Use it when |
| --- | --- | --- |
| [docs/vision.md](docs/vision.md) | Why the app exists, who it's for, goals and non-goals | Deciding whether a feature belongs at all |
| [docs/design.md](docs/design.md) | Visual rules and the screens of the student flow | Building or changing anything a student sees |
| [docs/data-model.md](docs/data-model.md) | What a recipe looks like as data, and how the schedule is calculated | Touching saving, loading, or the time plan |
| [docs/roadmap.md](docs/roadmap.md) | What's in v1, what's later, open questions | Planning the next piece of work |
| [docs/decisions.md](docs/decisions.md) | Dated log of decisions and why they were made | Before reversing something; after making a call |

## Running it

No install or build. Double-click `index.html`, or serve the folder
(`python -m http.server 8123`) and open http://127.0.0.1:8123.

- `js/schedule.js`: the time-plan calculation (no screen code; can run in Node for tests)
- `js/store.js`: saving and loading in the browser
- `js/app.js`: the four entry screens, the shared helpers, and undo
- `js/guide.js`: the lab guide (screen and print)
- `css/styles.css`: all styling

## Ground rules

- **No personal data stored, ever.** No accounts, no stored names, no server-side storage.
  A student's work stays in their own browser. Cook names typed on the lab guide are for
  printing only and are never saved. Don't add analytics or third-party trackers.
- **Keyboard first.** Most students use Chromebooks: everything must work without a mouse.
- **Calm over clever.** If a screen feels busy, cut something. See docs/design.md.
- **The student does the reading.** Features should make students engage with the
  recipe, not do it for them (this is why recipe auto-import is not in v1).
- **Works everywhere.** Chromebook, phone, home computer. Test at phone width.
- **Commit only when asked.** Log meaningful decisions in docs/decisions.md.
