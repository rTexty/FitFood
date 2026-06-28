from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Fridge, InventoryItem, Recipe


def build_recipe_matches(
    session: Session,
    *,
    fridge_id: int,
    goal: str = "all",
    max_missing: int = 3,
) -> list[dict[str, object]]:
    # Imported lazily to avoid a circular import with the recipes endpoint module.
    from app.api.v1.endpoints.recipes import (
        _ingredient_model_payload,
        _recipe_goals,
        _recipe_ingredients,
        _recipe_nutrition_summary,
        _recipe_payload,
    )

    fridge = session.get(Fridge, fridge_id)
    if fridge is None:
        return []

    inventory_items = session.scalars(
        select(InventoryItem).where(InventoryItem.fridge_id == fridge_id)
    ).all()
    available_names = {item.normalized_name for item in inventory_items}

    recipes = session.scalars(
        select(Recipe)
        .options(selectinload(Recipe.ingredients))
        .where(Recipe.is_active.is_(True))
        .order_by(Recipe.id.asc())
    ).all()

    matches: list[dict[str, object]] = []
    for recipe in recipes:
        recipe_goals = _recipe_goals(recipe)
        if goal != "all" and goal not in recipe_goals:
            continue

        ingredients = _recipe_ingredients(recipe)
        ingredient_names = [ingredient.normalized_name for ingredient in ingredients]
        available_ingredients = [
            _ingredient_model_payload(ingredient)
            for ingredient in ingredients
            if ingredient.normalized_name in available_names
        ]
        missing_ingredients = [
            _ingredient_model_payload(ingredient)
            for ingredient in ingredients
            if ingredient.normalized_name not in available_names and not ingredient.optional
        ]
        if len(missing_ingredients) > max_missing:
            continue

        match_score = 0
        if ingredient_names:
            match_score = round((len(available_ingredients) / len(ingredient_names)) * 100)

        matches.append(
            {
                "recipe": _recipe_payload(recipe),
                "match_score": match_score,
                "available_ingredients": available_ingredients,
                "missing_ingredients": missing_ingredients,
                "shopping_list_ready": len(missing_ingredients) > 0,
                "nutrition_summary": _recipe_nutrition_summary(recipe),
            }
        )

    matches.sort(
        key=lambda item: (
            len(item["missing_ingredients"]),
            -int(item["match_score"]),
            str(item["recipe"]["name"]),
        )
    )
    return matches
