# Fixtures

`recipe-pack.example.json` — a real two-recipe lab day (Rice Pilaf + Pan-Seared Chicken),
17 steps, 16 ingredients, 11 equipment entries, 6 filler tasks. It deliberately exercises
every hard case: passive steps of three different lengths, an oven with capacity 1, a
cross-recipe-shaped dependency override (`s_ch_oven` needs both the sear and the preheat),
several `dependsOnOverride: []` steps that must be allowed to start at minute 0, and a
`consumesBowlOf` on almost every step so filler derivation has real data.

`plan.example.json` — a student plan over that pack that accepts every teacher suggestion,
groups ingredients into 12 sensible bowls, and sets 4 cooks. This is what `blankPlan(pack)`
should produce apart from the bowl groupings.

## Golden reference values — verify against these

Computed directly from the spec in `04-scheduler-spec.md`. If your implementation disagrees
with any of these, the implementation is wrong.

| | Value |
|---|---|
| `floorMin` | **45** |
| Critical path | `s_pil_prep → s_pil_sweat → s_pil_toast → s_pil_liquid → s_pil_simmer → s_pil_rest → s_pil_fluff` |

| Cooks | `makespanMin` | Cook-minutes per cook (steps only, before fillers) |
|---|---|---|
| 1 | 68 | 57 |
| 2 | 47 | 34, 23 |
| 3 | 45 | 28, 23, 6 |
| 4 | 45 | 28, 23, 2, 4 |
| 5 | 45 | 28, 23, 2, 1, 3 |

Three things to notice, because they are the app working correctly:

- **Four cooks hit the floor exactly.** The schedule cannot be improved; the remaining time
  is the pilaf's unavoidable chain. This is the ideal case to show students first.
- **Cooks 3, 4 and 5 have almost nothing to do** — 2 to 6 minutes each. That is not a bug,
  it is the honest answer, and it is precisely the situation fillers exist for. After
  `fillGaps` those cooks should be carrying most of the cleaning.
- **The monotonic drop 68 → 47 → 45 → 45 → 45** is invariant 8 from `09-test-plan.md`.
  Adding a cook must never lengthen the plan.

The numbers `47 min` and `42 min` appearing in `05-ui-spec.md` and `06-print-spec.md` are
illustrative layout examples, not values from this fixture. Do not treat them as expected
output.
