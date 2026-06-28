import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ScanLine,
  Plus,
  PackageOpen,
  Refrigerator,
  AlertTriangle,
  Sparkles,
  Activity,
  UtensilsCrossed,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { BottomNav, PhoneShell, Scrollable, StatusBar } from "@/components/fitfood/Shell";
import { ProductCard, StatCard } from "@/components/fitfood/widgets";
import { useCreateInventoryItemMutation } from "@/lib/api/mutations";
import { ensureDashboardSlice, onboardingStateQueryOptions } from "@/lib/api/queries";
import { freshState, goalLabels } from "@/lib/fitfood-data";
import { useKitchen } from "@/lib/kitchen-store";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard")({
  loader: async ({ context }) => {
    const onboarding = await context.queryClient.ensureQueryData(onboardingStateQueryOptions());
    if (!onboarding.completed) {
      throw redirect({ to: "/onboarding" });
    }
    return ensureDashboardSlice(context.queryClient);
  },
  head: () => ({
    meta: [
      { title: "My Kitchen — FitFood" },
      {
        name: "description",
        content: "Your fridge and pantry at a glance with live freshness stats.",
      },
    ],
  }),
  component: Dashboard,
});

const defaultManualForm = {
  display_name: "",
  quantity: "1",
  unit: "count",
  location: "fridge",
  category: "Vegetables",
  expiration_date: "",
};

const unitOptions = ["count", "g", "kg", "ml", "L", "pack"] as const;
const categoryOptions = [
  "Vegetables",
  "Fruit",
  "Dairy",
  "Meat",
  "Fish",
  "Grains",
  "Oils",
  "Canned",
  "Snacks",
  "Beverages",
] as const;

function Dashboard() {
  const { fridge, pantry, products, goal, primaryFridgeId, removeProduct } = useKitchen();
  const [tab, setTab] = useState<"fridge" | "pantry">("fridge");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState(defaultManualForm);
  const createInventoryMutation = useCreateInventoryItemMutation();

  const expiringCount = products.filter((p) => freshState(p.expiryDate) === "expiring").length;
  const expiredCount = products.filter((p) => freshState(p.expiryDate) === "expired").length;
  const list = tab === "fridge" ? fridge : pantry;

  function resetManualForm() {
    setManualForm(defaultManualForm);
    setManualError(null);
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualError(null);

    const quantity = Number(manualForm.quantity);
    if (!manualForm.display_name.trim()) {
      setManualError("Enter a product name.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setManualError("Quantity must be greater than zero.");
      return;
    }

    createInventoryMutation.mutate(
      {
        fridgeId: primaryFridgeId,
        input: {
          display_name: manualForm.display_name.trim(),
          quantity,
          unit: manualForm.unit,
          location: manualForm.location,
          category: manualForm.category,
          expiration_date: manualForm.expiration_date || null,
        },
      },
      {
        onSuccess: () => {
          resetManualForm();
          setManualOpen(false);
          setTab(manualForm.location);
        },
        onError: (error) => {
          setManualError(error instanceof Error ? error.message : "Could not add this product.");
        },
      },
    );
  }

  return (
    <PhoneShell>
      <StatusBar />
      <Scrollable className="px-5">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pb-4 pt-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Good morning 👋</p>
            <h1 className="truncate text-xl font-extrabold">My Kitchen</h1>
          </div>
          <Link
            to="/profile"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground"
          >
            FF
          </Link>
        </header>

        {goal && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-primary-soft px-4 py-2.5 text-sm font-medium">
            <span className="text-base">{goalLabels[goal].emoji}</span>
            Goal: {goalLabels[goal].title}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2.5">
          <StatCard label="Total items" value={products.length} hint="in kitchen" />
          <StatCard label="Expiring soon" value={expiringCount} hint="≤ 3 days" tone="warning" />
          <StatCard
            label="Expired"
            value={expiredCount}
            hint="use or toss"
            tone={expiredCount ? "danger" : "default"}
          />
        </div>

        <Link
          to="/scan"
          className="mt-4 flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-float transition active:scale-[0.99]"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-foreground/15">
            <ScanLine className="h-6 w-6" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-bold">Scan a barcode</span>
            <span className="block text-xs opacity-90">Import a product in seconds</span>
          </span>
          <Plus className="h-5 w-5" />
        </Link>
        <button
          onClick={() => setManualOpen(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-semibold text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add manually
        </button>

        {expiringCount > 0 && (
          <Link
            to="/expiring"
            className="mt-3 flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-3.5"
          >
            <AlertTriangle className="h-5 w-5 text-warning-foreground" />
            <span className="flex-1 text-sm font-semibold text-warning-foreground">
              {expiringCount} item{expiringCount > 1 ? "s" : ""} expiring soon
            </span>
            <span className="text-xs font-semibold text-warning-foreground">View →</span>
          </Link>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Link
            to="/nutrition"
            className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3 transition hover:border-primary/40"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Activity className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight">Nutrition</span>
              <span className="block text-[11px] text-muted-foreground">Daily macros</span>
            </span>
          </Link>
          <Link
            to="/meal-plan"
            className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3 transition hover:border-primary/40"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight">Meal Plan</span>
              <span className="block text-[11px] text-muted-foreground">From fridge</span>
            </span>
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
          {(["fridge", "pantry"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold capitalize transition",
                tab === t ? "bg-card text-foreground shadow-soft" : "text-muted-foreground",
              )}
            >
              {t === "fridge" ? (
                <Refrigerator className="h-4 w-4" />
              ) : (
                <PackageOpen className="h-4 w-4" />
              )}
              {t} ({t === "fridge" ? fridge.length : pantry.length})
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2.5 pb-6">
          {list.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <>
              {list.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                >
                  <ProductCard product={p} onRemove={removeProduct} />
                </motion.div>
              ))}
            </>
          )}
        </div>
      </Scrollable>
      <Dialog
        open={manualOpen}
        onOpenChange={(open) => {
          setManualOpen(open);
          if (!open) {
            resetManualForm();
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>
              Add a single item to your kitchen without scanning.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleManualSubmit}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Product name</label>
              <Input
                value={manualForm.display_name}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    display_name: event.target.value,
                  }))
                }
                placeholder="Baby spinach"
              />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quantity</label>
                <Input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={manualForm.quantity}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Unit</label>
                <select
                  value={manualForm.unit}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      unit: event.target.value as (typeof unitOptions)[number],
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {unitOptions.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <select
                value={manualForm.category}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Store in</label>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
                {(["fridge", "pantry"] as const).map((location) => (
                  <button
                    key={location}
                    type="button"
                    onClick={() => setManualForm((current) => ({ ...current, location }))}
                    className={cn(
                      "rounded-xl py-2 text-sm font-semibold capitalize transition",
                      manualForm.location === location
                        ? "bg-card text-foreground shadow-soft"
                        : "text-muted-foreground",
                    )}
                  >
                    {location}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Best-before date</label>
              <Input
                type="date"
                value={manualForm.expiration_date}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    expiration_date: event.target.value,
                  }))
                }
              />
            </div>

            {manualError ? <p className="text-sm text-destructive">{manualError}</p> : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setManualOpen(false);
                  resetManualForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={createInventoryMutation.isPending}>
                {createInventoryMutation.isPending ? "Adding..." : "Add product"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <BottomNav />
    </PhoneShell>
  );
}

function EmptyState({ tab }: { tab: "fridge" | "pantry" }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-secondary text-3xl">
        {tab === "fridge" ? "🧊" : "🫙"}
      </span>
      <h3 className="mt-4 text-base font-bold">Your {tab} is empty</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {tab === "fridge"
          ? "No fresh products yet. Scan a receipt to fill it up automatically."
          : "No pantry staples yet. Add items or scan a grocery receipt."}
      </p>
      <Link
        to="/scan"
        className="mt-5 flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft"
      >
        <Sparkles className="h-4 w-4" />
        Scan a barcode
      </Link>
    </div>
  );
}
