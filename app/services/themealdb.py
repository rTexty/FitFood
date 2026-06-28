from __future__ import annotations

from collections.abc import Mapping
from fractions import Fraction

import httpx

from app.services.cache.provider_cache import PersistentProviderCache
from app.services.normalization import normalize_name
from app.services.provider_models import (
    ExternalRecipeIngredientSuggestion,
    ExternalRecipeSuggestion,
    ProviderLookupError,
    ProviderServiceError,
)


class ThemealdbRecipeService:
    def __init__(
        self,
        *,
        http_client: httpx.Client,
        base_url: str,
        api_key: str,
        cache: PersistentProviderCache,
        cache_ttl_seconds: int = 86_400,
    ) -> None:
        self._http_client = http_client
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key.strip("/") or "1"
        self._cache = cache
        self._cache_ttl_seconds = cache_ttl_seconds

    def search_by_name(self, query: str, limit: int) -> list[dict[str, object]]:
        normalized_query = query.strip()
        if not normalized_query:
            return []

        cached_response = self._cache.get_or_create_json(
            provider="themealdb",
            resource_type="recipe_search",
            request_payload={"query": normalized_query, "limit": limit},
            ttl_seconds=self._cache_ttl_seconds,
            producer=lambda: self._request_json(
                "search.php",
                params={"s": normalized_query},
            ),
        )
        return self._suggestions_from_payload(cached_response)[:limit]

    def list_by_first_letter(self, first_letter: str, limit: int) -> list[dict[str, object]]:
        normalized_letter = first_letter.strip().lower()[:1]
        if not normalized_letter or not normalized_letter.isalpha():
            return []

        cached_response = self._cache.get_or_create_json(
            provider="themealdb",
            resource_type="recipe_catalog_letter",
            request_payload={"first_letter": normalized_letter, "limit": limit},
            ttl_seconds=self._cache_ttl_seconds,
            producer=lambda: self._request_json(
                "search.php",
                params={"f": normalized_letter},
            ),
        )
        return self._suggestions_from_payload(cached_response)[:limit]

    def filter_by_ingredient(self, ingredient: str, limit: int) -> list[dict[str, object]]:
        normalized_ingredient = normalize_name(ingredient).replace(" ", "_")
        if not normalized_ingredient:
            return []

        cached_response = self._cache.get_or_create_json(
            provider="themealdb",
            resource_type="recipe_filter_ingredient",
            request_payload={"ingredient": normalized_ingredient, "limit": limit},
            ttl_seconds=self._cache_ttl_seconds,
            producer=lambda: self._request_json(
                "filter.php",
                params={"i": normalized_ingredient},
            ),
        )
        return self._suggestions_from_payload(cached_response)[:limit]

    def lookup_recipe(self, external_id: str) -> dict[str, object]:
        normalized_id = external_id.strip()
        if not normalized_id:
            raise ProviderLookupError("Recipe id is required")

        cached_response = self._cache.get_or_create_json(
            provider="themealdb",
            resource_type="recipe_lookup",
            request_payload={"external_id": normalized_id},
            ttl_seconds=self._cache_ttl_seconds,
            producer=lambda: self._request_json(
                "lookup.php",
                params={"i": normalized_id},
            ),
        )
        suggestions = self._suggestions_from_payload(cached_response)
        if not suggestions:
            raise ProviderLookupError("Recipe not found")
        return suggestions[0]

    def _request_json(self, endpoint: str, *, params: dict[str, str]) -> dict[str, object]:
        request_url = f"{self._base_url}/{self._api_key}/{endpoint}"
        try:
            response = self._http_client.get(request_url, params=params, timeout=10.0)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise ProviderLookupError("Recipe not found") from exc
            raise ProviderServiceError("TheMealDB request failed") from exc
        except httpx.HTTPError as exc:
            raise ProviderServiceError("TheMealDB request failed") from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderServiceError("TheMealDB returned invalid JSON") from exc
        return payload if isinstance(payload, dict) else {"meals": []}

    def _suggestions_from_payload(self, payload: object) -> list[dict[str, object]]:
        if not isinstance(payload, Mapping):
            return []

        meals = payload.get("meals") or []
        if not isinstance(meals, list):
            return []

        suggestions: list[dict[str, object]] = []
        for meal in meals:
            if not isinstance(meal, Mapping):
                continue
            suggestion = self._suggestion_from_meal(meal)
            if suggestion is not None:
                suggestions.append(suggestion.model_dump())
        return suggestions

    def _suggestion_from_meal(
        self,
        meal: Mapping[str, object],
    ) -> ExternalRecipeSuggestion | None:
        external_id = self._clean_string(meal.get("idMeal"))
        name = self._clean_string(meal.get("strMeal"))
        if not external_id or not name:
            return None

        return ExternalRecipeSuggestion(
            external_id=external_id,
            name=name,
            source_provider="themealdb",
            source_url=self._clean_string(meal.get("strSource"))
            or f"https://www.themealdb.com/meal/{external_id}",
            image_url=self._clean_string(meal.get("strMealThumb")),
            category=self._clean_string(meal.get("strCategory")),
            area=self._clean_string(meal.get("strArea")),
            tags=self._tags_from_meal(meal),
            instructions=self._instructions_from_meal(meal),
            ingredients=self._ingredients_from_meal(meal),
            provider="themealdb",
        )

    def _ingredients_from_meal(
        self,
        meal: Mapping[str, object],
    ) -> list[ExternalRecipeIngredientSuggestion]:
        ingredients: list[ExternalRecipeIngredientSuggestion] = []
        for index in range(1, 21):
            raw_ingredient = self._clean_string(meal.get(f"strIngredient{index}"))
            if not raw_ingredient:
                continue

            measure = self._clean_string(meal.get(f"strMeasure{index}"))
            quantity, unit = self._quantity_and_unit_from_measure(measure)
            display_name = raw_ingredient.title()
            raw_name = f"{measure} {raw_ingredient}".strip() if measure else raw_ingredient
            ingredients.append(
                ExternalRecipeIngredientSuggestion(
                    display_name=display_name,
                    normalized_name=normalize_name(raw_ingredient),
                    raw_name=raw_name,
                    quantity=quantity,
                    unit=unit,
                )
            )
        return ingredients

    def _instructions_from_meal(self, meal: Mapping[str, object]) -> list[str]:
        raw_instructions = self._clean_string(meal.get("strInstructions"))
        if not raw_instructions:
            return []

        return [
            step.strip()
            for step in raw_instructions.replace("\r", "\n").split("\n")
            if step.strip()
        ]

    def _tags_from_meal(self, meal: Mapping[str, object]) -> list[str]:
        raw_tags = self._clean_string(meal.get("strTags"))
        if not raw_tags:
            return []
        return [tag.strip() for tag in raw_tags.split(",") if tag.strip()]

    def _quantity_and_unit_from_measure(self, measure: str | None) -> tuple[float | None, str | None]:
        if not measure:
            return None, None

        parts = measure.split(maxsplit=1)
        if not parts:
            return None, None

        quantity = self._parse_quantity(parts[0])
        if quantity is None:
            return None, measure[:30]

        unit = parts[1][:30] if len(parts) > 1 else None
        return quantity, unit

    def _parse_quantity(self, value: str) -> float | None:
        try:
            return float(Fraction(value))
        except (ValueError, ZeroDivisionError):
            return None

    def _clean_string(self, value: object) -> str | None:
        if not isinstance(value, str):
            return None
        stripped_value = value.strip()
        return stripped_value or None
