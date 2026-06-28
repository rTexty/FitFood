import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Sparkles, Flame, Beef, Wheat, Droplet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav, PhoneShell, Scrollable, StatusBar, TopBar } from "@/components/fitfood/Shell";
import { RouteErrorScreen, RoutePendingScreen } from "@/components/fitfood/route-states";
import { Button } from "@/components/ui/button";
import { useCreateMealPlanMutation } from "@/lib/api/mutations";
import { ensureKitchenCore, mealPlansQueryOptions } from "@/lib/api/queries";
import { goalLabels } from "@/lib/fitfood-data";
import { groupMealPlanByDay, selectMealPlan, sumMealPlanEntries } from "@/lib/meal-plan-view";
import { useKitchen } from "@/lib/kitchen-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/planner")({
  loader: ({ context }) => ensureKitchenCore(context.queryClient),
  head: () => ({
    meta: [
      { title: "Meal Planner — FitFood" },
      {
        name: "description",
        content: "AI meal plans for the day, 3 days, or a full week with nutrition summaries.",
      },
    ],
  }),
  component: Planner,
});

type Span = 1 | 3 | 7;
const MEALS = ["Breakfast", "Lunch", "Dinner"] as const;

function Planner() {
  const { goal, primaryFridgeId } = useKitchen();
  const [span, setSpan] = useState<Span>(3);
  const mealPlansQuery = useQuery({
    ...mealPlansQueryOptions(),
    retry: false,
  });
  const createMealPlanMutation = useCreateMealPlanMutation();
  const requestedSpans = useRef<Partial<Record<Span, boolean>>>({});

  const selectedPlan = useMemo(
    () =>
      createMealPlanMutation.data?.span_days === span
        ? createMealPlanMutation.data
        : selectMealPlan(mealPlansQuery.data, span),
    [createMealPlanMutation.data, mealPlansQuery.data, span],
  );
  const groupedDays = useMemo(() => groupMealPlanByDay(selectedPlan), [selectedPlan]);
  const avg = useMemo(() => {
    const totals = groupedDays.reduce(
      (acc, day) => {
        const nutrition = sumMealPlanEntries(day.entries);
        return {
          cal: acc.cal + nutrition.calories,
          p: acc.p + nutrition.protein,
          c: acc.c + nutrition.carbs,
          f: acc.f + nutrition.fat,
        };
      },
      { cal: 0, p: 0, c: 0, f: 0 },
    );
    const n = groupedDays.length || 1;
    return {
      cal: Math.round(totals.cal / n),
      p: Math.round(totals.p / n),
      c: Math.round(totals.c / n),
      f: Math.round(totals.f / n),
    };
  }, [groupedDays]);

  useEffect(() => {
    if (requestedSpans.current[span]) {
      return;
    }
    if (!primaryFridgeId || mealPlansQuery.isLoading || mealPlansQuery.isError || selectedPlan) {
      return;
    }

    requestedSpans.current[span] = true;
    createMealPlanMutation.mutate({
      fridge_id: primaryFridgeId,
      goal: goal ?? undefined,
      span_days: span,
    });
  }, [
    createMealPlanMutation,
    goal,
    mealPlansQuery.isError,
    mealPlansQuery.isLoading,
    primaryFridgeId,
    selectedPlan,
    span,
  ]);

  if (!selectedPlan && (mealPlansQuery.isLoading || createMealPlanMutation.isPending)) {
    return (
      <RoutePendingScreen title="Meal Planner" subtitle="Building your plan" back="/dashboard" />
    );
  }

  if (!selectedPlan && mealPlansQuery.isError && !createMealPlanMutation.isPending) {
    return (
      <RouteErrorScreen
        title="Meal Planner"
        back="/dashboard"
        message={
          mealPlansQuery.error instanceof Error
            ? mealPlansQuery.error.message
            : "The meal planner is unavailable."
        }
      />
    );
  }

  return (
    <PhoneShell>
      <StatusBar />
      <TopBar
        title="Meal Planner"
        subtitle={goal ? `${goalLabels[goal].title} plan` : "AI generated"}
        back="/dashboard"
      />
      <Scrollable className="px-5">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-secondary p-1">
          {([1, 3, 7] as Span[]).map((s) => (
            <button
              key={s}
              onClick={() => setSpan(s)}
              className={cn(
                "rounded-xl py-2.5 text-sm font-semibold transition",
                span === s ? "bg-card text-foreground shadow-soft" : "text-muted-foreground",
              )}
            >
              {s === 1 ? "Daily" : s === 3 ? "3-Day" : "Weekly"}
            </button>
          ))}
        </div>

        <motion.div
          key={span}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-2xl bg-primary p-4 text-primary-foreground shadow-float"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
              Avg. daily nutrition
            </p>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <NutriPill icon={Flame} value={avg.cal} label="kcal" />
            <NutriPill icon={Beef} value={`${avg.p}g`} label="protein" />
            <NutriPill icon={Wheat} value={`${avg.c}g`} label="carbs" />
            <NutriPill icon={Droplet} value={`${avg.f}g`} label="fat" />
          </div>
        </motion.div>

        <div className="mt-4 flex flex-col gap-2 pb-6">
          {groupedDays.length > 0 ? (
            groupedDays.map((day, di) => (
              <motion.div
                key={`${span}-${day.label}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(di * 0.04, 0.25) }}
                className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-2.5"
              >
                <div className="w-16 shrink-0">
                  <p className="text-xs font-bold leading-tight">{day.label}</p>
                  <p className="text-[9px] font-medium text-muted-foreground">
                    {sumMealPlanEntries(day.entries).calories} kcal
                  </p>
                </div>
                <div className="grid flex-1 grid-cols-3 gap-1.5">
                  {MEALS.map((mealName) => {
                    const slot = day.entries.find((entry) => entry.meal === mealName);
                    return (
                      <div
                        key={mealName}
                        className="flex flex-col gap-1 rounded-xl bg-secondary px-2 py-2"
                      >
                        <span className="flex items-center gap-1">
                          <span className="text-base leading-none">
                            {slot?.recipe.hero_emoji ?? "·"}
                          </span>
                          <span className="text-[8px] font-bold uppercase tracking-wide text-primary leading-none">
                            {mealName.slice(0, 3)}
                          </span>
                        </span>
                        <span className="block truncate text-[10px] font-semibold leading-tight text-foreground">
                          {slot?.recipe.name ?? "—"}
                        </span>
                        <span className="block text-[9px] font-medium leading-none text-muted-foreground">
                          {slot?.recipe.nutrition_summary.calories ?? 0} kcal
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center">
              <p className="text-sm font-semibold">No meal plan yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Build a {span === 1 ? "daily" : span === 3 ? "3-day" : "weekly"} plan from your
                kitchen.
              </p>
              <Button
                type="button"
                className="mt-4 rounded-2xl"
                onClick={() =>
                  createMealPlanMutation.mutate({
                    fridge_id: primaryFridgeId,
                    goal: goal ?? undefined,
                    span_days: span,
                  })
                }
                disabled={createMealPlanMutation.isPending}
              >
                {createMealPlanMutation.isPending ? "Building..." : "Build plan"}
              </Button>
            </div>
          )}
        </div>
      </Scrollable>
      <BottomNav />
    </PhoneShell>
  );
}

function NutriPill({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Flame;
  value: string | number;
  label: string;
}) {
  return (
    <div className="rounded-xl bg-primary-foreground/15 py-2">
      <Icon className="mx-auto h-4 w-4" />
      <p className="mt-1 text-sm font-bold leading-none">{value}</p>
      <p className="text-[10px] opacity-90">{label}</p>
    </div>
  );
}
