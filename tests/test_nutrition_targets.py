from app.services.nutrition_targets import NutritionTargetInputs, calculate_nutrition_targets


def test_maintain_targets_use_mifflin_st_jeor_and_activity_factor() -> None:
    targets = calculate_nutrition_targets(
        NutritionTargetInputs(
            goal="maintain",
            age_years=30,
            sex_for_calorie_estimate="male",
            height_cm=180,
            weight_kg=80,
            activity_level="moderate",
        )
    )

    assert targets.estimate_snapshot["formula"] == "mifflin_st_jeor"
    assert targets.estimate_snapshot["bmr"] == 1780
    assert targets.estimate_snapshot["activity_factor"] == 1.55
    assert targets.calories_target == 2759
    assert targets.protein_target == 120
    assert targets.fat_target == 83
    assert targets.carbs_target == 383


def test_lose_targets_apply_deficit_and_minimum_calorie_floor() -> None:
    targets = calculate_nutrition_targets(
        NutritionTargetInputs(
            goal="lose",
            age_years=60,
            sex_for_calorie_estimate="female",
            height_cm=150,
            weight_kg=45,
            activity_level="sedentary",
            target_weight_kg=42,
        )
    )

    assert targets.calories_target == 1200
    assert targets.estimate_snapshot["goal_adjustment"] == -500
    assert targets.estimate_snapshot["minimum_calories"] == 1200
    assert targets.protein_target == 76


def test_gain_targets_apply_surplus_and_higher_protein() -> None:
    targets = calculate_nutrition_targets(
        NutritionTargetInputs(
            goal="gain",
            age_years=28,
            sex_for_calorie_estimate="not_specified",
            height_cm=170,
            weight_kg=70,
            activity_level="light",
            target_weight_kg=75,
        )
    )

    assert targets.estimate_snapshot["goal_adjustment"] == 300
    assert targets.calories_target > targets.estimate_snapshot["maintenance_calories"]
    assert targets.protein_target == 126

