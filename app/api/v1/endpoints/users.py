from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, cast

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user_account, get_session
from app.db.models import Fridge, MealPlan, ShoppingList, UserAccount, UserGoal, UserProfile
from app.services.demo_user import DEMO_USER_ID
from app.services.normalization import normalize_name
from app.services.nutrition_targets import (
    ActivityLevel,
    Goal,
    NutritionTargetInputs,
    SexForEstimate,
    calculate_nutrition_targets,
)


router = APIRouter()
GOAL_TARGETS = {
    "lose": {"calories": 1800, "protein": 130, "carbs": 160, "fat": 55},
    "maintain": {"calories": 2200, "protein": 120, "carbs": 230, "fat": 70},
    "gain": {"calories": 2800, "protein": 160, "carbs": 320, "fat": 90},
}


def _goal_target_error(goal: str, weight_kg: float, target_weight_kg: float | None) -> str | None:
    if goal in {"lose", "gain"} and target_weight_kg is None:
        return "target_weight_kg is required for lose and gain goals"
    if goal == "lose" and target_weight_kg is not None and target_weight_kg >= weight_kg:
        return "target_weight_kg must be lower than weight_kg for lose goal"
    if goal == "gain" and target_weight_kg is not None and target_weight_kg <= weight_kg:
        return "target_weight_kg must be higher than weight_kg for gain goal"
    return None


class CurrentGoalUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goal: Literal["lose", "maintain", "gain"]


class AllergyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=80)
    severity: Literal["avoid", "trace_ok", "preference"] = "avoid"

    @field_validator("display_name")
    @classmethod
    def trim_display_name(cls, value: str) -> str:
        stripped_value = value.strip()
        if not stripped_value:
            raise ValueError("display_name cannot be empty")
        return stripped_value


class OnboardingFridgeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    kind: Literal["home", "shared", "work", "other"] = "home"
    description: str | None = Field(default=None, max_length=255)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        stripped_value = value.strip()
        if not stripped_value:
            raise ValueError("name cannot be empty")
        return stripped_value

    @field_validator("description")
    @classmethod
    def trim_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class OnboardingCompleteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=120)
    age_years: int = Field(ge=13, le=120)
    sex_for_calorie_estimate: Literal["male", "female", "not_specified"]
    height_cm: float = Field(ge=90, le=250)
    weight_kg: float = Field(ge=25, le=350)
    target_weight_kg: float | None = Field(default=None, ge=25, le=350)
    goal: Literal["lose", "maintain", "gain"]
    activity_level: Literal["sedentary", "light", "moderate", "active", "very_active"]
    dietary_preferences: list[str] = Field(default_factory=list, max_length=20)
    allergies: list[AllergyInput] = Field(default_factory=list, max_length=30)
    fridge: OnboardingFridgeInput

    @field_validator("display_name")
    @classmethod
    def trim_display_name(cls, value: str) -> str:
        stripped_value = value.strip()
        if not stripped_value:
            raise ValueError("display_name cannot be empty")
        return stripped_value

    @field_validator("dietary_preferences")
    @classmethod
    def normalize_preferences(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for preference in value:
            cleaned = preference.strip().lower().replace(" ", "_")
            if len(cleaned) > 40:
                raise ValueError("dietary preference is too long")
            if cleaned and not cleaned.replace("_", "").isalnum():
                raise ValueError("dietary preference contains unsupported characters")
            if cleaned and cleaned not in seen:
                normalized.append(cleaned)
                seen.add(cleaned)
        return normalized

    @model_validator(mode="after")
    def validate_goal_direction(self) -> "OnboardingCompleteInput":
        error = _goal_target_error(self.goal, self.weight_kg, self.target_weight_kg)
        if error is not None:
            raise ValueError(error)
        return self


class ProfilePatchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    age_years: int | None = Field(default=None, ge=13, le=120)
    sex_for_calorie_estimate: Literal["male", "female", "not_specified"] | None = None
    height_cm: float | None = Field(default=None, ge=90, le=250)
    weight_kg: float | None = Field(default=None, ge=25, le=350)
    target_weight_kg: float | None = Field(default=None, ge=25, le=350)
    activity_level: Literal["sedentary", "light", "moderate", "active", "very_active"] | None = None
    dietary_preferences: list[str] | None = Field(default=None, max_length=20)
    allergies: list[AllergyInput] | None = Field(default=None, max_length=30)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def _goal_payload(goal: UserGoal) -> dict[str, object]:
    return {
        "goal": goal.goal,
        "calories_target": goal.calories_target,
        "protein_target": goal.protein_target,
        "carbs_target": goal.carbs_target,
        "fat_target": goal.fat_target,
        "active_from": _serialize_datetime(goal.active_from),
        "active_to": _serialize_datetime(goal.active_to),
        "target_weight_kg": goal.target_weight_kg,
        "estimate_snapshot": goal.estimate_snapshot_json,
        "source": goal.source,
    }


def _user_payload(user: UserAccount) -> dict[str, object]:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "locale": user.locale,
        "timezone": user.timezone,
        "onboarding_completed_at": _serialize_datetime(user.onboarding_completed_at),
        "primary_fridge_id": user.primary_fridge_id,
    }


def _profile_payload(profile: UserProfile) -> dict[str, object]:
    return {
        "user_id": profile.user_id,
        "age_years": profile.age_years,
        "sex_for_calorie_estimate": profile.sex_for_calorie_estimate,
        "height_cm": profile.height_cm,
        "weight_kg": profile.weight_kg,
        "target_weight_kg": profile.target_weight_kg,
        "activity_level": profile.activity_level,
        "dietary_preferences": profile.dietary_preferences_json,
        "allergies": profile.allergies_json,
        "calorie_formula": profile.calorie_formula,
        "calorie_estimate": profile.calorie_estimate_json,
        "created_at": _serialize_datetime(profile.created_at),
        "updated_at": _serialize_datetime(profile.updated_at),
    }


def _fridge_payload(fridge: Fridge | None) -> dict[str, object] | None:
    if fridge is None:
        return None
    return {
        "id": fridge.id,
        "name": fridge.name,
        "kind": fridge.kind,
        "description": fridge.description,
        "is_primary": fridge.is_primary,
    }


def _allergy_payload(allergy: AllergyInput) -> dict[str, str]:
    return {
        "display_name": allergy.display_name,
        "normalized_name": normalize_name(allergy.display_name),
        "severity": allergy.severity,
    }


def _raise_invalid_profile_goal(goal: str, profile: UserProfile) -> None:
    error = _goal_target_error(goal, profile.weight_kg, profile.target_weight_kg)
    if error is not None:
        raise HTTPException(status_code=422, detail=error)


def _find_primary_fridge(session: Session, user: UserAccount) -> Fridge | None:
    if user.primary_fridge_id is not None:
        fridge = session.get(Fridge, user.primary_fridge_id)
        if fridge is not None:
            return fridge
    return session.scalar(
        select(Fridge)
        .where(Fridge.user_id == user.id, Fridge.is_primary.is_(True))
        .order_by(Fridge.id.asc())
    )


def _calculate_targets_from_profile(
    *,
    profile: UserProfile,
    goal: str,
) -> tuple[int, int, int, int, dict[str, object]]:
    targets = calculate_nutrition_targets(
        NutritionTargetInputs(
            goal=cast(Goal, goal),
            age_years=profile.age_years,
            sex_for_calorie_estimate=cast(
                SexForEstimate,
                profile.sex_for_calorie_estimate,
            ),
            height_cm=profile.height_cm,
            weight_kg=profile.weight_kg,
            activity_level=cast(ActivityLevel, profile.activity_level),
            target_weight_kg=profile.target_weight_kg,
        )
    )
    return (
        targets.calories_target,
        targets.protein_target,
        targets.carbs_target,
        targets.fat_target,
        targets.estimate_snapshot,
    )


def _state_payload(
    *,
    user: UserAccount,
    profile: UserProfile | None,
    current_goal: UserGoal | None,
    primary_fridge: Fridge | None,
) -> dict[str, object]:
    return {
        "completed": user.onboarding_completed_at is not None,
        "user": _user_payload(user),
        "profile": _profile_payload(profile) if profile is not None else None,
        "current_goal": _goal_payload(current_goal) if current_goal is not None else None,
        "primary_fridge": _fridge_payload(primary_fridge),
    }


def _reset_display_name(user: UserAccount) -> str:
    return "Alex Green" if user.id == DEMO_USER_ID else "New User"


@router.get("/users/me")
def get_current_user(
    user: UserAccount = Depends(get_current_user_account),
) -> dict[str, dict[str, object]]:
    return {"data": _user_payload(user)}


@router.get("/users/me/onboarding")
def get_onboarding_state(
    session: Session = Depends(get_session),
    user: UserAccount = Depends(get_current_user_account),
) -> dict[str, object]:
    profile = session.get(UserProfile, user.id)
    current_goal = session.scalar(select(UserGoal).where(UserGoal.user_id == user.id))
    primary_fridge = _find_primary_fridge(session, user)
    return {
        "data": _state_payload(
            user=user,
            profile=profile,
            current_goal=current_goal,
            primary_fridge=primary_fridge,
        )
    }


@router.put("/users/me/onboarding")
def complete_onboarding(
    payload: OnboardingCompleteInput,
    session: Session = Depends(get_session),
    user: UserAccount = Depends(get_current_user_account),
) -> dict[str, object]:
    now = _utc_now()
    user.display_name = payload.display_name
    user.updated_at = now

    targets = calculate_nutrition_targets(
        NutritionTargetInputs(
            goal=payload.goal,
            age_years=payload.age_years,
            sex_for_calorie_estimate=payload.sex_for_calorie_estimate,
            height_cm=payload.height_cm,
            weight_kg=payload.weight_kg,
            activity_level=payload.activity_level,
            target_weight_kg=payload.target_weight_kg,
        )
    )

    profile = session.get(UserProfile, user.id)
    if profile is None:
        profile = UserProfile(
            user_id=user.id,
            age_years=payload.age_years,
            sex_for_calorie_estimate=payload.sex_for_calorie_estimate,
            height_cm=payload.height_cm,
            weight_kg=payload.weight_kg,
            target_weight_kg=payload.target_weight_kg,
            activity_level=payload.activity_level,
            dietary_preferences_json=payload.dietary_preferences,
            allergies_json=[_allergy_payload(allergy) for allergy in payload.allergies],
            calorie_estimate_json=targets.estimate_snapshot,
            created_at=now,
            updated_at=now,
        )
        session.add(profile)
    else:
        profile.age_years = payload.age_years
        profile.sex_for_calorie_estimate = payload.sex_for_calorie_estimate
        profile.height_cm = payload.height_cm
        profile.weight_kg = payload.weight_kg
        profile.target_weight_kg = payload.target_weight_kg
        profile.activity_level = payload.activity_level
        profile.dietary_preferences_json = payload.dietary_preferences
        profile.allergies_json = [_allergy_payload(allergy) for allergy in payload.allergies]
        profile.calorie_estimate_json = targets.estimate_snapshot
        profile.updated_at = now

    primary_fridge = _find_primary_fridge(session, user)
    if primary_fridge is None:
        primary_fridge = Fridge(
            user_id=user.id,
            name=payload.fridge.name,
            kind=payload.fridge.kind,
            description=payload.fridge.description,
            is_primary=True,
            created_at=now,
            updated_at=now,
        )
        session.add(primary_fridge)
        session.flush()
        user.primary_fridge_id = primary_fridge.id
    else:
        primary_fridge.name = payload.fridge.name
        primary_fridge.kind = payload.fridge.kind
        primary_fridge.description = payload.fridge.description
        primary_fridge.user_id = user.id
        primary_fridge.is_primary = True
        primary_fridge.updated_at = now
        user.primary_fridge_id = primary_fridge.id

    current_goal = session.scalar(select(UserGoal).where(UserGoal.user_id == user.id))
    if current_goal is None:
        current_goal = UserGoal(
            user_id=user.id,
            goal=payload.goal,
            calories_target=targets.calories_target,
            protein_target=targets.protein_target,
            carbs_target=targets.carbs_target,
            fat_target=targets.fat_target,
            target_weight_kg=payload.target_weight_kg,
            estimate_snapshot_json=targets.estimate_snapshot,
            source="onboarding",
            active_from=now,
            active_to=None,
            updated_at=now,
        )
        session.add(current_goal)
    else:
        current_goal.goal = payload.goal
        current_goal.calories_target = targets.calories_target
        current_goal.protein_target = targets.protein_target
        current_goal.carbs_target = targets.carbs_target
        current_goal.fat_target = targets.fat_target
        current_goal.target_weight_kg = payload.target_weight_kg
        current_goal.estimate_snapshot_json = targets.estimate_snapshot
        current_goal.source = "onboarding"
        current_goal.active_from = now
        current_goal.active_to = None
        current_goal.updated_at = now

    if user.onboarding_completed_at is None:
        user.onboarding_completed_at = now

    session.commit()
    session.refresh(user)
    session.refresh(profile)
    session.refresh(current_goal)
    session.refresh(primary_fridge)
    return {
        "data": _state_payload(
            user=user,
            profile=profile,
            current_goal=current_goal,
            primary_fridge=primary_fridge,
        )
    }


@router.post("/users/me/demo-reset")
def reset_demo_state(
    session: Session = Depends(get_session),
    user: UserAccount = Depends(get_current_user_account),
) -> dict[str, object]:
    user.primary_fridge_id = None

    for meal_plan in session.scalars(select(MealPlan).where(MealPlan.user_id == user.id)).all():
        session.delete(meal_plan)
    for shopping_list in session.scalars(
        select(ShoppingList).where(ShoppingList.user_id == user.id)
    ).all():
        session.delete(shopping_list)
    for fridge in session.scalars(select(Fridge).where(Fridge.user_id == user.id)).all():
        session.delete(fridge)

    profile = session.get(UserProfile, user.id)
    if profile is not None:
        session.delete(profile)

    current_goal = session.scalar(select(UserGoal).where(UserGoal.user_id == user.id))
    if current_goal is not None:
        session.delete(current_goal)

    user.display_name = _reset_display_name(user)
    user.onboarding_completed_at = None
    user.updated_at = _utc_now()

    session.commit()
    session.refresh(user)

    return {
        "data": _state_payload(
            user=user,
            profile=None,
            current_goal=None,
            primary_fridge=None,
        )
    }


@router.get("/users/me/profile")
def get_profile(
    session: Session = Depends(get_session),
    user: UserAccount = Depends(get_current_user_account),
) -> dict[str, object]:
    profile = session.get(UserProfile, user.id)
    if profile is None:
        return {"data": None}
    return {"data": _profile_payload(profile)}


@router.patch("/users/me/profile")
def patch_profile(
    payload: ProfilePatchInput,
    session: Session = Depends(get_session),
    user: UserAccount = Depends(get_current_user_account),
) -> dict[str, object]:
    profile = session.get(UserProfile, user.id)
    if profile is None:
        return {"data": None}

    now = _utc_now()
    updates = payload.model_dump(exclude_unset=True)
    for field_name in (
        "age_years",
        "sex_for_calorie_estimate",
        "height_cm",
        "weight_kg",
        "target_weight_kg",
        "activity_level",
    ):
        if field_name in updates:
            setattr(profile, field_name, updates[field_name])
    if payload.dietary_preferences is not None:
        normalized_preferences: list[str] = []
        for preference in payload.dietary_preferences:
            cleaned = preference.strip().lower().replace(" ", "_")
            if len(cleaned) > 40:
                raise HTTPException(status_code=422, detail="dietary preference is too long")
            if cleaned and not cleaned.replace("_", "").isalnum():
                raise HTTPException(
                    status_code=422,
                    detail="dietary preference contains unsupported characters",
                )
            if cleaned:
                normalized_preferences.append(cleaned)
        profile.dietary_preferences_json = normalized_preferences
    if payload.allergies is not None:
        profile.allergies_json = [_allergy_payload(allergy) for allergy in payload.allergies]
    current_goal = session.scalar(select(UserGoal).where(UserGoal.user_id == user.id))
    if current_goal is not None:
        _raise_invalid_profile_goal(current_goal.goal, profile)
        calories, protein, carbs, fat, snapshot = _calculate_targets_from_profile(
            profile=profile,
            goal=current_goal.goal,
        )
        current_goal.calories_target = calories
        current_goal.protein_target = protein
        current_goal.carbs_target = carbs
        current_goal.fat_target = fat
        current_goal.target_weight_kg = profile.target_weight_kg
        current_goal.estimate_snapshot_json = snapshot
        current_goal.updated_at = now
    profile.updated_at = now
    session.commit()
    session.refresh(profile)
    if current_goal is not None:
        session.refresh(current_goal)
    return {
        "data": {
            "profile": _profile_payload(profile),
            "current_goal": _goal_payload(current_goal) if current_goal is not None else None,
        }
    }


@router.get("/users/me/goals/current")
def get_current_goal(
    session: Session = Depends(get_session),
    user: UserAccount = Depends(get_current_user_account),
) -> dict[str, dict[str, object] | None]:
    current_goal = session.scalar(select(UserGoal).where(UserGoal.user_id == user.id))
    if current_goal is None:
        return {"data": None}
    return {"data": _goal_payload(current_goal)}


@router.put("/users/me/goals/current")
def update_current_goal(
    payload: CurrentGoalUpdate,
    session: Session = Depends(get_session),
    user: UserAccount = Depends(get_current_user_account),
) -> dict[str, dict[str, object]]:
    profile = session.get(UserProfile, user.id)
    if profile is None:
        static_targets = GOAL_TARGETS[payload.goal]
        calories = static_targets["calories"]
        protein = static_targets["protein"]
        carbs = static_targets["carbs"]
        fat = static_targets["fat"]
        snapshot = None
        target_weight_kg = None
    else:
        _raise_invalid_profile_goal(payload.goal, profile)
        calories, protein, carbs, fat, snapshot = _calculate_targets_from_profile(
            profile=profile,
            goal=payload.goal,
        )
        target_weight_kg = profile.target_weight_kg
    current_goal = session.scalar(select(UserGoal).where(UserGoal.user_id == user.id))
    current_timestamp = _utc_now()

    if current_goal is None:
        current_goal = UserGoal(
            user_id=user.id,
            goal=payload.goal,
            calories_target=calories,
            protein_target=protein,
            carbs_target=carbs,
            fat_target=fat,
            target_weight_kg=target_weight_kg,
            estimate_snapshot_json=snapshot,
            source="profile" if profile is not None else "manual",
            active_from=current_timestamp,
            active_to=None,
            updated_at=current_timestamp,
        )
        session.add(current_goal)
    else:
        current_goal.goal = payload.goal
        current_goal.calories_target = calories
        current_goal.protein_target = protein
        current_goal.carbs_target = carbs
        current_goal.fat_target = fat
        current_goal.target_weight_kg = target_weight_kg
        current_goal.estimate_snapshot_json = snapshot
        current_goal.source = "profile" if profile is not None else "manual"
        current_goal.active_from = current_timestamp
        current_goal.active_to = None
        current_goal.updated_at = current_timestamp

    session.commit()
    session.refresh(current_goal)
    return {"data": _goal_payload(current_goal)}
