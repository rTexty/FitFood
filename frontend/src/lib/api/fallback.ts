import {
  goalTargets,
  receiptProducts,
  recipes,
  seedProducts,
  type Goal,
  type Product,
} from "../fitfood-data";
import { daysUntil } from "../fitfood-data";
import { generateMealPlan } from "../meal-plan";
import type {
  BarcodeImportInput,
  BarcodeImportResult,
  BarcodeLookupResult,
  FitFoodApi,
  Fridge,
  GoalProfile,
  GoalUpdateInput,
  InventoryItem,
  InventoryItemCreateInput,
  InventoryItemUpdateInput,
  MealPlan,
  MealPlanCreateInput,
  MealPlanEntry,
  MealPlanEntryCreateInput,
  MealSlotName,
  NutritionProfile,
  NutritionSearchResult,
  NutritionTotals,
  OnboardingCompleteInput,
  OnboardingState,
  RecipeDetails,
  RecipeMatch,
  RecipeMatchParams,
  ReceiptConfirmInput,
  ReceiptImportResult,
  ReceiptOcrItem,
  ReceiptOcrPreview,
  ShoppingListCreateResult,
  ShoppingListItem,
  ShoppingListItemUpdateInput,
  UserProfile,
} from "./types";

const STORAGE_KEY = "fitfood-api-fallback-v1";
const DEFAULT_FRIDGE_ID = "fridge-home";

const DEFAULT_USER: UserProfile = {
  id: "user-demo",
  email: "alex@fitfood.app",
  display_name: "Alex Green",
  locale: "en-US",
  timezone: "Europe/Moscow",
};

const DEFAULT_FRIDGES: Fridge[] = [
  {
    id: DEFAULT_FRIDGE_ID,
    name: "Home Kitchen",
    kind: "home",
    description: "Your fridge and pantry in one shared kitchen.",
    is_primary: true,
  },
];

interface FallbackState {
  user: UserProfile;
  profile: NutritionProfile | null;
  goal: GoalProfile | null;
  fridges: Fridge[];
  inventory: InventoryItem[];
  shopping_list: ShoppingListItem[];
  meal_plans: MealPlan[];
}

const productLookup = new Map(
  seedProducts.map((product) => [normalizeName(product.name), product]),
);
const receiptLookup = new Map(
  receiptProducts.map((product) => [normalizeName(product.name), product]),
);
let memoryState: FallbackState | null = null;

const BREAKFAST_TAGS = new Set(["Breakfast", "Quick", "Bulking"]);
const DEFAULT_BARCODE = "5449000000996";
const barcodeCatalog: Record<
  string,
  {
    name: string;
    category: string;
    quantity: number;
    unit: Product["unit"];
    location: Product["location"];
    brand?: string;
  }
> = {
  [DEFAULT_BARCODE]: {
    name: "Sparkling Water",
    category: "Beverages",
    quantity: 1,
    unit: "count",
    location: "pantry",
    brand: "FitFood Select",
  },
  "7622210449283": {
    name: "Greek Yogurt",
    category: "Dairy",
    quantity: 500,
    unit: "g",
    location: "fridge",
    brand: "FitFood Dairy",
  },
};

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function createId(prefix: string) {
  const randomPart =
    typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomPart}`;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function isoDay(days: number) {
  return toIsoDate(addDays(days));
}

function isoTimestamp() {
  return new Date().toISOString();
}

function toNutrition(recipe: (typeof recipes)[number]): NutritionTotals {
  return {
    calories: recipe.calories,
    protein: recipe.protein,
    carbs: recipe.carbs,
    fat: recipe.fat,
  };
}

function toRecipeDetails(recipe: (typeof recipes)[number]): RecipeDetails {
  return {
    id: recipe.id,
    name: recipe.name,
    hero_emoji: recipe.emoji,
    minutes: recipe.minutes,
    servings: 1,
    tags: [recipe.tag],
    goals: recipe.goals,
    nutrition_summary: toNutrition(recipe),
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: ingredient,
      normalized_name: normalizeName(ingredient),
    })),
    instructions: recipe.steps,
  };
}

function toInventoryItem(
  product: Omit<Product, "id"> & { id?: string },
  fridgeId = DEFAULT_FRIDGE_ID,
): InventoryItem {
  return {
    id: product.id ?? createId("item"),
    fridge_id: fridgeId,
    display_name: product.name,
    normalized_name: normalizeName(product.name),
    quantity: product.quantity,
    unit: product.unit,
    location: product.location,
    category: product.category,
    purchase_date: product.addedDate,
    expiration_date: product.expiryDate,
    source:
      product.source === "manual" ? "manual" : product.source === "barcode" ? "barcode" : "receipt",
    confidence: product.source === "manual" ? 1 : 0.92,
  };
}

function createInitialState(): FallbackState {
  return {
    user: DEFAULT_USER,
    profile: null,
    goal: null,
    fridges: DEFAULT_FRIDGES,
    inventory: seedProducts.map((product) => toInventoryItem(product)),
    shopping_list: [],
    meal_plans: [],
  };
}

function readState(): FallbackState {
  if (typeof window === "undefined") {
    if (!memoryState) {
      memoryState = createInitialState();
    }
    return memoryState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw) as FallbackState;
  } catch {
    return createInitialState();
  }
}

function writeState(state: FallbackState) {
  if (typeof window === "undefined") {
    memoryState = state;
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures in offline demo mode.
  }
}

function updateState(updater: (state: FallbackState) => FallbackState) {
  const nextState = updater(readState());
  writeState(nextState);
  return nextState;
}

function makeGoalProfile(input: GoalUpdateInput): GoalProfile {
  const target = goalTargets[input.goal];
  return {
    goal: input.goal,
    calories_target: target.calories,
    protein_target: target.protein,
    carbs_target: target.carbs,
    fat_target: target.fat,
    active_from: new Date().toISOString(),
    active_to: null,
    source: "manual",
  };
}

function estimateFallbackGoal(input: OnboardingCompleteInput): GoalProfile {
  const target = goalTargets[input.goal];
  const adjustment = input.goal === "lose" ? -200 : input.goal === "gain" ? 180 : 0;
  return {
    goal: input.goal,
    calories_target: Math.max(1200, target.calories + adjustment),
    protein_target: Math.max(1, Math.round(input.weight_kg * 1.6)),
    carbs_target: target.carbs,
    fat_target: target.fat,
    active_from: isoTimestamp(),
    active_to: null,
    target_weight_kg: input.target_weight_kg ?? null,
    estimate_snapshot: {
      formula: "fallback",
      activity_level: input.activity_level,
      target_weight_kg: input.target_weight_kg ?? null,
    },
    source: "onboarding",
  };
}

function profileFromOnboarding(input: OnboardingCompleteInput): NutritionProfile {
  const now = isoTimestamp();
  return {
    user_id: DEFAULT_USER.id,
    age_years: input.age_years,
    sex_for_calorie_estimate: input.sex_for_calorie_estimate,
    height_cm: input.height_cm,
    weight_kg: input.weight_kg,
    target_weight_kg: input.target_weight_kg ?? null,
    activity_level: input.activity_level,
    dietary_preferences: input.dietary_preferences,
    allergies: input.allergies.map((allergy) => ({
      ...allergy,
      normalized_name: normalizeName(allergy.display_name),
    })),
    calorie_formula: "fallback",
    calorie_estimate: {
      activity_level: input.activity_level,
      target_weight_kg: input.target_weight_kg ?? null,
    },
    created_at: now,
    updated_at: now,
  };
}

function onboardingState(state: FallbackState): OnboardingState {
  const primaryFridge =
    state.fridges.find((fridge) => fridge.id === state.user.primary_fridge_id) ??
    state.fridges[0] ??
    null;
  return {
    completed: Boolean(state.user.onboarding_completed_at),
    user: state.user,
    profile: state.profile,
    current_goal: state.goal,
    primary_fridge: primaryFridge,
  };
}

function getRecipeCatalog(): RecipeDetails[] {
  return recipes.map(toRecipeDetails);
}

function getGoalAwareRecipeCatalog(goal?: Goal | null) {
  return getRecipeCatalog().filter((recipe) => (goal ? recipe.goals.includes(goal) : true));
}

function buildRecipeMatches(
  inventory: InventoryItem[],
  params: RecipeMatchParams = {},
): RecipeMatch[] {
  const availableNames = new Set(inventory.map((item) => normalizeName(item.display_name)));

  return getRecipeCatalog()
    .filter((recipe) => (params.goal ? recipe.goals.includes(params.goal) : true))
    .map((recipe) => {
      const availableIngredients = recipe.ingredients.filter((ingredient) =>
        availableNames.has(ingredient.normalized_name),
      );
      const missingIngredients = recipe.ingredients.filter(
        (ingredient) => !availableNames.has(ingredient.normalized_name),
      );
      const matchScore = Math.round(
        (availableIngredients.length / Math.max(recipe.ingredients.length, 1)) * 100,
      );

      return {
        recipe,
        match_score: matchScore,
        available_ingredients: availableIngredients,
        missing_ingredients: missingIngredients,
        shopping_list_ready: missingIngredients.length > 0,
        nutrition_summary: recipe.nutrition_summary,
      };
    })
    .filter((match) =>
      params.maxMissing == null ? true : match.missing_ingredients.length <= params.maxMissing,
    )
    .sort(
      (left, right) =>
        right.match_score - left.match_score ||
        left.missing_ingredients.length - right.missing_ingredients.length,
    );
}

function recipeMatchesForFridge(fridgeId: string, params: RecipeMatchParams = {}) {
  const inventory = readState().inventory.filter((item) => item.fridge_id === fridgeId);
  return buildRecipeMatches(inventory, params);
}

function createShoppingListItem(
  ingredient: { name: string; normalized_name: string },
  fridgeId: string,
  recipeId: string,
): ShoppingListItem {
  const now = isoTimestamp();
  return {
    id: createId("shopping"),
    fridge_id: fridgeId,
    recipe_id: recipeId,
    display_name: ingredient.name,
    normalized_name: ingredient.normalized_name,
    quantity: 1,
    unit: "count",
    category: "Ingredients",
    checked: false,
    notes: null,
    created_at: now,
    updated_at: now,
  };
}

function createManualInventoryItem(
  fridgeId: string,
  input: InventoryItemCreateInput,
): InventoryItem {
  return {
    id: createId("manual"),
    fridge_id: fridgeId,
    display_name: input.display_name.trim(),
    normalized_name: normalizeName(input.display_name),
    quantity: input.quantity,
    unit: input.unit,
    location: input.location,
    category: input.category.trim(),
    purchase_date: input.purchase_date ?? isoDay(0),
    expiration_date: input.expiration_date ?? null,
    source: "manual",
    source_provider: null,
    expiration_date_source:
      input.expiration_date_source ?? (input.expiration_date ? "user" : "unknown"),
    expiration_confidence: input.expiration_confidence ?? null,
    confidence: input.confidence ?? 1,
  };
}

function updateManualInventoryItem(
  item: InventoryItem,
  input: InventoryItemUpdateInput,
): InventoryItem {
  const displayName = input.display_name?.trim() ?? item.display_name;
  const expirationDate =
    "expiration_date" in input ? (input.expiration_date ?? null) : item.expiration_date;

  return {
    ...item,
    display_name: displayName,
    normalized_name:
      input.display_name != null ? normalizeName(input.display_name) : item.normalized_name,
    quantity: input.quantity ?? item.quantity,
    unit: input.unit ?? item.unit,
    location: input.location ?? item.location,
    category: input.category?.trim() ?? item.category,
    purchase_date: input.purchase_date ?? item.purchase_date,
    expiration_date: expirationDate,
    expiration_date_source:
      input.expiration_date_source ??
      ("expiration_date" in input
        ? expirationDate
          ? "user"
          : "unknown"
        : item.expiration_date_source),
    expiration_confidence:
      "expiration_confidence" in input
        ? (input.expiration_confidence ?? null)
        : item.expiration_confidence,
    confidence: "confidence" in input ? (input.confidence ?? null) : item.confidence,
  };
}

function sumNutrition(entries: MealPlanEntry[]): NutritionTotals {
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

function recipeForId(recipeId: string) {
  return getRecipeCatalog().find((recipe) => recipe.id === recipeId);
}

function createMealPlanEntry(
  recipe: RecipeDetails,
  meal: MealSlotName,
  scheduledFor: string,
): MealPlanEntry {
  return {
    id: createId("meal-entry"),
    meal,
    scheduled_for: scheduledFor,
    recipe,
    servings: 1,
    notes: null,
  };
}

function buildFallbackMealPlan(
  fridgeId: string,
  spanDays: number,
  goal?: Goal | null,
  startsOn = isoDay(0),
): MealPlan {
  const inventory = readState().inventory.filter((item) => item.fridge_id === fridgeId);
  const fridge = inventory.filter((item) => item.location === "fridge").map(toProduct);
  const pantry = inventory.filter((item) => item.location === "pantry").map(toProduct);
  const todaysPlan = generateMealPlan(fridge, pantry);
  const goalAwareRecipes = buildRecipeMatches(inventory, {
    goal: goal ?? undefined,
    maxMissing: 4,
  }).map((match) => match.recipe);
  const rankedRecipes = goalAwareRecipes.length
    ? goalAwareRecipes
    : getGoalAwareRecipeCatalog(goal);
  if (!rankedRecipes.length) {
    const createdAt = isoTimestamp();
    return {
      id: createId("meal-plan"),
      fridge_id: fridgeId,
      goal: goal ?? null,
      span_days: Math.max(spanDays, 1),
      starts_on: startsOn,
      created_at: createdAt,
      updated_at: createdAt,
      nutrition_summary: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      entries: [],
    };
  }

  const breakfastRecipes = rankedRecipes.filter((recipe) =>
    recipe.tags.some((tag) => BREAKFAST_TAGS.has(tag)),
  );
  const mainRecipes = rankedRecipes.filter(
    (recipe) => !recipe.tags.some((tag) => BREAKFAST_TAGS.has(tag)),
  );
  const snackRecipes = rankedRecipes.filter((recipe) => recipe.nutrition_summary.calories <= 420);

  const pick = (list: RecipeDetails[], index: number) =>
    list[index % Math.max(list.length, 1)] ??
    rankedRecipes[index % Math.max(rankedRecipes.length, 1)];

  const entries = Array.from({ length: Math.max(spanDays, 1) }).flatMap((_, dayIndex) => {
    const startDate = new Date(startsOn);
    startDate.setHours(12, 0, 0, 0);
    startDate.setDate(startDate.getDate() + dayIndex);
    const scheduledFor = toIsoDate(startDate);
    if (dayIndex === 0 && todaysPlan.enough && todaysPlan.meals.length) {
      return todaysPlan.meals
        .map((meal) => recipeForId(meal.recipe.id))
        .filter((recipe): recipe is RecipeDetails => recipe != null)
        .map((recipe, recipeIndex) =>
          createMealPlanEntry(
            recipe,
            (todaysPlan.meals[recipeIndex]?.meal ?? "Lunch") as MealSlotName,
            scheduledFor,
          ),
        );
    }

    const breakfast = pick(breakfastRecipes.length ? breakfastRecipes : rankedRecipes, dayIndex);
    const lunch = pick(mainRecipes.length ? mainRecipes : rankedRecipes, dayIndex);
    const dinner = pick(mainRecipes.length ? mainRecipes : rankedRecipes, dayIndex + 1);
    const snack = pick(snackRecipes.length ? snackRecipes : rankedRecipes, dayIndex + 2);

    return [
      createMealPlanEntry(breakfast, "Breakfast", scheduledFor),
      createMealPlanEntry(lunch, "Lunch", scheduledFor),
      createMealPlanEntry(dinner, "Dinner", scheduledFor),
      createMealPlanEntry(snack, "Snack", scheduledFor),
    ];
  });

  const createdAt = isoTimestamp();
  return {
    id: createId("meal-plan"),
    fridge_id: fridgeId,
    goal: goal ?? null,
    span_days: Math.max(spanDays, 1),
    starts_on: startsOn,
    created_at: createdAt,
    updated_at: createdAt,
    nutrition_summary: sumNutrition(entries),
    entries,
  };
}

function resolveBarcodePreview(barcode: string): BarcodeLookupResult {
  const configured = barcodeCatalog[barcode] ?? barcodeCatalog[DEFAULT_BARCODE];
  return {
    barcode,
    product_name: configured.name,
    brand: configured.brand ?? "FitFood Select",
    category: configured.category,
    quantity: configured.quantity,
    unit: configured.unit,
    location: configured.location,
    source: "open_food_facts",
  };
}

function inventoryItemFromBarcode(barcode: string, input: BarcodeImportInput): InventoryItem {
  const preview = resolveBarcodePreview(barcode);
  const expirationDate = input.expiration_date ?? null;
  return {
    id: createId("barcode"),
    fridge_id: input.fridge_id,
    display_name: input.display_name?.trim() || preview.product_name,
    normalized_name: normalizeName(input.display_name?.trim() || preview.product_name),
    quantity: input.quantity ?? preview.quantity ?? 1,
    unit: input.unit ?? preview.unit ?? "count",
    location: input.location ?? preview.location ?? "pantry",
    category: input.category?.trim() || preview.category || "Pantry",
    purchase_date: input.purchase_date ?? isoDay(0),
    expiration_date: expirationDate,
    source: "barcode",
    source_provider: "open_food_facts",
    expiration_date_source: input.expiration_date_source ?? (expirationDate ? "user" : "unknown"),
    expiration_confidence: input.expiration_confidence ?? null,
    confidence: 0.9,
  };
}

function inventoryItemFromReceiptOcr(
  item: ReceiptOcrItem,
  input: ReceiptConfirmInput,
): InventoryItem {
  return {
    id: createId("receipt-ocr"),
    fridge_id: input.fridge_id,
    display_name: item.display_name,
    normalized_name: item.normalized_name,
    quantity: item.quantity,
    unit: item.unit,
    location: item.location ?? input.location ?? "fridge",
    category: item.category ?? "Other",
    purchase_date: item.purchase_date ?? input.purchase_date ?? isoDay(0),
    expiration_date: item.expiration_date ?? null,
    source: "receipt_ocr",
    source_provider: null,
    expiration_date_source: item.expiration_date_source ?? "unknown",
    expiration_confidence: item.expiration_confidence ?? null,
    confidence: item.confidence,
  };
}

function searchFallbackNutrition(query: string): NutritionSearchResult[] {
  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) {
    return [];
  }

  const productResults = seedProducts
    .filter((product) => normalizeName(product.name).includes(normalizedQuery))
    .map((product) => ({
      id: `product-${normalizeName(product.name)}`,
      name: product.name,
      brand: "FitFood",
      category: product.category,
      calories: 120,
      protein: 8,
      carbs: 14,
      fat: 4,
      serving_description:
        product.unit === "count"
          ? `${product.quantity} item`
          : `${product.quantity} ${product.unit}`,
      source: "usda" as const,
    }));

  const recipeResults = recipes
    .filter((recipe) => normalizeName(recipe.name).includes(normalizedQuery))
    .map((recipe) => ({
      id: `recipe-${recipe.id}`,
      name: recipe.name,
      brand: null,
      category: recipe.tag,
      calories: recipe.calories,
      protein: recipe.protein,
      carbs: recipe.carbs,
      fat: recipe.fat,
      serving_description: "1 serving",
      source: "usda" as const,
    }));

  return [...productResults, ...recipeResults].slice(0, 8);
}

function emojiForItem(item: InventoryItem) {
  const normalizedName = normalizeName(item.display_name);
  return (
    productLookup.get(normalizedName)?.emoji ??
    receiptLookup.get(normalizedName)?.emoji ??
    {
      "sparkling water": "💧",
      water: "💧",
      milk: "🥛",
      bread: "🍞",
      "greek yogurt": "🥣",
      eggs: "🥚",
      banana: "🍌",
      bananas: "🍌",
    }[normalizedName] ??
    {
      Vegetables: "🥬",
      Produce: "🥬",
      Fruit: "🍎",
      Meat: "🍗",
      Protein: "🍗",
      Fish: "🐟",
      Dairy: "🥛",
      Grains: "🌾",
      Bakery: "🍞",
      Pantry: "🫙",
      Oils: "🫒",
      Canned: "🥫",
      Snacks: "🥜",
      Beverages: "🥤",
      Frozen: "🧊",
      Condiments: "🧂",
      Other: "🍽️",
    }[item.category] ??
    "🍽️"
  );
}

export function toProduct(item: InventoryItem): Product {
  return {
    id: item.id,
    name: item.display_name,
    emoji: emojiForItem(item),
    location: item.location,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    addedDate: item.purchase_date,
    expiryDate: item.expiration_date,
    source:
      item.source === "manual"
        ? "manual"
        : item.source === "barcode" || item.source === "open_food_facts"
          ? "barcode"
          : "receipt",
  };
}

export function toMatchedRecipe(match: RecipeMatch) {
  return {
    recipe: {
      id: match.recipe.id,
      name: match.recipe.name,
      emoji: match.recipe.hero_emoji,
      minutes: match.recipe.minutes,
      calories: match.recipe.nutrition_summary.calories,
      protein: match.recipe.nutrition_summary.protein,
      carbs: match.recipe.nutrition_summary.carbs,
      fat: match.recipe.nutrition_summary.fat,
      goals: match.recipe.goals,
      ingredients: match.recipe.ingredients.map((ingredient) => ingredient.name),
      steps: match.recipe.instructions,
      tag: match.recipe.tags[0] ?? "Recipe",
    },
    match: match.match_score,
    have: match.available_ingredients.map((ingredient) => ingredient.name),
    missing: match.missing_ingredients.map((ingredient) => ingredient.name),
  };
}

export function createFallbackApi(): FitFoodApi {
  return {
    async getCurrentUser() {
      return readState().user;
    },

    async getOnboardingState() {
      return onboardingState(readState());
    },

    async completeOnboarding(input) {
      const now = isoTimestamp();
      const goal = estimateFallbackGoal(input);
      const profile = profileFromOnboarding(input);
      const updated = updateState((state) => {
        const primaryFridge = state.fridges[0] ?? DEFAULT_FRIDGES[0];
        const nextFridge = {
          ...primaryFridge,
          name: input.fridge.name,
          kind: input.fridge.kind,
          description: input.fridge.description ?? primaryFridge.description,
          is_primary: true,
        };
        return {
          ...state,
          user: {
            ...state.user,
            display_name: input.display_name,
            onboarding_completed_at: state.user.onboarding_completed_at ?? now,
            primary_fridge_id: nextFridge.id,
          },
          profile,
          goal,
          fridges: [nextFridge, ...state.fridges.filter((fridge) => fridge.id !== nextFridge.id)],
        };
      });
      return onboardingState(updated);
    },

    async getNutritionProfile() {
      return readState().profile;
    },

    async getCurrentGoal() {
      return readState().goal;
    },

    async updateCurrentGoal(input) {
      const nextGoal = makeGoalProfile(input);
      updateState((state) => ({ ...state, goal: nextGoal }));
      return nextGoal;
    },

    async getFridges() {
      return readState().fridges;
    },

    async getInventoryItems(fridgeId) {
      return readState().inventory.filter((item) => item.fridge_id === fridgeId);
    },

    async getExpiringInventoryItems(fridgeId, days = 3) {
      return readState()
        .inventory.filter((item) => item.fridge_id === fridgeId)
        .filter((item) => item.expiration_date != null)
        .filter((item) => daysUntil(item.expiration_date ?? isoDay(0)) <= days)
        .sort(
          (left, right) =>
            daysUntil(left.expiration_date ?? isoDay(0)) -
            daysUntil(right.expiration_date ?? isoDay(0)),
        );
    },

    async deleteInventoryItem(itemId) {
      updateState((state) => ({
        ...state,
        inventory: state.inventory.filter((item) => item.id !== itemId),
      }));
    },

    async getRecipes() {
      return getRecipeCatalog();
    },

    async getRecipeMatches(fridgeId, params = {}) {
      const inventory = readState().inventory.filter((item) => item.fridge_id === fridgeId);
      return buildRecipeMatches(inventory, params);
    },

    async createInventoryItem(fridgeId, input) {
      const nextItem = createManualInventoryItem(fridgeId, input);
      updateState((state) => ({
        ...state,
        inventory: [nextItem, ...state.inventory],
      }));
      return nextItem;
    },

    async updateInventoryItem(itemId, input) {
      const existingItem = readState().inventory.find((item) => item.id === itemId);
      if (!existingItem) {
        throw new Error("Inventory item not found");
      }

      const nextItem = updateManualInventoryItem(existingItem, input);
      updateState((state) => ({
        ...state,
        inventory: state.inventory.map((item) => (item.id === itemId ? nextItem : item)),
      }));
      return nextItem;
    },

    async createRecipeShoppingListItems(recipeId, fridgeId) {
      const match = recipeMatchesForFridge(fridgeId).find(
        (candidate) => candidate.recipe.id === recipeId,
      );
      const items =
        match?.missing_ingredients.map((ingredient) =>
          createShoppingListItem(ingredient, fridgeId, recipeId),
        ) ?? [];

      updateState((state) => ({
        ...state,
        shopping_list: [...items, ...state.shopping_list],
      }));

      return {
        items,
        summary: {
          fridge_id: fridgeId,
          recipe_id: recipeId,
          created_count: items.length,
        },
      };
    },

    async getShoppingListItems() {
      return readState().shopping_list;
    },

    async updateShoppingListItem(itemId, input) {
      let updatedItem: ShoppingListItem | null = null;
      updateState((state) => ({
        ...state,
        shopping_list: state.shopping_list.map((item) => {
          if (item.id !== itemId) {
            return item;
          }

          updatedItem = {
            ...item,
            ...input,
            updated_at: isoTimestamp(),
          };
          return updatedItem;
        }),
      }));

      if (!updatedItem) {
        throw new Error("Shopping list item not found");
      }

      return updatedItem;
    },

    async deleteShoppingListItem(itemId) {
      updateState((state) => ({
        ...state,
        shopping_list: state.shopping_list.filter((item) => item.id !== itemId),
      }));
    },

    async getMealPlans() {
      return readState().meal_plans;
    },

    async createMealPlan(input) {
      const nextPlan = buildFallbackMealPlan(
        input.fridge_id,
        input.span_days ?? 1,
        input.goal ?? readState().goal?.goal ?? null,
        input.starts_on ?? isoDay(0),
      );

      updateState((state) => ({
        ...state,
        meal_plans: [nextPlan, ...state.meal_plans.filter((plan) => plan.id !== nextPlan.id)],
      }));

      return nextPlan;
    },

    async addMealPlanEntry(mealPlanId, input) {
      const recipe = recipeForId(input.recipe_id);
      if (!recipe) {
        throw new Error("Recipe not found");
      }

      let updatedPlan: MealPlan | null = null;
      updateState((state) => ({
        ...state,
        meal_plans: state.meal_plans.map((plan) => {
          if (plan.id !== mealPlanId) {
            return plan;
          }

          const nextEntries = [
            ...plan.entries,
            {
              ...createMealPlanEntry(recipe, input.meal, input.scheduled_for),
              servings: input.servings ?? 1,
              notes: input.notes ?? null,
            },
          ].sort(
            (left, right) =>
              left.scheduled_for.localeCompare(right.scheduled_for) ||
              left.meal.localeCompare(right.meal),
          );

          updatedPlan = {
            ...plan,
            entries: nextEntries,
            updated_at: isoTimestamp(),
            nutrition_summary: sumNutrition(nextEntries),
          };
          return updatedPlan;
        }),
      }));

      if (!updatedPlan) {
        throw new Error("Meal plan not found");
      }

      return updatedPlan;
    },

    async getBarcodeImportPreview(barcode) {
      return resolveBarcodePreview(barcode);
    },

    async importBarcode(barcode, input): Promise<BarcodeImportResult> {
      const importedItem = inventoryItemFromBarcode(barcode, input);

      updateState((state) => ({
        ...state,
        inventory: [importedItem, ...state.inventory],
      }));

      return {
        barcode,
        item: importedItem,
        summary: {
          fridge_id: input.fridge_id,
          imported_count: 1,
          source: "barcode",
        },
      };
    },

    async searchNutrition(query) {
      return searchFallbackNutrition(query);
    },

    async ocrReceipt(file): Promise<ReceiptOcrPreview> {
      const receiptId = `receipt:fallback-${file.name || "image"}`;
      return {
        receipt_id: receiptId,
        merchant: "OCR unavailable",
        purchase_date: null,
        items: [],
        summary: {
          detected_count: 0,
          receipt_id: receiptId,
          source: "minimax_ocr",
        },
      };
    },

    async confirmReceiptImport(input): Promise<ReceiptImportResult> {
      const importedItems = input.items.map((item) => inventoryItemFromReceiptOcr(item, input));

      updateState((state) => ({
        ...state,
        inventory: [...importedItems, ...state.inventory],
      }));

      return {
        items: importedItems,
        summary: {
          fridge_id: input.fridge_id,
          imported_count: importedItems.length,
          receipt_id: input.receipt_id,
          source: "receipt_ocr",
        },
      };
    },

    async importReceiptDemo(): Promise<ReceiptImportResult> {
      const importedItems = receiptProducts.map((product) =>
        toInventoryItem(
          {
            ...product,
            id: createId("receipt"),
          },
          DEFAULT_FRIDGE_ID,
        ),
      );

      updateState((state) => ({
        ...state,
        inventory: [...importedItems, ...state.inventory],
      }));

      return {
        items: importedItems,
        summary: {
          fridge_id: DEFAULT_FRIDGE_ID,
          imported_count: importedItems.length,
          source: "demo",
        },
      };
    },

    async resetDemoState() {
      const initialState = createInitialState();
      writeState(initialState);
      return onboardingState(initialState);
    },
  };
}
