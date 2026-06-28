import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  ScanLine,
  Leaf,
  ChevronRight,
  Trash2,
  RotateCcw,
  Target,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BottomNav, PhoneShell, Scrollable, StatusBar, TopBar } from "@/components/fitfood/Shell";
import { currentUserQueryOptions } from "@/lib/api/queries";
import { goalLabels, type Goal } from "@/lib/fitfood-data";
import { useKitchen } from "@/lib/kitchen-store";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile & Settings — FitFood" },
      {
        name: "description",
        content: "Manage your goal, notifications, and kitchen data in FitFood.",
      },
    ],
  }),
  component: Profile,
});

const goalOrder: Goal[] = ["lose", "maintain", "gain"];

function Profile() {
  const { goal, setGoal, products, clearProducts, resetAll } = useKitchen();
  const userQuery = useQuery(currentUserQueryOptions());
  const navigate = useNavigate();
  const [expiryAlerts, setExpiryAlerts] = useState(true);
  const [aiTips, setAiTips] = useState(true);
  const [autoAdd, setAutoAdd] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const displayName = userQuery.data?.display_name ?? "FitFood User";
  const email = userQuery.data?.email ?? "Loading account";
  const initials = initialsFor(displayName);

  return (
    <PhoneShell>
      <StatusBar />
      <TopBar title="Profile" subtitle="Settings & preferences" />
      <Scrollable className="px-5">
        <div className="flex items-center gap-4 rounded-2xl bg-primary p-4 text-primary-foreground shadow-float">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary-foreground/15 text-2xl font-bold">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{displayName}</p>
            <p className="truncate text-sm opacity-90">{email}</p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[11px] font-semibold">
              <Leaf className="h-3 w-3" /> {products.length} items tracked
            </span>
          </div>
        </div>

        <Section title="Your goal">
          <div className="flex flex-col gap-2">
            {goalOrder.map((g) => {
              const active = goal === g;
              return (
                <button
                  key={g}
                  onClick={() => setGoal(g)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition",
                    active ? "border-primary bg-primary-soft" : "border-border bg-card",
                  )}
                >
                  <span className="text-xl">{goalLabels[g].emoji}</span>
                  <span className="flex-1 text-sm font-semibold">{goalLabels[g].title}</span>
                  {active && <Target className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Notifications">
          <ToggleRow
            icon={Bell}
            label="Expiry alerts"
            desc="Warn me before food spoils"
            checked={expiryAlerts}
            onChange={setExpiryAlerts}
          />
          <ToggleRow
            icon={Sparkles}
            label="AI meal tips"
            desc="Daily recipe suggestions"
            checked={aiTips}
            onChange={setAiTips}
          />
          <ToggleRow
            icon={ScanLine}
            label="Auto-add from receipts"
            desc="Skip manual confirmation"
            checked={autoAdd}
            onChange={setAutoAdd}
          />
        </Section>

        <Section title="Kitchen data">
          <button
            onClick={clearProducts}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-warning-soft text-warning-foreground">
              <Trash2 className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">Clear all products</span>
              <span className="block text-xs text-muted-foreground">
                Empties fridge & pantry (demo)
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            disabled={isResetting}
            onClick={async () => {
              setIsResetting(true);
              setResetError(null);
              try {
                await resetAll();
                await navigate({ to: "/onboarding" });
              } catch (error) {
                setResetError(
                  error instanceof Error ? error.message : "Could not restart onboarding.",
                );
              } finally {
                setIsResetting(false);
              }
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left disabled:opacity-70"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-destructive-soft text-destructive">
              <RotateCcw className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">
                {isResetting ? "Resetting..." : "Reset prototype"}
              </span>
              <span className="block text-xs text-muted-foreground">
                Restore demo data & onboarding
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          {resetError && <p className="px-1 text-xs font-medium text-destructive">{resetError}</p>}
        </Section>

        <p className="py-4 text-center text-xs text-muted-foreground">FitFood · MVP v1 prototype</p>
      </Scrollable>
      <BottomNav />
    </PhoneShell>
  );
}

function initialsFor(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "FF";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  desc,
  checked,
  onChange,
}: {
  icon: typeof Bell;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
