import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Dumbbell,
  HeartPulse,
  Scale,
  UserRound,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { PhoneShell, StatusBar, TopBar } from "@/components/fitfood/Shell";
import { useCompleteOnboardingMutation } from "@/lib/api/mutations";
import { onboardingStateQueryOptions } from "@/lib/api/queries";
import { goalLabels, type Goal } from "@/lib/fitfood-data";
import { cn } from "@/lib/utils";
import type {
  ActivityLevel,
  OnboardingCompleteInput,
  SexForCalorieEstimate,
} from "@/lib/api/types";

export const Route = createFileRoute("/onboarding")({
  loader: async ({ context }) => {
    const state = await context.queryClient.ensureQueryData(onboardingStateQueryOptions());
    if (state.completed) {
      throw redirect({ to: "/dashboard" });
    }
    return state;
  },
  head: () => ({
    meta: [
      { title: "Set Up FitFood" },
      { name: "description", content: "Complete your FitFood profile and kitchen setup." },
    ],
  }),
  component: Onboarding,
});

const steps = [
  { title: "Profile", icon: UserRound },
  { title: "Body", icon: Scale },
  { title: "Goal", icon: HeartPulse },
  { title: "Food", icon: Dumbbell },
] as const;

const goalOrder: Goal[] = ["lose", "maintain", "gain"];
const activityOptions: Array<{ value: ActivityLevel; label: string; hint: string }> = [
  { value: "sedentary", label: "Low", hint: "Mostly sitting" },
  { value: "light", label: "Light", hint: "Walks, light training" },
  { value: "moderate", label: "Moderate", hint: "3-5 active days" },
  { value: "active", label: "Active", hint: "Hard training" },
  { value: "very_active", label: "Very active", hint: "Daily intense work" },
];
const preferenceOptions = ["high_protein", "vegetarian", "low_carb", "quick_meals", "budget"];

const initialForm = {
  display_name: "",
  age_years: "29",
  sex_for_calorie_estimate: "not_specified" as SexForCalorieEstimate,
  height_cm: "170",
  weight_kg: "70",
  target_weight_kg: "",
  goal: "maintain" as Goal,
  activity_level: "moderate" as ActivityLevel,
  dietary_preferences: [] as string[],
  allergies: "",
  fridge_name: "Home Kitchen",
  fridge_kind: "home" as OnboardingCompleteInput["fridge"]["kind"],
};

function Onboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const completeMutation = useCompleteOnboardingMutation();
  const navigate = useNavigate();
  const progress = ((step + 1) / steps.length) * 100;

  const needsTarget = form.goal !== "maintain";
  const canContinue = useMemo(() => validateStep(step, form) == null, [step, form]);

  function updateField<Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function togglePreference(preference: string) {
    setForm((current) => ({
      ...current,
      dietary_preferences: current.dietary_preferences.includes(preference)
        ? current.dietary_preferences.filter((item) => item !== preference)
        : [...current.dietary_preferences, preference],
    }));
  }

  function handleNext(event?: MouseEvent<HTMLButtonElement> | FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const stepError = validateStep(step, form);
    if (stepError) {
      setError(stepError);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function handleFinish() {
    const payload = buildPayload(form);
    const payloadError = validatePayload(payload);
    if (payloadError) {
      setError(payloadError);
      return;
    }
    setError(null);
    completeMutation.mutate(payload, {
      onSuccess: () => navigate({ to: "/dashboard" }),
      onError: (mutationError) => {
        setError(
          mutationError instanceof Error ? mutationError.message : "Could not finish setup.",
        );
      },
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < steps.length - 1) {
      handleNext(event);
      return;
    }
    handleFinish();
  }

  return (
    <PhoneShell>
      <StatusBar />
      <TopBar title="Set Up FitFood" subtitle={`Step ${step + 1} of ${steps.length}`} back="/" />
      <form className="flex flex-1 flex-col px-5 pb-7" onSubmit={handleSubmit}>
        <Progress value={progress} className="mb-4 h-1.5" />
        <div className="grid grid-cols-4 gap-2">
          {steps.map(({ title, icon: Icon }, index) => (
            <button
              key={title}
              type="button"
              onClick={() => setStep(index)}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-[11px] font-semibold transition",
                index === step
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {title}
            </button>
          ))}
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-5 flex-1"
        >
          {step === 0 && (
            <section className="space-y-4">
              <h2 className="text-2xl font-extrabold leading-tight">Tell us who is eating.</h2>
              <Field label="Name">
                <Input
                  value={form.display_name}
                  onChange={(event) => updateField("display_name", event.target.value)}
                  placeholder="Alex"
                />
              </Field>
              <Field label="Age">
                <Input
                  type="number"
                  min="13"
                  max="120"
                  value={form.age_years}
                  onChange={(event) => updateField("age_years", event.target.value)}
                />
              </Field>
              <Field label="Calorie estimate">
                <div className="grid grid-cols-3 gap-2">
                  {(["not_specified", "female", "male"] as const).map((sex) => (
                    <ChoiceButton
                      key={sex}
                      active={form.sex_for_calorie_estimate === sex}
                      onClick={() => updateField("sex_for_calorie_estimate", sex)}
                    >
                      {sex === "not_specified" ? "Neutral" : sex}
                    </ChoiceButton>
                  ))}
                </div>
              </Field>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4">
              <h2 className="text-2xl font-extrabold leading-tight">Body metrics.</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Height, cm">
                  <Input
                    type="number"
                    min="90"
                    max="250"
                    value={form.height_cm}
                    onChange={(event) => updateField("height_cm", event.target.value)}
                  />
                </Field>
                <Field label="Weight, kg">
                  <Input
                    type="number"
                    min="25"
                    max="350"
                    step="0.1"
                    value={form.weight_kg}
                    onChange={(event) => updateField("weight_kg", event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Target weight, kg">
                <Input
                  type="number"
                  min="25"
                  max="350"
                  step="0.1"
                  value={form.target_weight_kg}
                  onChange={(event) => updateField("target_weight_kg", event.target.value)}
                  placeholder={needsTarget ? "Required for this goal" : "Optional"}
                />
              </Field>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-4">
              <h2 className="text-2xl font-extrabold leading-tight">Choose the direction.</h2>
              <div className="space-y-2.5">
                {goalOrder.map((goal) => {
                  const active = form.goal === goal;
                  const label = goalLabels[goal];
                  return (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => updateField("goal", goal)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition",
                        active ? "border-primary bg-primary-soft" : "border-border bg-card",
                      )}
                    >
                      <span className="text-2xl">{label.emoji}</span>
                      <span className="flex-1">
                        <span className="block text-sm font-bold">{label.title}</span>
                        <span className="block text-xs text-muted-foreground">{label.desc}</span>
                      </span>
                      {active && <Check className="h-5 w-5 text-primary" />}
                    </button>
                  );
                })}
              </div>
              <Field label="Activity">
                <div className="grid grid-cols-1 gap-2">
                  {activityOptions.map((activity) => (
                    <ChoiceButton
                      key={activity.value}
                      active={form.activity_level === activity.value}
                      onClick={() => updateField("activity_level", activity.value)}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span>{activity.label}</span>
                        <span className="text-xs font-medium text-muted-foreground">
                          {activity.hint}
                        </span>
                      </span>
                    </ChoiceButton>
                  ))}
                </div>
              </Field>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-4">
              <h2 className="text-2xl font-extrabold leading-tight">Food rules and kitchen.</h2>
              <Field label="Preferences">
                <div className="flex flex-wrap gap-2">
                  {preferenceOptions.map((preference) => (
                    <button
                      key={preference}
                      type="button"
                      onClick={() => togglePreference(preference)}
                      className={cn(
                        "rounded-2xl border px-3 py-2 text-xs font-semibold transition",
                        form.dietary_preferences.includes(preference)
                          ? "border-primary bg-primary-soft text-primary"
                          : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {preference.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Allergies">
                <Input
                  value={form.allergies}
                  onChange={(event) => updateField("allergies", event.target.value)}
                  placeholder="Peanuts, shellfish"
                />
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
                <Field label="Kitchen name">
                  <Input
                    value={form.fridge_name}
                    onChange={(event) => updateField("fridge_name", event.target.value)}
                  />
                </Field>
                <Field label="Type">
                  <select
                    value={form.fridge_kind}
                    onChange={(event) =>
                      updateField(
                        "fridge_kind",
                        event.target.value as OnboardingCompleteInput["fridge"]["kind"],
                      )
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="home">Home</option>
                    <option value="shared">Shared</option>
                    <option value="work">Work</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
              </div>
            </section>
          )}
        </motion.div>

        {error ? (
          <p className="mb-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="mt-auto flex gap-2 pt-4">
          {step > 0 ? (
            <Button
              type="button"
              variant="secondary"
              className="h-12 w-14"
              onClick={() => setStep(step - 1)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : null}
          {step < steps.length - 1 ? (
            <Button
              key="continue"
              type="button"
              className="h-12 flex-1 gap-2"
              disabled={!canContinue}
              onClick={handleNext}
            >
              Continue
              <ArrowRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              key="finish"
              type="button"
              className="h-12 flex-1 gap-2"
              disabled={completeMutation.isPending || !canContinue}
              onClick={handleFinish}
            >
              {completeMutation.isPending ? "Saving..." : "Finish setup"}
              <Check className="h-5 w-5" />
            </Button>
          )}
        </div>
      </form>
    </PhoneShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-10 items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition",
        active
          ? "border-primary bg-primary-soft text-primary"
          : "border-border bg-card text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function validateStep(step: number, form: typeof initialForm) {
  if (step === 0) {
    if (!form.display_name.trim()) return "Enter your name.";
    if (!isBetween(Number(form.age_years), 13, 120)) return "Age must be between 13 and 120.";
  }
  if (step === 1) {
    if (!isBetween(Number(form.height_cm), 90, 250)) return "Height must be between 90 and 250 cm.";
    if (!isBetween(Number(form.weight_kg), 25, 350)) return "Weight must be between 25 and 350 kg.";
    if (form.target_weight_kg && !isBetween(Number(form.target_weight_kg), 25, 350)) {
      return "Target weight must be between 25 and 350 kg.";
    }
  }
  if (step === 3 && !form.fridge_name.trim()) {
    return "Name your kitchen.";
  }
  return null;
}

function validatePayload(payload: OnboardingCompleteInput) {
  if (
    payload.goal === "lose" &&
    (payload.target_weight_kg ?? payload.weight_kg) >= payload.weight_kg
  ) {
    return "For weight loss, target weight must be below current weight.";
  }
  if (
    payload.goal === "gain" &&
    (payload.target_weight_kg ?? payload.weight_kg) <= payload.weight_kg
  ) {
    return "For weight gain, target weight must be above current weight.";
  }
  return null;
}

function buildPayload(form: typeof initialForm): OnboardingCompleteInput {
  const allergies = form.allergies
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((display_name) => ({ display_name, severity: "avoid" as const }));
  const targetWeight = form.target_weight_kg ? Number(form.target_weight_kg) : null;
  return {
    display_name: form.display_name.trim(),
    age_years: Number(form.age_years),
    sex_for_calorie_estimate: form.sex_for_calorie_estimate,
    height_cm: Number(form.height_cm),
    weight_kg: Number(form.weight_kg),
    target_weight_kg: targetWeight,
    goal: form.goal,
    activity_level: form.activity_level,
    dietary_preferences: form.dietary_preferences,
    allergies,
    fridge: {
      name: form.fridge_name.trim(),
      kind: form.fridge_kind,
      description: null,
    },
  };
}

function isBetween(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
}
