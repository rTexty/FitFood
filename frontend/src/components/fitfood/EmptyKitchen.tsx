import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Leaf, Plus, ScanLine, Sparkles } from "lucide-react";
import { BottomNav, PhoneShell, StatusBar, TopBar } from "@/components/fitfood/Shell";

export function EmptyKitchenScreen({ kind }: { kind: "fridge" | "pantry" }) {
  const isFridge = kind === "fridge";
  const emoji = isFridge ? "🧊" : "🫙";
  const title = isFridge ? "Your fridge is empty" : "Your pantry is empty";
  const copy = isFridge
    ? "No fresh products yet. Scan a grocery receipt and FitFood will fill your fridge automatically."
    : "No pantry staples yet. Scan a receipt or add items so FitFood can track them for you.";

  return (
    <PhoneShell>
      <StatusBar />
      <TopBar title={isFridge ? "Fridge" : "Pantry"} subtitle="Empty state" back="/dashboard" />

      <div className="flex flex-1 flex-col items-center px-6 pb-8 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 140, damping: 16 }}
          className="relative mt-12 grid h-56 w-56 place-items-center"
        >
          <span className="absolute h-44 w-44 rounded-full bg-primary-soft" />
          <span className="absolute h-56 w-56 rounded-full border-2 border-dashed border-primary/25" />
          <span className="relative grid h-32 w-32 place-items-center rounded-[2rem] bg-card text-6xl shadow-card">
            {emoji}
          </span>
          <span className="absolute right-6 top-6 grid h-9 w-9 place-items-center rounded-full bg-success text-success-foreground shadow-soft">
            <Leaf className="h-4 w-4" />
          </span>
          <span className="absolute bottom-7 left-5 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft">
            <Sparkles className="h-4 w-4" />
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-10"
        >
          <h2 className="text-2xl font-extrabold">{title}</h2>
          <p className="mx-auto mt-2.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {copy}
          </p>
        </motion.div>

        <div className="mt-auto w-full space-y-3 pt-10">
          <Link
            to="/scan"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-float transition active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" />
            Add products
          </Link>
          <Link
            to="/scan"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-4 text-base font-semibold text-foreground"
          >
            <ScanLine className="h-5 w-5" />
            Scan a receipt
          </Link>
        </div>
      </div>

      <BottomNav />
    </PhoneShell>
  );
}
