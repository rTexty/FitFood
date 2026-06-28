from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_get_current_user_returns_demo_profile(client: TestClient) -> None:
    response = client.get("/api/v1/users/me")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["id"] == "user-demo"
    assert payload["email"] == "alex@fitfood.app"
    assert payload["display_name"] == "Alex Green"
    assert payload["locale"] == "en-US"
    assert payload["timezone"] == "Europe/Moscow"
    assert payload["onboarding_completed_at"] is None
    assert payload["primary_fridge_id"] is None


def test_current_goal_can_be_updated_and_persisted(client: TestClient) -> None:
    initial_response = client.get("/api/v1/users/me/goals/current")

    assert initial_response.status_code == 200
    assert initial_response.json() == {"data": None}

    update_response = client.put(
        "/api/v1/users/me/goals/current",
        json={"goal": "gain"},
    )

    assert update_response.status_code == 200
    payload = update_response.json()["data"]
    assert payload["goal"] == "gain"
    assert payload["calories_target"] > 0
    assert payload["protein_target"] > 0
    assert payload["carbs_target"] > 0
    assert payload["fat_target"] > 0
    assert payload["active_from"]
    assert payload["active_to"] is None

    refreshed_response = client.get("/api/v1/users/me/goals/current")

    assert refreshed_response.status_code == 200
    assert refreshed_response.json()["data"] == payload


def test_put_current_goal_rejects_invalid_goal(client: TestClient) -> None:
    response = client.put("/api/v1/users/me/goals/current", json={"goal": "bulk"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_onboarding_state_starts_incomplete(client: TestClient) -> None:
    response = client.get("/api/v1/users/me/onboarding")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["completed"] is False
    assert payload["user"]["id"] == "user-demo"
    assert payload["profile"] is None
    assert payload["current_goal"] is None
    assert payload["primary_fridge"] is None


def test_onboarding_completion_creates_profile_goal_and_primary_fridge(
    client: TestClient,
) -> None:
    response = client.put(
        "/api/v1/users/me/onboarding",
        json={
            "display_name": "Rita",
            "age_years": 29,
            "sex_for_calorie_estimate": "female",
            "height_cm": 168,
            "weight_kg": 72,
            "target_weight_kg": 65,
            "goal": "lose",
            "activity_level": "moderate",
            "dietary_preferences": ["high_protein"],
            "allergies": [{"display_name": "Peanuts", "severity": "avoid"}],
            "fridge": {
                "name": "Home Kitchen",
                "kind": "home",
                "description": "Daily cooking",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["user"]["display_name"] == "Rita"
    assert payload["user"]["onboarding_completed_at"]
    assert payload["user"]["primary_fridge_id"] == payload["primary_fridge"]["id"]
    assert payload["profile"]["age_years"] == 29
    assert payload["profile"]["height_cm"] == 168
    assert payload["profile"]["weight_kg"] == 72
    assert payload["profile"]["activity_level"] == "moderate"
    assert payload["profile"]["dietary_preferences"] == ["high_protein"]
    assert payload["profile"]["allergies"][0]["normalized_name"] == "peanuts"
    assert payload["current_goal"]["goal"] == "lose"
    assert payload["current_goal"]["calories_target"] >= 1200
    assert payload["current_goal"]["protein_target"] > 0

    state_response = client.get("/api/v1/users/me/onboarding")
    assert state_response.status_code == 200
    assert state_response.json()["data"]["completed"] is True

    profile_response = client.get("/api/v1/users/me/profile")
    assert profile_response.status_code == 200
    assert profile_response.json()["data"]["age_years"] == 29


def test_onboarding_completion_is_idempotent(client: TestClient) -> None:
    payload = {
        "display_name": "Alex",
        "age_years": 34,
        "sex_for_calorie_estimate": "male",
        "height_cm": 180,
        "weight_kg": 82,
        "target_weight_kg": 88,
        "goal": "gain",
        "activity_level": "light",
        "dietary_preferences": [],
        "allergies": [],
        "fridge": {"name": "Main Kitchen", "kind": "home"},
    }

    first_response = client.put("/api/v1/users/me/onboarding", json=payload)
    second_response = client.put("/api/v1/users/me/onboarding", json=payload | {"weight_kg": 83})

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first = first_response.json()["data"]
    second = second_response.json()["data"]
    assert second["primary_fridge"]["id"] == first["primary_fridge"]["id"]
    assert second["profile"]["weight_kg"] == 83


def test_demo_reset_restarts_onboarding_after_completion(client: TestClient) -> None:
    setup_response = client.put(
        "/api/v1/users/me/onboarding",
        json={
            "display_name": "Rita",
            "age_years": 29,
            "sex_for_calorie_estimate": "female",
            "height_cm": 168,
            "weight_kg": 72,
            "target_weight_kg": None,
            "goal": "maintain",
            "activity_level": "moderate",
            "dietary_preferences": ["high_protein"],
            "allergies": [],
            "fridge": {"name": "Rita Kitchen", "kind": "home"},
        },
    )
    assert setup_response.status_code == 200
    assert setup_response.json()["data"]["completed"] is True

    reset_response = client.post("/api/v1/users/me/demo-reset")

    assert reset_response.status_code == 200
    payload = reset_response.json()["data"]
    assert payload["completed"] is False
    assert payload["user"]["display_name"] == "Alex Green"
    assert payload["user"]["onboarding_completed_at"] is None
    assert payload["user"]["primary_fridge_id"] is None
    assert payload["profile"] is None
    assert payload["current_goal"] is None
    assert payload["primary_fridge"] is None

    profile_response = client.get("/api/v1/users/me/profile")
    assert profile_response.status_code == 200
    assert profile_response.json()["data"] is None


def test_onboarding_rejects_unsafe_goal_direction(client: TestClient) -> None:
    response = client.put(
        "/api/v1/users/me/onboarding",
        json={
            "display_name": "Alex",
            "age_years": 34,
            "sex_for_calorie_estimate": "male",
            "height_cm": 180,
            "weight_kg": 82,
            "target_weight_kg": 90,
            "goal": "lose",
            "activity_level": "moderate",
            "dietary_preferences": [],
            "allergies": [],
            "fridge": {"name": "Main Kitchen", "kind": "home"},
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_onboarding_rejects_blank_display_name(client: TestClient) -> None:
    response = client.put(
        "/api/v1/users/me/onboarding",
        json={
            "display_name": "   ",
            "age_years": 34,
            "sex_for_calorie_estimate": "male",
            "height_cm": 180,
            "weight_kg": 82,
            "target_weight_kg": None,
            "goal": "maintain",
            "activity_level": "moderate",
            "dietary_preferences": [],
            "allergies": [],
            "fridge": {"name": "Main Kitchen", "kind": "home"},
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_profile_patch_rejects_goal_direction_drift(client: TestClient) -> None:
    setup_response = client.put(
        "/api/v1/users/me/onboarding",
        json={
            "display_name": "Alex",
            "age_years": 34,
            "sex_for_calorie_estimate": "male",
            "height_cm": 180,
            "weight_kg": 82,
            "target_weight_kg": 75,
            "goal": "lose",
            "activity_level": "moderate",
            "dietary_preferences": [],
            "allergies": [],
            "fridge": {"name": "Main Kitchen", "kind": "home"},
        },
    )
    assert setup_response.status_code == 200

    response = client.patch("/api/v1/users/me/profile", json={"target_weight_kg": 90})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "http_error"


def test_goal_update_rejects_profile_without_required_target(client: TestClient) -> None:
    setup_response = client.put(
        "/api/v1/users/me/onboarding",
        json={
            "display_name": "Alex",
            "age_years": 34,
            "sex_for_calorie_estimate": "male",
            "height_cm": 180,
            "weight_kg": 82,
            "target_weight_kg": None,
            "goal": "maintain",
            "activity_level": "moderate",
            "dietary_preferences": [],
            "allergies": [],
            "fridge": {"name": "Main Kitchen", "kind": "home"},
        },
    )
    assert setup_response.status_code == 200

    response = client.put("/api/v1/users/me/goals/current", json={"goal": "lose"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "http_error"


def test_development_cors_allows_local_vite_origin(tmp_path: Path) -> None:
    settings = Settings(
        environment="development",
        database_url=f"sqlite:///{tmp_path / 'fitfood-cors.db'}",
        seed_demo_data=False,
    )
    app = create_app(settings)

    with TestClient(app) as client:
        response = client.get(
            "/api/v1/health",
            headers={"Origin": "http://localhost:5173"},
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_production_settings_do_not_seed_demo_data_by_default(tmp_path: Path) -> None:
    settings = Settings(
        environment="production",
        database_url=f"sqlite:///{tmp_path / 'fitfood-production.db'}",
    )
    app = create_app(settings)

    with TestClient(app) as client:
        response = client.get("/api/v1/fridges")

    assert settings.seed_demo_data is False
    assert response.status_code == 200
    assert response.json()["data"] == []


def test_production_settings_use_anonymous_session_not_demo_user(tmp_path: Path) -> None:
    settings = Settings(
        environment="production",
        database_url=f"sqlite:///{tmp_path / 'fitfood-production-auth.db'}",
    )
    app = create_app(settings)

    with TestClient(app) as client:
        response = client.get("/api/v1/users/me")
        second_response = client.get("/api/v1/users/me")

    assert settings.demo_user_enabled is False
    assert response.status_code == 200
    assert response.json()["data"]["id"].startswith("user-")
    assert response.json()["data"]["id"] != "user-demo"
    assert "fitfood_user_id=" in response.headers["set-cookie"]
    assert second_response.json()["data"]["id"] == response.json()["data"]["id"]
