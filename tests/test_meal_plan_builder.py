from __future__ import annotations

from app.services.meal_plan.builder import (
    MEAL_SLOTS,
    calorie_target_for_goal,
    fallback_assignment,
    validate_llm_assignment,
)


def test_meal_slots_excludes_snack():
    assert MEAL_SLOTS == ("breakfast", "lunch", "dinner")


def test_calorie_target_for_goal():
    assert calorie_target_for_goal("lose") == 1600
    assert calorie_target_for_goal("maintain") == 2000
    assert calorie_target_for_goal("gain") == 2500
    assert calorie_target_for_goal(None) == 2000


def test_fallback_assignment_shape_and_variety():
    pool = [101, 102, 103, 104, 105, 106]
    plan = fallback_assignment(pool, span_days=2)
    assert len(plan) == 2
    for day in plan:
        assert list(day.keys()) == list(MEAL_SLOTS)
    # No recipe repeats between consecutive days in the same slot when the pool is large enough
    for slot in MEAL_SLOTS:
        assert plan[0][slot] != plan[1][slot]


def test_fallback_assignment_wraps_small_pool():
    plan = fallback_assignment([7], span_days=2)
    assert len(plan) == 2
    assert all(day[slot] == 7 for day in plan for slot in MEAL_SLOTS)


def test_fallback_assignment_empty_pool_returns_empty():
    assert fallback_assignment([], span_days=3) == []


def test_validate_llm_assignment_accepts_valid():
    pool_ids = {1, 2, 3}
    raw = {"days": [{"breakfast": 1, "lunch": 2, "dinner": 3}]}
    assert validate_llm_assignment(raw, pool_ids=pool_ids, span_days=1) == [
        {"breakfast": 1, "lunch": 2, "dinner": 3}
    ]


def test_validate_llm_assignment_rejects_out_of_pool_id():
    assert validate_llm_assignment(
        {"days": [{"breakfast": 1, "lunch": 2, "dinner": 99}]},
        pool_ids={1, 2, 3},
        span_days=1,
    ) is None


def test_validate_llm_assignment_rejects_wrong_day_count():
    assert validate_llm_assignment(
        {"days": [{"breakfast": 1, "lunch": 2, "dinner": 3}]},
        pool_ids={1, 2, 3},
        span_days=2,
    ) is None


def test_validate_llm_assignment_rejects_missing_slot():
    assert validate_llm_assignment(
        {"days": [{"breakfast": 1, "lunch": 2}]},
        pool_ids={1, 2, 3},
        span_days=1,
    ) is None
