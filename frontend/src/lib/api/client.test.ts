import { afterEach, describe, expect, it, vi } from "vitest";
import { createFitFoodApi, FitFoodApiError, normalizeApiBaseUrl } from "./client";
import type {
  BarcodeImportResult,
  BarcodeLookupResult,
  FitFoodApi,
  GoalProfile,
  GoalUpdateInput,
  InventoryItem,
  InventoryItemCreateInput,
  InventoryItemUpdateInput,
  MealPlan,
  MealPlanCreateInput,
  MealPlanEntry,
  MealPlanEntryCreateInput,
  OnboardingState,
  NutritionSearchResult,
  ReceiptConfirmInput,
  ReceiptImportResult,
  ReceiptOcrPreview,
  ShoppingListCreateResult,
  ShoppingListItem,
  UserProfile,
  Fridge,
  RecipeDetails,
  RecipeMatch,
} from "./types";

function createJsonResponse<T>(data: T, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createFallbackApiStub() {
  const user: UserProfile = {
    id: "demo-user",
    email: "demo@fitfood.app",
    display_name: "Demo User",
    locale: "en-US",
    timezone: "Europe/Moscow",
  };

  const goal: GoalProfile = {
    goal: "maintain",
    calories_target: 2200,
    protein_target: 140,
    carbs_target: 220,
    fat_target: 70,
    active_from: "2026-06-23T00:00:00.000Z",
    active_to: null,
  };

  const shoppingListItem: ShoppingListItem = {
    id: "shopping-1",
    fridge_id: "fridge-home",
    recipe_id: "recipe-1",
    display_name: "Broccoli",
    normalized_name: "broccoli",
    quantity: 1,
    unit: "pack",
    category: "Vegetables",
    checked: false,
    created_at: "2026-06-23T08:00:00.000Z",
    updated_at: "2026-06-23T08:00:00.000Z",
  };

  const mealPlan: MealPlan = {
    id: "meal-plan-1",
    fridge_id: "fridge-home",
    goal: "maintain",
    span_days: 1,
    starts_on: "2026-06-23",
    created_at: "2026-06-23T08:00:00.000Z",
    updated_at: "2026-06-23T08:00:00.000Z",
    nutrition_summary: {
      calories: 1680,
      protein: 124,
      carbs: 160,
      fat: 58,
    },
    entries: [],
  };
  const mealPlanEntry: MealPlanEntry = {
    id: "meal-entry-1",
    meal: "Lunch",
    scheduled_for: "2026-06-23",
    recipe: {
      id: "recipe-1",
      name: "Chicken Bowl",
      hero_emoji: "🥗",
      minutes: 20,
      servings: 1,
      tags: ["High protein"],
      goals: ["maintain"],
      nutrition_summary: {
        calories: 520,
        protein: 44,
        carbs: 38,
        fat: 19,
      },
      ingredients: [],
      instructions: [],
    },
    recipe_id: "recipe-1",
    servings: 1,
    notes: null,
  };
  const recipeDetails: RecipeDetails = {
    id: "recipe-1",
    name: "Chicken Bowl",
    hero_emoji: "🥗",
    minutes: 20,
    servings: 1,
    tags: ["High protein"],
    goals: ["maintain"],
    nutrition_summary: {
      calories: 520,
      protein: 44,
      carbs: 38,
      fat: 19,
    },
    ingredients: [],
    instructions: [],
  };

  const barcodePreview: BarcodeLookupResult = {
    barcode: "5449000000996",
    product_name: "Sparkling Water",
    brand: "FitFood",
    category: "Beverages",
    quantity: 1,
    unit: "count",
    location: "pantry",
    source: "open_food_facts",
  };

  const barcodeImport: BarcodeImportResult = {
    barcode: "5449000000996",
    item: {
      id: "item-barcode",
      fridge_id: "fridge-home",
      display_name: "Sparkling Water",
      quantity: 1,
      unit: "count",
      location: "pantry",
      category: "Beverages",
      purchase_date: "2026-06-23",
      expiration_date: "2026-07-23",
      source: "barcode",
    },
    summary: {
      fridge_id: "fridge-home",
      imported_count: 1,
      source: "barcode",
    },
  };

  const nutritionResult: NutritionSearchResult = {
    id: "fdc-1",
    name: "Chicken Breast",
    brand: null,
    category: "Poultry",
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    serving_description: "100 g",
    source: "usda",
  };
  const onboardingState: OnboardingState = {
    completed: false,
    user,
    profile: null,
    current_goal: null,
    primary_fridge: null,
  };

  const api: FitFoodApi = {
    getCurrentUser: vi.fn(async () => user),
    getOnboardingState: vi.fn(async () => onboardingState),
    completeOnboarding: vi.fn(
      async (): Promise<OnboardingState> => ({
        completed: true,
        user: {
          ...user,
          onboarding_completed_at: "2026-06-28T12:00:00Z",
          primary_fridge_id: "fridge-home",
        },
        profile: null,
        current_goal: goal,
        primary_fridge: {
          id: "fridge-home",
          name: "Home Kitchen",
          kind: "home",
          is_primary: true,
        },
      }),
    ),
    getNutritionProfile: vi.fn(async () => null),
    getCurrentGoal: vi.fn(async () => goal),
    updateCurrentGoal: vi.fn(async (input: GoalUpdateInput) => ({
      ...goal,
      goal: input.goal,
    })),
    getFridges: vi.fn(async (): Promise<Fridge[]> => []),
    getInventoryItems: vi.fn(async (): Promise<InventoryItem[]> => []),
    getExpiringInventoryItems: vi.fn(async (): Promise<InventoryItem[]> => []),
    deleteInventoryItem: vi.fn(async () => undefined),
    getRecipes: vi.fn(async (): Promise<RecipeDetails[]> => [recipeDetails]),
    getRecipeMatches: vi.fn(async (): Promise<RecipeMatch[]> => []),
    createInventoryItem: vi.fn(
      async (_fridgeId: string, input: InventoryItemCreateInput): Promise<InventoryItem> => ({
        id: "manual-1",
        fridge_id: "fridge-home",
        display_name: input.display_name,
        quantity: input.quantity,
        unit: input.unit,
        location: input.location,
        category: input.category,
        purchase_date: input.purchase_date ?? "2026-06-23",
        expiration_date: input.expiration_date ?? "2026-06-27",
        source: "manual",
      }),
    ),
    updateInventoryItem: vi.fn(
      async (itemId: string, input: InventoryItemUpdateInput): Promise<InventoryItem> => ({
        id: itemId,
        fridge_id: "fridge-home",
        display_name: input.display_name ?? "Manual item",
        quantity: input.quantity ?? 1,
        unit: input.unit ?? "count",
        location: input.location ?? "fridge",
        category: input.category ?? "Vegetables",
        purchase_date: input.purchase_date ?? "2026-06-23",
        expiration_date: input.expiration_date ?? "2026-06-27",
        source: "manual",
      }),
    ),
    createRecipeShoppingListItems: vi.fn(
      async (): Promise<ShoppingListCreateResult> => ({
        items: [shoppingListItem],
        summary: {
          fridge_id: "fridge-home",
          recipe_id: "recipe-1",
          created_count: 1,
        },
      }),
    ),
    getShoppingListItems: vi.fn(async (): Promise<ShoppingListItem[]> => [shoppingListItem]),
    updateShoppingListItem: vi.fn(
      async (): Promise<ShoppingListItem> => ({
        ...shoppingListItem,
        checked: true,
      }),
    ),
    deleteShoppingListItem: vi.fn(async () => undefined),
    getMealPlans: vi.fn(async (): Promise<MealPlan[]> => [mealPlan]),
    createMealPlan: vi.fn(async (_input: MealPlanCreateInput): Promise<MealPlan> => mealPlan),
    addMealPlanEntry: vi.fn(
      async (_mealPlanId: string, _input: MealPlanEntryCreateInput): Promise<MealPlanEntry> =>
        mealPlanEntry,
    ),
    getBarcodeImportPreview: vi.fn(async (): Promise<BarcodeLookupResult> => barcodePreview),
    importBarcode: vi.fn(async (): Promise<BarcodeImportResult> => barcodeImport),
    searchNutrition: vi.fn(async (): Promise<NutritionSearchResult[]> => [nutritionResult]),
    ocrReceipt: vi.fn(
      async (): Promise<ReceiptOcrPreview> => ({
        receipt_id: "receipt:fallback",
        merchant: "Fallback Market",
        purchase_date: "2026-06-23",
        items: [],
        summary: {
          detected_count: 0,
          source: "minimax_ocr",
        },
      }),
    ),
    confirmReceiptImport: vi.fn(
      async (_input: ReceiptConfirmInput): Promise<ReceiptImportResult> => ({
        items: [],
        summary: {
          imported_count: 0,
          source: "receipt_ocr",
        },
      }),
    ),
    importReceiptDemo: vi.fn(
      async (): Promise<ReceiptImportResult> => ({
        items: [],
        summary: {
          imported_count: 0,
          source: "demo",
        },
      }),
    ),
    resetDemoState: vi.fn(
      async (): Promise<OnboardingState> => ({
        completed: false,
        user,
        profile: null,
        current_goal: null,
        primary_fridge: null,
      }),
    ),
  };

  return { api, user, goal };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api client helpers", () => {
  it("normalizes base URLs to the /api/v1 root exactly once", () => {
    expect(normalizeApiBaseUrl("http://127.0.0.1:8000")).toBe("http://127.0.0.1:8000/api/v1");
    expect(normalizeApiBaseUrl("http://127.0.0.1:8000/api/v1")).toBe(
      "http://127.0.0.1:8000/api/v1",
    );
    expect(normalizeApiBaseUrl("http://127.0.0.1:8000/")).toBe("http://127.0.0.1:8000/api/v1");
  });

  it("uses an internal API base URL for server-side rendering when configured", async () => {
    const { api: fallbackApi, user } = createFallbackApiStub();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse(user));
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_API_BASE_URL: "http://localhost:8000/api/v1",
        VITE_FITFOOD_INTERNAL_API_BASE_URL: "http://backend:8000/api/v1",
      },
      fallbackApi,
      fetchImpl,
    });

    await expect(api.getCurrentUser()).resolves.toEqual(user);

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/users/me",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fallbackApi.getCurrentUser).not.toHaveBeenCalled();
  });

  it.each([404, 405, 503])(
    "does not silently fallback for configured APIs when the server returns %i",
    async (status) => {
      const { api: fallbackApi } = createFallbackApiStub();
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(createJsonResponse({ message: "configured API failed" }, status));
      const api = createFitFoodApi({
        env: {
          DEV: false,
          VITE_API_BASE_URL: "https://api.fitfood.test",
        },
        fallbackApi,
        fetchImpl,
      });

      await expect(api.getCurrentUser()).rejects.toBeInstanceOf(FitFoodApiError);
      expect(fallbackApi.getCurrentUser).not.toHaveBeenCalled();
    },
  );

  it("does not silently fallback for configured APIs on network errors unless explicitly enabled", async () => {
    const { api: fallbackApi } = createFallbackApiStub();
    const networkError = new TypeError("fetch failed");
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(networkError);
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_API_BASE_URL: "https://api.fitfood.test",
      },
      fallbackApi,
      fetchImpl,
    });

    await expect(api.getCurrentUser()).rejects.toBe(networkError);
    expect(fallbackApi.getCurrentUser).not.toHaveBeenCalled();
  });

  it("still falls back in demo mode when no API URL is configured", async () => {
    const { api: fallbackApi, user } = createFallbackApiStub();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createJsonResponse({ message: "missing backend" }, 503));
    const api = createFitFoodApi({
      env: {
        DEV: false,
      },
      fallbackApi,
      fetchImpl,
    });

    await expect(api.getCurrentUser()).resolves.toEqual(user);
    expect(fallbackApi.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("allows explicit fallback for configured APIs when the fallback flag is true", async () => {
    const { api: fallbackApi, user } = createFallbackApiStub();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createJsonResponse({ message: "method not allowed" }, 405));
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_API_BASE_URL: "https://api.fitfood.test",
        VITE_FITFOOD_ENABLE_FALLBACK: "true",
      },
      fallbackApi,
      fetchImpl,
    });

    await expect(api.getCurrentUser()).resolves.toEqual(user);
    expect(fallbackApi.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("targets the current backend /users/me endpoints", async () => {
    const { api: fallbackApi, user, goal } = createFallbackApiStub();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse(user))
      .mockResolvedValueOnce(createJsonResponse(goal))
      .mockResolvedValueOnce(createJsonResponse({ ...goal, goal: "gain" }));
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_API_BASE_URL: "https://api.fitfood.test",
      },
      fallbackApi,
      fetchImpl,
    });

    await expect(api.getCurrentUser()).resolves.toEqual(user);
    await expect(api.getCurrentGoal()).resolves.toEqual(goal);
    await expect(api.updateCurrentGoal({ goal: "gain" })).resolves.toMatchObject({ goal: "gain" });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.fitfood.test/api/v1/users/me",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.fitfood.test/api/v1/users/me/goals/current",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://api.fitfood.test/api/v1/users/me/goals/current",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("targets manual inventory and shopping list endpoints", async () => {
    const { api: fallbackApi } = createFallbackApiStub();
    const createdItem: InventoryItem = {
      id: "manual-1",
      fridge_id: "fridge-home",
      display_name: "Cucumber",
      quantity: 2,
      unit: "count",
      location: "fridge",
      category: "Vegetables",
      purchase_date: "2026-06-23",
      expiration_date: "2026-06-27",
      source: "manual",
    };
    const shoppingResult: ShoppingListCreateResult = {
      items: [
        {
          id: "shopping-1",
          fridge_id: "fridge-home",
          recipe_id: "recipe-1",
          display_name: "Broccoli",
          normalized_name: "broccoli",
          quantity: 1,
          unit: "pack",
          category: "Vegetables",
          checked: false,
          created_at: "2026-06-23T08:00:00.000Z",
          updated_at: "2026-06-23T08:00:00.000Z",
        },
      ],
      summary: {
        fridge_id: "fridge-home",
        recipe_id: "recipe-1",
        created_count: 1,
        merged_count: 0,
      },
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse(createdItem, 201))
      .mockResolvedValueOnce(
        createJsonResponse({ ...createdItem, display_name: "Persian Cucumber" }),
      )
      .mockResolvedValueOnce(createJsonResponse(shoppingResult, 201));
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_API_BASE_URL: "https://api.fitfood.test",
      },
      fallbackApi,
      fetchImpl,
    });

    await expect(
      api.createInventoryItem("fridge-home", {
        display_name: "Cucumber",
        quantity: 2,
        unit: "count",
        location: "fridge",
        category: "Vegetables",
        purchase_date: "2026-06-23",
        expiration_date: "2026-06-27",
      }),
    ).resolves.toMatchObject(createdItem);
    await expect(
      api.updateInventoryItem("item-1", {
        display_name: "Persian Cucumber",
      }),
    ).resolves.toMatchObject({ display_name: "Persian Cucumber" });
    await expect(
      api.createRecipeShoppingListItems("recipe-1", "fridge-home"),
    ).resolves.toMatchObject(shoppingResult);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.fitfood.test/api/v1/fridges/fridge-home/inventory-items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          display_name: "Cucumber",
          quantity: 2,
          unit: "count",
          location: "fridge",
          category: "Vegetables",
          purchase_date: "2026-06-23",
          expiration_date: "2026-06-27",
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.fitfood.test/api/v1/inventory-items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          display_name: "Persian Cucumber",
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://api.fitfood.test/api/v1/recipe-matches/recipe-1/shopping-list-items?fridge_id=fridge-home",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("targets the recipe catalog endpoint", async () => {
    const { api: fallbackApi } = createFallbackApiStub();
    const recipe: RecipeDetails = {
      id: "recipe-1",
      name: "Chicken Bowl",
      hero_emoji: "🥗",
      minutes: 20,
      servings: 1,
      tags: ["High protein"],
      goals: ["maintain"],
      nutrition_summary: {
        calories: 520,
        protein: 44,
        carbs: 38,
        fat: 19,
      },
      ingredients: [{ name: "Chicken Breast", normalized_name: "chicken breast" }],
      instructions: ["Cook chicken.", "Serve warm."],
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(createJsonResponse([recipe]));
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_API_BASE_URL: "https://api.fitfood.test",
      },
      fallbackApi,
      fetchImpl,
    });

    await expect(api.getRecipes()).resolves.toMatchObject([recipe]);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.fitfood.test/api/v1/recipes",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("normalizes recipe matches from the fridge endpoint", async () => {
    const { api: fallbackApi } = createFallbackApiStub();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse([
        {
          recipe: {
            id: 42,
            name: "Spinach Omelet",
            hero_emoji: "🥚",
            minutes: 12,
            servings: 1,
            tags: ["Quick"],
            goals: ["lose", "maintain"],
            nutrition_summary: {
              calories: 310,
              protein: 22,
              carbs: 8,
              fat: 21,
            },
            ingredients: [{ name: "Eggs", normalized_name: "eggs" }],
            instructions: ["Whisk eggs.", "Cook gently."],
          },
          match_score: 75,
          available_ingredients: [{ name: "Eggs", normalized_name: "eggs" }],
          missing_ingredients: [{ name: "Spinach", normalized_name: "spinach" }],
          shopping_list_ready: true,
          nutrition_summary: {
            calories: 310,
            protein: 22,
            carbs: 8,
            fat: 21,
          },
        },
      ]),
    );
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_API_BASE_URL: "https://api.fitfood.test",
      },
      fallbackApi,
      fetchImpl,
    });

    await expect(api.getRecipeMatches("1", { goal: "lose", maxMissing: 3 })).resolves.toMatchObject(
      [
        {
          recipe: {
            id: "42",
            name: "Spinach Omelet",
          },
          match_score: 75,
          available_ingredients: [{ name: "Eggs", normalized_name: "eggs" }],
          missing_ingredients: [{ name: "Spinach", normalized_name: "spinach" }],
        },
      ],
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.fitfood.test/api/v1/fridges/1/recipe-matches?goal=lose&max_missing=3",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("targets meal plans, barcode import, and nutrition search endpoints", async () => {
    const { api: fallbackApi } = createFallbackApiStub();
    const mealPlan: MealPlan = {
      id: "meal-plan-1",
      fridge_id: "fridge-home",
      goal: "maintain",
      span_days: 3,
      starts_on: "2026-06-23",
      created_at: "2026-06-23T08:00:00.000Z",
      updated_at: "2026-06-23T08:00:00.000Z",
      nutrition_summary: {
        calories: 2100,
        protein: 130,
        carbs: 220,
        fat: 70,
      },
      entries: [],
    };
    const mealEntry: MealPlanEntry = {
      id: "meal-entry-1",
      meal: "Lunch",
      scheduled_for: "2026-06-23",
      recipe: {
        id: "recipe-1",
        name: "Chicken Bowl",
        hero_emoji: "🥗",
        minutes: 20,
        servings: 1,
        tags: ["High protein"],
        goals: ["maintain"],
        nutrition_summary: {
          calories: 520,
          protein: 44,
          carbs: 38,
          fat: 19,
        },
        ingredients: [],
        instructions: [],
      },
      recipe_id: "recipe-1",
      servings: 1,
      notes: null,
    };
    const preview: BarcodeLookupResult = {
      barcode: "5449000000996",
      product_name: "Sparkling Water",
      brand: "FitFood",
      category: "Beverages",
      quantity: 1,
      unit: "count",
      location: "pantry",
      source: "open_food_facts",
    };
    const importResult: BarcodeImportResult = {
      barcode: "5449000000996",
      item: {
        id: "item-barcode",
        fridge_id: "fridge-home",
        display_name: "Sparkling Water",
        quantity: 1,
        unit: "count",
        location: "pantry",
        category: "Beverages",
        purchase_date: "2026-06-23",
        expiration_date: "2026-07-23",
        source: "barcode",
      },
      summary: {
        fridge_id: "fridge-home",
        imported_count: 1,
        source: "barcode",
      },
    };
    const nutritionResults: NutritionSearchResult[] = [
      {
        id: "fdc-1",
        name: "Chicken Breast",
        brand: null,
        category: "Poultry",
        calories: 165,
        protein: 31,
        carbs: 0,
        fat: 3.6,
        serving_description: "100 g",
        source: "usda",
      },
    ];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse([mealPlan]))
      .mockResolvedValueOnce(createJsonResponse(mealPlan, 201))
      .mockResolvedValueOnce(createJsonResponse(mealEntry, 201))
      .mockResolvedValueOnce(createJsonResponse(preview))
      .mockResolvedValueOnce(createJsonResponse(importResult, 201))
      .mockResolvedValueOnce(createJsonResponse(nutritionResults));
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_API_BASE_URL: "https://api.fitfood.test",
      },
      fallbackApi,
      fetchImpl,
    });

    await expect(api.getMealPlans()).resolves.toMatchObject([mealPlan]);
    await expect(
      api.createMealPlan({
        fridge_id: "fridge-home",
        goal: "maintain",
        span_days: 3,
      }),
    ).resolves.toMatchObject(mealPlan);
    await expect(
      api.addMealPlanEntry("meal-plan-1", {
        meal: "Lunch",
        recipe_id: "recipe-1",
        scheduled_for: "2026-06-23",
      }),
    ).resolves.toMatchObject({ meal: "Lunch", scheduled_for: "2026-06-23" });
    await expect(api.getBarcodeImportPreview("5449000000996")).resolves.toMatchObject(preview);
    await expect(
      api.importBarcode("5449000000996", {
        fridge_id: "fridge-home",
        display_name: "Sparkling Water",
        quantity: 1,
        unit: "count",
        location: "pantry",
        category: "Beverages",
        purchase_date: "2026-06-23",
        expiration_date: "2026-07-23",
        expiration_date_source: "user",
        expiration_confidence: 1,
      }),
    ).resolves.toMatchObject(importResult);
    await expect(api.searchNutrition("chicken breast")).resolves.toMatchObject(nutritionResults);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.fitfood.test/api/v1/meal-plans",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.fitfood.test/api/v1/meal-plans",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          fridge_id: "fridge-home",
          goal: "maintain",
          span_days: 3,
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://api.fitfood.test/api/v1/meal-plans/meal-plan-1/entries",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          meal_type: "lunch",
          recipe_id: "recipe-1",
          scheduled_for: "2026-06-23",
          servings: 1,
          notes: null,
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "https://api.fitfood.test/api/v1/imports/barcode/5449000000996",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      5,
      "https://api.fitfood.test/api/v1/imports/barcode/5449000000996",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          fridge_id: "fridge-home",
          display_name: "Sparkling Water",
          quantity: 1,
          unit: "count",
          location: "pantry",
          category: "Beverages",
          purchase_date: "2026-06-23",
          expiration_date: "2026-07-23",
          expiration_date_source: "user",
          expiration_confidence: 1,
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      6,
      "https://api.fitfood.test/api/v1/nutrition/search?q=chicken+breast",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("uploads receipt OCR as multipart and confirms reviewed receipt items", async () => {
    const { api: fallbackApi } = createFallbackApiStub();
    const preview: ReceiptOcrPreview = {
      receipt_id: "receipt:test",
      merchant: "Green Market",
      purchase_date: "2026-06-23",
      items: [
        {
          display_name: "Greek Yogurt",
          normalized_name: "greek yogurt",
          quantity: 2,
          unit: "cup",
          category: "Dairy",
          location: "fridge",
          purchase_date: "2026-06-23",
          expiration_date: "2026-06-30",
          expiration_date_source: "user",
          expiration_confidence: 1,
          confidence: 0.91,
        },
      ],
      summary: {
        detected_count: 1,
        source: "minimax_ocr",
      },
    };
    const importResult: ReceiptImportResult = {
      items: [
        {
          id: "receipt-item-1",
          fridge_id: "fridge-home",
          display_name: "Greek Yogurt",
          normalized_name: "greek yogurt",
          quantity: 2,
          unit: "cup",
          location: "fridge",
          category: "Dairy",
          purchase_date: "2026-06-23",
          expiration_date: "2026-06-30",
          source: "receipt_ocr",
          expiration_date_source: "user",
          expiration_confidence: 1,
          confidence: 0.91,
        },
      ],
      summary: {
        fridge_id: "fridge-home",
        imported_count: 1,
        receipt_id: "receipt:test",
        source: "receipt_ocr",
      },
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse(preview))
      .mockResolvedValueOnce(createJsonResponse(importResult, 201));
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_API_BASE_URL: "https://api.fitfood.test",
      },
      fallbackApi,
      fetchImpl,
    });
    const file = new File(["receipt image"], "receipt.png", { type: "image/png" });

    await expect(api.ocrReceipt(file)).resolves.toMatchObject(preview);
    await expect(
      api.confirmReceiptImport({
        fridge_id: "fridge-home",
        receipt_id: "receipt:test",
        purchase_date: "2026-06-23",
        items: preview.items,
      }),
    ).resolves.toMatchObject(importResult);

    const uploadInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.fitfood.test/api/v1/imports/receipt/ocr",
      expect.objectContaining({ method: "POST" }),
    );
    expect(uploadInit.body).toBeInstanceOf(FormData);
    expect(uploadInit.headers).toEqual({ Accept: "application/json" });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.fitfood.test/api/v1/imports/receipt/confirm",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          fridge_id: "fridge-home",
          receipt_id: "receipt:test",
          purchase_date: "2026-06-23",
          items: preview.items,
        }),
      }),
    );
  });

  it("does not fallback when receipt OCR returns a backend error", async () => {
    const { api: fallbackApi } = createFallbackApiStub();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "http_error", message: "Receipt OCR is disabled" },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_FITFOOD_ENABLE_FALLBACK: "true",
      },
      fallbackApi,
      fetchImpl,
    });
    const file = new File(["receipt image"], "receipt.png", { type: "image/png" });

    await expect(api.ocrReceipt(file)).rejects.toMatchObject({
      code: "http_error",
      message: "Receipt OCR is disabled",
      status: 503,
    });
    expect(fallbackApi.ocrReceipt).not.toHaveBeenCalled();
  });

  it("does not fallback when onboarding completion returns a backend error", async () => {
    const { api: fallbackApi } = createFallbackApiStub();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "http_error", message: "Onboarding API is unavailable" },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_FITFOOD_ENABLE_FALLBACK: "true",
      },
      fallbackApi,
      fetchImpl,
    });

    await expect(
      api.completeOnboarding({
        display_name: "Rita",
        age_years: 29,
        sex_for_calorie_estimate: "female",
        height_cm: 168,
        weight_kg: 72,
        target_weight_kg: null,
        goal: "maintain",
        activity_level: "moderate",
        dietary_preferences: [],
        allergies: [],
        fridge: { name: "Home Kitchen", kind: "home" },
      }),
    ).rejects.toMatchObject({
      code: "http_error",
      message: "Onboarding API is unavailable",
      status: 503,
    });
    expect(fallbackApi.completeOnboarding).not.toHaveBeenCalled();
  });

  it("targets the backend demo reset endpoint when an API URL is configured", async () => {
    const { api: fallbackApi, user } = createFallbackApiStub();
    const resetState: OnboardingState = {
      completed: false,
      user,
      profile: null,
      current_goal: null,
      primary_fridge: null,
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(createJsonResponse(resetState));
    const api = createFitFoodApi({
      env: {
        DEV: false,
        VITE_API_BASE_URL: "https://api.fitfood.test",
      },
      fallbackApi,
      fetchImpl,
    });

    await expect(api.resetDemoState()).resolves.toEqual(resetState);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.fitfood.test/api/v1/users/me/demo-reset",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fallbackApi.resetDemoState).not.toHaveBeenCalled();
  });
});
