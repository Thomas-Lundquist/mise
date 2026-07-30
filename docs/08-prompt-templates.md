# 08 — Prompt Templates

For the teacher. Copy one of these, fill the blanks, paste into a fresh conversation with
whatever model is doing the work. Attach or paste the doc files listed in the ticket.

Start a **new conversation per ticket**. A long conversation drifts, and drift is the exact
failure mode this scaffold exists to prevent.

---

## The standard work prompt

> You are implementing one ticket of a scaffolded project. I have attached the design
> documents. They are the source of truth.
>
> **Ticket: T__**
>
> Before writing any code:
> 1. Read `00-START-HERE.md`, `01-product-spec.md`, `02-conventions.md`, and
>    `07-build-plan.md`.
> 2. Read the specific documents that ticket T__ lists.
> 3. Restate the ticket in two sentences and list exactly which files you will produce.
>    Wait for me to say go.
>
> Rules:
> - Produce only the files the ticket names. Do not create, rename, or refactor anything else.
> - Follow `02-conventions.md` exactly: no dependencies, no build step, no framework, named
>   exports, pure modules stay pure, no `innerHTML` with dynamic content.
> - Do not redesign, improve, or second-guess any specified behaviour, including the
>   scheduler's tie-break order. If something is genuinely unspecified, stop and add the
>   question to `OPEN-QUESTIONS.md` instead of inventing an answer.
> - If the ticket touches a pure module, write its tests in the same session.
> - Finish with: what you built, which tests you ran and their results, and anything you
>   could not verify.

---

## Follow-up prompts

**When it starts redesigning:**

> Stop. That is a redesign, not the ticket. `04-scheduler-spec.md` specifies the behaviour;
> implement it as written. If you think it is wrong, add it to `OPEN-QUESTIONS.md` and
> continue with the spec as written.

**When it wants a dependency:**

> No dependencies, ever, including for tests. `02-conventions.md` is not negotiable on this.
> Write it in vanilla JS.

**When a test fails and it starts editing the test:**

> Do not change the test to match the code. Cases A–F in `09-test-plan.md` are
> hand-computed and correct. Find the bug in the implementation. If you truly believe the
> expected value is wrong, show me your arithmetic minute by minute before changing anything.

**Verification prompt, run after T5, T6, and T13:**

> Do not write code. Read `js/scheduler.js` and `js/fillers.js` against
> `04-scheduler-spec.md` and list every place the implementation and the spec differ, with
> line references. Then check each invariant in `09-test-plan.md` Part 1 by reading the code
> and say which ones the code cannot violate by construction and which ones rely on tests.

---

## Authoring a new lab day (no model needed)

Open `author.html`, build the day, check the feasibility preview, copy the link, paste it
into the Canvas assignment as an External URL or an embedded iframe. If a model is helping
convert a recipe into pack steps, use this:

> Convert the recipe below into the `Recipe` shape from `03-data-model.md`. Rules:
> - One step per physical action. If a step contains "and then", split it.
> - Anything unattended — simmering, baking, chilling, resting, marinating — gets
>   `suggestedHands: "free"`.
> - Taking something out of the oven or off the heat is its **own** 1-minute
>   `"busy"` step. Never fold retrieval into the passive step.
> - `shortLabel` is 22 characters or fewer, imperative voice: "Toast rice", "Sear chicken".
> - `suggestedDurationMin` must be one of 1, 2, 3, 5, 10, 15, 20, 30, 45, 60.
> - Only use equipment ids that exist in the pack; list every one a step actually occupies.
> - Set `consumesBowlOf` to the ingredient ids whose bowl is emptied by that step.
> - Leave `dependsOnOverride` as `null` unless the step genuinely does not follow the one
>   before it.
> Output valid JSON only, no commentary.
