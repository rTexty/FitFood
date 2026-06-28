from __future__ import annotations

from typing import Any

MEAL_SLOTS: tuple[str, ...] = ("breakfast", "lunch", "dinner")

_CALORIE_TARGETS = {"lose": 1600, "maintain": 2000, "gain": 2500}
_DEFAULT_CALORIE_TARGET = 2000


def calorie_target_for_goal(goal: str | None) -> int:
    if goal is None:
        return _DEFAULT_CALORIE_TARGET
    return _CALORIE_TARGETS.get(goal, _DEFAULT_CALORIE_TARGET)


def fallback_assignment(pool: list[int], span_days: int) -> list[dict[str, int]]:
    """Assign recipe ids to slots, walking the ranked pool with simple variety.

    The pool is ordered fridge-cookable first. We walk it round-robin across all
    slots of all days; when the pool is larger than the slots-per-day count this
    naturally avoids repeating a recipe in the same slot on consecutive days.
    """
    if not pool or span_days <= 0:
        return []

    plan: list[dict[str, int]] = []
    cursor = 0
    for _ in range(span_days):
        day: dict[str, int] = {}
        for slot in MEAL_SLOTS:
            day[slot] = pool[cursor % len(pool)]
            cursor += 1
        plan.append(day)
    return plan


def validate_llm_assignment(
    raw: Any,
    *,
    pool_ids: set[int],
    span_days: int,
) -> list[dict[str, int]] | None:
    """Return a normalized assignment, or None if the LLM output is unusable."""
    if not isinstance(raw, dict):
        return None
    days = raw.get("days")
    if not isinstance(days, list) or len(days) != span_days:
        return None

    normalized: list[dict[str, int]] = []
    for day in days:
        if not isinstance(day, dict):
            return None
        normalized_day: dict[str, int] = {}
        for slot in MEAL_SLOTS:
            value = day.get(slot)
            if not isinstance(value, int) or isinstance(value, bool):
                return None
            if value not in pool_ids:
                return None
            normalized_day[slot] = value
        normalized.append(normalized_day)
    return normalized
