# UX Redesign: Recipes & Planner

**Date:** 2026-06-28  
**Scope:** `recipes.tsx`, `planner.tsx`  
**Style direction:** Stay in current green/card design system, elevate hierarchy and info density

---

## Problems Being Solved

1. **Recipes — "Best for you" vs "All recipes" look identical** — no visual differentiation between tabs
2. **Recipes — ingredients hidden** — only visible after expanding a card, user doesn't know what a recipe needs at a glance
3. **Recipes — shopping list button buried** — only appears inside expanded card when missing ingredients exist
4. **Planner — recipe names invisible** — compact rows only show emoji + 3-letter abbreviation + calories, user can't read what's planned

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

The day label column stays at `w-16`. Slot columns stretch evenly across remaining width (`grid-cols-3 flex-1`).

> **Implementation note:** Verify that the `MealPlanEntry.recipe` object from `groupMealPlanByDay` includes a `name` (or equivalent) field. If it does not exist on the type, check the backend response shape and add the field to the frontend type before rendering.

No changes to the nutrition summary pill at the top or the span selector (Daily / 3-Day / Weekly).

---

## Files to Change

| File | Changes |
|------|---------|
| `frontend/src/routes/recipes.tsx` | Add `FeaturedRecipeCard`, featured strip section, ingredient preview + shopping button to collapsed `RecipeCard` |
| `frontend/src/routes/planner.tsx` | Update meal slot layout to show recipe name |

No API changes, no new queries, no new mutations. All data already available in existing query responses.

---

## Out of Scope

- Shopping list as a dedicated route/page
- Meal plan generation quality improvements (AI prompt changes)
- Dashboard "For You" section (not currently in the UI)
- Planner: tapping a meal slot to see recipe detail
