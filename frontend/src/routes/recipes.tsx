import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Clock,
  Flame,
  ChevronDown,
  Check,
  ShoppingCart,
  BookOpen,
  Search,
  Timer,
  ListFilter,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BottomNav, PhoneShell, Scrollable, StatusBar, TopBar } from "@/components/fitfood/Shell";
import { useCreateRecipeShoppingListItemsMutation } from "@/lib/api/mutations";
import {
  ensureRecipeSlice,
  recipeMatchesQueryOptions,
  recipesQueryOptions,
} from "@/lib/api/queries";
import { goalLabels } from "@/lib/fitfood-data";
import {
  getAllRecipeMenuItems,
  getFeaturedRecipes,
  getMatchColor,
  getRecipeCategoryOptions,
  getRecipeReadinessCounts,
  getRecipeTabView,
  getRecommendedRecipeMatches,
  filterRecipeMenuItems,
  mergeRecipeMenuWithMatches,
  type RecipeCardItem,
  type RecipeReadinessFilter,
  type RecipeTab,
} from "@/lib/recipe-view";
import { useKitchen } from "@/lib/kitchen-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/recipes")({
  loader: ({ context }) => ensureRecipeSlice(context.queryClient),
  head: () => ({
    meta: [
      { title: "AI Recipes — FitFood" },
      {
        name: "description",
        content: "AI recipe suggestions matched to the ingredients already in your kitchen.",
      },
    ],
  }),
  component: Recipes,
});

function Recipes() {
  const { goal, primaryFridgeId } = useKitchen();
  const [activeTab, setActiveTab] = useState<RecipeTab>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [readiness, setReadiness] = useState<RecipeReadinessFilter>("smart");
  const [shoppingStatus, setShoppingStatus] = useState<Record<string, string>>({});
  const canLoadRecommendedRecipes = /^\d+$/.test(primaryFridgeId);
  const recipesQuery = useQuery(recipesQueryOptions());
  const recipeMatchesQuery = useQuery({
    ...recipeMatchesQueryOptions(primaryFridgeId, {
      goal,
      maxMissing: 20,
    }),
    enabled: canLoadRecommendedRecipes,
  });
  const createShoppingListMutation = useCreateRecipeShoppingListItemsMutation();

  const allRecipes = useMemo(() => {
    const recipes = recipesQuery.data ?? [];
    const matches = recipeMatchesQuery.data ?? [];
    return matches.length > 0
      ? mergeRecipeMenuWithMatches(recipes, matches)
      : getAllRecipeMenuItems(recipes);
  }, [recipeMatchesQuery.data, recipesQuery.data]);
  const recommendedRecipes = useMemo(
    () => getRecommendedRecipeMatches(recipeMatchesQuery.data ?? [], goal),
    [goal, recipeMatchesQuery.data],
  );
  const tabView = useMemo(
    () => getRecipeTabView(activeTab, allRecipes, recommendedRecipes),
    [activeTab, allRecipes, recommendedRecipes],
  );
  const categories = useMemo(() => getRecipeCategoryOptions(allRecipes), [allRecipes]);
  const readinessCounts = useMemo(() => getRecipeReadinessCounts(allRecipes), [allRecipes]);
  const visibleRecipes = useMemo(
    () => filterRecipeMenuItems(tabView.list, { search, category, readiness }),
    [category, readiness, search, tabView.list],
  );
  const featured = useMemo(
    () => (activeTab === "recommended" ? getFeaturedRecipes(visibleRecipes, 5) : []),
    [activeTab, visibleRecipes],
  );
  const featuredIds = useMemo(() => new Set(featured.map((item) => item.recipe.id)), [featured]);
  const listRecipes = useMemo(
    () => visibleRecipes.filter((item) => !featuredIds.has(item.recipe.id)),
    [featuredIds, visibleRecipes],
  );
  const readinessMeta: Array<{
    id: RecipeReadinessFilter;
    label: string;
    count: number;
  }> = [
    { id: "smart", label: "Smart picks", count: tabView.list.length },
    { id: "ready", label: "Ready now", count: readinessCounts.ready },
    { id: "close", label: "1-3 missing", count: readinessCounts.close },
    { id: "shop", label: "Shop & cook", count: readinessCounts.shop },
  ];
  const tabMeta: Record<RecipeTab, { label: string; count: number; icon: typeof Sparkles }> = {
    recommended: { label: "Best for you", count: tabView.counts.recommended, icon: Sparkles },
    all: { label: "All recipes", count: tabView.counts.all, icon: BookOpen },
  };

  return (
    <PhoneShell>
      <StatusBar />
      <TopBar title="Recipes" subtitle="Kitchen-fit menu" back="/dashboard" />
      <Scrollable className="px-5">
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
          {(["recommended", "all"] as const).map((tab) => {
            const Icon = tabMeta[tab].icon;
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setOpen(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition",
                  activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tabMeta[tab].label}
                <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px]">
                  {tabMeta[tab].count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-3 rounded-[1.5rem] border border-border bg-card p-2.5">
          <label className="flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search dish or ingredient"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-0.5">
            {readinessMeta.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setReadiness(filter.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold transition",
                  readiness === filter.id
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                <ListFilter className="h-3.5 w-3.5" />
                {filter.label}
                <span className="rounded-full bg-background/20 px-1.5 py-0.5">{filter.count}</span>
              </button>
            ))}
          </div>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-0.5">
            {["All", ...categories].map((option) => (
              <button
                key={option}
                onClick={() => setCategory(option)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition",
                  category === option
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary-soft text-primary",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {featured.length > 0 ? (
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-bold text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Top picks for your kitchen
            </p>
            <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {featured.map((item) => (
                <FeaturedRecipeCard
                  key={item.recipe.id}
                  item={item}
                  onOpen={() => setOpen(item.recipe.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-bold text-muted-foreground">
            Showing {visibleRecipes.length} of {tabView.list.length}
          </p>
          <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <Timer className="h-3.5 w-3.5" />
            Sorted for your kitchen
          </p>
        </div>

        <div className="flex flex-col gap-3 pb-6">
          {listRecipes.length === 0 && featured.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center">
              <p className="text-sm font-bold">No recipes match these filters</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tabView.list.length === 0
                  ? tabView.emptyMessage
                  : "Try another category, ingredient, or kitchen-fit filter."}
              </p>
            </div>
          ) : null}

          {listRecipes.map((item, i) => (
            <RecipeCard
              key={item.recipe.id}
              item={item}
              index={i}
              isOpen={open === item.recipe.id}
              showMatch={tabView.showMatch || item.match > 0}
              status={shoppingStatus[item.recipe.id]}
              isAdding={createShoppingListMutation.isPending && open === item.recipe.id}
              onToggle={() => setOpen(open === item.recipe.id ? null : item.recipe.id)}
              onAddMissingItems={() => {
                setShoppingStatus((current) => ({
                  ...current,
                  [item.recipe.id]: "",
                }));
                createShoppingListMutation.mutate(
                  {
                    recipeId: item.recipe.id,
                    fridgeId: primaryFridgeId,
                  },
                  {
                    onSuccess: (result) => {
                      setShoppingStatus((current) => ({
                        ...current,
                        [item.recipe.id]:
                          result.summary.created_count > 0
                            ? `Added ${result.summary.created_count} item${result.summary.created_count === 1 ? "" : "s"} to shopping list`
                            : "Everything for this recipe is already covered",
                      }));
                    },
                    onError: (error) => {
                      setShoppingStatus((current) => ({
                        ...current,
                        [item.recipe.id]:
                          error instanceof Error
                            ? error.message
                            : "Could not update the shopping list.",
                      }));
                    },
                  },
                );
              }}
            />
          ))}
        </div>
      </Scrollable>
      <BottomNav />
    </PhoneShell>
  );
}

function FeaturedRecipeCard({ item, onOpen }: { item: RecipeCardItem; onOpen: () => void }) {
  const { recipe, match } = item;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-40 shrink-0 flex-col gap-2 rounded-[1.35rem] border border-border bg-card p-3 text-left shadow-[0_10px_30px_rgba(15,47,37,0.06)] transition active:scale-[0.98]"
    >
      <div className="flex items-center justify-between">
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt=""
            className="h-12 w-12 rounded-2xl object-cover"
            loading="lazy"
          />
        ) : (
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-2xl">
            {recipe.emoji}
          </span>
        )}
        <span
          className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", getMatchColor(match))}
        >
          {match}%
        </span>
      </div>
      <p className="line-clamp-2 text-sm font-bold leading-snug">{recipe.name}</p>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {recipe.minutes}m
        </span>
        {recipe.calories > 0 ? (
          <span className="flex items-center gap-1">
            <Flame className="h-3 w-3" />
            {recipe.calories}
          </span>
        ) : null}
      </div>
    </button>
  );
}

interface RecipeCardProps {
  item: RecipeCardItem;
  index: number;
  isOpen: boolean;
  showMatch: boolean;
  status?: string;
  isAdding: boolean;
  onToggle: () => void;
  onAddMissingItems: () => void;
}

function RecipeCard({
  item,
  index,
  isOpen,
  showMatch,
  status,
  isAdding,
  onToggle,
  onAddMissingItems,
}: RecipeCardProps) {
  const { recipe, match, have, missing } = item;
  const hasIngredientStatus = have.length > 0 || missing.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.3) }}
      className="overflow-hidden rounded-[1.35rem] border border-border bg-card shadow-[0_10px_30px_rgba(15,47,37,0.06)]"
    >
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-3.5 text-left">
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-[1.1rem] object-cover"
            loading="lazy"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[1.1rem] bg-secondary text-3xl">
            {recipe.emoji}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold leading-snug">{recipe.name}</p>
            {showMatch ? (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                  getMatchColor(match),
                )}
              >
                {match}%
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {recipe.minutes} min
            </span>
            {recipe.calories > 0 ? (
              <span className="flex items-center gap-1">
                <Flame className="h-3 w-3" />
                {recipe.calories} kcal
              </span>
            ) : null}
            <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">
              {recipe.tag}
            </span>
            {recipe.sourceProvider === "themealdb" ? (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">
                MealDB
              </span>
            ) : null}
          </div>
          {showMatch ? (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${match}%` }} />
            </div>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-3.5 pb-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Ingredients</p>
                <div className="flex flex-wrap gap-1.5">
                  {hasIngredientStatus ? (
                    <>
                      {have.map((ingredient) => (
                        <span
                          key={ingredient}
                          className="flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success"
                        >
                          <Check className="h-3 w-3" />
                          {ingredient}
                        </span>
                      ))}
                      {missing.map((ingredient) => (
                        <span
                          key={ingredient}
                          className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                        >
                          <ShoppingCart className="h-3 w-3" />
                          {ingredient}
                        </span>
                      ))}
                    </>
                  ) : (
                    recipe.ingredients.map((ingredient) => (
                      <span
                        key={ingredient}
                        className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                      >
                        {ingredient}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Steps</p>
                <ol className="space-y-1.5">
                  {recipe.steps.map((step, idx) => (
                    <li key={idx} className="flex gap-2 text-xs">
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                        {idx + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
              {missing.length > 0 ? (
                <div className="space-y-2">
                  <button
                    onClick={onAddMissingItems}
                    disabled={isAdding}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary px-3 py-2.5 text-xs font-semibold text-foreground transition disabled:opacity-60"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {isAdding ? "Adding..." : "Add missing items"}
                  </button>
                  {status ? <p className="text-[11px] text-muted-foreground">{status}</p> : null}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
