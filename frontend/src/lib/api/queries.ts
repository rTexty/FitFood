import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { fitfoodApi } from "./client";
import type { Fridge, GoalProfile } from "./types";

export const fitfoodKeys = {
  user: ["fitfood", "user"] as const,
  onboarding: ["fitfood", "onboarding"] as const,
  nutritionProfile: ["fitfood", "nutrition-profile"] as const,
  goal: ["fitfood", "goal"] as const,
  fridges: ["fitfood", "fridges"] as const,
  recipes: ["fitfood", "recipes", "catalog"] as const,
  shoppingList: ["fitfood", "shopping-list"] as const,
  mealPlans: ["fitfood", "meal-plans"] as const,
  inventory: (fridgeId: string) => ["fitfood", "inventory", fridgeId] as const,
  expiring: (fridgeId: string, days: number) =>
    ["fitfood", "inventory", fridgeId, "expiring", days] as const,
  recipeMatches: (fridgeId: string, goal: string | null, maxMissing: number) =>
    ["fitfood", "recipes", fridgeId, goal, maxMissing] as const,
  barcodePreview: (barcode: string) => ["fitfood", "barcode-preview", barcode] as const,
  nutritionSearch: (query: string) => ["fitfood", "nutrition-search", query] as const,
};

export const currentUserQueryOptions = () =>
  queryOptions({
    queryKey: fitfoodKeys.user,
    queryFn: () => fitfoodApi.getCurrentUser(),
    staleTime: 30_000,
  });

export const onboardingStateQueryOptions = () =>
  queryOptions({
    queryKey: fitfoodKeys.onboarding,
    queryFn: () => fitfoodApi.getOnboardingState(),
    staleTime: 10_000,
  });

export const nutritionProfileQueryOptions = () =>
  queryOptions({
    queryKey: fitfoodKeys.nutritionProfile,
    queryFn: () => fitfoodApi.getNutritionProfile(),
    staleTime: 30_000,
  });

export const currentGoalQueryOptions = () =>
  queryOptions({
    queryKey: fitfoodKeys.goal,
    queryFn: () => fitfoodApi.getCurrentGoal(),
    staleTime: 30_000,
  });

export const fridgesQueryOptions = () =>
  queryOptions({
    queryKey: fitfoodKeys.fridges,
    queryFn: () => fitfoodApi.getFridges(),
    staleTime: 30_000,
  });

export const inventoryItemsQueryOptions = (fridgeId: string) =>
  queryOptions({
    queryKey: fitfoodKeys.inventory(fridgeId),
    queryFn: () => fitfoodApi.getInventoryItems(fridgeId),
    staleTime: 10_000,
  });

export const expiringItemsQueryOptions = (fridgeId: string, days = 3) =>
  queryOptions({
    queryKey: fitfoodKeys.expiring(fridgeId, days),
    queryFn: () => fitfoodApi.getExpiringInventoryItems(fridgeId, days),
    staleTime: 10_000,
  });

export const recipesQueryOptions = () =>
  queryOptions({
    queryKey: fitfoodKeys.recipes,
    queryFn: () => fitfoodApi.getRecipes(),
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
  });

export const recipeMatchesQueryOptions = (
  fridgeId: string,
  params: { goal?: string | null; maxMissing?: number } = {},
) =>
  queryOptions({
    queryKey: fitfoodKeys.recipeMatches(fridgeId, params.goal ?? null, params.maxMissing ?? 3),
    queryFn: () =>
      fitfoodApi.getRecipeMatches(fridgeId, {
        goal: params.goal ?? undefined,
        maxMissing: params.maxMissing ?? 3,
      }),
    staleTime: 10_000,
  });

export const shoppingListItemsQueryOptions = () =>
  queryOptions({
    queryKey: fitfoodKeys.shoppingList,
    queryFn: () => fitfoodApi.getShoppingListItems(),
    staleTime: 10_000,
  });

export const mealPlansQueryOptions = () =>
  queryOptions({
    queryKey: fitfoodKeys.mealPlans,
    queryFn: () => fitfoodApi.getMealPlans(),
    staleTime: 10_000,
  });

export const barcodePreviewQueryOptions = (barcode: string) =>
  queryOptions({
    queryKey: fitfoodKeys.barcodePreview(barcode),
    queryFn: () => fitfoodApi.getBarcodeImportPreview(barcode),
    staleTime: 60_000,
  });

export const nutritionSearchQueryOptions = (query: string) =>
  queryOptions({
    queryKey: fitfoodKeys.nutritionSearch(query),
    queryFn: () => fitfoodApi.searchNutrition(query),
    staleTime: 60_000,
  });

export function getPrimaryFridgeId(fridges: Fridge[]) {
  return fridges.find((fridge) => fridge.is_primary)?.id ?? fridges[0]?.id ?? "fridge-home";
}

export async function ensureKitchenCore(queryClient: QueryClient) {
  const onboarding = await queryClient.ensureQueryData(onboardingStateQueryOptions());
  const fridges = await queryClient.ensureQueryData(fridgesQueryOptions());
  const fridgeId = onboarding.primary_fridge?.id ?? getPrimaryFridgeId(fridges);

  if (!onboarding.completed) {
    return { fridgeId };
  }

  await Promise.all([
    queryClient.ensureQueryData(currentUserQueryOptions()),
    queryClient.ensureQueryData(currentGoalQueryOptions()),
    queryClient.ensureQueryData(inventoryItemsQueryOptions(fridgeId)),
  ]);

  return { fridgeId };
}

export async function ensureDashboardSlice(queryClient: QueryClient) {
  const { fridgeId } = await ensureKitchenCore(queryClient);
  await queryClient.ensureQueryData(expiringItemsQueryOptions(fridgeId, 3));
  return { fridgeId };
}

export async function ensureRecipeSlice(queryClient: QueryClient) {
  await queryClient.ensureQueryData(recipesQueryOptions());

  try {
    const { fridgeId } = await ensureKitchenCore(queryClient);
    const goal = queryClient.getQueryData<GoalProfile | null>(fitfoodKeys.goal);
    void queryClient
      .ensureQueryData(
        recipeMatchesQueryOptions(fridgeId, { goal: goal?.goal ?? null, maxMissing: 20 }),
      )
      .catch(() => undefined);
    return { fridgeId };
  } catch {
    return { fridgeId: getPrimaryFridgeId([]) };
  }
}
