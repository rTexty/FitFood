import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Leaf, ScanLine, Sparkles, ArrowRight } from "lucide-react";
import splashHero from "@/assets/splash-hero.jpg";
import { PhoneShell, StatusBar } from "@/components/fitfood/Shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FitFood — Waste Less, Eat Better" },
      {
        name: "description",
        content:
          "Welcome to FitFood: track your kitchen, monitor expiry dates, and get AI meal plans from what you already have.",
      },
    ],
  }),
  component: Splash,
});

const features = [
  { icon: ScanLine, label: "Scan receipts" },
  { icon: Leaf, label: "Track freshness" },
  { icon: Sparkles, label: "AI meal plans" },
];

function Splash() {
  return (
    <PhoneShell>
      <StatusBar />
      <div className="flex flex-1 flex-col px-6 pb-8 pt-2">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Leaf className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">FitFood</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05, type: "spring", stiffness: 120, damping: 16 }}
          className="mt-6 overflow-hidden rounded-[2rem] bg-primary-soft"
        >
          <img
            src={splashHero}
            alt="A fridge full of fresh organic produce"
            width={1024}
            height={1024}
            className="h-64 w-full object-cover"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-7"
        >
          <h1 className="text-3xl font-extrabold leading-tight">
            Waste less,
            <br />
            eat <span className="text-primary">smarter.</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            FitFood tracks everything in your kitchen, warns you before food spoils, and turns what
            you already have into AI-powered recipes and meal plans.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mt-6 flex gap-2"
        >
          {features.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl bg-secondary px-2 py-3 text-center"
            >
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-[11px] font-semibold leading-tight">{label}</span>
            </div>
          ))}
        </motion.div>

        <div className="mt-auto pt-8">
          <Link
            to="/onboarding"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-float transition active:scale-[0.98]"
          >
            Get started
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            to="/dashboard"
            className="mt-3 block text-center text-sm font-medium text-muted-foreground"
          >
            I already have an account
          </Link>
        </div>
      </div>
    </PhoneShell>
  );
}
