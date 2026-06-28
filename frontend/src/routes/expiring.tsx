import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChefHat, Leaf } from "lucide-react";
import { BottomNav, PhoneShell, Scrollable, StatusBar, TopBar } from "@/components/fitfood/Shell";
import { ProductCard } from "@/components/fitfood/widgets";
import { ensureDashboardSlice } from "@/lib/api/queries";
import { daysUntil, freshState } from "@/lib/fitfood-data";
import { useKitchen } from "@/lib/kitchen-store";

export const Route = createFileRoute("/expiring")({
  loader: ({ context }) => ensureDashboardSlice(context.queryClient),
  head: () => ({
    meta: [
      { title: "Expiring Soon — FitFood" },
      {
        name: "description",
        content: "See which products are close to their expiry date and act before they spoil.",
      },
    ],
  }),
  component: Expiring,
});

function Expiring() {
  const { products, removeProduct } = useKitchen();
  const list = products
    .filter((p) => {
      const state = freshState(p.expiryDate);
      return state === "expired" || state === "expiring";
    })
    .sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate));

  return (
    <PhoneShell>
      <StatusBar />
      <TopBar
        title="Expiring Soon"
        subtitle="Use these before they go to waste"
        back="/dashboard"
      />
      <Scrollable className="px-5">
        {list.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-success-soft text-3xl">
              🌿
            </span>
            <h3 className="mt-4 text-base font-bold">Nothing's spoiling</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Everything in your kitchen is still fresh. Great job reducing waste!
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3">
              <Leaf className="h-5 w-5 text-warning-foreground" />
              <p className="text-sm font-medium text-warning-foreground">
                Cooking these saves about <span className="font-bold">{list.length * 0.4}kg</span>{" "}
                of food waste.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 pb-4">
              {list.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                >
                  <ProductCard product={p} onRemove={removeProduct} />
                </motion.div>
              ))}
            </div>
            <Link
              to="/recipes"
              className="mb-6 mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-float"
            >
              <ChefHat className="h-5 w-5" />
              Find recipes to use them
            </Link>
          </>
        )}
      </Scrollable>
      <BottomNav />
    </PhoneShell>
  );
}
