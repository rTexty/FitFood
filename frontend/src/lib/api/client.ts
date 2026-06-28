import { createFallbackApi } from "./fallback";
import type { Goal, Location, Unit } from "../fitfood-data";
import type {
  ApiErrorShape,
  BarcodeImportInput,
  BarcodeImportResult,
  BarcodeLookupResult,
  ApiListResponse,
  ApiResponse,
  FitFoodApi,
  GoalProfile,
  GoalUpdateInput,
  IngredientStatus,
  InventoryItem,
  InventoryItemCreateInput,
  InventoryItemUpdateInput,
  MealPlan,
  MealPlanEntry,
  MealPlanCreateInput,
  MealPlanEntryCreateInput,
  MealSlotName,
  NutritionProfile,
  NutritionSearchResult,
  NutritionTotals,
  OnboardingCompleteInput,
  OnboardingState,
  RecipeMatch,
  RecipeMatchParams,
  RecipeDetails,
  ReceiptConfirmInput,
  ReceiptImportResult,
  ReceiptOcrItem,
  ReceiptOcrPreview,
  ShoppingListCreateResult,
  ShoppingListItem,
  ShoppingListItemUpdateInput,
  UserProfile,
  Fridge,
} from "./types";

const defaultFallbackApi = createFallbackApi();
const FALLBACKABLE_STATUSES = new Set([404, 405, 500, 501, 502, 503, 504]);

export interface ApiClientEnv {
  DEV?: boolean;
  VITE_API_BASE_URL?: string;
  VITE_FITFOOD_API_BASE_URL?: string;
  VITE_FITFOOD_INTERNAL_API_BASE_URL?: string;
  VITE_FITFOOD_ENABLE_FALLBACK?: string;
}

interface CreateFitFoodApiOptions {
  baseUrl?: string;
  env?: ApiClientEnv;
  fallbackApi?: FitFoodApi;
  fetchImpl?: typeof fetch;
}

interface HttpFitFoodApiOptions {
  allowFallback?: boolean;
  fallbackApi?: FitFoodApi;
  fetchImpl?: typeof fetch;
}

export class FitFoodApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, error: ApiErrorShape) {
    super(error.message);
    this.name = "FitFoodApiError";
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

export function normalizeApiBaseUrl(baseUrl?: string) {
  const trimmed = (baseUrl ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

function getConfiguredApiBaseUrl(env: ApiClientEnv = import.meta.env) {
  const serverBaseUrl = getServerApiBaseUrl(env);
  if (serverBaseUrl) {
    return serverBaseUrl;
  }
  return env.VITE_API_BASE_URL ?? env.VITE_FITFOOD_API_BASE_URL;
}

function getServerApiBaseUrl(env: ApiClientEnv) {
  if (typeof window !== "undefined") {
    return undefined;
  }

  const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return (
    runtimeEnv?.FITFOOD_INTERNAL_API_BASE_URL ??
    runtimeEnv?.VITE_FITFOOD_INTERNAL_API_BASE_URL ??
    env.VITE_FITFOOD_INTERNAL_API_BASE_URL
  );
}

function shouldAllowFallback(env: ApiClientEnv = import.meta.env) {
  return env.VITE_FITFOOD_ENABLE_FALLBACK === "true" || !getConfiguredApiBaseUrl(env);
}

function isNetworkLikeError(error: unknown) {
  return error instanceof TypeError;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNutrition(value: unknown): NutritionTotals {
  const record = asRecord(value);
  return {
    calories: asNumber(record.calories),
    protein: asNumber(record.protein),
    carbs: asNumber(record.carbs),
    fat: asNumber(record.fat),
  };
}

function normalizeLocation(value: unknown): Location {
  return value === "pantry" || value === "freezer" ? value : "fridge";
}

function normalizeUnit(value: unknown, fallback: Unit = "count"): Unit {
  return asString(value, fallback) as Unit;
}

function normalizeGoalList(value: unknown): Goal[] {
  return Array.isArray(value)
    ? value.filter(
        (goal): goal is Goal => goal === "lose" || goal === "maintain" || goal === "gain",
      )
    : [];
}

function normalizeUserProfile(value: unknown): UserProfile {
  const record = asRecord(value);
  const user: UserProfile = {
    id: asString(record.id, "user-demo"),
    email: asString(record.email, "alex@fitfood.app"),
    display_name: asString(record.display_name, "Alex Green"),
    locale: asString(record.locale, "en-US"),
    timezone: asString(record.timezone, "UTC"),
  };
  if ("onboarding_completed_at" in record) {
    user.onboarding_completed_at =
      typeof record.onboarding_completed_at === "string" ? record.onboarding_completed_at : null;
  }
  if ("primary_fridge_id" in record) {
    user.primary_fridge_id =
      record.primary_fridge_id != null ? String(record.primary_fridge_id) : null;
  }
  return user;
}

function normalizeAllergy(value: unknown): NutritionProfile["allergies"][number] {
  const record = asRecord(value);
  const displayName = asString(record.display_name, "Allergy");
  const severity =
    record.severity === "trace_ok" || record.severity === "preference" ? record.severity : "avoid";
  return {
    display_name: displayName,
    normalized_name: asString(record.normalized_name, displayName.toLowerCase()),
    severity,
  };
}

function normalizeNutritionProfile(value: unknown): NutritionProfile {
  const record = asRecord(value);
  return {
    user_id: asString(record.user_id, "user-demo"),
    age_years: asNumber(record.age_years),
    sex_for_calorie_estimate:
      record.sex_for_calorie_estimate === "male" || record.sex_for_calorie_estimate === "female"
        ? record.sex_for_calorie_estimate
        : "not_specified",
    height_cm: asNumber(record.height_cm),
    weight_kg: asNumber(record.weight_kg),
    target_weight_kg: typeof record.target_weight_kg === "number" ? record.target_weight_kg : null,
    activity_level:
      record.activity_level === "sedentary" ||
      record.activity_level === "light" ||
      record.activity_level === "moderate" ||
      record.activity_level === "active" ||
      record.activity_level === "very_active"
        ? record.activity_level
        : "moderate",
    dietary_preferences: Array.isArray(record.dietary_preferences)
      ? record.dietary_preferences.map(String)
      : [],
    allergies: Array.isArray(record.allergies) ? record.allergies.map(normalizeAllergy) : [],
    calorie_formula: asString(record.calorie_formula, "mifflin_st_jeor"),
    calorie_estimate: asRecord(record.calorie_estimate),
    created_at: asString(record.created_at),
    updated_at: asString(record.updated_at),
  };
}

function normalizeGoalProfile(value: unknown): GoalProfile {
  const record = asRecord(value);
  const goal = record.goal === "lose" || record.goal === "gain" ? record.goal : "maintain";
  const profile: GoalProfile = {
    goal,
    calories_target: asNumber(record.calories_target),
    protein_target: asNumber(record.protein_target),
    carbs_target: asNumber(record.carbs_target),
    fat_target: asNumber(record.fat_target),
    active_from: asString(record.active_from, new Date().toISOString()),
    active_to: typeof record.active_to === "string" ? record.active_to : null,
  };
  if ("target_weight_kg" in record) {
    profile.target_weight_kg =
      typeof record.target_weight_kg === "number" ? record.target_weight_kg : null;
  }
  if ("estimate_snapshot" in record) {
    profile.estimate_snapshot = record.estimate_snapshot
      ? asRecord(record.estimate_snapshot)
      : null;
  }
  if ("source" in record) {
    profile.source = asString(record.source, "manual");
  }
  return profile;
}

function normalizeFridge(value: unknown): Fridge {
  const record = asRecord(value);
  return {
    id: String(record.id ?? ""),
    name: asString(record.name, "Kitchen"),
    kind: asString(record.kind, "home"),
    description: typeof record.description === "string" ? record.description : undefined,
    is_primary: record.is_primary === true,
  };
}

function normalizeOnboardingState(value: unknown): OnboardingState {
  const record = asRecord(value);
  return {
    completed: record.completed === true,
    user: normalizeUserProfile(record.user),
    profile: record.profile ? normalizeNutritionProfile(record.profile) : null,
    current_goal: record.current_goal ? normalizeGoalProfile(record.current_goal) : null,
    primary_fridge: record.primary_fridge ? normalizeFridge(record.primary_fridge) : null,
  };
}

function normalizeInventoryItem(value: unknown): InventoryItem {
  const record = asRecord(value);
  const displayName = asString(record.display_name, "Product");
  return {
    id: String(record.id ?? ""),
    fridge_id: String(record.fridge_id ?? ""),
    display_name: displayName,
    normalized_name: asString(record.normalized_name, displayName.toLowerCase()),
    quantity: asNumber(record.quantity, 1),
    unit: normalizeUnit(record.unit),
    location: normalizeLocation(record.location),
    category: asString(record.category, "Other"),
    purchase_date: asString(record.purchase_date, new Date().toISOString().slice(0, 10)),
    expiration_date: typeof record.expiration_date === "string" ? record.expiration_date : null,
    source: asString(record.source, "manual") as InventoryItem["source"],
    source_provider: typeof record.source_provider === "string" ? record.source_provider : null,
    expiration_date_source: asExpirationDateSource(record.expiration_date_source),
    expiration_confidence:
      typeof record.expiration_confidence === "number" &&
      Number.isFinite(record.expiration_confidence)
        ? record.expiration_confidence
        : null,
    confidence:
      typeof record.confidence === "number" && Number.isFinite(record.confidence)
        ? record.confidence
        : null,
  };
}

function asExpirationDateSource(value: unknown): InventoryItem["expiration_date_source"] {
  return value === "user" ||
    value === "ocr" ||
    value === "provider" ||
    value === "estimated" ||
    value === "unknown"
    ? value
    : "unknown";
}

function normalizeIngredient(value: unknown): IngredientStatus {
  const record = asRecord(value);
  const name = asString(record.name, asString(record.display_name, "Ingredient"));
  return {
    name,
    normalized_name: asString(record.normalized_name, name.toLowerCase()),
  };
}

function normalizeRecipeDetails(value: unknown): RecipeDetails {
  const record = asRecord(value);
  const nutrition = asNutrition(record.nutrition_summary);
  const name = asString(record.name, "Recipe");
  return {
    id: String(record.id ?? ""),
    name,
    hero_emoji: asString(record.hero_emoji, "🍽️"),
    image_url: typeof record.image_url === "string" ? record.image_url : null,
    source_provider: typeof record.source_provider === "string" ? record.source_provider : null,
    minutes: asNumber(record.minutes, 0),
    servings: asNumber(record.servings, 1),
    tags: Array.isArray(record.tags) ? record.tags.map(String) : ["Recipe"],
    goals: normalizeGoalList(record.goals),
    nutrition_summary: nutrition,
    ingredients: Array.isArray(record.ingredients)
      ? record.ingredients.map(normalizeIngredient)
      : [],
    instructions: Array.isArray(record.instructions)
      ? record.instructions.map(String)
      : ["Prepare the ingredients.", "Serve when ready."],
  };
}

function normalizeRecipeMatch(value: unknown): RecipeMatch {
  const record = asRecord(value);
  const recipe = normalizeRecipeDetails(record.recipe);
  const availableIngredients = Array.isArray(record.available_ingredients)
    ? record.available_ingredients.map(normalizeIngredient)
    : [];
  const missingIngredients = Array.isArray(record.missing_ingredients)
    ? record.missing_ingredients.map(normalizeIngredient)
    : [];

  return {
    recipe,
    match_score: asNumber(record.match_score),
    available_ingredients: availableIngredients,
    missing_ingredients: missingIngredients,
    shopping_list_ready:
      typeof record.shopping_list_ready === "boolean"
        ? record.shopping_list_ready
        : missingIngredients.length > 0,
    nutrition_summary: record.nutrition_summary
      ? asNutrition(record.nutrition_summary)
      : recipe.nutrition_summary,
  };
}

function normalizeShoppingListItem(value: unknown, fridgeId?: string): ShoppingListItem {
  const record = asRecord(value);
  const recipeId = record.recipe_id ?? record.source_recipe_id ?? null;
  return {
    id: String(record.id ?? ""),
    fridge_id: record.fridge_id != null ? String(record.fridge_id) : fridgeId,
    shopping_list_id: record.shopping_list_id != null ? String(record.shopping_list_id) : null,
    recipe_id: recipeId != null ? String(recipeId) : null,
    source_recipe_id: recipeId != null ? String(recipeId) : null,
    display_name: asString(record.display_name, "Ingredient"),
    normalized_name: asString(record.normalized_name, "ingredient"),
    quantity: asNumber(record.quantity, 1),
    unit: normalizeUnit(record.unit, "item"),
    category: asString(record.category, "Ingredients"),
    checked: record.checked === true,
    notes: typeof record.notes === "string" ? record.notes : null,
    created_at: asString(record.created_at, new Date().toISOString()),
    updated_at: asString(record.updated_at, new Date().toISOString()),
  };
}

function normalizeShoppingListCreateResult(
  value: unknown,
  recipeId: string,
  fridgeId: string,
): ShoppingListCreateResult {
  const record = asRecord(value);
  const summary = asRecord(record.summary);
  const items = Array.isArray(record.items)
    ? record.items.map((item) => normalizeShoppingListItem(item, fridgeId))
    : [];
  return {
    items,
    summary: {
      fridge_id: asString(summary.fridge_id, fridgeId),
      recipe_id: asString(summary.recipe_id, recipeId),
      created_count: asNumber(record.created_count, asNumber(summary.created_count, items.length)),
      merged_count: asNumber(record.merged_count, asNumber(summary.merged_count, 0)),
    },
  };
}

function normalizeMealSlot(value: unknown): MealSlotName {
  const normalized = asString(value, "Lunch").toLowerCase();
  if (normalized === "breakfast") return "Breakfast";
  if (normalized === "dinner") return "Dinner";
  if (normalized === "snack") return "Snack";
  return "Lunch";
}

function addDaysIso(start: string, dayIndex: number) {
  const date = new Date(`${start.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + dayIndex);
  return date.toISOString().slice(0, 10);
}

function fallbackRecipeDetails(recipeId: string, snapshot: NutritionTotals): RecipeDetails {
  return {
    id: recipeId,
    name: `Recipe ${recipeId}`,
    hero_emoji: "🍽️",
    minutes: 0,
    servings: 1,
    tags: ["Recipe"],
    goals: [],
    nutrition_summary: snapshot,
    ingredients: [],
    instructions: ["Prepare and serve."],
  };
}

function normalizeMealPlanEntry(value: unknown, startsOn: string): MealPlanEntry {
  const record = asRecord(value);
  const recipeId = String(record.recipe_id ?? asRecord(record.recipe).id ?? "");
  const nutritionSnapshot = asNutrition(record.nutrition_snapshot);
  const dayIndex = asNumber(record.day_index, 0);
  return {
    id: String(record.id ?? ""),
    meal: normalizeMealSlot(record.meal ?? record.meal_type),
    meal_type: asString(record.meal_type),
    day_index: dayIndex,
    scheduled_for: asString(record.scheduled_for, addDaysIso(startsOn, dayIndex)),
    recipe: record.recipe
      ? normalizeRecipeDetails(record.recipe)
      : fallbackRecipeDetails(recipeId, nutritionSnapshot),
    recipe_id: recipeId,
    servings: asNumber(record.servings, 1),
    nutrition_snapshot: nutritionSnapshot,
    notes: typeof record.notes === "string" ? record.notes : null,
  };
}

function normalizeMealPlan(value: unknown): MealPlan {
  const record = asRecord(value);
  const generatedAt = asString(record.generated_at, new Date().toISOString());
  const startsOn = asString(record.starts_on, generatedAt.slice(0, 10));
  const entries = Array.isArray(record.entries)
    ? record.entries.map((entry) => normalizeMealPlanEntry(entry, startsOn))
    : [];
  const entryTotals = entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + entry.recipe.nutrition_summary.calories,
      protein: totals.protein + entry.recipe.nutrition_summary.protein,
      carbs: totals.carbs + entry.recipe.nutrition_summary.carbs,
      fat: totals.fat + entry.recipe.nutrition_summary.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return {
    id: String(record.id ?? ""),
    fridge_id: String(record.fridge_id ?? ""),
    goal:
      record.goal === "lose" || record.goal === "maintain" || record.goal === "gain"
        ? record.goal
        : null,
    span_days: asNumber(record.span_days, 1),
    status: asString(record.status, "draft"),
    starts_on: startsOn,
    generated_at: generatedAt,
    created_at: asString(record.created_at, generatedAt),
    updated_at: asString(record.updated_at, generatedAt),
    nutrition_summary: record.nutrition_summary
      ? asNutrition(record.nutrition_summary)
      : entryTotals,
    entries,
  };
}

function normalizeBarcodePreview(value: unknown, barcode: string): BarcodeLookupResult {
  const record = asRecord(value);
  const productName = asString(record.product_name, asString(record.display_name, "Product"));
  return {
    barcode: asString(record.barcode, barcode),
    product_name: productName,
    display_name: productName,
    normalized_name: asString(record.normalized_name, productName.toLowerCase()),
    brand: typeof record.brand === "string" ? record.brand : null,
    category: typeof record.category === "string" ? record.category : null,
    quantity: typeof record.quantity === "number" ? record.quantity : 1,
    unit: record.unit ? normalizeUnit(record.unit) : null,
    location: record.location ? normalizeLocation(record.location) : "pantry",
    image_url: typeof record.image_url === "string" ? record.image_url : null,
    nutrition_per_100g: asNutrition(record.nutrition_per_100g),
    source: "open_food_facts",
    provider: "open_food_facts",
  };
}

function normalizeBarcodeImport(value: unknown, barcode: string): BarcodeImportResult {
  const record = asRecord(value);
  const item = normalizeInventoryItem(record.item ?? record);
  return {
    barcode: asString(record.barcode, barcode),
    item,
    summary: {
      fridge_id: String(asRecord(record.summary).fridge_id ?? item.fridge_id),
      imported_count: asNumber(asRecord(record.summary).imported_count, 1),
      source: "barcode",
    },
  };
}

function normalizeNutritionSearchResult(value: unknown): NutritionSearchResult {
  const record = asRecord(value);
  const nutrition = asNutrition(record.nutrition_per_100g);
  const name = asString(record.name, asString(record.display_name, "Food"));
  return {
    id: String(record.id ?? record.external_id ?? ""),
    external_id: record.external_id != null ? String(record.external_id) : undefined,
    name,
    display_name: name,
    normalized_name: asString(record.normalized_name, name.toLowerCase()),
    brand: typeof record.brand === "string" ? record.brand : null,
    category: typeof record.category === "string" ? record.category : null,
    description: typeof record.description === "string" ? record.description : null,
    calories: asNumber(record.calories, nutrition.calories),
    protein: asNumber(record.protein, nutrition.protein),
    carbs: asNumber(record.carbs, nutrition.carbs),
    fat: asNumber(record.fat, nutrition.fat),
    nutrition_per_100g: nutrition,
    serving_description: asString(record.serving_description, "100 g"),
    source: "usda",
    provider: "usda",
  };
}

function normalizeReceiptOcrItem(value: unknown): ReceiptOcrItem {
  const record = asRecord(value);
  const displayName = asString(record.display_name, "Receipt item");
  return {
    display_name: displayName,
    normalized_name: asString(record.normalized_name, displayName.toLowerCase()),
    quantity: asNumber(record.quantity, 1),
    unit: normalizeUnit(record.unit, "pcs"),
    location: record.location ? normalizeLocation(record.location) : undefined,
    category: typeof record.category === "string" ? record.category : "Other",
    purchase_date: typeof record.purchase_date === "string" ? record.purchase_date : null,
    expiration_date: typeof record.expiration_date === "string" ? record.expiration_date : null,
    expiration_date_source: asExpirationDateSource(record.expiration_date_source),
    expiration_confidence:
      typeof record.expiration_confidence === "number" &&
      Number.isFinite(record.expiration_confidence)
        ? record.expiration_confidence
        : null,
    confidence: asNumber(record.confidence, 0.5),
  };
}

function normalizeReceiptOcrPreview(value: unknown): ReceiptOcrPreview {
  const record = asRecord(value);
  const summary = asRecord(record.summary);
  const items = Array.isArray(record.items) ? record.items.map(normalizeReceiptOcrItem) : [];
  return {
    receipt_id: asString(record.receipt_id, asString(summary.receipt_id, "receipt:unknown")),
    merchant: typeof record.merchant === "string" ? record.merchant : null,
    purchase_date: typeof record.purchase_date === "string" ? record.purchase_date : null,
    items,
    summary: {
      detected_count: asNumber(summary.detected_count, items.length),
      model: typeof summary.model === "string" ? summary.model : undefined,
      receipt_id: typeof summary.receipt_id === "string" ? summary.receipt_id : undefined,
      source: "minimax_ocr",
    },
  };
}

function normalizeReceiptImportResult(value: unknown): ReceiptImportResult {
  const record = asRecord(value);
  const summary = asRecord(record.summary);
  const items = Array.isArray(record.items) ? record.items.map(normalizeInventoryItem) : [];
  return {
    items,
    summary: {
      fridge_id: summary.fridge_id != null ? String(summary.fridge_id) : undefined,
      imported_count: asNumber(summary.imported_count, items.length),
      receipt_id: typeof summary.receipt_id === "string" ? summary.receipt_id : undefined,
      source: summary.source === "receipt_ocr" ? "receipt_ocr" : "demo",
    },
  };
}

function isFormDataBody(value: unknown) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function createHeaders(init: RequestInit) {
  return {
    Accept: "application/json",
    ...(init.body != null && !isFormDataBody(init.body)
      ? { "Content-Type": "application/json" }
      : {}),
    ...init.headers,
  };
}

async function parseResponseData<T>(response: Response) {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  const payload = JSON.parse(text) as ApiResponse<T> | ApiListResponse<T>;
  return payload.data as T;
}

async function parseErrorPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }

  return JSON.parse(text) as {
    error?: ApiErrorShape;
  } | null;
}

class HttpFitFoodApi implements FitFoodApi {
  private readonly allowFallback: boolean;
  private readonly fallbackApi: FitFoodApi;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    options: HttpFitFoodApiOptions = {},
  ) {
    this.allowFallback = options.allowFallback ?? false;
    this.fallbackApi = options.fallbackApi ?? defaultFallbackApi;
    this.fetchImpl =
      options.fetchImpl ??
      (typeof globalThis !== "undefined" ? globalThis.fetch.bind(globalThis) : fetch);
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    fallback: () => Promise<T>,
    allowFallback = this.allowFallback,
  ): Promise<T> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        credentials: "include",
        headers: createHeaders(init),
      });

      if (!response.ok) {
        if (allowFallback && FALLBACKABLE_STATUSES.has(response.status)) {
          return fallback();
        }

        const payload = await parseErrorPayload(response).catch(() => null);
        throw new FitFoodApiError(
          response.status,
          payload?.error ?? {
            code: "request_failed",
            message: `Request failed with status ${response.status}`,
          },
        );
      }

      return parseResponseData<T>(response);
    } catch (error) {
      if (allowFallback && isNetworkLikeError(error)) {
        return fallback();
      }
      throw error;
    }
  }

  getCurrentUser() {
    return this.request<unknown>("/users/me", { method: "GET" }, () =>
      this.fallbackApi.getCurrentUser(),
    ).then(normalizeUserProfile);
  }

  getOnboardingState() {
    return this.request<unknown>("/users/me/onboarding", { method: "GET" }, () =>
      this.fallbackApi.getOnboardingState(),
    ).then(normalizeOnboardingState);
  }

  completeOnboarding(input: OnboardingCompleteInput) {
    return this.request<unknown>(
      "/users/me/onboarding",
      { method: "PUT", body: JSON.stringify(input) },
      () => this.fallbackApi.completeOnboarding(input),
      false,
    ).then(normalizeOnboardingState);
  }

  getNutritionProfile() {
    return this.request<unknown | null>("/users/me/profile", { method: "GET" }, () =>
      this.fallbackApi.getNutritionProfile(),
    ).then((profile) => (profile ? normalizeNutritionProfile(profile) : null));
  }

  getCurrentGoal() {
    return this.request<unknown | null>("/users/me/goals/current", { method: "GET" }, () =>
      this.fallbackApi.getCurrentGoal(),
    ).then((goal) => (goal ? normalizeGoalProfile(goal) : null));
  }

  updateCurrentGoal(input: GoalUpdateInput) {
    return this.request<unknown>(
      "/users/me/goals/current",
      { method: "PUT", body: JSON.stringify(input) },
      () => this.fallbackApi.updateCurrentGoal(input),
    ).then(normalizeGoalProfile);
  }

  getFridges() {
    return this.request<unknown[]>("/fridges", { method: "GET" }, () =>
      this.fallbackApi.getFridges(),
    ).then((fridges) => fridges.map(normalizeFridge));
  }

  getInventoryItems(fridgeId: string) {
    return this.request<unknown[]>(`/fridges/${fridgeId}/inventory-items`, { method: "GET" }, () =>
      this.fallbackApi.getInventoryItems(fridgeId),
    ).then((items) => items.map(normalizeInventoryItem));
  }

  getExpiringInventoryItems(fridgeId: string, days = 3) {
    return this.request<unknown[]>(
      `/fridges/${fridgeId}/inventory-items/expiring?days=${days}`,
      { method: "GET" },
      () => this.fallbackApi.getExpiringInventoryItems(fridgeId, days),
    ).then((items) => items.map(normalizeInventoryItem));
  }

  deleteInventoryItem(itemId: string) {
    return this.request<void>(`/inventory-items/${itemId}`, { method: "DELETE" }, () =>
      this.fallbackApi.deleteInventoryItem(itemId),
    );
  }

  getRecipes() {
    return this.request<unknown[]>("/recipes", { method: "GET" }, () =>
      this.fallbackApi.getRecipes(),
    ).then((items) => items.map(normalizeRecipeDetails));
  }

  getRecipeMatches(fridgeId: string, params: RecipeMatchParams = {}) {
    const search = new URLSearchParams();
    if (params.goal) search.set("goal", params.goal);
    if (params.maxMissing != null) search.set("max_missing", String(params.maxMissing));
    const suffix = search.size ? `?${search.toString()}` : "";

    return this.request<unknown[]>(
      `/fridges/${fridgeId}/recipe-matches${suffix}`,
      { method: "GET" },
      () => this.fallbackApi.getRecipeMatches(fridgeId, params),
    ).then((items) => items.map(normalizeRecipeMatch));
  }

  createInventoryItem(fridgeId: string, input: InventoryItemCreateInput) {
    return this.request<unknown>(
      `/fridges/${encodeURIComponent(fridgeId)}/inventory-items`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      () => this.fallbackApi.createInventoryItem(fridgeId, input),
    ).then(normalizeInventoryItem);
  }

  updateInventoryItem(itemId: string, input: InventoryItemUpdateInput) {
    return this.request<unknown>(
      `/inventory-items/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
      () => this.fallbackApi.updateInventoryItem(itemId, input),
    ).then(normalizeInventoryItem);
  }

  createRecipeShoppingListItems(recipeId: string, fridgeId: string) {
    const search = new URLSearchParams({ fridge_id: fridgeId });
    return this.request<unknown>(
      `/recipe-matches/${encodeURIComponent(recipeId)}/shopping-list-items?${search.toString()}`,
      { method: "POST", body: JSON.stringify({}) },
      () => this.fallbackApi.createRecipeShoppingListItems(recipeId, fridgeId),
    ).then((result) => normalizeShoppingListCreateResult(result, recipeId, fridgeId));
  }

  getShoppingListItems() {
    return this.request<unknown[]>("/shopping-list-items", { method: "GET" }, () =>
      this.fallbackApi.getShoppingListItems(),
    ).then((items) => items.map((item) => normalizeShoppingListItem(item)));
  }

  updateShoppingListItem(itemId: string, input: ShoppingListItemUpdateInput) {
    return this.request<unknown>(
      `/shopping-list-items/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
      () => this.fallbackApi.updateShoppingListItem(itemId, input),
    ).then((item) => normalizeShoppingListItem(item));
  }

  deleteShoppingListItem(itemId: string) {
    return this.request<void>(
      `/shopping-list-items/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
      () => this.fallbackApi.deleteShoppingListItem(itemId),
    );
  }

  getMealPlans() {
    return this.request<unknown[]>("/meal-plans", { method: "GET" }, () =>
      this.fallbackApi.getMealPlans(),
    ).then((plans) => plans.map(normalizeMealPlan));
  }

  createMealPlan(input: MealPlanCreateInput) {
    return this.request<unknown>(
      "/meal-plans",
      { method: "POST", body: JSON.stringify(input) },
      () => this.fallbackApi.createMealPlan(input),
    ).then(normalizeMealPlan);
  }

  addMealPlanEntry(mealPlanId: string, input: MealPlanEntryCreateInput) {
    const body = {
      meal_type: input.meal.toLowerCase(),
      recipe_id: input.recipe_id,
      scheduled_for: input.scheduled_for,
      servings: input.servings ?? 1,
      notes: input.notes ?? null,
    };
    return this.request<unknown>(
      `/meal-plans/${encodeURIComponent(mealPlanId)}/entries`,
      { method: "POST", body: JSON.stringify(body) },
      () => this.fallbackApi.addMealPlanEntry(mealPlanId, input),
    ).then((entry) => normalizeMealPlanEntry(entry, input.scheduled_for));
  }

  getBarcodeImportPreview(barcode: string) {
    return this.request<unknown>(
      `/imports/barcode/${encodeURIComponent(barcode)}`,
      { method: "GET" },
      () => this.fallbackApi.getBarcodeImportPreview(barcode),
    ).then((preview) => normalizeBarcodePreview(preview, barcode));
  }

  importBarcode(barcode: string, input: BarcodeImportInput) {
    return this.request<unknown>(
      `/imports/barcode/${encodeURIComponent(barcode)}`,
      { method: "POST", body: JSON.stringify(input) },
      () => this.fallbackApi.importBarcode(barcode, input),
    ).then((result) => normalizeBarcodeImport(result, barcode));
  }

  searchNutrition(query: string) {
    const search = new URLSearchParams({ q: query });
    return this.request<unknown[]>(
      `/nutrition/search?${search.toString()}`,
      { method: "GET" },
      () => this.fallbackApi.searchNutrition(query),
    ).then((items) => items.map(normalizeNutritionSearchResult));
  }

  ocrReceipt(file: File) {
    const body = new FormData();
    body.append("file", file);
    return this.request<unknown>(
      "/imports/receipt/ocr",
      { method: "POST", body },
      () => this.fallbackApi.ocrReceipt(file),
      false,
    ).then(normalizeReceiptOcrPreview);
  }

  confirmReceiptImport(input: ReceiptConfirmInput) {
    return this.request<unknown>(
      "/imports/receipt/confirm",
      { method: "POST", body: JSON.stringify(input) },
      () => this.fallbackApi.confirmReceiptImport(input),
    ).then(normalizeReceiptImportResult);
  }

  importReceiptDemo() {
    return this.request<unknown>(
      "/imports/receipt/demo",
      { method: "POST", body: JSON.stringify({}) },
      () => this.fallbackApi.importReceiptDemo(),
    ).then(normalizeReceiptImportResult);
  }

  resetDemoState() {
    return this.request<unknown>(
      "/users/me/demo-reset",
      { method: "POST", body: JSON.stringify({}) },
      () => this.fallbackApi.resetDemoState(),
    ).then(normalizeOnboardingState);
  }
}

export function createFitFoodApi(options: CreateFitFoodApiOptions = {}) {
  const env = options.env ?? import.meta.env;
  const configuredBaseUrl = options.baseUrl ?? getConfiguredApiBaseUrl(env);

  return new HttpFitFoodApi(normalizeApiBaseUrl(configuredBaseUrl), {
    allowFallback: shouldAllowFallback(env),
    fallbackApi: options.fallbackApi ?? defaultFallbackApi,
    fetchImpl: options.fetchImpl,
  });
}

export const fitfoodApi = createFitFoodApi();
