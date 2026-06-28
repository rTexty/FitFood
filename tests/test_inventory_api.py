from fastapi.testclient import TestClient


def test_health_endpoint_uses_v1_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"data": {"status": "ok"}}


def test_list_fridges_returns_seeded_kitchen(client: TestClient) -> None:
    response = client.get("/api/v1/fridges")

    assert response.status_code == 200

    payload = response.json()
    assert payload["meta"]["total"] >= 1
    assert payload["meta"]["page"] == 1
    assert payload["meta"]["per_page"] == len(payload["data"])
    assert payload["data"][0]["name"] == "Starter Kitchen"


def test_inventory_list_and_expiring_items_return_seeded_data(
    client: TestClient,
    fridge_id: int,
) -> None:
    list_response = client.get(f"/api/v1/fridges/{fridge_id}/inventory-items")
    assert list_response.status_code == 200

    inventory_payload = list_response.json()
    inventory_names = {item["display_name"] for item in inventory_payload["data"]}
    assert {"Greek Yogurt", "Baby Spinach", "Chicken Breast"}.issubset(
        inventory_names
    )
    assert inventory_payload["meta"]["total"] >= 4
    assert inventory_payload["meta"]["page"] == 1
    assert inventory_payload["meta"]["per_page"] == len(inventory_payload["data"])

    response = client.get(
        f"/api/v1/fridges/{fridge_id}/inventory-items/expiring",
        params={"days": 3},
    )

    assert response.status_code == 200

    expiring_names = {item["display_name"] for item in response.json()["data"]}
    assert {"Greek Yogurt", "Baby Spinach", "Avocado"}.issubset(expiring_names)
    expiring_meta = response.json()["meta"]
    assert expiring_meta["page"] == 1
    assert expiring_meta["per_page"] == len(response.json()["data"])
    assert expiring_meta["total"] == len(response.json()["data"])


def test_expiring_inventory_items_enforce_day_bounds(
    client: TestClient,
    fridge_id: int,
) -> None:
    response = client.get(
        f"/api/v1/fridges/{fridge_id}/inventory-items/expiring",
        params={"days": 366},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_delete_inventory_item_removes_it(client: TestClient, fridge_id: int) -> None:
    list_response = client.get(f"/api/v1/fridges/{fridge_id}/inventory-items")
    assert list_response.status_code == 200

    item_to_delete = next(
        item for item in list_response.json()["data"] if item["display_name"] == "Avocado"
    )

    delete_response = client.delete(f"/api/v1/inventory-items/{item_to_delete['id']}")
    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["deleted"] is True
    assert delete_response.json()["data"]["id"] == item_to_delete["id"]

    refreshed_response = client.get(f"/api/v1/fridges/{fridge_id}/inventory-items")
    remaining_names = {
        item["display_name"] for item in refreshed_response.json()["data"]
    }
    assert "Avocado" not in remaining_names


def test_demo_receipt_import_adds_inventory_items(
    client: TestClient,
    fridge_id: int,
) -> None:
    import_response = client.post("/api/v1/imports/receipt/demo")
    assert import_response.status_code == 201

    payload = import_response.json()["data"]
    assert payload["summary"]["fridge_id"] == fridge_id
    assert payload["summary"]["imported_count"] >= 2
    assert payload["summary"]["source"] == "demo"
    imported_names = {item["display_name"] for item in payload["items"]}
    assert "Bananas" in imported_names

    list_response = client.get(f"/api/v1/fridges/{fridge_id}/inventory-items")
    inventory_names = {item["display_name"] for item in list_response.json()["data"]}
    assert {"Bananas", "Rolled Oats"}.issubset(inventory_names)


def test_manual_inventory_item_can_be_created(client: TestClient, fridge_id: int) -> None:
    create_response = client.post(
        f"/api/v1/fridges/{fridge_id}/inventory-items",
        json={
            "display_name": "Cottage Cheese",
            "quantity": 1,
            "unit": "tub",
            "location": "fridge",
            "category": "Dairy",
            "purchase_date": "2026-06-23",
            "expiration_date": "2026-06-30",
        },
    )

    assert create_response.status_code == 201
    payload = create_response.json()["data"]
    assert payload["fridge_id"] == fridge_id
    assert payload["display_name"] == "Cottage Cheese"
    assert payload["normalized_name"] == "cottage cheese"
    assert payload["quantity"] == 1
    assert payload["unit"] == "tub"
    assert payload["source"] == "manual"
    assert payload["expiration_date"] == "2026-06-30"

    list_response = client.get(f"/api/v1/fridges/{fridge_id}/inventory-items")
    inventory_names = {item["display_name"] for item in list_response.json()["data"]}
    assert "Cottage Cheese" in inventory_names


def test_inventory_item_can_be_updated(client: TestClient, fridge_id: int) -> None:
    list_response = client.get(f"/api/v1/fridges/{fridge_id}/inventory-items")
    assert list_response.status_code == 200
    item_to_update = next(
        item for item in list_response.json()["data"] if item["display_name"] == "Avocado"
    )

    update_response = client.patch(
        f"/api/v1/inventory-items/{item_to_update['id']}",
        json={
            "display_name": "Ripe Avocado",
            "quantity": 2,
            "unit": "count",
            "location": "pantry",
            "category": "Fruit",
            "expiration_date": "2026-07-02",
        },
    )

    assert update_response.status_code == 200
    payload = update_response.json()["data"]
    assert payload["display_name"] == "Ripe Avocado"
    assert payload["normalized_name"] == "ripe avocado"
    assert payload["quantity"] == 2
    assert payload["location"] == "pantry"
    assert payload["expiration_date"] == "2026-07-02"
    assert payload["expiration_date_source"] == "user"

    refreshed_response = client.get(f"/api/v1/fridges/{fridge_id}/inventory-items")
    refreshed_item = next(
        item for item in refreshed_response.json()["data"] if item["id"] == item_to_update["id"]
    )
    assert refreshed_item["display_name"] == "Ripe Avocado"


def test_manual_inventory_item_rejects_non_positive_quantity(
    client: TestClient,
    fridge_id: int,
) -> None:
    response = client.post(
        f"/api/v1/fridges/{fridge_id}/inventory-items",
        json={
            "display_name": "Tomatoes",
            "quantity": 0,
            "unit": "pcs",
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_manual_inventory_item_rejects_blank_name(
    client: TestClient,
    fridge_id: int,
) -> None:
    response = client.post(
        f"/api/v1/fridges/{fridge_id}/inventory-items",
        json={
            "display_name": "   ",
            "quantity": 1,
            "unit": "pcs",
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
