from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.v1.deps import get_meal_planner, get_session
from app.api.v1.endpoints.recipes import (
    _recipe_nutrition_summary,
    _recipe_payload,
)
from app.api.v1.pagination import build_list_meta
from app.db.models import Fridge, MealPlan, MealPlanEntry, Recipe
from app.services.demo_user import get_or_create_demo_user
from app.services.llm import MiniMaxMealPlanner
from app.services.meal_plan.builder import (
    MEAL_SLOTS,
    calorie_target_for_goal,
    fallback_assignment,
    validate_llm_assignment,
)
from app.services.recipes.matching import build_recipe_matches


router = APIRouter()
MEAL_TYPES = ("breakfast", "lunch", "dinner", "snack")


class MealPlanCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fridge_id: int
    span_days: int = Field(ge=1, le=31)
    goal: Literal["lose", "maintain", "gain", "all"] | None = None
    starts_on: date | None = None
    status: Literal["draft", "active"] = "draft"


class MealPlanEntryCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day_index: int | None = Field(default=None, ge=0, le=30)
    meal_type: str | None = Field(default=None, min_length=1, max_length=30)
    meal: str | None = Field(default=None, min_length=1, max_length=30)
    scheduled_for: date | None = None
    recipe_id: int
    servings: float = Field(gt=0, le=10)
    notes: str | None = None

    @model_validator(mode="after")
    def validate_schedule(self) -> "MealPlanEntryCreateRequest":
        if self.day_index is None and self.scheduled_for is None:
            raise ValueError("day_index or scheduled_for must be provided")
        if self.meal_type is None and self.meal is None:
            raise ValueError("meal_type or meal must be provided")
        return self


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _serialize_datetime(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _meal_label(value: str) -> str:
    return value.strip().lower().replace("_", " ").title()


def _normalize_meal_type(value: str | None) -> str:
    normalized_value = (value or "").strip().lower().replace(" ", "_")
    if normalized_value not in MEAL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="meal_type must be breakfast, lunch, dinner, or snack",
        )
    return normalized_value


def _nutrition_snapshot_for_recipe(recipe: Recipe, servings: float) -> dict[str, float]:
    base_nutrition = _recipe_nutrition_summary(recipe)
    return {
        metric: round(float(value) * servings, 1)
        for metric, value in base_nutrition.items()
        if isinstance(value, (int, float))
    }


def serialize_meal_plan_entry(entry: MealPlanEntry) -> dict[str, object]:
    scheduled_for = entry.meal_plan.starts_on + timedelta(days=entry.day_index)
    return {
        "id": entry.id,
        "meal_plan_id": entry.meal_plan_id,
        "day_index": entry.day_index,
        "meal_type": entry.meal_type,
        "meal": _meal_label(entry.meal_type),
        "scheduled_for": scheduled_for.isoformat(),
        "recipe_id": entry.recipe_id,
        "recipe": _recipe_payload(entry.recipe),
        "servings": entry.servings,
        "nutrition_snapshot": entry.nutrition_snapshot_json,
    }


def serialize_meal_plan(meal_plan: MealPlan) -> dict[str, object]:
    entries = sorted(
        meal_plan.entries,
        key=lambda entry: (entry.day_index, MEAL_TYPES.index(entry.meal_type), entry.id),
    )
    nutrition_summary = {
        "calories": round(
            sum(entry.nutrition_snapshot_json.get("calories", 0) for entry in entries),
            1,
        ),
        "protein": round(
            sum(entry.nutrition_snapshot_json.get("protein", 0) for entry in entries),
            1,
        ),
        "carbs": round(
            sum(entry.nutrition_snapshot_json.get("carbs", 0) for entry in entries),
            1,
        ),
        "fat": round(
            sum(entry.nutrition_snapshot_json.get("fat", 0) for entry in entries),
            1,
        ),
    }
    generated_at = _serialize_datetime(meal_plan.generated_at)
    return {
        "id": meal_plan.id,
        "fridge_id": meal_plan.fridge_id,
        "goal": meal_plan.goal,
        "span_days": meal_plan.span_days,
        "status": meal_plan.status,
        "starts_on": meal_plan.starts_on.isoformat(),
        "generated_at": generated_at,
        "created_at": generated_at,
        "updated_at": generated_at,
        "nutrition_summary": nutrition_summary,
        "entries": [serialize_meal_plan_entry(entry) for entry in entries],
    }


def _get_meal_plan_or_404(session: Session, *, meal_plan_id: int, user_id: str) -> MealPlan:
    meal_plan = session.scalar(
        select(MealPlan)
        .options(
            selectinload(MealPlan.entries)
            .selectinload(MealPlanEntry.recipe)
            .selectinload(Recipe.ingredients)
        )
        .where(MealPlan.id == meal_plan_id, MealPlan.user_id == user_id)
    )
    if meal_plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal plan not found")
    return meal_plan


@router.get("/meal-plans")
def list_meal_plans(session: Session = Depends(get_session)) -> dict[str, object]:
    user = get_or_create_demo_user(session)
    meal_plans = session.scalars(
        select(MealPlan)
        .options(
            selectinload(MealPlan.entries)
            .selectinload(MealPlanEntry.recipe)
            .selectinload(Recipe.ingredients)
        )
        .where(MealPlan.user_id == user.id)
        .order_by(MealPlan.id.asc())
    ).all()
    data = [serialize_meal_plan(meal_plan) for meal_plan in meal_plans]
    return {"data": data, "meta": build_list_meta(len(data))}


@router.post("/meal-plans", status_code=status.HTTP_201_CREATED)
def create_meal_plan(
    payload: MealPlanCreateRequest,
    session: Session = Depends(get_session),
    meal_planner: MiniMaxMealPlanner | None = Depends(get_meal_planner),
) -> dict[str, dict[str, object]]:
    user = get_or_create_demo_user(session)
    fridge = session.get(Fridge, payload.fridge_id)
    if fridge is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fridge not found")

    meal_plan = MealPlan(
        user_id=user.id,
        fridge_id=payload.fridge_id,
        goal=None if payload.goal == "all" else payload.goal,
        span_days=payload.span_days,
        status=payload.status,
        starts_on=payload.starts_on or date.today(),
        generated_at=_utc_now(),
    )
    session.add(meal_plan)
    session.flush()

    goal_value = None if payload.goal == "all" else payload.goal
    matches = build_recipe_matches(
        session,
        fridge_id=payload.fridge_id,
        goal=payload.goal or "all",
        max_missing=20,
    )
    if not matches:
        matches = build_recipe_matches(
            session, fridge_id=payload.fridge_id, goal="all", max_missing=99
        )

    pool_ids = [match["recipe"]["id"] for match in matches]
    recipes_by_id = {match["recipe"]["id"]: session.get(Recipe, match["recipe"]["id"]) for match in matches}

    assignment: list[dict[str, int]] | None = None
    if meal_planner is not None and pool_ids:
        try:
            llm_input = {
                "span_days": payload.span_days,
                "goal": goal_value,
                "daily_calorie_target": calorie_target_for_goal(goal_value),
                "meals": list(MEAL_SLOTS),
                "pool": [
                    {
                        "id": match["recipe"]["id"],
                        "name": match["recipe"]["name"],
                        "match_score": match["match_score"],
                        "missing_count": len(match["missing_ingredients"]),
                        "calories": match["nutrition_summary"].get("calories", 0),
                    }
                    for match in matches
                ],
            }
            raw_output = meal_planner.generate_plan(llm_input)
            assignment = validate_llm_assignment(
                raw_output, pool_ids=set(pool_ids), span_days=payload.span_days
            )
        except Exception:
            assignment = None

    if assignment is None:
        assignment = fallback_assignment(pool_ids, payload.span_days)

    for day_index, day in enumerate(assignment):
        for meal_type in MEAL_SLOTS:
            recipe = recipes_by_id.get(day[meal_type])
            if recipe is None:
                continue
            session.add(
                MealPlanEntry(
                    meal_plan_id=meal_plan.id,
                    day_index=day_index,
                    meal_type=meal_type,
                    recipe=recipe,
                    recipe_id=recipe.id,
                    servings=1,
                    nutrition_snapshot_json=_nutrition_snapshot_for_recipe(recipe, 1),
                )
            )

    session.commit()
    meal_plan = _get_meal_plan_or_404(session, meal_plan_id=meal_plan.id, user_id=user.id)
    return {"data": serialize_meal_plan(meal_plan)}


@router.post("/meal-plans/{meal_plan_id}/entries", status_code=status.HTTP_201_CREATED)
def create_meal_plan_entry(
    meal_plan_id: int,
    payload: MealPlanEntryCreateRequest,
    session: Session = Depends(get_session),
) -> dict[str, dict[str, object]]:
    user = get_or_create_demo_user(session)
    meal_plan = _get_meal_plan_or_404(session, meal_plan_id=meal_plan_id, user_id=user.id)
    day_index = payload.day_index
    if day_index is None and payload.scheduled_for is not None:
        day_index = (payload.scheduled_for - meal_plan.starts_on).days

    if day_index is None or day_index < 0 or day_index >= meal_plan.span_days:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="day_index must be within the meal plan span",
        )

    meal_type = _normalize_meal_type(payload.meal_type or payload.meal)

    recipe = session.scalar(
        select(Recipe)
        .options(selectinload(Recipe.ingredients))
        .where(Recipe.id == payload.recipe_id, Recipe.is_active.is_(True))
    )
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    entry = MealPlanEntry(
        meal_plan_id=meal_plan.id,
        day_index=day_index,
        meal_type=meal_type,
        recipe=recipe,
        recipe_id=payload.recipe_id,
        servings=payload.servings,
        nutrition_snapshot_json=_nutrition_snapshot_for_recipe(recipe, payload.servings),
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return {"data": serialize_meal_plan_entry(entry)}
