from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_sqlite_runtime_schema_adds_new_meal_plan_columns(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy-fitfood.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE meal_plans (
                id INTEGER PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                fridge_id INTEGER NOT NULL,
                span_days INTEGER NOT NULL,
                status VARCHAR(30) NOT NULL,
                generated_at DATETIME NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE meal_plan_entries (
                id INTEGER PRIMARY KEY,
                meal_plan_id INTEGER NOT NULL,
                day_index INTEGER NOT NULL,
                meal_type VARCHAR(30) NOT NULL,
                recipe_id INTEGER NOT NULL,
                servings FLOAT
            )
            """
        )

    app = create_app(
        Settings(
            environment="test",
            database_url=f"sqlite:///{database_path}",
            seed_demo_data=True,
        )
    )

    with TestClient(app) as client:
        fridge_id = client.get("/api/v1/fridges").json()["data"][0]["id"]
        response = client.post(
            "/api/v1/meal-plans",
            json={"fridge_id": fridge_id, "goal": "maintain", "span_days": 1},
        )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["goal"] == "maintain"
    assert payload["starts_on"]
    assert payload["entries"]

    with sqlite3.connect(database_path) as connection:
        meal_plan_entry_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(meal_plan_entries)").fetchall()
        }

    assert "nutrition_snapshot_json" in meal_plan_entry_columns


def test_sqlite_runtime_schema_adds_recipe_cache_columns(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy-recipes.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE recipes (
                id INTEGER PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                goal VARCHAR(50),
                servings INTEGER,
                minutes INTEGER
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE recipe_ingredients (
                id INTEGER PRIMARY KEY,
                recipe_id INTEGER NOT NULL,
                display_name VARCHAR(120) NOT NULL,
                normalized_name VARCHAR(120) NOT NULL,
                optional BOOLEAN
            )
            """
        )

    create_app(
        Settings(
            environment="test",
            database_url=f"sqlite:///{database_path}",
            seed_demo_data=False,
        )
    )

    with sqlite3.connect(database_path) as connection:
        recipe_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(recipes)").fetchall()
        }
        ingredient_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(recipe_ingredients)").fetchall()
        }
        recipe_indexes = {
            row[1] for row in connection.execute("PRAGMA index_list(recipes)").fetchall()
        }
        ingredient_indexes = {
            row[1]
            for row in connection.execute("PRAGMA index_list(recipe_ingredients)").fetchall()
        }
        table_names = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }

    assert {
        "goals_json",
        "hero_emoji",
        "tags_json",
        "is_active",
        "source",
        "source_provider",
        "external_id",
        "instructions_json",
        "nutrition_snapshot_json",
        "last_synced_at",
    }.issubset(recipe_columns)
    assert {"raw_name", "quantity", "unit", "sort_order", "source"}.issubset(
        ingredient_columns
    )
    assert {
        "ix_recipes_source_provider_external_id",
        "ix_recipes_is_active_name",
    }.issubset(recipe_indexes)
    assert {
        "ix_recipe_ingredients_recipe_sort",
        "ix_recipe_ingredients_normalized_recipe",
    }.issubset(ingredient_indexes)
    assert {"provider_cache", "ai_artifacts"}.issubset(table_names)


def test_sqlite_runtime_schema_repairs_legacy_fridge_columns(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy-fridges.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE fridges (
                id INTEGER PRIMARY KEY,
                name VARCHAR(120) NOT NULL
            )
            """
        )
        connection.execute("INSERT INTO fridges (id, name) VALUES (1, 'Legacy Kitchen')")

    app = create_app(
        Settings(
            environment="test",
            database_url=f"sqlite:///{database_path}",
            seed_demo_data=False,
        )
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/fridges")

    assert response.status_code == 200
    assert response.json()["data"][0] == {
        "id": 1,
        "name": "Legacy Kitchen",
        "kind": "fridge",
        "description": None,
        "is_primary": False,
    }


def test_sqlite_runtime_schema_repairs_legacy_shopping_list_columns(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "legacy-shopping-lists.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE fridges (
                id INTEGER PRIMARY KEY,
                name VARCHAR(120) NOT NULL
            )
            """
        )
        connection.execute("INSERT INTO fridges (id, name) VALUES (1, 'Legacy Kitchen')")
        connection.execute(
            """
            CREATE TABLE shopping_lists (
                id INTEGER PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE shopping_list_items (
                id INTEGER PRIMARY KEY,
                shopping_list_id INTEGER NOT NULL,
                display_name VARCHAR(120) NOT NULL,
                normalized_name VARCHAR(120) NOT NULL,
                quantity FLOAT,
                unit VARCHAR(30)
            )
            """
        )

    app = create_app(
        Settings(
            environment="test",
            database_url=f"sqlite:///{database_path}",
            seed_demo_data=True,
        )
    )

    with TestClient(app) as client:
        response = client.post("/api/v1/recipe-matches/1/shopping-list-items?fridge_id=1")

    assert response.status_code == 201
    assert response.json()["data"]["created_count"] >= 1


def test_sqlite_runtime_schema_adds_inventory_review_metadata_columns(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "legacy-inventory.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE inventory_items (
                id INTEGER PRIMARY KEY,
                fridge_id INTEGER NOT NULL,
                display_name VARCHAR(120) NOT NULL,
                normalized_name VARCHAR(120) NOT NULL,
                quantity FLOAT,
                unit VARCHAR(30),
                location VARCHAR(50),
                category VARCHAR(50),
                source VARCHAR(50),
                purchase_date DATE NOT NULL,
                expiration_date DATE
            )
            """
        )

    create_app(
        Settings(
            environment="test",
            database_url=f"sqlite:///{database_path}",
            seed_demo_data=False,
        )
    )

    with sqlite3.connect(database_path) as connection:
        inventory_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(inventory_items)").fetchall()
        }

    assert {
        "source_provider",
        "expiration_date_source",
        "expiration_confidence",
        "confidence",
    }.issubset(inventory_columns)


def test_sqlite_runtime_schema_adds_product_taxonomy_tables(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy-product-taxonomy.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE fridges (
                id INTEGER PRIMARY KEY,
                name VARCHAR(120) NOT NULL
            )
            """
        )

    create_app(
        Settings(
            environment="test",
            database_url=f"sqlite:///{database_path}",
            seed_demo_data=False,
        )
    )

    with sqlite3.connect(database_path) as connection:
        table_names = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        product_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(canonical_products)").fetchall()
        }
        alias_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(product_aliases)").fetchall()
        }

    assert {"canonical_products", "product_aliases"}.issubset(table_names)
    assert {
        "display_name",
        "normalized_name",
        "category",
        "default_location",
        "shelf_life_days",
        "expiration_confidence",
    }.issubset(product_columns)
    assert {"canonical_product_id", "alias", "normalized_alias", "confidence"}.issubset(
        alias_columns
    )


def test_sqlite_runtime_schema_repairs_partial_product_taxonomy_tables(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "legacy-partial-product-taxonomy.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE canonical_products (
                id INTEGER PRIMARY KEY,
                display_name VARCHAR(120) NOT NULL,
                normalized_name VARCHAR(120) NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE product_aliases (
                id INTEGER PRIMARY KEY
            )
            """
        )

    create_app(
        Settings(
            environment="test",
            database_url=f"sqlite:///{database_path}",
            seed_demo_data=True,
        )
    )

    with sqlite3.connect(database_path) as connection:
        product_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(canonical_products)").fetchall()
        }
        alias_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(product_aliases)").fetchall()
        }
        alias_count = connection.execute("SELECT COUNT(*) FROM product_aliases").fetchone()[0]

    assert {
        "category",
        "default_location",
        "shelf_life_days",
        "expiration_confidence",
        "is_active",
    }.issubset(product_columns)
    assert {
        "canonical_product_id",
        "alias",
        "normalized_alias",
        "locale",
        "source",
        "confidence",
    }.issubset(alias_columns)
    assert alias_count >= 1


def test_sqlite_app_startup_uses_schema_lock_file(tmp_path: Path) -> None:
    database_path = tmp_path / "locked-fitfood.db"

    app = create_app(
        Settings(
            environment="test",
            database_url=f"sqlite:///{database_path}",
            seed_demo_data=False,
        )
    )

    assert app.state.engine.url.database == str(database_path)
    assert database_path.with_suffix(".db.schema.lock").exists()
