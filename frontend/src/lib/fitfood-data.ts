export type Unit =
  | "count"
  | "pcs"
  | "g"
  | "kg"
  | "ml"
  | "L"
  | "pack"
  | "bag"
  | "carton"
  | "tub"
  | "cup"
  | "item";
export type Location = "fridge" | "pantry" | "freezer";
export type Goal = "lose" | "gain" | "maintain";

export interface Product {
  id: string;
  name: string;
  emoji: string;
  location: Location;
  quantity: number;
  unit: Unit;
  category: string;
  addedDate: string; // ISO
  expiryDate: string | null; // ISO
  source?: "manual" | "receipt" | "barcode";
}

export interface Recipe {
  id: string;
  name: string;
  emoji: string;
  minutes: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  goals: Goal[];
  ingredients: string[];
  steps: string[];
  tag: string;
}

export interface MealSlot {
  meal: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  recipeId: string;
}

export interface PlannedDay {
  label: string;
  meals: MealSlot[];
}

function iso(daysFromNow: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

export function daysUntil(isoDate: string | null): number {
  if (!isoDate) {
    return Number.POSITIVE_INFINITY;
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(isoDate);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export type FreshState = "expired" | "expiring" | "fresh" | "unknown";
export function freshState(isoDate: string | null): FreshState {
  if (!isoDate) {
    return "unknown";
  }
  const d = daysUntil(isoDate);
  if (d < 0) return "expired";
  if (d <= 3) return "expiring";
  return "fresh";
}

export const seedProducts: Product[] = [
  {
    id: "p1",
    name: "Greek Yogurt",
    emoji: "🥛",
    location: "fridge",
    quantity: 500,
    unit: "g",
    category: "Dairy",
    addedDate: iso(-2),
    expiryDate: iso(2),
    source: "receipt",
  },
  {
    id: "p2",
    name: "Baby Spinach",
    emoji: "🥬",
    location: "fridge",
    quantity: 1,
    unit: "pack",
    category: "Vegetables",
    addedDate: iso(-1),
    expiryDate: iso(1),
    source: "receipt",
  },
  {
    id: "p3",
    name: "Chicken Breast",
    emoji: "🍗",
    location: "fridge",
    quantity: 600,
    unit: "g",
    category: "Meat",
    addedDate: iso(-1),
    expiryDate: iso(3),
    source: "receipt",
  },
  {
    id: "p4",
    name: "Cherry Tomatoes",
    emoji: "🍅",
    location: "fridge",
    quantity: 250,
    unit: "g",
    category: "Vegetables",
    addedDate: iso(-3),
    expiryDate: iso(5),
    source: "manual",
  },
  {
    id: "p5",
    name: "Free-range Eggs",
    emoji: "🥚",
    location: "fridge",
    quantity: 10,
    unit: "count",
    category: "Dairy",
    addedDate: iso(-4),
    expiryDate: iso(12),
    source: "receipt",
  },
  {
    id: "p6",
    name: "Avocado",
    emoji: "🥑",
    location: "fridge",
    quantity: 3,
    unit: "count",
    category: "Fruit",
    addedDate: iso(-2),
    expiryDate: iso(2),
    source: "manual",
  },
  {
    id: "p7",
    name: "Brown Rice",
    emoji: "🍚",
    location: "pantry",
    quantity: 1,
    unit: "kg",
    category: "Grains",
    addedDate: iso(-20),
    expiryDate: iso(220),
    source: "manual",
  },
  {
    id: "p8",
    name: "Rolled Oats",
    emoji: "🌾",
    location: "pantry",
    quantity: 750,
    unit: "g",
    category: "Grains",
    addedDate: iso(-15),
    expiryDate: iso(180),
    source: "receipt",
  },
  {
    id: "p9",
    name: "Olive Oil",
    emoji: "🫒",
    location: "pantry",
    quantity: 500,
    unit: "ml",
    category: "Oils",
    addedDate: iso(-30),
    expiryDate: iso(300),
    source: "manual",
  },
  {
    id: "p10",
    name: "Chickpeas",
    emoji: "🫘",
    location: "pantry",
    quantity: 2,
    unit: "count",
    category: "Canned",
    addedDate: iso(-10),
    expiryDate: iso(400),
    source: "receipt",
  },
  {
    id: "p11",
    name: "Almonds",
    emoji: "🥜",
    location: "pantry",
    quantity: 300,
    unit: "g",
    category: "Snacks",
    addedDate: iso(-8),
    expiryDate: iso(90),
    source: "manual",
  },
  {
    id: "p12",
    name: "Whole Wheat Pasta",
    emoji: "🍝",
    location: "pantry",
    quantity: 500,
    unit: "g",
    category: "Grains",
    addedDate: iso(-5),
    expiryDate: iso(2),
    source: "receipt",
  },
];

// Products "detected" from a scanned receipt
export const receiptProducts: Omit<Product, "id">[] = [
  {
    name: "Salmon Fillet",
    emoji: "🐟",
    location: "fridge",
    quantity: 400,
    unit: "g",
    category: "Fish",
    addedDate: iso(0),
    expiryDate: iso(2),
    source: "receipt",
  },
  {
    name: "Broccoli",
    emoji: "🥦",
    location: "fridge",
    quantity: 1,
    unit: "pack",
    category: "Vegetables",
    addedDate: iso(0),
    expiryDate: iso(4),
    source: "receipt",
  },
  {
    name: "Bananas",
    emoji: "🍌",
    location: "fridge",
    quantity: 6,
    unit: "count",
    category: "Fruit",
    addedDate: iso(0),
    expiryDate: iso(5),
    source: "receipt",
  },
  {
    name: "Quinoa",
    emoji: "🌾",
    location: "pantry",
    quantity: 500,
    unit: "g",
    category: "Grains",
    addedDate: iso(0),
    expiryDate: iso(240),
    source: "receipt",
  },
];

export const recipes: Recipe[] = [
  {
    id: "r1",
    name: "Spinach & Chicken Power Bowl",
    emoji: "🥗",
    minutes: 25,
    calories: 480,
    protein: 42,
    carbs: 28,
    fat: 18,
    goals: ["lose", "maintain"],
    tag: "High protein",
    ingredients: ["Baby Spinach", "Chicken Breast", "Cherry Tomatoes", "Brown Rice", "Olive Oil"],
    steps: [
      "Cook brown rice until fluffy.",
      "Sear seasoned chicken breast 6 min per side.",
      "Toss spinach and tomatoes with olive oil.",
      "Slice chicken and assemble the bowl.",
    ],
  },
  {
    id: "r2",
    name: "Greek Yogurt Oat Jars",
    emoji: "🥣",
    minutes: 10,
    calories: 320,
    protein: 22,
    carbs: 38,
    fat: 9,
    goals: ["lose", "maintain", "gain"],
    tag: "Breakfast",
    ingredients: ["Greek Yogurt", "Rolled Oats", "Almonds", "Bananas"],
    steps: [
      "Layer oats and yogurt in a jar.",
      "Top with sliced banana and almonds.",
      "Chill overnight and enjoy.",
    ],
  },
  {
    id: "r3",
    name: "Avocado Egg Toast",
    emoji: "🥑",
    minutes: 12,
    calories: 410,
    protein: 18,
    carbs: 30,
    fat: 24,
    goals: ["maintain", "gain"],
    tag: "Quick",
    ingredients: ["Avocado", "Free-range Eggs", "Cherry Tomatoes"],
    steps: [
      "Toast your bread of choice.",
      "Mash avocado with salt and lemon.",
      "Fry eggs to taste.",
      "Assemble and top with tomatoes.",
    ],
  },
  {
    id: "r4",
    name: "Mediterranean Chickpea Pasta",
    emoji: "🍝",
    minutes: 20,
    calories: 540,
    protein: 21,
    carbs: 72,
    fat: 16,
    goals: ["gain", "maintain"],
    tag: "Plant-based",
    ingredients: ["Whole Wheat Pasta", "Chickpeas", "Cherry Tomatoes", "Olive Oil", "Baby Spinach"],
    steps: [
      "Boil pasta until al dente.",
      "Saute chickpeas and tomatoes in olive oil.",
      "Fold in spinach until wilted.",
      "Combine with pasta and serve.",
    ],
  },
  {
    id: "r5",
    name: "Protein Oat Pancakes",
    emoji: "🥞",
    minutes: 18,
    calories: 600,
    protein: 34,
    carbs: 64,
    fat: 18,
    goals: ["gain"],
    tag: "Bulking",
    ingredients: ["Rolled Oats", "Free-range Eggs", "Greek Yogurt", "Bananas", "Almonds"],
    steps: [
      "Blend oats, eggs, yogurt and banana.",
      "Cook pancakes on medium heat.",
      "Top with almonds and extra yogurt.",
    ],
  },
  {
    id: "r6",
    name: "Salmon Quinoa Plate",
    emoji: "🐟",
    minutes: 28,
    calories: 520,
    protein: 38,
    carbs: 40,
    fat: 22,
    goals: ["lose", "maintain"],
    tag: "Omega-3",
    ingredients: ["Salmon Fillet", "Quinoa", "Broccoli", "Olive Oil"],
    steps: [
      "Cook quinoa and steam broccoli.",
      "Pan-sear salmon skin-side down.",
      "Drizzle with olive oil and plate.",
    ],
  },
  {
    id: "r7",
    name: "Garden Veggie Stir-fry",
    emoji: "🥦",
    minutes: 22,
    calories: 380,
    protein: 16,
    carbs: 44,
    fat: 12,
    goals: ["lose", "maintain"],
    tag: "Low calorie",
    ingredients: ["Broccoli", "Cherry Tomatoes", "Baby Spinach", "Brown Rice", "Olive Oil"],
    steps: ["Cook rice.", "Stir-fry vegetables over high heat.", "Season and serve over rice."],
  },
];

export const goalTargets: Record<
  Goal,
  { calories: number; protein: number; carbs: number; fat: number }
> = {
  lose: { calories: 1800, protein: 130, carbs: 160, fat: 55 },
  maintain: { calories: 2200, protein: 120, carbs: 230, fat: 70 },
  gain: { calories: 2800, protein: 160, carbs: 320, fat: 90 },
};

export const goalLabels: Record<Goal, { title: string; emoji: string; desc: string }> = {
  lose: {
    title: "Lose Weight",
    emoji: "🔥",
    desc: "Lighter, high-protein meals with a calorie focus.",
  },
  gain: {
    title: "Gain Weight",
    emoji: "💪",
    desc: "Calorie-dense, protein-rich meals to build mass.",
  },
  maintain: {
    title: "Maintain Weight",
    emoji: "⚖️",
    desc: "Balanced, wholesome meals for healthy eating.",
  },
};
