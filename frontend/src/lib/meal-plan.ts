import { recipes, type Product, type Recipe } from "./fitfood-data";

export type MealName = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export interface PlannedMeal {
  meal: MealName;
  recipe: Recipe;
  fridgeHave: string[];
  match: number;
}

export interface MealPlanResult {
  enough: boolean;
  meals: PlannedMeal[];
}

const BREAKFAST_TAGS = ["Breakfast", "Quick", "Bulking"];

/**
 * Generates a breakfast / lunch / dinner / snack plan based on the
 * ingredients currently available in the refrigerator (pantry staples
 * are also considered for completeness). Returns enough=false when the
 * fridge doesn't hold enough usable ingredients.
 */
export function generateMealPlan(fridge: Product[], pantry: Product[]): MealPlanResult {
  const fridgeNames = new Set(fridge.map((p) => p.name.toLowerCase()));
  const allNames = new Set([...fridge, ...pantry].map((p) => p.name.toLowerCase()));

  const scored = recipes
    .map((recipe) => {
      const fridgeHave = recipe.ingredients.filter((i) => fridgeNames.has(i.toLowerCase()));
      const have = recipe.ingredients.filter((i) => allNames.has(i.toLowerCase()));
      const match = Math.round((have.length / recipe.ingredients.length) * 100);
      return { recipe, fridgeHave, match };
    })
    .filter((s) => s.fridgeHave.length > 0)
    .sort((a, b) => b.fridgeHave.length - a.fridgeHave.length || b.match - a.match);

  const enough = fridge.length >= 3 && scored.length >= 2 && scored[0].fridgeHave.length >= 2;
  if (!enough) return { enough: false, meals: [] };

  const used = new Set<string>();
  const pick = (predicate: (r: Recipe) => boolean) =>
    scored.find((s) => !used.has(s.recipe.id) && predicate(s.recipe)) ??
    scored.find((s) => !used.has(s.recipe.id));

  const order: { meal: MealName; pred: (r: Recipe) => boolean }[] = [
    { meal: "Breakfast", pred: (r) => BREAKFAST_TAGS.includes(r.tag) },
    { meal: "Lunch", pred: (r) => !BREAKFAST_TAGS.includes(r.tag) },
    { meal: "Dinner", pred: (r) => !BREAKFAST_TAGS.includes(r.tag) },
    { meal: "Snack", pred: (r) => r.calories <= 420 },
  ];

  const meals: PlannedMeal[] = [];
  for (const o of order) {
    const chosen = pick(o.pred);
    if (chosen) {
      used.add(chosen.recipe.id);
      meals.push({
        meal: o.meal,
        recipe: chosen.recipe,
        fridgeHave: chosen.fridgeHave,
        match: chosen.match,
      });
    }
  }

  return { enough: true, meals };
}
