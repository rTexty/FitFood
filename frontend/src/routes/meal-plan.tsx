import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Sparkles,
  Clock,
  Flame,
  Check,
  Refrigerator,
  Sunrise,
  Sun,
  Moon,
  Cookie,
  Activity,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { BottomNav, PhoneShell, Scrollable, StatusBar, TopBar } from "@/components/fitfood/Shell";
import { RouteErrorScreen, RoutePendingScreen } from "@/components/fitfood/route-states";
import { Button } from "@/components/ui/button";
import { useCreateMealPlanMutation } from "@/lib/api/mutations";
import { ensureKitchenCore, mealPlansQueryOptions } from "@/lib/api/queries";
import { goalLabels } from "@/lib/fitfood-data";
import { groupMealPlanByDay, selectMealPlan, sumMealPlanEntries } from "@/lib/meal-plan-view";
import type { MealSlotName } from "@/lib/api/types";
import { useKitchen } from "@/lib/kitchen-store";

export const Route = createFileRoute("/meal-plan")({
  loader: ({ context }) => ensureKitchenCore(context.queryClient),
  head: () => ({
    meta: [
      { title: "Meal Plan — FitFood" },
      {
        name: "description",
        content: "Breakfast, lunch, dinner and snack ideas from what's in your fridge.",
      },
    ],
  }),
  component: MealPlan,
});

const mealMeta: Record<MealSlotName, { icon: typeof Sun; time: string }> = {
  Breakfast: { icon: Sunrise, time: "8:00 AM" },
  Lunch: { icon: Sun, time: "1:00 PM" },
  Dinner: { icon: Moon, time: "7:30 PM" },
  Snack: { icon: Cookie, time: "4:00 PM" },
};

function MealPlan() {
  const { fridge, goal, primaryFridgeId } = useKitchen();
  const mealPlansQuery = useQuery({
    ...mealPlansQueryOptions(),
    retry: false,
  });
  const createMealPlanMutation = useCreateMealPlanMutation();
  const requestedInitialPlan = useRef(false);

  const plan = useMemo(
    () =>
      createMealPlanMutation.data?.span_days === 1
        ? createMealPlanMutation.data
        : selectMealPlan(mealPlansQuery.data, 1),
    [createMealPlanMutation.data, mealPlansQuery.data],
  );
  const today = groupMealPlanByDay(plan)[0] ?? null;
  const totalNutrition = today ? sumMealPlanEntries(today.entries) : null;

  useEffect(() => {
    if (requestedInitialPlan.current) {
      return;
    }
    if (!primaryFridgeId || mealPlansQuery.isLoading || mealPlansQuery.isError || plan) {
      return;
    }

    requestedInitialPlan.current = true;
    createMealPlanMutation.mutate({
      fridge_id: primaryFridgeId,
      goal: goal ?? undefined,
      span_days: 1,
    });
  }, [
    createMealPlanMutation,
    goal,
    mealPlansQuery.isError,
    mealPlansQuery.isLoading,
    plan,
    primaryFridgeId,
  ]);

  if (!plan && (mealPlansQuery.isLoading || createMealPlanMutation.isPending)) {
    return (
      <RoutePendingScreen title="Meal Plan" subtitle="Building today's plan" back="/dashboard" />
    );
  }

  if (!plan && mealPlansQuery.isError && !createMealPlanMutation.isPending) {
    return (
      <RouteErrorScreen
        title="Meal Plan"
        back="/dashboard"
        message={
          mealPlansQuery.error instanceof Error
            ? mealPlansQuery.error.message
            : "The meal plan service is unavailable."
        }
      />
    );
  }

  return (
    <PhoneShell>
      <StatusBar />
      <TopBar
        title="Meal Plan"
        subtitle={goal ? `${goalLabels[goal].title} plan` : "From your fridge"}
        back="/dashboard"
        right={
          <Link
            to="/nutrition"
            className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-foreground"
            aria-label="Nutrition"
          >
            <Activity className="h-5 w-5" />
          </Link>
        }
      />
      <Scrollable className="px-5">
        {today && today.entries.length > 0 ? (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-2xl bg-primary-soft px-4 py-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium">
                Built from {fridge.length} fridge items · {totalNutrition?.calories ?? 0} kcal total
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pb-6">
              {today.entries.map((entry, i) => {
                const Icon = mealMeta[entry.meal].icon;
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.06, 0.3) }}
                    className="rounded-2xl border border-border bg-card p-3.5"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary-soft text-primary">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
                        {entry.meal}
                      </p>
                      <span className="ml-auto text-[11px] font-medium text-muted-foreground">
                        {mealMeta[entry.meal].time}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary text-2xl">
                        {entry.recipe.hero_emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-snug">{entry.recipe.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {entry.recipe.minutes} min
                          </span>
                          <span className="flex items-center gap-1">
                            <Flame className="h-3 w-3" />
                            {entry.recipe.nutrition_summary.calories} kcal
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {entry.recipe.ingredients.slice(0, 3).map((ingredient) => (
                            <span
                              key={`${entry.id}-${ingredient.normalized_name}`}
                              className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success"
                            >
                              <Check className="h-2.5 w-2.5" />
                              {ingredient.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyMealPlan
            fridgeCount={fridge.length}
            onBuild={() =>
              createMealPlanMutation.mutate({
                fridge_id: primaryFridgeId,
                goal: goal ?? undefined,
                span_days: 1,
              })
            }
            isBuilding={createMealPlanMutation.isPending}
            errorMessage={
              createMealPlanMutation.error instanceof Error
                ? createMealPlanMutation.error.message
                : null
            }
          />
        )}
      </Scrollable>
      <BottomNav />
    </PhoneShell>
  );
}

function EmptyMealPlan({
  fridgeCount,
  onBuild,
  isBuilding,
  errorMessage,
}: {
  fridgeCount: number;
  onBuild: () => void;
  isBuilding: boolean;
  errorMessage: string | null;
}) {
  return (
    <div className="flex flex-1 flex-col items-center px-2 pb-8 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 140, damping: 16 }}
        className="relative mt-10 grid h-52 w-52 place-items-center"
      >
        <span className="absolute h-40 w-40 rounded-full bg-primary-soft" />
        <span className="absolute h-52 w-52 rounded-full border-2 border-dashed border-primary/25" />
        <span className="relative grid h-28 w-28 place-items-center rounded-[2rem] bg-card text-5xl shadow-card">
          🍽️
        </span>
        <span className="absolute right-5 top-6 grid h-9 w-9 place-items-center rounded-full bg-warning text-warning-foreground shadow-soft">
          <Refrigerator className="h-4 w-4" />
        </span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-8"
      >
        <h2 className="text-2xl font-extrabold">Not enough ingredients</h2>
        <p className="mx-auto mt-2.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {fridgeCount === 0
            ? "Your fridge is empty, so we can't plan meals yet."
            : "There aren't enough fresh ingredients in your fridge to build a full plan."}{" "}
          Add a few more items and FitFood will generate breakfast, lunch, dinner and a snack.
        </p>
      </motion.div>

      <div className="mt-auto w-full space-y-3 pt-10">
        <Button
          type="button"
          onClick={onBuild}
          disabled={isBuilding}
          className="h-auto w-full rounded-2xl py-4 text-base font-semibold shadow-float"
        >
          <Sparkles className="h-5 w-5" />
          {isBuilding ? "Building plan..." : "Build meal plan"}
        </Button>
        <Link
          to="/dashboard"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-4 text-base font-semibold text-foreground"
        >
          <Refrigerator className="h-5 w-5" />
          Go to my kitchen
        </Link>
        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
      </div>
    </div>
  );
}
