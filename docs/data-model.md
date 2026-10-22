# Data model

Everything a student enters is one **recipe** object, saved in the browser's local
storage. Nothing is sent to a server.

```json
{
  "title": "Buttermilk Pancakes",
  "servings": 4,
  "startTime": "09:15",
  "minutesAvailable": 90,
  "cooks": 2,
  "ingredients": [
    { "id": "i1", "amount": "2", "unit": "cups", "name": "flour", "prep": "" }
  ],
  "equipment": [
    { "id": "e1", "name": "mixing bowl", "qty": 2 }
  ],
  "bowls": [
    { "id": "b1", "label": "Dry", "ingredientIds": ["i1"] }
  ],
  "steps": [
    { "id": "s1", "text": "Whisk wet into dry", "minutes": 3, "handsOff": false,
      "bowlIds": ["b1"], "after": ["s0"] }
  ]
}
```

Notes:
- `amount` is text so students can write "½" or "1 ½" naturally.
- An ingredient can sit in at most one bowl. Ingredients not in a bowl still appear in
  the mise en place list on their own.
- `cooks` is the team size, 1–5. Cooks are labeled Cook A, Cook B, and so on (no names).
- `after` lists the steps that must finish before this one can start. It defaults to the
  step right before it. A student can change it to an earlier step, or to "any time".

## How the time plan is calculated

One method, the same for 1 cook or 5. It's "greedy": whenever a cook is free, they
take the next step that's ready.

**Tasks.** The plan is built from:
1. **Setup** (wash hands, set up station): every cook, at the start, at the same time.
2. **Fill each bowl** (measure and prep its ingredients): one task per bowl, so bowls can
   be split between cooks. Estimated minutes per bowl (see open questions).
3. **The recipe's steps.** A step that uses a bowl also waits for that bowl to be filled.
4. **Cleanup** (clean and sanitize): every cook, after the last step.

**Scheduling, repeated until every task is placed:**
- A task is *ready* when everything it waits for is finished.
- Take ready tasks in recipe order. Give each one to the cook who's free soonest.
- A **hands-off** task (baking, chilling) has a cook start it, then frees that cook
  right away. The tasks waiting on it still wait until its time is up.
- The plan ends when cleanup ends. If that's later than `startTime + minutesAvailable`,
  the guide shows the overrun.

**Not handled yet:** shared equipment (two tasks needing the one oven at the same time).
