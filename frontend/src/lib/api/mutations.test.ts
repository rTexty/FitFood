import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyOnboardingStateToCache } from "./mutations";
import { fitfoodKeys, onboardingStateQueryOptions } from "./queries";
import type { OnboardingState } from "./types";

const incompleteState: OnboardingState = {
  completed: false,
  user: {
    id: "user-demo",
    email: "alex@fitfood.app",
    display_name: "Alex Green",
    locale: "en-US",
    timezone: "Europe/Moscow",
    onboarding_completed_at: null,
    primary_fridge_id: null,
  },
  profile: null,
  current_goal: null,
  primary_fridge: null,
};

const completedState: OnboardingState = {
  completed: true,
  user: {
    ...incompleteState.user,
    display_name: "Rita",
    onboarding_completed_at: "2026-06-28T12:00:00Z",
    primary_fridge_id: "fridge-home",
  },
  profile: {
    user_id: "user-demo",
    age_years: 29,
    sex_for_calorie_estimate: "female",
    height_cm: 168,
    weight_kg: 72,
    target_weight_kg: 65,
    activity_level: "moderate",
    dietary_preferences: ["high_protein"],
    allergies: [],
  },
  current_goal: {
    goal: "lose",
    calories_target: 1800,
    protein_target: 130,
    carbs_target: 160,
    fat_target: 55,
    active_from: "2026-06-28T12:00:00Z",
    active_to: null,
  },
  primary_fridge: {
    id: "fridge-home",
    name: "Home Kitchen",
    kind: "home",
    is_primary: true,
  },
};

describe("onboarding mutation cache updates", () => {
  it("replaces stale incomplete onboarding cache with the completed API state", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(fitfoodKeys.onboarding, incompleteState);

    applyOnboardingStateToCache(queryClient, completedState);
    await queryClient.invalidateQueries({ queryKey: fitfoodKeys.onboarding });

    const onboarding = await queryClient.ensureQueryData(onboardingStateQueryOptions());

    expect(onboarding.completed).toBe(true);
    expect(queryClient.getQueryData(fitfoodKeys.user)).toEqual(completedState.user);
    expect(queryClient.getQueryData(fitfoodKeys.fridges)).toEqual([completedState.primary_fridge]);
  });
});
