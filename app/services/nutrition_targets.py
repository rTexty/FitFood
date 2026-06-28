from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


Goal = Literal["lose", "maintain", "gain"]
SexForEstimate = Literal["male", "female", "not_specified"]
ActivityLevel = Literal["sedentary", "light", "moderate", "active", "very_active"]

ACTIVITY_FACTORS: dict[ActivityLevel, float] = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

GOAL_ADJUSTMENTS: dict[Goal, int] = {
    "lose": -500,
    "maintain": 0,
    "gain": 300,
}


@dataclass(frozen=True, slots=True)
class NutritionTargetInputs:
    goal: Goal
    age_years: int
    sex_for_calorie_estimate: SexForEstimate
    height_cm: float
    weight_kg: float
    activity_level: ActivityLevel
    target_weight_kg: float | None = None


@dataclass(frozen=True, slots=True)
class NutritionTargets:
    calories_target: int
    protein_target: int
    carbs_target: int
    fat_target: int
    estimate_snapshot: dict[str, object]


def calculate_nutrition_targets(inputs: NutritionTargetInputs) -> NutritionTargets:
    bmr = _calculate_bmr(inputs)
    activity_factor = ACTIVITY_FACTORS[inputs.activity_level]
    maintenance_calories = bmr * activity_factor
    adjusted_calories = maintenance_calories + GOAL_ADJUSTMENTS[inputs.goal]
    minimum_calories = _minimum_calories(inputs.sex_for_calorie_estimate)
    calories_target = round(max(minimum_calories, adjusted_calories))

    protein_target = round(inputs.weight_kg * _protein_multiplier(inputs.goal))
    fat_target = round((calories_target * 0.27) / 9)
    carb_calories = max(0, calories_target - protein_target * 4 - fat_target * 9)
    carbs_target = round(carb_calories / 4)

    snapshot = {
        "formula": "mifflin_st_jeor",
        "bmr": round(bmr),
        "activity_factor": activity_factor,
        "maintenance_calories": round(maintenance_calories),
        "goal_adjustment": GOAL_ADJUSTMENTS[inputs.goal],
        "minimum_calories": minimum_calories,
        "target_weight_kg": inputs.target_weight_kg,
    }
    return NutritionTargets(
        calories_target=calories_target,
        protein_target=max(1, protein_target),
        carbs_target=max(0, carbs_target),
        fat_target=max(1, fat_target),
        estimate_snapshot=snapshot,
    )


def _calculate_bmr(inputs: NutritionTargetInputs) -> float:
    sex_adjustment = {
        "male": 5,
        "female": -161,
        "not_specified": -78,
    }[inputs.sex_for_calorie_estimate]
    return 10 * inputs.weight_kg + 6.25 * inputs.height_cm - 5 * inputs.age_years + sex_adjustment


def _minimum_calories(sex_for_estimate: SexForEstimate) -> int:
    if sex_for_estimate == "male":
        return 1500
    return 1200


def _protein_multiplier(goal: Goal) -> float:
    return {
        "lose": 1.7,
        "maintain": 1.5,
        "gain": 1.8,
    }[goal]

