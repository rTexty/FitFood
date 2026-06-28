from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone
from string import ascii_lowercase

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Recipe, RecipeIngredient
from app.services.provider_models import (
    ExternalRecipeSuggestion,
    ProviderLookupError,
    ProviderServiceError,
)
from app.services.themealdb import ThemealdbRecipeService

DEFAULT_THEMEALDB_CATALOG_LETTERS = tuple(ascii_lowercase)
SUPPORTED_RECIPE_GOALS = ("lose", "maintain", "gain")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_external_recipe_or_none(
    session: Session,
    *,
    provider: str,
    external_id: str,
) -> Recipe | None:
    return session.scalar(
        select(Recipe)
        .options(selectinload(Recipe.ingredients))
        .where(Recipe.source_provider == provider, Recipe.external_id == external_id)
    )


def _is_complete_suggestion(suggestion: ExternalRecipeSuggestion) -> bool:
    return bool(suggestion.instructions and suggestion.ingredients)


def _hero_emoji_for_suggestion(suggestion: ExternalRecipeSuggestion) -> str:
    category = (suggestion.category or "").strip().lower()
    if category in {"breakfast", "starter"}:
        return "🍳"
    if category in {"vegetarian", "vegan", "side"}:
        return "🥗"
    if category in {"seafood"}:
        return "🐟"
    if category in {"dessert"}:
        return "🍓"
    if category in {"pasta"}:
        return "🍝"
    return "🍽️"


def _tags_for_suggestion(suggestion: ExternalRecipeSuggestion) -> list[str]:
    tags = [
        value
        for value in [suggestion.category, suggestion.area, *suggestion.tags]
        if value and value.strip()
    ]
    seen: set[str] = set()
    deduped_tags: list[str] = []
    for tag in tags:
        normalized_tag = tag.casefold()
        if normalized_tag in seen:
            continue
        seen.add(normalized_tag)
        deduped_tags.append(tag)
    return deduped_tags or ["Recipe"]


def persist_external_recipe(
    session: Session,
    *,
    suggestion: ExternalRecipeSuggestion,
    goal: str = "maintain",
    goals: Iterable[str] | None = None,
) -> tuple[Recipe, bool]:
    existing_recipe = get_external_recipe_or_none(
        session,
        provider=suggestion.source_provider,
        external_id=suggestion.external_id,
    )
    if existing_recipe is not None:
        return existing_recipe, False

    recipe_goals = list(goals or SUPPORTED_RECIPE_GOALS)
    primary_goal = goal if goal in recipe_goals else recipe_goals[0]
    recipe = Recipe(
        name=suggestion.name,
        goal=primary_goal,
        servings=1,
        minutes=30,
        goals_json=recipe_goals,
        hero_emoji=_hero_emoji_for_suggestion(suggestion),
        tags_json=_tags_for_suggestion(suggestion),
        source="external",
        source_provider=suggestion.source_provider,
        external_id=suggestion.external_id,
        source_url=suggestion.source_url,
        image_url=suggestion.image_url,
        attribution_json={
            "provider": suggestion.source_provider,
            "category": suggestion.category,
            "area": suggestion.area,
            "tags": suggestion.tags,
        },
        instructions_json=list(suggestion.instructions),
        nutrition_snapshot_json={"calories": 0, "protein": 0, "carbs": 0, "fat": 0},
        last_synced_at=_utc_now(),
    )
    recipe.ingredients = [
        RecipeIngredient(
            display_name=ingredient.display_name,
            normalized_name=ingredient.normalized_name,
            raw_name=ingredient.raw_name,
            quantity=ingredient.quantity,
            unit=ingredient.unit,
            sort_order=index,
            source=suggestion.source_provider,
        )
        for index, ingredient in enumerate(suggestion.ingredients)
    ]
    session.add(recipe)
    session.flush()
    return recipe, True


def save_external_search_results(
    session: Session,
    themealdb_service: ThemealdbRecipeService,
    provider_results: list[dict[str, object]],
    *,
    limit: int,
    goal: str = "maintain",
) -> int:
    imported_count = 0
    for item in provider_results[:limit]:
        try:
            suggestion = ExternalRecipeSuggestion.model_validate(item)
        except ValueError:
            continue

        if not _is_complete_suggestion(suggestion):
            try:
                suggestion = ExternalRecipeSuggestion.model_validate(
                    themealdb_service.lookup_recipe(suggestion.external_id)
                )
            except (ProviderLookupError, ProviderServiceError, ValueError):
                continue

        _, created = persist_external_recipe(session, suggestion=suggestion, goal=goal)
        if created:
            imported_count += 1
    return imported_count


def themealdb_catalog_count(session: Session) -> int:
    return int(
        session.scalar(
            select(func.count(Recipe.id)).where(
                Recipe.source_provider == "themealdb",
                Recipe.external_id.is_not(None),
                Recipe.is_active.is_(True),
            )
        )
        or 0
    )


def import_themealdb_catalog(
    session: Session,
    themealdb_service: ThemealdbRecipeService,
    *,
    target_count: int,
    first_letters: Iterable[str] = DEFAULT_THEMEALDB_CATALOG_LETTERS,
) -> int:
    remaining_count = max(0, target_count - themealdb_catalog_count(session))
    if remaining_count == 0:
        return 0

    imported_count = 0
    for raw_letter in first_letters:
        letter = raw_letter.strip().lower()[:1]
        if not letter or imported_count >= remaining_count:
            break

        provider_results = themealdb_service.list_by_first_letter(
            letter,
            limit=max(remaining_count - imported_count, 1),
        )
        imported_count += save_external_search_results(
            session,
            themealdb_service,
            provider_results,
            limit=max(remaining_count - imported_count, 1),
        )

    return imported_count
