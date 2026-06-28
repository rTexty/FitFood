from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.v1.deps import get_session, get_themealdb_service
from app.api.v1.pagination import build_list_meta
from app.services.recipes.matching import build_recipe_matches
from app.db.models import Fridge, InventoryItem, Recipe, RecipeIngredient
from app.services.normalization import normalize_name
from app.services.provider_models import (
    ExternalRecipeSuggestion,
    ProviderLookupError,
    ProviderServiceError,
)
from app.services.themealdb_catalog import (
    get_external_recipe_or_none,
    persist_external_recipe,
    save_external_search_results,
)
from app.services.themealdb import ThemealdbRecipeService


router = APIRouter()
SUPPORTED_GOALS = ("lose", "maintain", "gain")


class ExternalRecipeImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["themealdb"]
    external_id: str = Field(min_length=1, max_length=120)
    goal: Literal["lose", "maintain", "gain"] = "maintain"


@router.get("/recipes")
def list_recipes(session: Session = Depends(get_session)) -> dict[str, object]:
    recipes = session.scalars(
        select(Recipe)
        .options(selectinload(Recipe.ingredients))
        .where(Recipe.is_active.is_(True))
        .order_by(Recipe.name.asc())
    ).all()

    return {
        "data": [_recipe_payload(recipe) for recipe in recipes],
        "meta": build_list_meta(len(recipes)),
    }


def _ingredient_payload(
    display_name: str,
    normalized_name: str,
    *,
    quantity: float | None = None,
    unit: str | None = None,
    raw_name: str | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {"name": display_name, "normalized_name": normalized_name}
    if quantity is not None:
        payload["quantity"] = quantity
    if unit:
        payload["unit"] = unit
    if raw_name:
        payload["raw_name"] = raw_name
    return payload


def _ingredient_model_payload(ingredient: RecipeIngredient) -> dict[str, object]:
    return _ingredient_payload(
        ingredient.display_name,
        ingredient.normalized_name,
        quantity=ingredient.quantity,
        unit=ingredient.unit,
        raw_name=ingredient.raw_name,
    )


def _recipe_goals(recipe: Recipe) -> list[str]:
    configured_goals = recipe.goals_json
    if isinstance(configured_goals, list) and configured_goals:
        return [str(goal) for goal in configured_goals]
    if recipe.goal == "any":
        return list(SUPPORTED_GOALS)
    return [recipe.goal]


def _recipe_tags(recipe: Recipe) -> list[str]:
    if isinstance(recipe.tags_json, list) and recipe.tags_json:
        return [str(tag) for tag in recipe.tags_json if str(tag).strip()]
    return ["Recipe"]


def _recipe_nutrition_summary(recipe: Recipe) -> dict[str, float]:
    persisted_nutrition = recipe.nutrition_snapshot_json
    if isinstance(persisted_nutrition, dict):
        return {
            metric: float(persisted_nutrition.get(metric) or 0)
            for metric in ("calories", "protein", "carbs", "fat")
        }

    return {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}


def _recipe_instructions(recipe: Recipe) -> list[str]:
    if recipe.instructions_json:
        return [str(step) for step in recipe.instructions_json if str(step).strip()]

    return ["Prepare the ingredients.", "Cook until done and serve."]


def _recipe_ingredients(recipe: Recipe) -> list[RecipeIngredient]:
    return sorted(
        recipe.ingredients,
        key=lambda ingredient: (ingredient.sort_order, ingredient.id),
    )


def _recipe_payload(recipe: Recipe) -> dict[str, object]:
    nutrition_summary = _recipe_nutrition_summary(recipe)
    goals = _recipe_goals(recipe)
    tags = _recipe_tags(recipe)
    instructions = _recipe_instructions(recipe)

    return {
        "id": recipe.id,
        "name": recipe.name,
        "hero_emoji": recipe.hero_emoji or "🍽️",
        "image_url": recipe.image_url,
        "source": recipe.source,
        "source_provider": recipe.source_provider,
        "external_id": recipe.external_id,
        "minutes": recipe.minutes,
        "servings": recipe.servings,
        "tags": tags,
        "goals": goals,
        "nutrition_summary": nutrition_summary,
        "ingredients": [
            _ingredient_model_payload(ingredient) for ingredient in _recipe_ingredients(recipe)
        ],
        "instructions": instructions,
    }


def _saved_recipe_search_query(
    *,
    q: str | None,
    ingredient: str | None,
) -> select[tuple[Recipe]]:
    query = (
        select(Recipe)
        .options(selectinload(Recipe.ingredients))
        .where(Recipe.is_active.is_(True))
        .order_by(Recipe.name.asc())
    )
    if q is not None:
        normalized_query = q.strip().lower()
        return query.where(func.lower(Recipe.name).contains(normalized_query))

    normalized_ingredient = normalize_name(str(ingredient))
    return (
        query.join(Recipe.ingredients)
        .where(RecipeIngredient.normalized_name.contains(normalized_ingredient))
        .distinct()
    )


def _saved_recipe_search_results(
    session: Session,
    *,
    q: str | None,
    ingredient: str | None,
    limit: int,
) -> list[dict[str, object]]:
    recipes = session.scalars(
        _saved_recipe_search_query(q=q, ingredient=ingredient).limit(limit)
    ).all()
    return [_recipe_payload(recipe) for recipe in recipes]


@router.get("/recipes/search")
def search_external_recipes(
    q: str | None = Query(default=None, min_length=1, max_length=120),
    ingredient: str | None = Query(default=None, min_length=1, max_length=120),
    limit: int = Query(default=10, ge=1, le=25),
    session: Session = Depends(get_session),
    themealdb_service: ThemealdbRecipeService = Depends(get_themealdb_service),
) -> dict[str, object]:
    if q is None and ingredient is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="q or ingredient is required",
        )

    saved_results = _saved_recipe_search_results(
        session,
        q=q,
        ingredient=ingredient,
        limit=limit,
    )
    if saved_results:
        return {"data": saved_results, "meta": build_list_meta(len(saved_results))}

    try:
        if q is not None:
            provider_data = themealdb_service.search_by_name(q, limit=limit)
        else:
            provider_data = themealdb_service.filter_by_ingredient(str(ingredient), limit=limit)
    except ProviderServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    save_external_search_results(
        session,
        themealdb_service,
        provider_data,
        limit=limit,
    )
    session.commit()
    data = _saved_recipe_search_results(session, q=q, ingredient=ingredient, limit=limit)
    return {"data": data, "meta": build_list_meta(len(data))}

@router.post("/recipes/import", status_code=status.HTTP_201_CREATED)
def import_external_recipe(
    payload: ExternalRecipeImportRequest,
    response: Response,
    session: Session = Depends(get_session),
    themealdb_service: ThemealdbRecipeService = Depends(get_themealdb_service),
) -> dict[str, dict[str, object]]:
    existing_recipe = get_external_recipe_or_none(
        session,
        provider=payload.provider,
        external_id=payload.external_id,
    )
    if existing_recipe is not None:
        response.status_code = status.HTTP_200_OK
        return {"data": _recipe_payload(existing_recipe)}

    try:
        suggestion = ExternalRecipeSuggestion.model_validate(
            themealdb_service.lookup_recipe(payload.external_id)
        )
    except ProviderLookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProviderServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    recipe, _ = persist_external_recipe(session, suggestion=suggestion, goal=payload.goal)
    session.commit()
    return {"data": _recipe_payload(recipe)}


@router.get("/fridges/{fridge_id}/recipe-matches")
def list_recipe_matches(
    fridge_id: int,
    max_missing: int = Query(default=3, ge=0, le=20),
    goal: Literal["lose", "maintain", "gain", "all"] = Query(default="all"),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    matches = build_recipe_matches(
        session,
        fridge_id=fridge_id,
        goal=goal,
        max_missing=max_missing,
    )
    return {"data": matches, "meta": build_list_meta(len(matches))}
