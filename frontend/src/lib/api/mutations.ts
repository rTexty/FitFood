import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fitfoodApi } from "./client";
import { fitfoodKeys } from "./queries";
import type {
  BarcodeImportInput,
  GoalUpdateInput,
  InventoryItem,
  InventoryItemCreateInput,
  InventoryItemUpdateInput,
  MealPlanCreateInput,
  MealPlanEntryCreateInput,
  Fridge,
  OnboardingState,
  OnboardingCompleteInput,
  ReceiptConfirmInput,
  ShoppingListItemUpdateInput,
} from "./types";

export function applyOnboardingStateToCache(queryClient: QueryClient, state: OnboardingState) {
  queryClient.setQueryData(fitfoodKeys.onboarding, state);
  queryClient.setQueryData(fitfoodKeys.user, state.user);
  queryClient.setQueryData(fitfoodKeys.nutritionProfile, state.profile);
  queryClient.setQueryData(fitfoodKeys.goal, state.current_goal);
  queryClient.setQueryData(fitfoodKeys.fridges, (current: Fridge[] | undefined) => {
    if (!state.primary_fridge) {
      return [];
    }

    const currentFridges = Array.isArray(current) ? current : [];
    return [
      state.primary_fridge,
      ...currentFridges.filter((fridge) => fridge.id !== state.primary_fridge?.id),
    ];
  });
}

export function useUpdateGoalMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GoalUpdateInput) => fitfoodApi.updateCurrentGoal(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.goal }),
        queryClient.invalidateQueries({ queryKey: ["fitfood", "recipes"] }),
      ]);
    },
  });
}

export function useCompleteOnboardingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: OnboardingCompleteInput) => fitfoodApi.completeOnboarding(input),
    onSuccess: async (state) => {
      applyOnboardingStateToCache(queryClient, state);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.onboarding }),
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.user }),
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.nutritionProfile }),
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.goal }),
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.fridges }),
        queryClient.invalidateQueries({ queryKey: ["fitfood", "recipes"] }),
      ]);
    },
  });
}

export function useDeleteInventoryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => fitfoodApi.deleteInventoryItem(itemId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fitfood", "inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["fitfood", "recipes"] }),
      ]);
    },
  });
}

export function useImportReceiptDemoMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => fitfoodApi.importReceiptDemo(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fitfood", "inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["fitfood", "recipes"] }),
      ]);
    },
  });
}

export function useCreateInventoryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fridgeId, input }: { fridgeId: string; input: InventoryItemCreateInput }) =>
      fitfoodApi.createInventoryItem(fridgeId, input),
    onSuccess: async (_item, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.inventory(variables.fridgeId) }),
        queryClient.invalidateQueries({
          queryKey: ["fitfood", "inventory", variables.fridgeId, "expiring"],
        }),
        queryClient.invalidateQueries({ queryKey: ["fitfood", "recipes", variables.fridgeId] }),
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.mealPlans }),
      ]);
    },
  });
}

export function useUpdateInventoryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: InventoryItemUpdateInput }) =>
      fitfoodApi.updateInventoryItem(itemId, input),
    onSuccess: async (item) => {
      const inventoryKey = fitfoodKeys.inventory(item.fridge_id);
      queryClient.setQueryData(
        inventoryKey,
        (current: InventoryItem[] | undefined) =>
          current?.map((candidate) => (candidate.id === item.id ? item : candidate)) ?? [item],
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryKey }),
        queryClient.invalidateQueries({
          queryKey: ["fitfood", "inventory", item.fridge_id, "expiring"],
        }),
        queryClient.invalidateQueries({ queryKey: ["fitfood", "recipes", item.fridge_id] }),
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.mealPlans }),
      ]);
    },
  });
}

export function useCreateRecipeShoppingListItemsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipeId, fridgeId }: { recipeId: string; fridgeId: string }) =>
      fitfoodApi.createRecipeShoppingListItems(recipeId, fridgeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fitfoodKeys.shoppingList });
    },
  });
}

export function useUpdateShoppingListItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: ShoppingListItemUpdateInput }) =>
      fitfoodApi.updateShoppingListItem(itemId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fitfoodKeys.shoppingList });
    },
  });
}

export function useDeleteShoppingListItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => fitfoodApi.deleteShoppingListItem(itemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fitfoodKeys.shoppingList });
    },
  });
}

export function useCreateMealPlanMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MealPlanCreateInput) => fitfoodApi.createMealPlan(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fitfoodKeys.mealPlans });
    },
  });
}

export function useAddMealPlanEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mealPlanId, input }: { mealPlanId: string; input: MealPlanEntryCreateInput }) =>
      fitfoodApi.addMealPlanEntry(mealPlanId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fitfoodKeys.mealPlans });
    },
  });
}

export function useImportBarcodeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ barcode, input }: { barcode: string; input: BarcodeImportInput }) =>
      fitfoodApi.importBarcode(barcode, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fitfood", "inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["fitfood", "recipes"] }),
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.mealPlans }),
      ]);
    },
  });
}

export function useReceiptOcrMutation() {
  return useMutation({
    mutationFn: (file: File) => fitfoodApi.ocrReceipt(file),
  });
}

export function useConfirmReceiptImportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReceiptConfirmInput) => fitfoodApi.confirmReceiptImport(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fitfood", "inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["fitfood", "recipes"] }),
        queryClient.invalidateQueries({ queryKey: fitfoodKeys.mealPlans }),
      ]);
    },
  });
}

export function useResetDemoStateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => fitfoodApi.resetDemoState(),
    onSuccess: async (state) => {
      applyOnboardingStateToCache(queryClient, state);
      await queryClient.invalidateQueries({ queryKey: ["fitfood"] });
    },
  });
}
