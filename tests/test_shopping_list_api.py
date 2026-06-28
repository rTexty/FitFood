from __future__ import annotations

from fastapi.testclient import TestClient


def test_missing_recipe_ingredients_can_be_added_to_active_shopping_list(
    client: TestClient,
    fridge_id: int,
) -> None:
    create_response = client.post(
        "/api/v1/recipe-matches/2/shopping-list-items",
        params={"fridge_id": fridge_id},
    )

    assert create_response.status_code == 201
    payload = create_response.json()["data"]
    assert payload["created_count"] == 1
    assert payload["merged_count"] == 0
    assert payload["items"][0]["display_name"] == "Brown Rice"
    assert payload["items"][0]["normalized_name"] == "brown rice"
    assert payload["items"][0]["source_recipe_id"] == 2

    list_response = client.get("/api/v1/shopping-list-items")
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert list_payload["meta"]["total"] == 1
    assert list_payload["data"][0]["display_name"] == "Brown Rice"
    assert list_payload["data"][0]["checked"] is False


def test_shopping_list_items_can_be_updated_and_deleted(
    client: TestClient,
    fridge_id: int,
) -> None:
    create_response = client.post(
        "/api/v1/recipe-matches/2/shopping-list-items",
        params={"fridge_id": fridge_id},
    )
    item_id = create_response.json()["data"]["items"][0]["id"]

    update_response = client.patch(
        f"/api/v1/shopping-list-items/{item_id}",
        json={"checked": True, "quantity": 2},
    )

    assert update_response.status_code == 200
    updated_item = update_response.json()["data"]
    assert updated_item["id"] == item_id
    assert updated_item["checked"] is True
    assert updated_item["quantity"] == 2

    delete_response = client.delete(f"/api/v1/shopping-list-items/{item_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["data"] == {"id": item_id, "deleted": True}

    list_response = client.get("/api/v1/shopping-list-items")
    assert list_response.status_code == 200
    assert list_response.json()["data"] == []
    assert list_response.json()["meta"]["total"] == 0
