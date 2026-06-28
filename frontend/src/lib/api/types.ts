import type { Goal, Location, Unit } from "../fitfood-data";

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data: T;
}

export interface ApiListResponse<T> {
  data: T[];
  meta?: {
    page: number;
    per_page: number;
    total: number;
  };
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  locale: string;
  timezone: string;
  onboarding_completed_at?: string | null;
  primary_fridge_id?: string | null;
}

export interface Fridge {
  id: string;
  name: string;
  kind?: string;
  description?: string;
  is_primary?: boolean;
}

export interface GoalProfile {
  goal: Goal;
  calories_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  active_from: string;
  active_to?: string | null;
  target_weight_kg?: number | null;
  estimate_snapshot?: Record<string, unknown> | null;
  source?: string;
}

export type SexForCalorieEstimate = "male" | "female" | "not_specified";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export interface AllergyProfile {
  display_name: string;
  normalized_name?: string;
  severity: "avoid" | "trace_ok" | "preference";
}

export interface NutritionProfile {
  user_id: string;
  age_years: number;
  sex_for_calorie_estimate: SexForCalorieEstimate;
  height_cm: number;
  weight_kg: number;
  target_weight_kg?: number | null;
  activity_level: ActivityLevel;
  dietary_preferences: string[];
  allergies: AllergyProfile[];
  calorie_formula?: string;
  calorie_estimate?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface OnboardingState {
  completed: boolean;
  user: UserProfile;
  profile: NutritionProfile | null;
  current_goal: GoalProfile | null;
  primary_fridge: Fridge | null;
}

export interface OnboardingCompleteInput {
  display_name: string;
  age_years: number;
  sex_for_calorie_estimate: SexForCalorieEstimate;
  height_cm: number;
  weight_kg: number;
  target_weight_kg?: number | null;
  goal: Goal;
  activity_level: ActivityLevel;
  dietary_preferences: string[];
  allergies: Array<{
    display_name: string;
    severity: "avoid" | "trace_ok" | "preference";
  }>;
  fridge: {
    name: string;
    kind: "home" | "shared" | "work" | "other";
    description?: string | null;
  };
}

export interface IngredientStatus {
  name: string;
  normalized_name: string;
}

export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface InventoryItem {
  id: string;
  fridge_id: string;
  display_name: string;
  normalized_name?: string;
  quantity: number;
  unit: Unit;
  location: Location;
  category: string;
  purchase_date: string;
  expiration_date: string | null;
  source:
    | "manual"
    | "receipt"
    | "demo"
    | "barcode"
    | "seed"
    | "receipt_demo"
    | "open_food_facts"
    | "receipt_ocr";
  source_provider?: string | null;
  expiration_date_source?: "unknown" | "user" | "ocr" | "provider" | "estimated";
  expiration_confidence?: number | null;
  confidence?: number | null;
}

export interface InventoryItemCreateInput {
  display_name: string;
  quantity: number;
  unit: Unit;
  location: Location;
  category: string;
  purchase_date?: string;
  expiration_date?: string | null;
  expiration_date_source?: "unknown" | "user" | "ocr" | "provider" | "estimated";
  expiration_confidence?: number | null;
  confidence?: number | null;
}

export interface InventoryItemUpdateInput {
  display_name?: string;
  quantity?: number;
  unit?: Unit;
  location?: Location;
  category?: string;
  purchase_date?: string;
  expiration_date?: string | null;
  expiration_date_source?: "unknown" | "user" | "ocr" | "provider" | "estimated";
  expiration_confidence?: number | null;
  confidence?: number | null;
}

export interface RecipeDetails {
  id: string;
  name: string;
  hero_emoji: string;
  image_url?: string | null;
  source_provider?: string | null;
  minutes: number;
  servings: number;
  tags: string[];
  goals: Goal[];
  nutrition_summary: NutritionTotals;
  ingredients: IngredientStatus[];
  instructions: string[];
}

export interface RecipeMatch {
  recipe: RecipeDetails;
  match_score: number;
  available_ingredients: IngredientStatus[];
  missing_ingredients: IngredientStatus[];
  shopping_list_ready: boolean;
  nutrition_summary: NutritionTotals;
}

export interface NutritionSummary {
  from: string;
  to: string;
  totals: NutritionTotals;
  target: NutritionTotals;
}

export interface ReceiptImportResult {
  items: InventoryItem[];
  summary: {
    fridge_id?: string;
    imported_count: number;
    receipt_id?: string;
    source: "demo" | "receipt_ocr";
  };
}

export interface ReceiptOcrItem {
  display_name: string;
  normalized_name: string;
  quantity: number;
  unit: Unit;
  location?: Location;
  category?: string | null;
  purchase_date?: string | null;
  expiration_date?: string | null;
  expiration_date_source?: "unknown" | "user" | "ocr" | "provider" | "estimated";
  expiration_confidence?: number | null;
  confidence: number;
}

export interface ReceiptOcrPreview {
  receipt_id: string;
  merchant?: string | null;
  purchase_date?: string | null;
  items: ReceiptOcrItem[];
  summary: {
    detected_count: number;
    model?: string;
    receipt_id?: string;
    source: "minimax_ocr";
  };
}

export interface ReceiptConfirmInput {
  fridge_id: string;
  receipt_id: string;
  location?: Location;
  purchase_date?: string | null;
  items: ReceiptOcrItem[];
}

export interface ShoppingListItem {
  id: string;
  fridge_id?: string | null;
  shopping_list_id?: string | null;
  recipe_id?: string | null;
  source_recipe_id?: string | null;
  display_name: string;
  normalized_name: string;
  quantity: number;
  unit: Unit;
  category?: string;
  checked: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ShoppingListCreateResult {
  items: ShoppingListItem[];
  summary: {
    fridge_id?: string;
    recipe_id?: string;
    created_count: number;
    merged_count?: number;
  };
}

export interface ShoppingListItemUpdateInput {
  checked?: boolean;
  quantity?: number;
  unit?: Unit;
  notes?: string | null;
}

export type MealSlotName = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export interface MealPlanEntry {
  id: string;
  meal: MealSlotName;
  meal_type?: string;
  day_index?: number;
  scheduled_for: string;
  recipe: RecipeDetails;
  recipe_id?: string;
  servings: number;
  nutrition_snapshot?: NutritionTotals;
  notes?: string | null;
}

export interface MealPlan {
  id: string;
  fridge_id: string;
  goal?: Goal | null;
  span_days: number;
  status?: string;
  starts_on: string;
  created_at: string;
  updated_at: string;
  generated_at?: string;
  nutrition_summary: NutritionTotals;
  entries: MealPlanEntry[];
}

export interface MealPlanCreateInput {
  fridge_id: string;
  goal?: Goal | null;
  span_days?: number;
  starts_on?: string;
}

export interface MealPlanEntryCreateInput {
  meal: MealSlotName;
  recipe_id: string;
  scheduled_for: string;
  servings?: number;
  notes?: string | null;
}

export interface BarcodeLookupResult {
  barcode: string;
  product_name: string;
  display_name?: string;
  normalized_name?: string;
  brand?: string | null;
  category?: string | null;
  quantity?: number | null;
  unit?: Unit | null;
  location?: Location | null;
  image_url?: string | null;
  nutrition_per_100g?: Partial<NutritionTotals>;
  source: "open_food_facts";
  provider?: "open_food_facts";
}

export interface BarcodeImportResult {
  barcode: string;
  item: InventoryItem;
  summary: {
    fridge_id: string;
    imported_count: number;
    source: "barcode";
  };
}

export interface BarcodeImportInput {
  fridge_id: string;
  display_name?: string | null;
  quantity?: number;
  unit?: Unit | null;
  location?: Location;
  category?: string | null;
  purchase_date?: string | null;
  expiration_date?: string | null;
  expiration_date_source?: "unknown" | "user" | "ocr" | "provider" | "estimated";
  expiration_confidence?: number | null;
}

export interface NutritionSearchResult {
  id: string;
  external_id?: string;
  name: string;
  display_name?: string;
  normalized_name?: string;
  brand?: string | null;
  category?: string | null;
  description?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutrition_per_100g?: Partial<NutritionTotals>;
  serving_description?: string | null;
  source: "usda";
  provider?: "usda";
}

export interface GoalUpdateInput {
  goal: Goal;
}

export interface RecipeMatchParams {
  goal?: Goal;
  maxMissing?: number;
}

export interface FitFoodApi {
  getCurrentUser(): Promise<UserProfile>;
  getOnboardingState(): Promise<OnboardingState>;
  completeOnboarding(input: OnboardingCompleteInput): Promise<OnboardingState>;
  getNutritionProfile(): Promise<NutritionProfile | null>;
  getCurrentGoal(): Promise<GoalProfile | null>;
  updateCurrentGoal(input: GoalUpdateInput): Promise<GoalProfile>;
  getFridges(): Promise<Fridge[]>;
  getInventoryItems(fridgeId: string): Promise<InventoryItem[]>;
  getExpiringInventoryItems(fridgeId: string, days?: number): Promise<InventoryItem[]>;
  deleteInventoryItem(itemId: string): Promise<void>;
  getRecipes(): Promise<RecipeDetails[]>;
  getRecipeMatches(fridgeId: string, params?: RecipeMatchParams): Promise<RecipeMatch[]>;
  createInventoryItem(fridgeId: string, input: InventoryItemCreateInput): Promise<InventoryItem>;
  updateInventoryItem(itemId: string, input: InventoryItemUpdateInput): Promise<InventoryItem>;
  createRecipeShoppingListItems(
    recipeId: string,
    fridgeId: string,
  ): Promise<ShoppingListCreateResult>;
  getShoppingListItems(): Promise<ShoppingListItem[]>;
  updateShoppingListItem(
    itemId: string,
    input: ShoppingListItemUpdateInput,
  ): Promise<ShoppingListItem>;
  deleteShoppingListItem(itemId: string): Promise<void>;
  getMealPlans(): Promise<MealPlan[]>;
  createMealPlan(input: MealPlanCreateInput): Promise<MealPlan>;
  addMealPlanEntry(mealPlanId: string, input: MealPlanEntryCreateInput): Promise<MealPlanEntry>;
  getBarcodeImportPreview(barcode: string): Promise<BarcodeLookupResult>;
  importBarcode(barcode: string, input: BarcodeImportInput): Promise<BarcodeImportResult>;
  searchNutrition(query: string): Promise<NutritionSearchResult[]>;
  ocrReceipt(file: File): Promise<ReceiptOcrPreview>;
  confirmReceiptImport(input: ReceiptConfirmInput): Promise<ReceiptImportResult>;
  importReceiptDemo(): Promise<ReceiptImportResult>;
  resetDemoState(): Promise<OnboardingState>;
}
