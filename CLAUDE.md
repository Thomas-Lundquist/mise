# Mise Planner — working agreement

The specs in docs/ are the source of truth. Do not redesign anything.

- Work ONE ticket at a time from docs/07-build-plan.md. Do not start the next ticket.
- Before coding: read docs/00, 01, 02, 07, plus the docs that ticket lists. Restate the
  ticket and list the files you'll produce, then wait for me to say go.
- Follow docs/02-conventions.md exactly: no dependencies, no build step, no framework,
  named exports, pure modules stay pure, no innerHTML with dynamic content.
- If something is genuinely unspecified, add it to docs/OPEN-QUESTIONS.md and continue with
  the spec as written. Never invent behavior and move on.
- If a hand-computed test (docs/09) fails, fix the code, never the test.
- One ticket = one commit, message prefixed with the ticket number (e.g. "T3: codec.js").