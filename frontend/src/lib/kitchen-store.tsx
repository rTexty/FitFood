import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fitfoodApi } from "./api/client";
import {
  useDeleteInventoryItemMutation,
  useImportReceiptDemoMutation,
  useResetDemoStateMutation,
  useUpdateGoalMutation,
} from "./api/mutations";
import {
  currentGoalQueryOptions,
  fitfoodKeys,
  fridgesQueryOptions,
  getPrimaryFridgeId,
  inventoryItemsQueryOptions,
  recipeMatchesQueryOptions,
} from "./api/queries";
import type { GoalProfile, InventoryItem } from "./api/types";
import { toMatchedRecipe, toProduct } from "./fitfood-adapters";
import { goalTargets, type Goal, type Product } from "./fitfood-data";

const ONBOARDED_STORAGE_KEY = "fitfood-onboarded";

type MatchedRecipeView = ReturnType<typeof toMatchedRecipe>;

interface KitchenContextValue {
  primaryFridgeId: string;
  fridge: Product[];
  pantry: Product[];
  products: Product[];
  matchedRecipes: MatchedRecipeView[];
  goal: Goal | null;
  setGoal: (goal: Goal) => void;
  setOnboarded: (value: boolean) => void;
  addProducts: (_products?: readonly unknown[]) => void;
  removeProduct: (id: string) => void;
  clearProducts: () => void;
  resetAll: () => Promise<void>;
}

const KitchenContext = createContext<KitchenContextValue | null>(null);

function readOnboarded() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(ONBOARDED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeOnboarded(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ONBOARDED_STORAGE_KEY, String(value));
  } catch {
    // Ignore local storage failures in demo mode.
  }
}

function createOptimisticGoalProfile(goal: Goal): GoalProfile {
  const target = goalTargets[goal];
  return {
    goal,
    calories_target: target.calories,
    protein_target: target.protein,
    carbs_target: target.carbs,
    fat_target: target.fat,
    active_from: new Date().toISOString(),
    active_to: null,
  };
}

export function KitchenProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [, setOnboardedState] = useState(readOnboarded);
  const fridgesQuery = useQuery(fridgesQueryOptions());
  const fridgeId = useMemo(() => getPrimaryFridgeId(fridgesQuery.data ?? []), [fridgesQuery.data]);
  const goalQuery = useQuery(currentGoalQueryOptions());
  const inventoryQuery = useQuery(inventoryItemsQueryOptions(fridgeId));
  const recipeMatchesQuery = useQuery(
    recipeMatchesQueryOptions(fridgeId, {
      goal: goalQuery.data?.goal ?? null,
      maxMissing: 3,
    }),
  );

  const updateGoalMutation = useUpdateGoalMutation();
  const deleteInventoryMutation = useDeleteInventoryItemMutation();
  const importReceiptMutation = useImportReceiptDemoMutation();
  const resetDemoMutation = useResetDemoStateMutation();

  const products = useMemo(() => (inventoryQuery.data ?? []).map(toProduct), [inventoryQuery.data]);
  const fridge = useMemo(
    () => products.filter((product) => product.location === "fridge"),
    [products],
  );
  const pantry = useMemo(
    () => products.filter((product) => product.location === "pantry"),
    [products],
  );
  const matchedRecipes = useMemo(
    () => (recipeMatchesQuery.data ?? []).map(toMatchedRecipe),
    [recipeMatchesQuery.data],
  );

  const setOnboarded = useCallback((value: boolean) => {
    setOnboardedState(value);
    writeOnboarded(value);
  }, []);

  const setGoal = useCallback(
    (goal: Goal) => {
      const previousGoal = queryClient.getQueryData<GoalProfile | null>(fitfoodKeys.goal) ?? null;
      queryClient.setQueryData(fitfoodKeys.goal, createOptimisticGoalProfile(goal));
      updateGoalMutation.mutate(
        { goal },
        {
          onError: () => {
            queryClient.setQueryData(fitfoodKeys.goal, previousGoal);
          },
        },
      );
    },
    [queryClient, updateGoalMutation],
  );

  const removeProduct = useCallback(
    (itemId: string) => {
      const inventoryKey = fitfoodKeys.inventory(fridgeId);
      const expiringKey = fitfoodKeys.expiring(fridgeId, 3);
      const previousInventory = queryClient.getQueryData<InventoryItem[]>(inventoryKey) ?? [];
      const previousExpiring = queryClient.getQueryData<InventoryItem[]>(expiringKey);
      const nextInventory = previousInventory.filter((item) => item.id !== itemId);

      queryClient.setQueryData(inventoryKey, nextInventory);
      if (previousExpiring) {
        queryClient.setQueryData(
          expiringKey,
          previousExpiring.filter((item) => item.id !== itemId),
        );
      }

      deleteInventoryMutation.mutate(itemId, {
        onError: () => {
          queryClient.setQueryData(inventoryKey, previousInventory);
          if (previousExpiring) {
            queryClient.setQueryData(expiringKey, previousExpiring);
          }
        },
      });
    },
    [deleteInventoryMutation, fridgeId, queryClient],
  );

  const addProducts = useCallback(() => {
    importReceiptMutation.mutate();
  }, [importReceiptMutation]);

  const clearProducts = useCallback(() => {
    const inventoryKey = fitfoodKeys.inventory(fridgeId);
    const expiringKey = fitfoodKeys.expiring(fridgeId, 3);
    const recipeKey = fitfoodKeys.recipeMatches(fridgeId, goalQuery.data?.goal ?? null, 3);
    const existingItems = queryClient.getQueryData<InventoryItem[]>(inventoryKey) ?? [];

    queryClient.setQueryData(inventoryKey, []);
    queryClient.setQueryData(expiringKey, []);
    queryClient.setQueryData(recipeKey, []);

    void Promise.all(existingItems.map((item) => fitfoodApi.deleteInventoryItem(item.id)))
      .then(() => queryClient.invalidateQueries({ queryKey: ["fitfood"] }))
      .catch(() => {
        void queryClient.invalidateQueries({ queryKey: ["fitfood"] });
      });
  }, [fridgeId, goalQuery.data?.goal, queryClient]);

  const resetAll = useCallback(async () => {
    await resetDemoMutation.mutateAsync();
    setOnboarded(false);
  }, [resetDemoMutation, setOnboarded]);

  const value = useMemo<KitchenContextValue>(
    () => ({
      primaryFridgeId: fridgeId,
      fridge,
      pantry,
      products,
      matchedRecipes,
      goal: goalQuery.data?.goal ?? null,
      setGoal,
      setOnboarded,
      addProducts,
      removeProduct,
      clearProducts,
      resetAll,
    }),
    [
      addProducts,
      clearProducts,
      fridge,
      fridgeId,
      goalQuery.data?.goal,
      matchedRecipes,
      pantry,
      products,
      removeProduct,
      resetAll,
      setGoal,
      setOnboarded,
    ],
  );

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}

export function useKitchen() {
  const context = useContext(KitchenContext);
  if (!context) {
    throw new Error("useKitchen must be used within KitchenProvider");
  }
  return context;
}
