import type { MealPlan, MealPlanEntry, MealSlotName, NutritionTotals } from "./api/types";

const MEAL_ORDER: MealSlotName[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function labelForDate(value: string) {
  const target = startOfDay(new Date(value));
  const today = startOfDay(new Date());
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";

  return target.toLocaleDateString(undefined, { weekday: "short" });
}

export function sumMealPlanEntries(entries: MealPlanEntry[]): NutritionTotals {
  return entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + entry.recipe.nutrition_summary.calories,
      protein: totals.protein + entry.recipe.nutrition_summary.protein,
      carbs: totals.carbs + entry.recipe.nutrition_summary.carbs,
      fat: totals.fat + entry.recipe.nutrition_summary.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function selectMealPlan(plans: MealPlan[] | undefined, spanDays: number) {
  if (!plans?.length) {
    return null;
  }

  const sortedPlans = [...plans].sort(
    (left, right) =>
      right.updated_at.localeCompare(left.updated_at) ||
      right.created_at.localeCompare(left.created_at),
  );

  return sortedPlans.find((plan) => plan.span_days === spanDays) ?? null;
}

export function groupMealPlanByDay(plan: MealPlan | null) {
  if (!plan) {
    return [];
  }

  const grouped = new Map<string, MealPlanEntry[]>();
  for (const entry of plan.entries) {
    const key = dateOnly(entry.scheduled_for);
    const existing = grouped.get(key) ?? [];
    grouped.set(key, [...existing, entry]);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, entries]) => ({
      date,
      label: labelForDate(date),
      entries: [...entries].sort(
        (left, right) => MEAL_ORDER.indexOf(left.meal) - MEAL_ORDER.indexOf(right.meal),
      ),
    }));
}

export function getConsumedEntries(plan: MealPlan | null) {
  if (!plan) {
    return [];
  }

  return plan.entries.filter((entry) => entry.meal !== "Dinner");
}
