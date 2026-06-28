from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import Recipe


def test_meal_plans_can_be_created_and_listed(
    client: TestClient,
    fridge_id: int,
) -> None:
    create_response = client.post(
        "/api/v1/meal-plans",
        json={"fridge_id": fridge_id, "span_days": 3},
    )

    assert create_response.status_code == 201
    payload = create_response.json()["data"]
    assert payload["fridge_id"] == fridge_id
    assert payload["span_days"] == 3
    assert payload["status"] == "draft"
    assert payload["starts_on"]
    assert payload["nutrition_summary"]["calories"] > 0
    assert payload["entries"]
    assert payload["entries"][0]["recipe"]["name"]
    assert payload["entries"][0]["scheduled_for"]
    assert payload["generated_at"]

    list_response = client.get("/api/v1/meal-plans")
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert list_payload["meta"]["total"] == 1
    assert list_payload["data"][0]["id"] == payload["id"]


def test_meal_plan_entries_can_be_added_with_recipe_nutrition_snapshot(
    client: TestClient,
    fridge_id: int,
) -> None:
    create_response = client.post(
        "/api/v1/meal-plans",
        json={"fridge_id": fridge_id, "span_days": 7},
    )
    meal_plan_id = create_response.json()["data"]["id"]

    entry_response = client.post(
        f"/api/v1/meal-plans/{meal_plan_id}/entries",
        json={
            "day_index": 0,
            "meal_type": "breakfast",
            "recipe_id": 1,
            "servings": 1.5,
        },
    )

    assert entry_response.status_code == 201
    payload = entry_response.json()["data"]
    assert payload["meal_plan_id"] == meal_plan_id
    assert payload["recipe_id"] == 1
    assert payload["meal_type"] == "breakfast"
    assert payload["servings"] == 1.5
    assert payload["nutrition_snapshot"]["calories"] > 0
    assert payload["nutrition_snapshot"]["protein"] > 0


def test_meal_plan_excludes_snack_and_uses_three_meals(
    client: TestClient,
    fridge_id: int,
) -> None:
    response = client.post(
        "/api/v1/meal-plans",
        json={"fridge_id": fridge_id, "span_days": 2},
    )
    assert response.status_code == 201
    entries = response.json()["data"]["entries"]
    meal_types = {entry["meal_type"] for entry in entries}
    assert meal_types == {"breakfast", "lunch", "dinner"}
    assert "snack" not in meal_types
    # 2 days * 3 meals
    assert len(entries) == 6


def test_meal_plan_returns_non_empty_entries(
    client: TestClient,
    fridge_id: int,
) -> None:
    response = client.post(
        "/api/v1/meal-plans",
        json={"fridge_id": fridge_id, "span_days": 2},
    )
    assert response.status_code == 201
    assert len(response.json()["data"]["entries"]) > 0


def test_meal_plan_uses_persisted_recipe_nutrition_snapshot(
    client: TestClient,
    fridge_id: int,
) -> None:
    session_factory = client.app.state.session_factory
    with session_factory() as session:
        recipe = session.scalar(select(Recipe).where(Recipe.name == "Spinach Omelet"))
        assert recipe is not None
        recipe.nutrition_snapshot_json = {
            "calories": 123,
            "protein": 45,
            "carbs": 6,
            "fat": 7,
        }
        recipe.goals_json = ["maintain"]
        session.commit()
        recipe_id = recipe.id

    create_response = client.post(
        "/api/v1/meal-plans",
        json={"fridge_id": fridge_id, "span_days": 1, "goal": "maintain"},
    )

    assert create_response.status_code == 201
    payload = create_response.json()["data"]
    spinach_entry = next(
        entry for entry in payload["entries"] if entry["recipe_id"] == recipe_id
    )
    assert spinach_entry["nutrition_snapshot"] == {
        "calories": 123,
        "protein": 45,
        "carbs": 6,
        "fat": 7,
    }
