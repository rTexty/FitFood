import { describe, expect, it } from "vitest";
import {
  filterRecipeMenuItems,
  getAllRecipeMenuItems,
  getRecipeCategoryOptions,
  getRecipeReadinessCounts,
  getRecipeTabView,
  mergeRecipeMenuWithMatches,
  getRecommendedRecipeMatches,
} from "./recipe-view";
import type { RecipeMatch } from "./api/types";

function recipeMatch(
  id: string,
  name: string,
  goals: RecipeMatch["recipe"]["goals"],
  matchScore: number,
  missingCount: number,
): RecipeMatch {
  return {
    recipe: {
      id,
      name,
      hero_emoji: "🍽️",
      image_url: null,
      source_provider: null,
      minutes: 20,
      servings: 1,
      tags: ["Recipe"],
      goals,
      nutrition_summary: { calories: 400, protein: 20, carbs: 40, fat: 12 },
      ingredients: [],
      instructions: [],
    },
    match_score: matchScore,
    available_ingredients: [],
    missing_ingredients: Array.from({ length: missingCount }, (_, index) => ({
      name: `Missing ${index + 1}`,
      normalized_name: `missing-${index + 1}`,
    })),
    shopping_list_ready: missingCount > 0,
    nutrition_summary: { calories: 400, protein: 20, carbs: 40, fat: 12 },
  };
}

describe("recipe view helpers", () => {
  it("sorts the full recipe menu alphabetically without removing items", () => {
    const menuItems = getAllRecipeMenuItems([
      recipeMatch("2", "Zucchini Bowl", ["maintain"], 80, 1),
      recipeMatch("1", "Apple Oats", ["lose"], 20, 3),
      recipeMatch("3", "Banana Toast", ["gain"], 100, 0),
    ]);

    expect(menuItems.map((item) => item.recipe.name)).toEqual([
      "Apple Oats",
      "Banana Toast",
      "Zucchini Bowl",
    ]);
  });

  it("recommends goal-matching recipes before ranking by products on hand", () => {
    const recommended = getRecommendedRecipeMatches(
      [
        recipeMatch("1", "Almost Ready Bulk Bowl", ["gain"], 95, 1),
        recipeMatch("2", "Lean Chicken Bowl", ["lose"], 80, 1),
        recipeMatch("3", "Perfect Pasta", ["maintain"], 100, 0),
        recipeMatch("4", "Light Omelet", ["lose", "maintain"], 80, 0),
      ],
      "lose",
    );

    expect(recommended.map((item) => item.recipe.name)).toEqual([
      "Light Omelet",
      "Lean Chicken Bowl",
    ]);
  });

  it("builds tab state with counts, active list, match visibility, and empty text", () => {
    const allRecipes = getAllRecipeMenuItems([
      recipeMatch("1", "Apple Oats", ["lose"], 20, 3),
      recipeMatch("2", "Banana Toast", ["gain"], 100, 0),
    ]);
    const recommendedRecipes = getRecommendedRecipeMatches(
      [recipeMatch("1", "Apple Oats", ["lose"], 80, 1)],
      "lose",
    );

    const recommendedView = getRecipeTabView("recommended", allRecipes, recommendedRecipes);
    const allView = getRecipeTabView("all", allRecipes, recommendedRecipes);

    expect(recommendedView.counts).toEqual({ recommended: 1, all: 2 });
    expect(recommendedView.list.map((item) => item.recipe.name)).toEqual(["Apple Oats"]);
    expect(recommendedView.showMatch).toBe(true);
    expect(recommendedView.emptyMessage).toContain("Add more products");

    expect(allView.list.map((item) => item.recipe.name)).toEqual(["Apple Oats", "Banana Toast"]);
    expect(allView.showMatch).toBe(false);
    expect(allView.emptyMessage).toContain("recipe catalog");
  });

  it("merges saved recipes with kitchen match data for product-aware filtering", () => {
    const allRecipes = [
      recipeMatch("1", "Apple Oats", ["lose"], 0, 0).recipe,
      recipeMatch("2", "Banana Toast", ["gain"], 0, 0).recipe,
      recipeMatch("3", "Chicken Curry", ["maintain"], 0, 0).recipe,
    ];
    const merged = mergeRecipeMenuWithMatches(allRecipes, [
      recipeMatch("1", "Apple Oats", ["lose"], 100, 0),
      recipeMatch("2", "Banana Toast", ["gain"], 75, 2),
      recipeMatch("3", "Chicken Curry", ["maintain"], 25, 5),
    ]);

    expect(getRecipeReadinessCounts(merged)).toEqual({ ready: 1, close: 1, shop: 1 });
    expect(
      filterRecipeMenuItems(merged, {
        search: "banana",
        category: "All",
        readiness: "close",
      }).map((item) => item.recipe.name),
    ).toEqual(["Banana Toast"]);
  });

  it("builds category options from the most common recipe tags", () => {
    const menuItems = getAllRecipeMenuItems([
      {
        ...recipeMatch("1", "Apple Oats", ["lose"], 20, 3).recipe,
        tags: ["Breakfast", "Quick"],
      },
      {
        ...recipeMatch("2", "Banana Toast", ["gain"], 100, 0).recipe,
        tags: ["Breakfast"],
      },
      {
        ...recipeMatch("3", "Chicken Curry", ["maintain"], 60, 1).recipe,
        tags: ["Chicken"],
      },
    ]);

    expect(getRecipeCategoryOptions(menuItems)).toEqual(["Breakfast", "Chicken", "Quick"]);
  });
});

import { getIngredientPreview, getFeaturedRecipes } from "./recipe-view";
import type { RecipeCardItem } from "./recipe-view";

function cardItem(overrides: Partial<RecipeCardItem>): RecipeCardItem {
  return {
    recipe: {
      id: "r1",
      name: "Test",
      emoji: "🍽️",
      imageUrl: null,
      sourceProvider: null,
      minutes: 20,
      calories: 400,
      protein: 20,
      carbs: 40,
      fat: 12,
      goals: [],
      tags: ["Recipe"],
      ingredients: ["a", "b", "c", "d", "e", "f"],
      steps: [],
      tag: "Recipe",
    },
    match: 0,
    have: [],
    missing: [],
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
