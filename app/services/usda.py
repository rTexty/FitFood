from __future__ import annotations

from collections.abc import Mapping

import httpx

from app.services.normalization import normalize_name
from app.services.provider_models import (
    NutritionPer100g,
    NutritionSearchSuggestion,
    ProviderServiceError,
)


class UsdaNutritionService:
    def __init__(
        self,
        *,
        http_client: httpx.Client,
        base_url: str,
        api_key: str,
    ) -> None:
        self._http_client = http_client
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key

    def search(self, query: str, limit: int) -> list[dict[str, object]]:
        request_url = f"{self._base_url}/fdc/v1/foods/search"

        try:
            response = self._http_client.get(
                request_url,
                params={
                    "api_key": self._api_key,
                    "query": query,
                    "pageSize": limit,
                },
                timeout=10.0,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderServiceError("USDA request failed") from exc

        payload = response.json()
        foods = payload.get("foods", [])
        if not isinstance(foods, list):
            return []

        suggestions: list[dict[str, object]] = []
        for food in foods:
            if not isinstance(food, Mapping):
                continue
            description = self._clean_string(food.get("description"))
            if not description:
                continue

            suggestion = NutritionSearchSuggestion(
                external_id=str(food.get("fdcId")),
                display_name=description,
                normalized_name=normalize_name(description),
                brand=self._clean_string(food.get("brandOwner"))
                or self._clean_string(food.get("brandName")),
                description=self._clean_string(food.get("dataType")),
                nutrition_per_100g=self._nutrition_from_food(food),
            )
            suggestions.append(suggestion.model_dump())
        return suggestions

    def _nutrition_from_food(self, food: Mapping[str, object]) -> NutritionPer100g:
        nutrients = food.get("foodNutrients", [])
        if not isinstance(nutrients, list):
            return NutritionPer100g()

        nutrient_values: dict[str, float] = {}
        for nutrient in nutrients:
            if not isinstance(nutrient, Mapping):
                continue

            raw_value = nutrient.get("value") or nutrient.get("amount")
            resolved_value = self._as_float(raw_value)
            if resolved_value is None:
                continue

            nutrient_number = self._clean_string(nutrient.get("nutrientNumber"))
            nutrient_name = self._clean_string(nutrient.get("nutrientName"))

            if nutrient_number == "208" or nutrient_name == "Energy":
                nutrient_values["calories"] = resolved_value
            elif nutrient_number == "203" or nutrient_name == "Protein":
                nutrient_values["protein"] = resolved_value
            elif nutrient_number == "205" or nutrient_name == "Carbohydrate, by difference":
                nutrient_values["carbs"] = resolved_value
            elif nutrient_number == "204" or nutrient_name == "Total lipid (fat)":
                nutrient_values["fat"] = resolved_value

        return NutritionPer100g(**nutrient_values)

    def _clean_string(self, value: object) -> str | None:
        if not isinstance(value, str):
            return None
        stripped_value = value.strip()
        return stripped_value or None

    def _as_float(self, value: object) -> float | None:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            stripped_value = value.strip()
            if not stripped_value:
                return None
            try:
                return float(stripped_value)
            except ValueError:
                return None
        return None
