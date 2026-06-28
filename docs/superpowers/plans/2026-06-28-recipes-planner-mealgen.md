# Recipes & Planner UX + Meal Plan Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Recipes and Planner readable and useful, and replace the placeholder meal-plan generator with a real fridge-aware, LLM-driven generator that has a deterministic fallback.

**Architecture:** Three frontend tasks restyle existing TanStack Router routes within the current green/card design system (no new design language). Backend extracts the existing fridge→recipe matching into a shared helper, then rebuilds `create_meal_plan` around a candidate pool + LLM selection + deterministic fallback, dropping the snack slot to match the 3-meal UI.

**Tech Stack:** React 19 + TanStack Router/Query + framer-motion + Tailwind (frontend, vitest tests); FastAPI + SQLAlchemy + Pydantic (backend, pytest tests); MiniMax/OpenRouter LLM via existing `AiArtifactStore` caching.

**Design direction (frontend):** Preserve the established system. Reuse existing tokens (`bg-card`, `bg-primary`, `bg-secondary`, `text-muted-foreground`, `getMatchColor`), rounded `rounded-[1.35rem]` surfaces, and framer-motion entry transitions. The single new "memorable moment" is the horizontal featured strip on the recommended tab — everything else is hierarchy and density cleanup, not new chrome.

**Source spec:** `docs/superpowers/specs/2026-06-28-recipes-planner-ux-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/lib/recipe-view.ts` | Add pure helpers: `getIngredientPreview`, `getFeaturedRecipes` (testable, no JSX) |
| `frontend/src/lib/recipe-view.test.ts` | Unit tests for the new helpers |
| `frontend/src/routes/recipes.tsx` | Render featured strip, collapsed ingredient preview, on-card shopping button |
| `frontend/src/routes/planner.tsx` | Render recipe name in each meal slot |
| `app/services/recipes/__init__.py` (new) | Package marker |
| `app/services/recipes/matching.py` (new) | `build_recipe_matches(...)` extracted from `list_recipe_matches` |
| `tests/test_recipe_matching_service.py` (new) | Unit tests for the extracted matcher |
| `app/api/v1/endpoints/recipes.py` | Call shared matcher (no behavior change) |
| `app/services/meal_plan/__init__.py` (new) | Package marker |
| `app/services/meal_plan/builder.py` (new) | Calorie targets, candidate pool, deterministic fallback, LLM-output validation (pure) |
| `app/services/llm/meal_planner.py` (new) | `MiniMaxMealPlanner` LLM generator with caching + budget |
| `tests/test_meal_plan_builder.py` (new) | Unit tests for fallback + validation (pure) |
| `app/api/v1/endpoints/meal_plans.py` | Replace modulo stub: pool → LLM → fallback; drop snack |
| `app/api/v1/deps.py` | DI provider for the meal planner service |
| `tests/test_meal_plan_api.py` | Extend: fridge-aware, no-snack, no-consecutive-repeat assertions |

---

# Phase A — Frontend UX

## Task 1: Planner shows recipe names

**Files:**
- Modify: `frontend/src/routes/planner.tsx:169-186`

Recipe name is already available as `slot?.recipe.name` (`MealPlanEntry.recipe.name`, confirmed in `frontend/src/lib/api/types.ts:289` + `RecipeDetails.name`). No type or backend change needed. This task is JSX-only and is verified by type-check, lint, and visual run (no unit test — pure markup).

- [ ] **Step 1: Replace the meal-slot markup**

In `frontend/src/routes/planner.tsx`, replace the slot `<div>` block (the `MEALS.map(...)` body, currently lines ~170-185) with:

```tsx
{MEALS.map((mealName) => {
  const slot = day.entries.find((entry) => entry.meal === mealName);
  return (
    <div key={mealName} className="flex flex-col gap-1 rounded-xl bg-secondary px-2 py-2">
      <span className="flex items-center gap-1">
        <span className="text-base leading-none">{slot?.recipe.hero_emoji ?? "·"}</span>
        <span className="text-[8px] font-bold uppercase tracking-wide text-primary leading-none">
          {mealName.slice(0, 3)}
        </span>
      </span>
      <span className="block truncate text-[10px] font-semibold leading-tight text-foreground">
        {slot?.recipe.name ?? "—"}
      </span>
      <span className="block text-[9px] font-medium leading-none text-muted-foreground">
        {slot?.recipe.nutrition_summary.calories ?? 0} kcal
      </span>
    </div>
  );
})}
```

- [ ] **Step 2: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/planner.tsx
git commit -m "feat(planner): show recipe names in day rows"
```

---

## Task 2: Pure helper `getIngredientPreview`

**Files:**
- Modify: `frontend/src/lib/recipe-view.ts`
- Test: `frontend/src/lib/recipe-view.test.ts`

A collapsed RecipeCard needs an at-a-glance ingredient list with have/missing status. Extract the selection logic as a pure function so it is unit-tested independently of JSX.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/recipe-view.test.ts`:

```ts
import { getIngredientPreview } from "./recipe-view";
import type { RecipeCardItem } from "./recipe-view";

function cardItem(overrides: Partial<RecipeCardItem>): RecipeCardItem {
  return {
    recipe: {
      id: "r1", name: "Test", emoji: "🍽️", imageUrl: null, sourceProvider: null,
      minutes: 20, calories: 400, protein: 20, carbs: 40, fat: 12,
      goals: [], tags: ["Recipe"], ingredients: ["a", "b", "c", "d", "e", "f"],
      steps: [], tag: "Recipe",
    },
    match: 0, have: [], missing: [],
    ...overrides,
  };
}

describe("getIngredientPreview", () => {
  it("uses have/missing status when match data exists", () => {
    const item = cardItem({ have: ["Eggs", "Onion"], missing: ["Cream"] });
    const preview = getIngredientPreview(item, 5);
    expect(preview.chips).toEqual([
      { name: "Eggs", status: "have" },
      { name: "Onion", status: "have" },
      { name: "Cream", status: "missing" },
    ]);
    expect(preview.extra).toBe(0);
  });

  it("falls back to plain ingredients when no match data", () => {
    const item = cardItem({});
    const preview = getIngredientPreview(item, 5);
    expect(preview.chips).toHaveLength(5);
    expect(preview.chips[0]).toEqual({ name: "a", status: "neutral" });
    expect(preview.extra).toBe(1);
  });

  it("caps chips at the limit and reports the overflow count", () => {
    const item = cardItem({ have: ["a", "b", "c"], missing: ["d", "e", "f", "g"] });
    const preview = getIngredientPreview(item, 5);
    expect(preview.chips).toHaveLength(5);
    expect(preview.extra).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/recipe-view.test.ts`
Expected: FAIL — `getIngredientPreview is not a function` / type error.

- [ ] **Step 3: Implement the helper**

Append to `frontend/src/lib/recipe-view.ts`:

```ts
export type IngredientChipStatus = "have" | "missing" | "neutral";

export interface IngredientChip {
  name: string;
  status: IngredientChipStatus;
}

export interface IngredientPreview {
  chips: IngredientChip[];
  extra: number;
}

export function getIngredientPreview(item: RecipeCardItem, limit: number): IngredientPreview {
  const hasStatus = item.have.length > 0 || item.missing.length > 0;
  const all: IngredientChip[] = hasStatus
    ? [
        ...item.have.map((name): IngredientChip => ({ name, status: "have" })),
        ...item.missing.map((name): IngredientChip => ({ name, status: "missing" })),
      ]
    : item.recipe.ingredients.map((name): IngredientChip => ({ name, status: "neutral" }));

  return {
    chips: all.slice(0, limit),
    extra: Math.max(0, all.length - limit),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/recipe-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/recipe-view.ts frontend/src/lib/recipe-view.test.ts
git commit -m "feat(recipes): add getIngredientPreview helper"
```

---

## Task 3: Pure helper `getFeaturedRecipes`

**Files:**
- Modify: `frontend/src/lib/recipe-view.ts`
- Test: `frontend/src/lib/recipe-view.test.ts`

The recommended tab shows a featured strip of the top matches. Selecting them is pure logic.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/recipe-view.test.ts`:

```ts
import { getFeaturedRecipes } from "./recipe-view";

describe("getFeaturedRecipes", () => {
  it("returns the first N items", () => {
    const items = [
      cardItem({ recipe: { ...cardItem({}).recipe, id: "a" }, match: 90 }),
      cardItem({ recipe: { ...cardItem({}).recipe, id: "b" }, match: 80 }),
      cardItem({ recipe: { ...cardItem({}).recipe, id: "c" }, match: 70 }),
    ];
    expect(getFeaturedRecipes(items, 2).map((i) => i.recipe.id)).toEqual(["a", "b"]);
  });

  it("returns an empty array when there are no items", () => {
    expect(getFeaturedRecipes([], 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/recipe-view.test.ts`
Expected: FAIL — `getFeaturedRecipes is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `frontend/src/lib/recipe-view.ts`:

```ts
export function getFeaturedRecipes(items: readonly RecipeCardItem[], limit: number): RecipeCardItem[] {
  return items.slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/recipe-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/recipe-view.ts frontend/src/lib/recipe-view.test.ts
git commit -m "feat(recipes): add getFeaturedRecipes helper"
```

---

## Task 4: RecipeCard collapsed preview + on-card shopping button

**Files:**
- Modify: `frontend/src/routes/recipes.tsx` (RecipeCard component + imports)

Render the ingredient preview and shopping button on the collapsed card. The shopping button shows only when `missing.length > 0` (per decision). JSX-only — verified by type-check, lint, and visual run.

- [ ] **Step 1: Import the helper**

In `frontend/src/routes/recipes.tsx`, add `getIngredientPreview` to the existing import from `@/lib/recipe-view` (the block at lines ~26-38).

- [ ] **Step 2: Render preview + button inside the collapsed card button**

In `RecipeCard`, inside the `<button onClick={onToggle}>` content, after the `showMatch` progress-bar block (around line 388) and before the closing `</div>` of the `min-w-0 flex-1` wrapper, insert:

```tsx
{(() => {
  const preview = getIngredientPreview(item, 5);
  if (preview.chips.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {preview.chips.map((chip) => (
        <span
          key={`${chip.status}-${chip.name}`}
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            chip.status === "have" && "bg-success-soft text-success",
            chip.status === "missing" && "bg-secondary text-muted-foreground",
            chip.status === "neutral" && "bg-secondary text-muted-foreground",
          )}
        >
          {chip.status === "have" ? <Check className="h-2.5 w-2.5" /> : null}
          {chip.status === "missing" ? <ShoppingCart className="h-2.5 w-2.5" /> : null}
          {chip.name}
        </span>
      ))}
      {preview.extra > 0 ? (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          +{preview.extra} more
        </span>
      ) : null}
    </div>
  );
})()}
```

- [ ] **Step 3: Add the on-card shopping button**

Immediately after the block from Step 2 (still inside the `min-w-0 flex-1` wrapper), insert. `onAddMissingItems` and `isAdding` are existing props; calling it from here must not toggle the card, so stop propagation:

```tsx
{missing.length > 0 ? (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      onAddMissingItems();
    }}
    disabled={isAdding}
    className="mt-2 flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[11px] font-bold text-background transition disabled:opacity-60"
  >
    <ShoppingCart className="h-3 w-3" />
    {isAdding ? "Adding..." : "+ В список"}
  </button>
) : null}
```

- [ ] **Step 4: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no errors. (`Check` and `ShoppingCart` are already imported in this file.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/recipes.tsx
git commit -m "feat(recipes): show ingredient preview and shopping button on collapsed card"
```

---

## Task 5: Featured strip on the recommended tab

**Files:**
- Modify: `frontend/src/routes/recipes.tsx` (Recipes component + new FeaturedRecipeCard)

On the recommended tab, render a horizontal strip of top picks above the list. Tapping a featured card opens the matching list card via the existing `open` state. To avoid showing the same recipe twice, exclude featured ids from the list below on this tab.

- [ ] **Step 1: Import the helper**

Add `getFeaturedRecipes` to the existing `@/lib/recipe-view` import in `frontend/src/routes/recipes.tsx`.

- [ ] **Step 2: Compute featured + deduped list**

In the `Recipes` component, after `visibleRecipes` is computed (around line 97), add:

```tsx
const featured = useMemo(
  () => (activeTab === "recommended" ? getFeaturedRecipes(visibleRecipes, 5) : []),
  [activeTab, visibleRecipes],
);
const featuredIds = useMemo(() => new Set(featured.map((item) => item.recipe.id)), [featured]);
const listRecipes = useMemo(
  () => visibleRecipes.filter((item) => !featuredIds.has(item.recipe.id)),
  [featuredIds, visibleRecipes],
);
```

- [ ] **Step 3: Render the strip and switch the list to `listRecipes`**

Before the `<div className="mb-2 flex items-center justify-between px-1">` "Showing X of Y" block (around line 224), insert:

```tsx
{featured.length > 0 ? (
  <div className="mb-4">
    <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-bold text-muted-foreground">
      <Sparkles className="h-3.5 w-3.5 text-primary" />
      Top picks for your kitchen
    </p>
    <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {featured.map((item) => (
        <FeaturedRecipeCard
          key={item.recipe.id}
          item={item}
          onOpen={() => setOpen(item.recipe.id)}
        />
      ))}
    </div>
  </div>
) : null}
```

Then change the list renderer (around line 246) from `visibleRecipes.map(...)` to `listRecipes.map(...)`, and the empty-state guard (line 235) from `visibleRecipes.length === 0` to `listRecipes.length === 0 && featured.length === 0`.

- [ ] **Step 4: Add the FeaturedRecipeCard component**

At the end of `frontend/src/routes/recipes.tsx`, add:

```tsx
function FeaturedRecipeCard({ item, onOpen }: { item: RecipeCardItem; onOpen: () => void }) {
  const { recipe, match } = item;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-40 shrink-0 flex-col gap-2 rounded-[1.35rem] border border-border bg-card p-3 text-left shadow-[0_10px_30px_rgba(15,47,37,0.06)] transition active:scale-[0.98]"
    >
      <div className="flex items-center justify-between">
        {recipe.imageUrl ? (
          <img src={recipe.imageUrl} alt="" className="h-12 w-12 rounded-2xl object-cover" loading="lazy" />
        ) : (
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-2xl">
            {recipe.emoji}
          </span>
        )}
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", getMatchColor(match))}>
          {match}%
        </span>
      </div>
      <p className="line-clamp-2 text-sm font-bold leading-snug">{recipe.name}</p>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{recipe.minutes}m</span>
        <span className="flex items-center gap-1"><Flame className="h-3 w-3" />{recipe.calories}</span>
      </div>
    </button>
  );
}
```

- [ ] **Step 5: Type-check, lint, and run unit tests**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: no errors, all tests pass. (`Sparkles`, `Clock`, `Flame`, `getMatchColor`, `RecipeCardItem` are already imported.)

- [ ] **Step 6: Visual verification**

Use the `run` skill to launch the app, open `/recipes`, and confirm: recommended tab shows the strip; switching to "All recipes" hides it; collapsed cards show ingredient chips + shopping button; no recipe appears twice on the recommended tab.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/recipes.tsx
git commit -m "feat(recipes): add featured top-picks strip to recommended tab"
```

---

# Phase B — Backend: extract shared matching

## Task 6: Extract `build_recipe_matches`

**Files:**
- Create: `app/services/recipes/__init__.py`
- Create: `app/services/recipes/matching.py`
- Create: `tests/test_recipe_matching_service.py`
- Modify: `app/api/v1/endpoints/recipes.py` (use the helper)

The fridge→recipe ranking in `list_recipe_matches` ([recipes.py:256-320](../../../app/api/v1/endpoints/recipes.py)) must be reusable by the meal planner. Extract it verbatim into a service, returning plain dicts identical to today's payload, then call it from the endpoint.

- [ ] **Step 1: Write the failing test**

Create `tests/test_recipe_matching_service.py`:

```python
from __future__ import annotations

from app.services.recipes.matching import build_recipe_matches


def test_build_recipe_matches_ranks_fridge_cookable_first(client, fridge_id):
    # client fixture seeds recipes + a fridge with inventory
    session_factory = client.app.state.session_factory
    with session_factory() as session:
        matches = build_recipe_matches(
            session,
            fridge_id=fridge_id,
            goal="all",
            max_missing=20,
        )

    assert matches, "expected at least one match"
    # Sorted by fewest missing, then highest score
    missing_counts = [len(m["missing_ingredients"]) for m in matches]
    assert missing_counts == sorted(missing_counts)
    first = matches[0]
    assert set(first.keys()) >= {
        "recipe",
        "match_score",
        "available_ingredients",
        "missing_ingredients",
        "shopping_list_ready",
        "nutrition_summary",
    }


def test_build_recipe_matches_returns_empty_for_unknown_fridge(client):
    session_factory = client.app.state.session_factory
    with session_factory() as session:
        matches = build_recipe_matches(session, fridge_id=999999, goal="all", max_missing=3)
    assert matches == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_recipe_matching_service.py -v`
Expected: FAIL — `ModuleNotFoundError: app.services.recipes.matching`.

- [ ] **Step 3: Create the package marker**

Create `app/services/recipes/__init__.py` (empty file).

- [ ] **Step 4: Implement the matcher**

Create `app/services/recipes/matching.py`:

```python
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Fridge, InventoryItem, Recipe


def build_recipe_matches(
    session: Session,
    *,
    fridge_id: int,
    goal: str = "all",
    max_missing: int = 3,
) -> list[dict[str, object]]:
    # Imported lazily to avoid a circular import with the recipes endpoint module.
    from app.api.v1.endpoints.recipes import (
        _ingredient_model_payload,
        _recipe_goals,
        _recipe_ingredients,
        _recipe_nutrition_summary,
        _recipe_payload,
    )

    fridge = session.get(Fridge, fridge_id)
    if fridge is None:
        return []

    inventory_items = session.scalars(
        select(InventoryItem).where(InventoryItem.fridge_id == fridge_id)
    ).all()
    available_names = {item.normalized_name for item in inventory_items}

    recipes = session.scalars(
        select(Recipe)
        .options(selectinload(Recipe.ingredients))
        .where(Recipe.is_active.is_(True))
        .order_by(Recipe.id.asc())
    ).all()

    matches: list[dict[str, object]] = []
    for recipe in recipes:
        recipe_goals = _recipe_goals(recipe)
        if goal != "all" and goal not in recipe_goals:
            continue

        ingredients = _recipe_ingredients(recipe)
        ingredient_names = [ingredient.normalized_name for ingredient in ingredients]
        available_ingredients = [
            _ingredient_model_payload(ingredient)
            for ingredient in ingredients
            if ingredient.normalized_name in available_names
        ]
        missing_ingredients = [
            _ingredient_model_payload(ingredient)
            for ingredient in ingredients
            if ingredient.normalized_name not in available_names and not ingredient.optional
        ]
        if len(missing_ingredients) > max_missing:
            continue

        match_score = 0
        if ingredient_names:
            match_score = round((len(available_ingredients) / len(ingredient_names)) * 100)

        matches.append(
            {
                "recipe": _recipe_payload(recipe),
                "match_score": match_score,
                "available_ingredients": available_ingredients,
                "missing_ingredients": missing_ingredients,
                "shopping_list_ready": len(missing_ingredients) > 0,
                "nutrition_summary": _recipe_nutrition_summary(recipe),
            }
        )

    matches.sort(
        key=lambda item: (
            len(item["missing_ingredients"]),
            -int(item["match_score"]),
            str(item["recipe"]["name"]),
        )
    )
    return matches
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_recipe_matching_service.py -v`
Expected: PASS.

- [ ] **Step 6: Refactor the endpoint to use the helper**

In `app/api/v1/endpoints/recipes.py`, replace the body of `list_recipe_matches` (lines 262-320, everything that builds and sorts `matches`) with a call to the helper, keeping the existing response envelope and `max_missing`/`goal` query params:

```python
    matches = build_recipe_matches(
        session,
        fridge_id=fridge_id,
        goal=goal,
        max_missing=max_missing,
    )
    return {"data": matches, "meta": build_list_meta(len(matches))}
```

Add the import at the top: `from app.services.recipes.matching import build_recipe_matches`.

- [ ] **Step 7: Run the matching API regression test**

Run: `pytest tests/test_recipe_matching_api.py tests/test_recipe_matching_service.py -v`
Expected: PASS (endpoint behavior unchanged).

- [ ] **Step 8: Commit**

```bash
git add app/services/recipes/ tests/test_recipe_matching_service.py app/api/v1/endpoints/recipes.py
git commit -m "refactor(recipes): extract build_recipe_matches into shared service"
```

---

# Phase C — Backend: real meal-plan generation

## Task 7: Meal-plan builder — calorie targets + deterministic fallback

**Files:**
- Create: `app/services/meal_plan/__init__.py`
- Create: `app/services/meal_plan/builder.py`
- Create: `tests/test_meal_plan_builder.py`

Pure logic, no DB: given an ordered candidate pool (recipe ids ranked fridge-first), produce a day-by-day assignment for breakfast/lunch/dinner with variety (no recipe on two consecutive days when avoidable) and a soft calorie target. Also a validator for LLM output.

- [ ] **Step 1: Write the failing test**

Create `tests/test_meal_plan_builder.py`:

```python
from __future__ import annotations

from app.services.meal_plan.builder import (
    MEAL_SLOTS,
    calorie_target_for_goal,
    fallback_assignment,
    validate_llm_assignment,
)


def test_meal_slots_excludes_snack():
    assert MEAL_SLOTS == ("breakfast", "lunch", "dinner")


def test_calorie_target_for_goal():
    assert calorie_target_for_goal("lose") == 1600
    assert calorie_target_for_goal("maintain") == 2000
    assert calorie_target_for_goal("gain") == 2500
    assert calorie_target_for_goal(None) == 2000


def test_fallback_assignment_shape_and_variety():
    pool = [101, 102, 103, 104, 105, 106]
    plan = fallback_assignment(pool, span_days=2)
    assert len(plan) == 2
    for day in plan:
        assert list(day.keys()) == list(MEAL_SLOTS)
    # No recipe repeats between consecutive days in the same slot when the pool is large enough
    for slot in MEAL_SLOTS:
        assert plan[0][slot] != plan[1][slot]


def test_fallback_assignment_wraps_small_pool():
    plan = fallback_assignment([7], span_days=2)
    assert len(plan) == 2
    assert all(day[slot] == 7 for day in plan for slot in MEAL_SLOTS)


def test_fallback_assignment_empty_pool_returns_empty():
    assert fallback_assignment([], span_days=3) == []


def test_validate_llm_assignment_accepts_valid():
    pool_ids = {1, 2, 3}
    raw = {"days": [{"breakfast": 1, "lunch": 2, "dinner": 3}]}
    assert validate_llm_assignment(raw, pool_ids=pool_ids, span_days=1) == [
        {"breakfast": 1, "lunch": 2, "dinner": 3}
    ]


def test_validate_llm_assignment_rejects_out_of_pool_id():
    assert validate_llm_assignment(
        {"days": [{"breakfast": 1, "lunch": 2, "dinner": 99}]},
        pool_ids={1, 2, 3},
        span_days=1,
    ) is None


def test_validate_llm_assignment_rejects_wrong_day_count():
    assert validate_llm_assignment(
        {"days": [{"breakfast": 1, "lunch": 2, "dinner": 3}]},
        pool_ids={1, 2, 3},
        span_days=2,
    ) is None


def test_validate_llm_assignment_rejects_missing_slot():
    assert validate_llm_assignment(
        {"days": [{"breakfast": 1, "lunch": 2}]},
        pool_ids={1, 2, 3},
        span_days=1,
    ) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_meal_plan_builder.py -v`
Expected: FAIL — `ModuleNotFoundError: app.services.meal_plan.builder`.

- [ ] **Step 3: Create the package marker**

Create `app/services/meal_plan/__init__.py` (empty file).

- [ ] **Step 4: Implement the builder**

Create `app/services/meal_plan/builder.py`:

```python
from __future__ import annotations

from typing import Any

MEAL_SLOTS: tuple[str, ...] = ("breakfast", "lunch", "dinner")

_CALORIE_TARGETS = {"lose": 1600, "maintain": 2000, "gain": 2500}
_DEFAULT_CALORIE_TARGET = 2000


def calorie_target_for_goal(goal: str | None) -> int:
    if goal is None:
        return _DEFAULT_CALORIE_TARGET
    return _CALORIE_TARGETS.get(goal, _DEFAULT_CALORIE_TARGET)


def fallback_assignment(pool: list[int], span_days: int) -> list[dict[str, int]]:
    """Assign recipe ids to slots, walking the ranked pool with simple variety.

    The pool is ordered fridge-cookable first. We walk it round-robin across all
    slots of all days; when the pool is larger than the slots-per-day count this
    naturally avoids repeating a recipe in the same slot on consecutive days.
    """
    if not pool or span_days <= 0:
        return []

    plan: list[dict[str, int]] = []
    cursor = 0
    for _ in range(span_days):
        day: dict[str, int] = {}
        for slot in MEAL_SLOTS:
            day[slot] = pool[cursor % len(pool)]
            cursor += 1
        plan.append(day)
    return plan


def validate_llm_assignment(
    raw: Any,
    *,
    pool_ids: set[int],
    span_days: int,
) -> list[dict[str, int]] | None:
    """Return a normalized assignment, or None if the LLM output is unusable."""
    if not isinstance(raw, dict):
        return None
    days = raw.get("days")
    if not isinstance(days, list) or len(days) != span_days:
        return None

    normalized: list[dict[str, int]] = []
    for day in days:
        if not isinstance(day, dict):
            return None
        normalized_day: dict[str, int] = {}
        for slot in MEAL_SLOTS:
            value = day.get(slot)
            if not isinstance(value, int) or isinstance(value, bool):
                return None
            if value not in pool_ids:
                return None
            normalized_day[slot] = value
        normalized.append(normalized_day)
    return normalized
```

> **Note on variety:** the round-robin cursor advances across slots *and* days, so with a pool larger than 3 the same id will not land in the same slot on consecutive days. The test `test_fallback_assignment_shape_and_variety` covers this.

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_meal_plan_builder.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/services/meal_plan/ tests/test_meal_plan_builder.py
git commit -m "feat(meal-plan): add builder with calorie targets, fallback, and LLM validation"
```

---

## Task 8: LLM meal planner service

**Files:**
- Create: `app/services/llm/meal_planner.py`
- Modify: `app/services/llm/__init__.py` (export)

Mirror `MiniMaxRecipeAssistant`: cache via `AiArtifactStore`, prompt versioning, return the raw JSON for the validator to check. No new test here — its output is validated by `validate_llm_assignment` (Task 7) and exercised in the endpoint integration test (Task 9).

- [ ] **Step 1: Implement the planner**

Create `app/services/llm/meal_planner.py`:

```python
from __future__ import annotations

import json
from typing import Any, Protocol

from app.services.cache.provider_cache import JsonContainer, JsonValue
from app.services.llm.artifacts import AiArtifactStore
from app.services.llm.minimax import MiniMaxJsonResult
from sqlalchemy.orm import Session


class JsonChatService(Protocol):
    model: str

    def complete_json(self, **kwargs: Any) -> MiniMaxJsonResult: ...


class MiniMaxMealPlanner:
    def __init__(
        self,
        *,
        chat_service: JsonChatService,
        session: Session,
        prompt_version: str = "meal-plan-v1",
    ) -> None:
        self._chat_service = chat_service
        self._artifact_store = AiArtifactStore(session)
        self._prompt_version = prompt_version

    def generate_plan(self, input_payload: JsonValue) -> JsonContainer:
        cached_output = self._artifact_store.get_output(
            task_type="meal_plan_generation",
            model=self._chat_service.model,
            input_payload=input_payload,
            prompt_version=self._prompt_version,
        )
        if cached_output is not None:
            return cached_output

        result = self._chat_service.complete_json(
            messages=self._build_messages(input_payload),
            max_completion_tokens=2000,
            temperature=0.4,
        )
        return self._artifact_store.store_output(
            task_type="meal_plan_generation",
            model=self._chat_service.model,
            input_payload=input_payload,
            prompt_version=self._prompt_version,
            output_json=result.output_json,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
        )

    def _build_messages(self, input_payload: JsonValue) -> list[dict[str, Any]]:
        return [
            {
                "role": "system",
                "content": (
                    "You are FitFood's meal planning engine. You receive a pool of "
                    "candidate recipes (each with id, name, match_score, missing_count, "
                    "calories), a span in days, a daily calorie target, and the meal slots "
                    "breakfast/lunch/dinner. Select one recipe id PER SLOT PER DAY, choosing "
                    "ONLY ids present in the pool. Prefer high match_score (fridge-cookable), "
                    "keep each day's total calories near the target, vary dishes so the same "
                    "recipe does not repeat on consecutive days. Return ONLY valid JSON: "
                    '{"days":[{"breakfast":<id>,"lunch":<id>,"dinner":<id>}, ...]} with '
                    "exactly one object per day."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    input_payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True
                ),
            },
        ]
```

- [ ] **Step 2: Export it**

In `app/services/llm/__init__.py`, add `from app.services.llm.meal_planner import MiniMaxMealPlanner` and append `"MiniMaxMealPlanner"` to `__all__`.

- [ ] **Step 3: Verify it imports**

Run: `python -c "from app.services.llm import MiniMaxMealPlanner; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add app/services/llm/meal_planner.py app/services/llm/__init__.py
git commit -m "feat(meal-plan): add MiniMaxMealPlanner LLM service"
```

---

## Task 9: Wire generation into the endpoint (pool → LLM → fallback, drop snack)

**Files:**
- Modify: `app/api/v1/endpoints/meal_plans.py`
- Modify: `app/api/v1/deps.py` (DI provider)
- Modify: `tests/test_meal_plan_api.py` (extend)

Replace the modulo stub. Build the candidate pool from the fridge matcher, try the LLM planner, validate, and fall back deterministically on any failure. Generate breakfast/lunch/dinner only.

- [ ] **Step 1: Extend the API test (failing)**

Add to `tests/test_meal_plan_api.py`:

```python
def test_meal_plan_excludes_snack_and_uses_three_meals(client, fridge_id):
    response = client.post(
        "/api/v1/meal-plans",
        json={"fridge_id": fridge_id, "span_days": 2},
    )
    assert response.status_code == 201
    entries = response.json()["data"]["entries"]
    meal_types = {entry["meal_type"] for entry in entries}
    assert meal_types == {"breakfast", "lunch", "dinner"}
    assert "snack" not in meal_types
    # 2 days * 3 meals
    assert len(entries) == 6


def test_meal_plan_avoids_consecutive_day_repeats_when_possible(client, fridge_id):
    response = client.post(
        "/api/v1/meal-plans",
        json={"fridge_id": fridge_id, "span_days": 2},
    )
    entries = response.json()["data"]["entries"]
    by_day: dict[int, dict[str, int]] = {}
    for entry in entries:
        by_day.setdefault(entry["day_index"], {})[entry["meal_type"]] = entry["recipe_id"]
    # With the seeded recipe catalog (>3 recipes) no slot repeats day-to-day
    for meal_type in ("breakfast", "lunch", "dinner"):
        assert by_day[0][meal_type] != by_day[1][meal_type]
```

> If the seeded catalog has 3 or fewer recipes, relax the second test to assert the plan is non-empty instead. Check `tests/conftest.py` seeding before finalizing.

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_meal_plan_api.py -v`
Expected: FAIL — current stub generates 4 meal types incl. snack (8 entries), so the assertions fail.

- [ ] **Step 3: Add the DI provider**

In `app/api/v1/deps.py`, add a provider mirroring the receipt-OCR one (reuse the same chat-service selection and budget enforcement):

```python
def get_meal_planner(
    request: Request,
    session: Session = Depends(get_session),
) -> Generator["MiniMaxMealPlanner | None", None, None]:
    settings = get_settings(request)
    api_key = (
        settings.openrouter_api_key
        if settings.llm_provider == "openrouter"
        else settings.minimax_api_key
    )
    if not api_key:
        yield None
        return

    base_url = (
        settings.openrouter_base_url
        if settings.llm_provider == "openrouter"
        else settings.minimax_base_url
    )
    client = httpx.Client(base_url=base_url)
    try:
        chat_service = (
            OpenRouterChatService(
                http_client=client,
                base_url=settings.openrouter_base_url,
                api_key=settings.openrouter_api_key,
                model=settings.openrouter_model,
                http_referer=settings.openrouter_http_referer,
                app_title=settings.openrouter_app_title,
            )
            if settings.llm_provider == "openrouter"
            else MiniMaxChatService(
                http_client=client,
                base_url=settings.minimax_base_url,
                api_key=settings.minimax_api_key,
                model=settings.minimax_model,
            )
        )
        yield MiniMaxMealPlanner(chat_service=chat_service, session=session)
    finally:
        client.close()
```

Add the import near the other LLM imports: `from app.services.llm import MiniMaxMealPlanner`. Confirm `Request` and `Generator` are already imported in deps.py (they are, used by `get_receipt_ocr_service`).

- [ ] **Step 4: Rewrite generation in the endpoint**

In `app/api/v1/endpoints/meal_plans.py`:

1. **Do NOT change the module constant `MEAL_TYPES`** — it stays `("breakfast", "lunch", "dinner", "snack")` because `_normalize_meal_type` (manual entry validation) and `serialize_meal_plan`'s sort key (`MEAL_TYPES.index(entry.meal_type)`) both depend on it including snack. Auto-generation uses the builder's `MEAL_SLOTS` (3 meals) instead, so snack is dropped from generation without breaking manual snack entries or serialization.
2. Add imports:
   ```python
   from app.api.v1.deps import get_meal_planner
   from app.services.llm import MiniMaxMealPlanner
   from app.services.meal_plan.builder import (
       MEAL_SLOTS,
       calorie_target_for_goal,
       fallback_assignment,
       validate_llm_assignment,
   )
   from app.services.recipes.matching import build_recipe_matches
   ```
3. Add `meal_planner: MiniMaxMealPlanner | None = Depends(get_meal_planner)` to the `create_meal_plan` signature.
4. Replace the recipe-selection block (current lines ~196-226, from `recipes = session.scalars(...)` through the nested `for` loops) with:

```python
    goal_value = None if payload.goal == "all" else payload.goal
    matches = build_recipe_matches(
        session,
        fridge_id=payload.fridge_id,
        goal=payload.goal or "all",
        max_missing=20,
    )
    if not matches:
        matches = build_recipe_matches(
            session, fridge_id=payload.fridge_id, goal="all", max_missing=99
        )

    pool_ids = [int(match["recipe"]["id"]) for match in matches]
    recipes_by_id = {
        int(match["recipe"]["id"]): session.get(Recipe, int(match["recipe"]["id"]))
        for match in matches
    }

    assignment: list[dict[str, int]] | None = None
    if meal_planner is not None and pool_ids:
        try:
            llm_input = {
                "span_days": payload.span_days,
                "goal": goal_value,
                "daily_calorie_target": calorie_target_for_goal(goal_value),
                "meals": list(MEAL_SLOTS),
                "pool": [
                    {
                        "id": int(match["recipe"]["id"]),
                        "name": match["recipe"]["name"],
                        "match_score": match["match_score"],
                        "missing_count": len(match["missing_ingredients"]),
                        "calories": match["nutrition_summary"].get("calories", 0),
                    }
                    for match in matches
                ],
            }
            raw_output = meal_planner.generate_plan(llm_input)
            assignment = validate_llm_assignment(
                raw_output, pool_ids=set(pool_ids), span_days=payload.span_days
            )
        except Exception:
            assignment = None

    if assignment is None:
        assignment = fallback_assignment(pool_ids, payload.span_days)

    for day_index, day in enumerate(assignment):
        for meal_type in MEAL_SLOTS:
            recipe = recipes_by_id.get(day[meal_type])
            if recipe is None:
                continue
            session.add(
                MealPlanEntry(
                    meal_plan_id=meal_plan.id,
                    day_index=day_index,
                    meal_type=meal_type,
                    recipe=recipe,
                    recipe_id=recipe.id,
                    servings=1,
                    nutrition_snapshot_json=_nutrition_snapshot_for_recipe(recipe, 1),
                )
            )
```

> Keep the `meal_plan.goal` assignment (line ~187) as `None if payload.goal == "all" else payload.goal` — already present. The `selectinload(Recipe.ingredients)` for `recipes_by_id` is satisfied because `build_recipe_matches` already loaded them; `session.get` returns the identity-mapped instances.

- [ ] **Step 5: Run the full meal-plan test suite**

Run: `pytest tests/test_meal_plan_api.py tests/test_meal_plan_builder.py -v`
Expected: PASS — 3 meal types, 6 entries for 2 days, no consecutive repeats, existing nutrition-snapshot tests still green.

- [ ] **Step 6: Run the whole backend suite for regressions**

Run: `pytest -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/endpoints/meal_plans.py app/api/v1/deps.py tests/test_meal_plan_api.py
git commit -m "feat(meal-plan): fridge-aware LLM generation with deterministic fallback, drop snack"
```

---

## Final verification

- [ ] **Backend:** `pytest -q` → all green.
- [ ] **Frontend:** `cd frontend && npx tsc --noEmit && npm run lint && npx vitest run` → all green.
- [ ] **Visual (run skill):** `/planner` shows dish names; rebuilding a plan yields fridge-relevant, varied dishes across days; no snack row. `/recipes` recommended tab shows the featured strip and per-card ingredient chips + shopping button; "All recipes" hides the strip.

---

## Spec Coverage Check

| Spec requirement | Task |
|------------------|------|
| Tab differentiation (featured strip) | Task 3, 5 |
| Collapsed ingredient preview (✅/🛒) | Task 2, 4 |
| On-card shopping button (only when missing) | Task 4 |
| Planner recipe names | Task 1 |
| Reusable fridge matcher | Task 6 |
| Calorie target by goal | Task 7 |
| LLM generation path | Task 8, 9 |
| Deterministic fallback (fridge-first, variety) | Task 7, 9 |
| Snack removed from generation | Task 7, 9 |
| Tests (matcher parity, fallback, validation, integration) | Task 6, 7, 9 |
