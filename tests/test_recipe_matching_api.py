from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings
from app.main import create_app
from app.db.models import Recipe, RecipeIngredient
from app.services.normalization import normalize_name
from app.services.recipe_catalog import seed_recipe_catalog


def test_recipes_catalog_lists_all_persisted_recipes(client: TestClient) -> None:
    response = client.get("/api/v1/recipes")

    assert response.status_code == 200

    payload = response.json()
    assert payload["meta"]["total"] >= 1
    assert payload["meta"]["per_page"] == len(payload["data"])

    first_recipe = payload["data"][0]
    assert first_recipe["name"]
    assert first_recipe["hero_emoji"]
    assert first_recipe["ingredients"]
    assert first_recipe["instructions"]
    assert first_recipe["nutrition_summary"]["calories"] >= 0


def test_recipes_catalog_is_seeded_even_when_demo_data_is_disabled(tmp_path) -> None:
    app = create_app(
        Settings(
            environment="production",
            database_url=f"sqlite:///{tmp_path / 'production-fitfood.db'}",
            seed_demo_data=False,
        )
    )

    with TestClient(app) as test_client:
        response = test_client.get("/api/v1/recipes")

    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["total"] >= 3
    assert {recipe["name"] for recipe in payload["data"]}.issuperset(
        {"Spinach Omelet", "Chicken Power Bowl", "Greek Yogurt Parfait"}
    )


def test_recipes_catalog_uses_database_backed_recipe_metadata(client: TestClient) -> None:
    session_factory = client.app.state.session_factory
    with session_factory() as session:
        recipe = session.scalar(select(Recipe).where(Recipe.name == "Spinach Omelet"))
        assert recipe is not None
        recipe.hero_emoji = "🍳"
        recipe.tags_json = ["DB Tag", "Recovery"]
        recipe.goals_json = ["gain"]
        recipe.instructions_json = ["Use the persisted method."]
        recipe.nutrition_snapshot_json = {
            "calories": 777,
            "protein": 55,
            "carbs": 44,
            "fat": 33,
        }
        session.commit()

    response = client.get("/api/v1/recipes")

    assert response.status_code == 200
    recipes = response.json()["data"]
    recipe_payload = next(recipe for recipe in recipes if recipe["name"] == "Spinach Omelet")
    assert recipe_payload["hero_emoji"] == "🍳"
    assert recipe_payload["tags"] == ["DB Tag", "Recovery"]
    assert recipe_payload["goals"] == ["gain"]
    assert recipe_payload["instructions"] == ["Use the persisted method."]
    assert recipe_payload["nutrition_summary"] == {
        "calories": 777,
        "protein": 55,
        "carbs": 44,
        "fat": 33,
    }


def test_recipe_catalog_seed_is_idempotent_when_fridge_already_exists(
    client: TestClient,
) -> None:
    session_factory = client.app.state.session_factory
    with session_factory() as session:
        before_count = session.query(Recipe).count()
        seed_recipe_catalog(session)
        seed_recipe_catalog(session)
        session.commit()
        after_count = session.query(Recipe).count()

    assert after_count == before_count


def test_recipe_catalog_seed_backfills_existing_recipe_metadata_and_ingredients(
    client: TestClient,
) -> None:
    session_factory = client.app.state.session_factory
    with session_factory() as session:
        recipe = session.scalar(select(Recipe).where(Recipe.name == "Spinach Omelet"))
        assert recipe is not None
        recipe.source_provider = None
        recipe.external_id = None
        recipe.ingredients[0].quantity = None
        recipe.ingredients[0].unit = None
        recipe.ingredients[0].source = "local"
        session.commit()

        seed_recipe_catalog(session)
        session.commit()
        session.refresh(recipe)

        first_ingredient = sorted(
            recipe.ingredients,
            key=lambda ingredient: ingredient.sort_order,
        )[0]

    assert recipe.source_provider == "fitfood"
    assert recipe.external_id == "spinach_omelet:v1"
    assert first_ingredient.quantity == 2
    assert first_ingredient.unit == "pcs"
    assert first_ingredient.source == "seed"


def test_recipe_catalog_seed_does_not_overwrite_custom_same_name_recipe(
    client: TestClient,
) -> None:
    session_factory = client.app.state.session_factory
    with session_factory() as session:
        custom_recipe = Recipe(
            name="Spinach Omelet",
            goal="maintain",
            source="manual",
            ingredients=[
                RecipeIngredient(
                    display_name="Custom Greens",
                    normalized_name=normalize_name("Custom Greens"),
                    quantity=1,
                    unit="bunch",
                    source="manual",
                )
            ],
        )
        session.add(custom_recipe)
        session.commit()
        custom_recipe_id = custom_recipe.id

        seed_recipe_catalog(session)
        session.commit()

        persisted_custom_recipe = session.get(Recipe, custom_recipe_id)
        assert persisted_custom_recipe is not None
        custom_recipe_snapshot = {
            "source": persisted_custom_recipe.source,
            "source_provider": persisted_custom_recipe.source_provider,
            "external_id": persisted_custom_recipe.external_id,
            "ingredient": persisted_custom_recipe.ingredients[0].display_name,
        }

    assert custom_recipe_snapshot == {
        "source": "manual",
        "source_provider": None,
        "external_id": None,
        "ingredient": "Custom Greens",
    }


def test_inactive_recipes_are_hidden_from_catalog_and_matches(
    client: TestClient,
    fridge_id: int,
) -> None:
    session_factory = client.app.state.session_factory
    with session_factory() as session:
        recipe = session.scalar(select(Recipe).where(Recipe.name == "Spinach Omelet"))
        assert recipe is not None
        recipe.is_active = False
        session.commit()

    catalog_response = client.get("/api/v1/recipes")
    matches_response = client.get(
        f"/api/v1/fridges/{fridge_id}/recipe-matches",
        params={"max_missing": 3, "goal": "all"},
    )

    assert catalog_response.status_code == 200
    assert matches_response.status_code == 200
    catalog_names = {recipe["name"] for recipe in catalog_response.json()["data"]}
    match_names = {item["recipe"]["name"] for item in matches_response.json()["data"]}
    assert "Spinach Omelet" not in catalog_names
    assert "Spinach Omelet" not in match_names


def test_recipe_matches_include_missing_ingredients_and_scores(
    client: TestClient,
    fridge_id: int,
) -> None:
    response = client.get(
        f"/api/v1/fridges/{fridge_id}/recipe-matches",
        params={"max_missing": 3, "goal": "maintain"},
    )

    assert response.status_code == 200

    payload = response.json()
    assert payload["meta"]["total"] >= 1
    assert payload["meta"]["page"] == 1
    assert payload["meta"]["per_page"] == len(payload["data"])

    top_match = payload["data"][0]
    assert top_match["recipe"]["name"] == "Spinach Omelet"
    assert top_match["recipe"]["hero_emoji"]
    assert top_match["recipe"]["nutrition_summary"]["calories"] > 0
    assert top_match["nutrition_summary"] == top_match["recipe"]["nutrition_summary"]
    assert top_match["available_ingredients"]
    assert {"name", "normalized_name"}.issubset(top_match["available_ingredients"][0])
    assert isinstance(top_match["missing_ingredients"], list)
    assert "available_ingredients" in top_match
    assert "missing_ingredients" in top_match
    assert "shopping_list_ready" in top_match
    assert top_match["match_score"] >= 50


def test_recipe_matches_filter_consistently_for_lose_goal(
    client: TestClient,
    fridge_id: int,
) -> None:
    response = client.get(
        f"/api/v1/fridges/{fridge_id}/recipe-matches",
        params={"goal": "lose", "max_missing": 3},
    )

    assert response.status_code == 200

    recipe_names = {item["recipe"]["name"] for item in response.json()["data"]}
    assert "Chicken Power Bowl" in recipe_names
    assert "Greek Yogurt Parfait" in recipe_names


def test_recipe_matches_filter_consistently_for_gain_goal(
    client: TestClient,
    fridge_id: int,
) -> None:
    response = client.get(
        f"/api/v1/fridges/{fridge_id}/recipe-matches",
        params={"goal": "gain", "max_missing": 3},
    )

    assert response.status_code == 200

    recipe_names = {item["recipe"]["name"] for item in response.json()["data"]}
    assert "Greek Yogurt Parfait" in recipe_names
    assert "Spinach Omelet" in recipe_names
    assert "Chicken Power Bowl" not in recipe_names


def test_recipe_matches_reject_invalid_goal_and_large_max_missing(
    client: TestClient,
    fridge_id: int,
) -> None:
    invalid_goal_response = client.get(
        f"/api/v1/fridges/{fridge_id}/recipe-matches",
        params={"goal": "bulk"},
    )
    assert invalid_goal_response.status_code == 422
    assert invalid_goal_response.json()["error"]["code"] == "validation_error"

    max_missing_response = client.get(
        f"/api/v1/fridges/{fridge_id}/recipe-matches",
        params={"max_missing": 21},
    )
    assert max_missing_response.status_code == 422
    assert max_missing_response.json()["error"]["code"] == "validation_error"


def test_recipe_matches_use_persisted_recipe_preparation_details(
    client: TestClient,
    fridge_id: int,
) -> None:
    session_factory = client.app.state.session_factory
    with session_factory() as session:
        session.add(
            Recipe(
                name="Cached Egg Bowl",
                goal="maintain",
                servings=1,
                minutes=12,
                source="llm",
                source_provider="minimax",
                instructions_json=[
                    "Use the saved preparation method.",
                    "Serve while warm.",
                ],
                nutrition_snapshot_json={
                    "calories": 275,
                    "protein": 20,
                    "carbs": 8,
                    "fat": 17,
                },
                ingredients=[
                    RecipeIngredient(
                        display_name="Eggs",
                        normalized_name=normalize_name("Eggs"),
                        quantity=2,
                        unit="pcs",
                        raw_name="2 eggs",
                        source="llm",
                    )
                ],
            )
        )
        session.commit()

    response = client.get(
        f"/api/v1/fridges/{fridge_id}/recipe-matches",
        params={"max_missing": 0, "goal": "maintain"},
    )

    assert response.status_code == 200
    recipes = [item["recipe"] for item in response.json()["data"]]
    cached_recipe = next(recipe for recipe in recipes if recipe["name"] == "Cached Egg Bowl")
    assert cached_recipe["instructions"] == [
        "Use the saved preparation method.",
        "Serve while warm.",
    ]
    assert cached_recipe["nutrition_summary"] == {
        "calories": 275,
        "protein": 20,
        "carbs": 8,
        "fat": 17,
    }
    assert cached_recipe["ingredients"] == [
        {
            "name": "Eggs",
            "normalized_name": "eggs",
            "quantity": 2,
            "unit": "pcs",
            "raw_name": "2 eggs",
        }
    ]
