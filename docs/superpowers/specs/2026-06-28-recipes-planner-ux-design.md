# UX Redesign: Recipes & Planner + Meal Plan Generation

**Date:** 2026-06-28  
**Scope:** `recipes.tsx`, `planner.tsx`, `app/api/v1/endpoints/meal_plans.py`, new `app/services/llm/meal_planner.py`  
**Style direction:** Stay in current green/card design system, elevate hierarchy and info density

---

## Problems Being Solved

1. **Recipes — "Best for you" vs "All recipes" look identical** — no visual differentiation between tabs
2. **Recipes — ingredients hidden** — only visible after expanding a card, user doesn't know what a recipe needs at a glance
3. **Recipes — shopping list button buried** — only appears inside expanded card when missing ingredients exist
4. **Planner — recipe names invisible** — compact rows only show emoji + 3-letter abbreviation + calories, user can't read what's planned
5. **Planner — meal plans are poorly composed** — the generator is a placeholder, not AI (see Root Cause below)

### Root Cause: meal plan generator is a stub

`create_meal_plan` ([meal_plans.py:210-226](../../../app/api/v1/endpoints/meal_plans.py)) assigns recipes by modulo cycling:
`eligible_recipes[(day_index * 4 + meal_index) % len(eligible_recipes)]`. Consequences:

- **Fridge ignored** — accepts `fridge_id`, validates it exists, but never reads `InventoryItem`. The "From fridge" promise is false. A working fridge-match service already exists at [recipes.py:266-301](../../../app/api/v1/endpoints/recipes.py) and is not reused.
- **No meal-type appropriateness** — `Recipe` has no meal-slot tag; recipes land in slots by modulo (dinner food at breakfast).
- **Snack mismatch** — backend generates 4 meals incl. snack; frontend shows 3 (`MEALS` in planner.tsx). Snack entries are stored then dropped, and backend/ frontend nutrition sums diverge.
- **No goal targeting** — `goal` only filters the pool, never aims for a calorie/macro target.
- **Fully repetitive** — deterministic ID order; dishes loop in lockstep across days.

---

## Design Decisions

### Recipes Page

#### Tab differentiation

- **"Best for you" tab**: renders a horizontal-scroll featured strip at the top (top 3–5 recommended matches with large match % badge), followed by the standard list below. The featured strip is only present on this tab.
- **"All recipes" tab**: renders the standard list only, no featured strip. Visual difference is immediately apparent when switching tabs.

#### Featured strip cards (`FeaturedRecipeCard`)

- New compact card variant used only in the horizontal strip
- Shows: recipe image/emoji, name (1 line truncated), match % badge (prominent, colored by `getMatchColor`), cook time, calorie count
- Fixed width (~160px), fixed height, horizontal scroll with `no-scrollbar`
- Tapping a featured card toggles the same expand state as the main list card (scrolls to it)
- Only rendered when `activeTab === "recommended"` and `recommendedRecipes.length > 0`

#### RecipeCard — collapsed state changes

Add an ingredient preview row visible **without expanding**:

- Show up to 5 ingredients as inline chips
- If match data is available: ✅ green chip for `have[]`, 🛒 muted chip for `missing[]`
- If no match data: show plain chips from `recipe.ingredients` (first 5, muted)
- If more than 5 ingredients: show `+N more` chip at the end

Add a `+ В список` (Add to shopping list) button visible **on the collapsed card** when `missing.length > 0`:

- Small secondary button, right-aligned below ingredient chips
- Same mutation as existing `onAddMissingItems`
- Shows loading/success state inline
- Does not require expanding the card

The existing expand behavior (full ingredient list + steps + add button) remains unchanged.

#### No floating shopping list button

A floating bubble was considered but rejected — the per-card button is sufficient and avoids UI clutter.

---

### Planner Page

#### Day row layout changes

Current: compact row, emoji only, 8px font for meal labels, calorie count only.

New: rows are slightly taller, each meal slot shows:
- Emoji (smaller, ~text-sm)
- Meal type label (`BRK` / `LUN` / `DIN`) — keeps 8px uppercase
- Recipe name (truncated 1 line, ~9px, muted foreground)
- Calorie count (kept, 9px)

Layout within each slot:
```
[emoji]  BRK
         Recipe name (truncated)
         350 kcal
```

The day label column stays at `w-16`. Slot columns stretch evenly across remaining width (`grid-cols-3 flex-1`). `MealPlanEntry.recipe.name` is confirmed present (backend `_recipe_payload`), so no type changes needed.

No changes to the nutrition summary pill at the top or the span selector (Daily / 3-Day / Weekly).

---

### Meal Plan Generation (backend)

Replace the modulo stub with an LLM-driven generator plus a deterministic fallback.

#### Candidate pool (shared by both paths)

1. Read fridge inventory and rank recipes with the **existing matching logic** from `list_recipe_matches` (extract it into a reusable helper, e.g. `app/services/recipes/matching.py`, so both the recipes endpoint and the planner call the same code — no duplication).
2. Filter by `goal` (reuse `_recipe_goals`).
3. Pass the ranked candidates (id, name, match_score, missing count, nutrition_summary, tags) to the generator. **The generator only ever selects from this pool by `recipe_id`** — it never invents recipes, because `MealPlanEntry.recipe_id` is a real FK.

#### Calorie target

Derive a per-day calorie target from `goal` (lose / maintain / gain) using a simple constant map (e.g. lose ≈ 1600, maintain ≈ 2000, gain ≈ 2500 kcal — values to confirm during implementation). Used as a soft target for day composition.

#### LLM path (`MiniMaxMealPlanner`)

- New service `app/services/llm/meal_planner.py`, mirroring `MiniMaxRecipeAssistant`: `complete_json`, caching via `AiArtifactStore` (`task_type="meal_plan_generation"`, `prompt_version="meal-plan-v1"`), daily-budget enforcement via `enforce_llm_daily_budget`.
- Input payload: ranked candidate pool + `span_days` + `goal` + daily calorie target + meals `[breakfast, lunch, dinner]`.
- Output (validated): per day, a `recipe_id` per meal slot, chosen from the pool, aiming for the calorie target, meal-type appropriateness, and **variety** (avoid repeating a recipe on consecutive days).
- Validation: every returned `recipe_id` must exist in the candidate pool; meal slots must be exactly breakfast/lunch/dinner; day count must equal `span_days`. On any validation failure → fall back.

#### Deterministic fallback (always available)

Used when the LLM key is unset, the daily budget is exhausted, the call errors, or output fails validation:

- Walk the ranked candidate pool (fridge-cookable first).
- Assign breakfast/lunch/dinner per day, skipping a recipe if it was used the previous day (variety), wrapping the pool when exhausted.
- Nudge daily selection toward the calorie target where the pool allows.
- This alone resolves the "fridge ignored / repetitive" complaints even with no LLM.

#### Snack removed

`MEAL_TYPES` for generation becomes `(breakfast, lunch, dinner)`. Backend no longer generates snack entries, aligning with the 3-meal frontend and fixing the nutrition-sum divergence. (Manual `create_meal_plan_entry` may still accept snack; only auto-generation drops it.)

---

## Files to Change

| File | Changes |
|------|---------|
| `frontend/src/routes/recipes.tsx` | Add `FeaturedRecipeCard`, featured strip section, ingredient preview + shopping button to collapsed `RecipeCard` |
| `frontend/src/routes/planner.tsx` | Update meal slot layout to show recipe name |
| `app/services/recipes/matching.py` (new) | Extract reusable fridge→recipe ranking from `list_recipe_matches` |
| `app/api/v1/endpoints/recipes.py` | Use the extracted matching helper (no behavior change) |
| `app/services/llm/meal_planner.py` (new) | `MiniMaxMealPlanner` LLM generator with caching + budget |
| `app/api/v1/endpoints/meal_plans.py` | Replace modulo stub: candidate pool → LLM path → deterministic fallback; drop snack from auto-generation |
| `app/api/v1/deps.py` | DI wiring for the meal planner service (mirror existing LLM service wiring) |

Frontend recipe/UX changes need no API changes. Meal-plan response shape is unchanged (still `entries` with `recipe`, `meal_type`, `nutrition_snapshot`).

---

## Testing

- Unit: extracted matching helper (parity with current `list_recipe_matches` output).
- Unit: deterministic fallback — fridge-first ordering, no consecutive-day repeats, snack never generated, day/meal counts correct.
- Unit: LLM output validation — reject out-of-pool ids / wrong meal slots / wrong day count → triggers fallback.
- Integration: `POST /meal-plans` with empty LLM key produces a valid fallback plan from fridge contents.

---

## Out of Scope

- Shopping list as a dedicated route/page
- Adding meal-type tags to the `Recipe` model (appropriateness is best-effort via tags/LLM for now)
- Dashboard "For You" section (not currently in the UI)
- Planner: tapping a meal slot to see recipe detail
- Showing snack in the planner UI (snack dropped, not displayed)
