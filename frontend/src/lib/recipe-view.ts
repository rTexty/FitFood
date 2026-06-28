import type { Goal } from "./fitfood-data";
import type { RecipeDetails, RecipeMatch } from "./api/types";

export interface RecipeCardRecipe {
  id: string;
  name: string;
  emoji: string;
  imageUrl: string | null;
  sourceProvider: string | null;
  minutes: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  goals: Goal[];
  tags: string[];
  ingredients: string[];
  steps: string[];
  tag: string;
}

export interface RecipeCardItem {
  recipe: RecipeCardRecipe;
  match: number;
  have: string[];
  missing: string[];
}

export type RecipeTab = "recommended" | "all";
export type RecipeReadinessFilter = "smart" | "ready" | "close" | "shop";

export interface RecipeMenuFilters {
  search: string;
  category: string;
  readiness: RecipeReadinessFilter;
}

export interface RecipeTabView {
  list: RecipeCardItem[];
  showMatch: boolean;
  counts: Record<RecipeTab, number>;
  emptyMessage: string;
}

type RecipeMenuInput = RecipeDetails | RecipeMatch;

function isRecipeMatch(item: RecipeMenuInput): item is RecipeMatch {
  return "recipe" in item && "match_score" in item;
}

function toRecipeCardRecipe(recipe: RecipeDetails): RecipeCardRecipe {
  return {
    id: recipe.id,
    name: recipe.name,
    emoji: recipe.hero_emoji,
    imageUrl: recipe.image_url ?? null,
    sourceProvider: recipe.source_provider ?? null,
    minutes: recipe.minutes,
    calories: recipe.nutrition_summary.calories,
    protein: recipe.nutrition_summary.protein,
    carbs: recipe.nutrition_summary.carbs,
    fat: recipe.nutrition_summary.fat,
    goals: recipe.goals,
    tags: recipe.tags,
    ingredients: recipe.ingredients.map((ingredient) => ingredient.name),
    steps: recipe.instructions,
    tag: recipe.tags[0] ?? "Recipe",
  };
}

function toRecipeCardItem(input: RecipeMenuInput): RecipeCardItem {
  if (isRecipeMatch(input)) {
    return {
      recipe: toRecipeCardRecipe(input.recipe),
      match: input.match_score,
      have: input.available_ingredients.map((ingredient) => ingredient.name),
      missing: input.missing_ingredients.map((ingredient) => ingredient.name),
    };
  }

  return {
    recipe: toRecipeCardRecipe(input),
    match: 0,
    have: [],
    missing: [],
  };
}

function compareByName(left: RecipeCardItem, right: RecipeCardItem) {
  return left.recipe.name.localeCompare(right.recipe.name);
}

function compareRecommended(left: RecipeCardItem, right: RecipeCardItem) {
  return (
    right.match - left.match ||
    left.missing.length - right.missing.length ||
    compareByName(left, right)
  );
}

export function getAllRecipeMenuItems(items: readonly RecipeMenuInput[]): RecipeCardItem[] {
  return items.map(toRecipeCardItem).sort(compareByName);
}

export function getRecommendedRecipeMatches(
  matches: readonly RecipeMatch[],
  goal: Goal | null,
): RecipeCardItem[] {
  return matches
    .filter((match) => (goal ? match.recipe.goals.includes(goal) : true))
    .map(toRecipeCardItem)
    .sort(compareRecommended);
}

export function mergeRecipeMenuWithMatches(
  recipes: readonly RecipeDetails[],
  matches: readonly RecipeMatch[],
): RecipeCardItem[] {
  const matchItemsById = new Map(
    matches.map((match) => [match.recipe.id, toRecipeCardItem(match)]),
  );
  return getAllRecipeMenuItems(recipes).map((item) => matchItemsById.get(item.recipe.id) ?? item);
}

export function getRecipeCategoryOptions(items: readonly RecipeCardItem[], limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.recipe.tags.slice(0, 3)) {
      const normalizedTag = tag.trim();
      if (!normalizedTag) continue;
      counts.set(normalizedTag, (counts.get(normalizedTag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

function matchesReadiness(item: RecipeCardItem, readiness: RecipeReadinessFilter) {
  if (readiness === "smart") return true;
  if (readiness === "ready") return item.match > 0 && item.missing.length === 0;
  if (readiness === "close") return item.missing.length > 0 && item.missing.length <= 3;
  return item.missing.length > 3;
}

function matchesSearch(item: RecipeCardItem, search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;
  const haystack = [
    item.recipe.name,
    item.recipe.tag,
    ...item.recipe.tags,
    ...item.recipe.ingredients,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalizedSearch);
}

export function filterRecipeMenuItems(
  items: readonly RecipeCardItem[],
  filters: RecipeMenuFilters,
): RecipeCardItem[] {
  return items.filter((item) => {
    const matchesCategory =
      filters.category === "All" || item.recipe.tags.includes(filters.category);
    return (
      matchesCategory &&
      matchesReadiness(item, filters.readiness) &&
      matchesSearch(item, filters.search)
    );
  });
}

export function getRecipeReadinessCounts(items: readonly RecipeCardItem[]) {
  return {
    ready: items.filter((item) => item.match > 0 && item.missing.length === 0).length,
    close: items.filter((item) => item.missing.length > 0 && item.missing.length <= 3).length,
    shop: items.filter((item) => item.missing.length > 3).length,
  };
}

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

export function getMatchColor(match: number) {
  if (match >= 80) return "text-success bg-success-soft";
  if (match >= 50) return "text-warning-foreground bg-warning-soft";
  return "text-muted-foreground bg-secondary";
}

export function getFeaturedRecipes(
  items: readonly RecipeCardItem[],
  limit: number,
): RecipeCardItem[] {
  return items.slice(0, limit);
}

export function getRecipeTabView(
  activeTab: RecipeTab,
  allRecipes: readonly RecipeCardItem[],
  recommendedRecipes: readonly RecipeCardItem[],
): RecipeTabView {
  const list = activeTab === "recommended" ? recommendedRecipes : allRecipes;

  return {
    list: [...list],
    showMatch: activeTab === "recommended",
    counts: {
      recommended: recommendedRecipes.length,
      all: allRecipes.length,
    },
    emptyMessage:
      activeTab === "recommended"
        ? "Add more products or set a goal to improve your matches."
        : "Your recipe catalog will appear here once recipes are available.",
  };
}
