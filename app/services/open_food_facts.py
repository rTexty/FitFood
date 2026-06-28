from __future__ import annotations

from collections.abc import Mapping

import httpx

from app.services.normalization import normalize_name
from app.services.provider_models import (
    BarcodeProductSuggestion,
    NutritionPer100g,
    ProviderLookupError,
    ProviderServiceError,
)


class OpenFoodFactsService:
    def __init__(
        self,
        *,
        http_client: httpx.Client,
        base_url: str,
        user_agent: str,
    ) -> None:
        self._http_client = http_client
        self._base_url = base_url.rstrip("/")
        self._user_agent = user_agent

    def lookup_barcode(self, barcode: str) -> dict[str, object]:
        request_url = f"{self._base_url}/api/v3.6/product/{barcode}.json"

        try:
            response = self._http_client.get(
                request_url,
                params={
                    "fields": ",".join(
                        [
                            "code",
                            "product_name",
                            "product_name_en",
                            "generic_name",
                            "brands",
                            "categories_tags",
                            "product_quantity_unit",
                            "image_front_small_url",
                            "image_url",
                            "nutriments",
                            "status",
                        ]
                    )
                },
                headers={"User-Agent": self._user_agent},
                timeout=10.0,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise ProviderLookupError("Barcode not found") from exc
            raise ProviderServiceError("Open Food Facts request failed") from exc
        except httpx.HTTPError as exc:
            raise ProviderServiceError("Open Food Facts request failed") from exc

        payload = response.json()
        if payload.get("status") != 1:
            raise ProviderLookupError("Barcode not found")

        product = payload.get("product")
        if not isinstance(product, Mapping):
            raise ProviderLookupError("Barcode not found")

        display_name = self._resolve_display_name(product)
        if not display_name:
            raise ProviderLookupError("Barcode product name missing")

        category = self._resolve_category(product.get("categories_tags"))
        nutriments = product.get("nutriments")
        suggestion = BarcodeProductSuggestion(
            barcode=str(payload.get("code") or barcode),
            display_name=display_name,
            normalized_name=normalize_name(display_name),
            brand=self._clean_string(product.get("brands")),
            category=category,
            unit=self._clean_string(product.get("product_quantity_unit")) or "pcs",
            image_url=self._clean_string(product.get("image_front_small_url"))
            or self._clean_string(product.get("image_url")),
            nutrition_per_100g=self._nutrition_from_nutriments(nutriments),
        )
        return suggestion.model_dump()

    def _resolve_display_name(self, product: Mapping[str, object]) -> str | None:
        for field_name in ("product_name", "product_name_en", "generic_name"):
            value = self._clean_string(product.get(field_name))
            if value:
                return value
        return None

    def _resolve_category(self, raw_categories: object) -> str | None:
        if not isinstance(raw_categories, list) or not raw_categories:
            return None

        raw_value = raw_categories[0]
        if not isinstance(raw_value, str):
            return None

        cleaned_value = raw_value.split(":", 1)[-1].replace("-", " ").strip()
        return cleaned_value.title() if cleaned_value else None

    def _nutrition_from_nutriments(self, nutriments: object) -> NutritionPer100g:
        if not isinstance(nutriments, Mapping):
            return NutritionPer100g()

        return NutritionPer100g(
            calories=self._as_float(
                nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal")
            ),
            protein=self._as_float(nutriments.get("proteins_100g")),
            carbs=self._as_float(nutriments.get("carbohydrates_100g")),
            fat=self._as_float(nutriments.get("fat_100g")),
        )

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
