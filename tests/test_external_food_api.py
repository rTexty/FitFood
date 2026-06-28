from __future__ import annotations

from fastapi.testclient import TestClient


class FakeOpenFoodFactsService:
    def lookup_barcode(self, barcode: str) -> dict[str, object]:
        return {
            "barcode": barcode,
            "display_name": "Protein Yogurt",
            "normalized_name": "protein yogurt",
            "brand": "FitFood Labs",
            "category": "Dairy",
            "unit": "cup",
            "image_url": "https://example.com/yogurt.jpg",
            "nutrition_per_100g": {
                "calories": 90.0,
                "protein": 11.0,
                "carbs": 6.0,
                "fat": 1.5,
            },
            "provider": "open_food_facts",
        }


class FakeUsdaService:
    def search(self, query: str, limit: int) -> list[dict[str, object]]:
        assert query == "cheddar cheese"
        assert limit == 10
        return [
            {
                "external_id": "12345",
                "display_name": "Cheddar Cheese",
                "normalized_name": "cheddar cheese",
                "brand": None,
                "description": "USDA Foundation Foods",
                "nutrition_per_100g": {
                    "calories": 403.0,
                    "protein": 24.9,
                    "carbs": 1.3,
                    "fat": 33.1,
                },
                "provider": "usda",
            }
        ]


def test_barcode_lookup_returns_normalized_product_suggestion(
    client: TestClient,
) -> None:
    client.app.state.open_food_facts_service = FakeOpenFoodFactsService()

    response = client.get("/api/v1/imports/barcode/1234567890123")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["barcode"] == "1234567890123"
    assert payload["display_name"] == "Protein Yogurt"
    assert payload["normalized_name"] == "protein yogurt"
    assert payload["provider"] == "open_food_facts"
    assert payload["nutrition_per_100g"]["protein"] == 11.0


def test_barcode_lookup_rejects_invalid_barcode_before_provider_call(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/imports/barcode/not-a-barcode")

    assert response.status_code == 422


def test_barcode_import_creates_inventory_item_from_provider_data(
    client: TestClient,
    fridge_id: int,
) -> None:
    client.app.state.open_food_facts_service = FakeOpenFoodFactsService()

    response = client.post(
        "/api/v1/imports/barcode/1234567890123",
        json={
            "fridge_id": fridge_id,
            "display_name": "Edited Protein Yogurt",
            "quantity": 2,
            "location": "fridge",
            "purchase_date": "2026-06-20",
            "expiration_date": "2026-07-04",
            "expiration_date_source": "user",
            "expiration_confidence": 1,
        },
    )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["fridge_id"] == fridge_id
    assert payload["display_name"] == "Edited Protein Yogurt"
    assert payload["normalized_name"] == "edited protein yogurt"
    assert payload["quantity"] == 2
    assert payload["unit"] == "cup"
    assert payload["source"] == "barcode"
    assert payload["source_provider"] == "open_food_facts"
    assert payload["purchase_date"] == "2026-06-20"
    assert payload["expiration_date"] == "2026-07-04"
    assert payload["expiration_date_source"] == "user"
    assert payload["expiration_confidence"] == 1


def test_barcode_import_rejects_overlong_category(
    client: TestClient,
    fridge_id: int,
) -> None:
    client.app.state.open_food_facts_service = FakeOpenFoodFactsService()

    response = client.post(
        "/api/v1/imports/barcode/1234567890123",
        json={
            "fridge_id": fridge_id,
            "category": "x" * 51,
        },
    )

    assert response.status_code == 422


def test_nutrition_search_returns_normalized_usda_suggestions(client: TestClient) -> None:
    client.app.state.usda_service = FakeUsdaService()

    response = client.get("/api/v1/nutrition/search", params={"q": "cheddar cheese"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["total"] == 1
    assert payload["data"][0]["display_name"] == "Cheddar Cheese"
    assert payload["data"][0]["provider"] == "usda"
    assert payload["data"][0]["nutrition_per_100g"]["fat"] == 33.1
