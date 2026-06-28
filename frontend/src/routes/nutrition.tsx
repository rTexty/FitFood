import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Flame, Beef, Search, Wheat, Droplet, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";
import { BottomNav, PhoneShell, Scrollable, StatusBar, TopBar } from "@/components/fitfood/Shell";
import { Input } from "@/components/ui/input";
import {
  ensureKitchenCore,
  mealPlansQueryOptions,
  nutritionSearchQueryOptions,
} from "@/lib/api/queries";
import { goalLabels, goalTargets, type Goal } from "@/lib/fitfood-data";
import { getConsumedEntries, selectMealPlan, sumMealPlanEntries } from "@/lib/meal-plan-view";
import { useKitchen } from "@/lib/kitchen-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/nutrition")({
  loader: ({ context }) => ensureKitchenCore(context.queryClient),
  head: () => ({
    meta: [
      { title: "Nutrition Dashboard — FitFood" },
      {
        name: "description",
        content: "Track daily calories, protein, carbs and fat against your goal.",
      },
    ],
  }),
  component: Nutrition,
});

function Nutrition() {
  const { goal } = useKitchen();
  const [searchQuery, setSearchQuery] = useState("");
  const activeGoal: Goal = goal ?? "maintain";
  const target = goalTargets[activeGoal];
  const trimmedSearch = searchQuery.trim();
  const mealPlansQuery = useQuery({
    ...mealPlansQueryOptions(),
    retry: false,
  });
  const nutritionSearchQuery = useQuery({
    ...nutritionSearchQueryOptions(trimmedSearch),
    enabled: trimmedSearch.length >= 2,
    retry: false,
  });

  const activePlan = useMemo(() => selectMealPlan(mealPlansQuery.data, 1), [mealPlansQuery.data]);
  const eaten = useMemo(() => getConsumedEntries(activePlan), [activePlan]);
  const consumed = useMemo(() => sumMealPlanEntries(eaten), [eaten]);

  const calPct = Math.min(100, Math.round((consumed.calories / target.calories) * 100));

  return (
    <PhoneShell>
      <StatusBar />
      <TopBar
        title="Nutrition"
        subtitle={`${goalLabels[activeGoal].title} goal`}
        back="/dashboard"
        right={
          <Link
            to="/meal-plan"
            className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-foreground"
            aria-label="Meal plan"
          >
            <UtensilsCrossed className="h-5 w-5" />
          </Link>
        }
      />
      <Scrollable className="px-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl bg-primary p-5 text-primary-foreground shadow-float"
        >
          <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
            Calories consumed today
          </p>
          <div className="mt-1 flex items-end gap-2">
            <p className="text-4xl font-extrabold leading-none">{consumed.calories}</p>
            <p className="pb-0.5 text-sm font-medium opacity-90">/ {target.calories} kcal</p>
          </div>
          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-primary-foreground/25">
            <div
              className="h-full rounded-full bg-primary-foreground"
              style={{ width: `${calPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium opacity-90">
            {Math.max(0, target.calories - consumed.calories)} kcal remaining · {calPct}% of goal
          </p>
        </motion.div>

        <div className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4">
          <MacroBar
            icon={Beef}
            label="Protein"
            value={consumed.protein}
            target={target.protein}
            tone="primary"
          />
          <MacroBar
            icon={Wheat}
            label="Carbohydrates"
            value={consumed.carbs}
            target={target.carbs}
            tone="warning"
          />
          <MacroBar
            icon={Droplet}
            label="Fat"
            value={consumed.fat}
            target={target.fat}
            tone="success"
          />
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <p className="text-sm font-bold">Food lookup</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Search USDA-backed nutrition data without leaving the app.
          </p>
          <div className="mt-3">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search chicken breast, oats, yogurt..."
            />
          </div>
          <div className="mt-3 space-y-2">
            {trimmedSearch.length < 2 ? (
              <p className="text-xs text-muted-foreground">Type at least 2 characters to search.</p>
            ) : nutritionSearchQuery.isPending ? (
              <p className="text-xs text-muted-foreground">Searching nutrition database...</p>
            ) : nutritionSearchQuery.isError ? (
              <p className="text-xs text-destructive">
                {nutritionSearchQuery.error instanceof Error
                  ? nutritionSearchQuery.error.message
                  : "Nutrition search is unavailable right now."}
              </p>
            ) : nutritionSearchQuery.data?.length ? (
              nutritionSearchQuery.data.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{result.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {result.brand ?? result.category ?? "USDA"}
                      {result.serving_description ? ` · ${result.serving_description}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                    <p className="font-bold text-foreground">{result.calories} kcal</p>
                    <p>
                      P{result.protein} · C{result.carbs} · F{result.fat}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No foods matched that search yet.</p>
            )}
          </div>
        </div>

        <div className="mt-4 pb-6">
          <p className="mb-2 text-sm font-bold">Daily nutrition summary</p>
          {eaten.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center">
              <span className="text-3xl">🍽️</span>
              <p className="mt-2 text-sm font-semibold">Nothing logged yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Generate a meal plan to start tracking today's nutrition.
              </p>
              <Link
                to="/meal-plan"
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                <UtensilsCrossed className="h-4 w-4" />
                Build meal plan
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {eaten.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-2xl">
                    {entry.recipe.hero_emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-primary">
                      {entry.meal}
                    </p>
                    <p className="truncate text-sm font-semibold leading-tight">
                      {entry.recipe.name}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="flex items-center justify-end gap-1 text-sm font-bold">
                      <Flame className="h-3.5 w-3.5 text-warning-foreground" />
                      {entry.recipe.nutrition_summary.calories}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      P{entry.recipe.nutrition_summary.protein} · C
                      {entry.recipe.nutrition_summary.carbs} · F{entry.recipe.nutrition_summary.fat}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Scrollable>
      <BottomNav />
    </PhoneShell>
  );
}

function MacroBar({
  icon: Icon,
  label,
  value,
  target,
  tone,
}: {
  icon: typeof Beef;
  label: string;
  value: number;
  target: number;
  tone: "primary" | "warning" | "success";
}) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  const bar = {
    primary: "bg-primary",
    warning: "bg-warning",
    success: "bg-success",
  }[tone];
  const chip = {
    primary: "text-primary",
    warning: "text-warning-foreground",
    success: "text-success",
  }[tone];
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <Icon className={cn("h-4 w-4", chip)} />
          {label}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          <span className="font-bold text-foreground">{value}g</span> / {target}g
        </span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
          className={cn("h-full rounded-full", bar)}
        />
      </div>
    </div>
  );
}
