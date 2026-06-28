from __future__ import annotations

from sqlalchemy import Engine, inspect, text


def ensure_runtime_schema(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    statements: list[str] = []

    if "meal_plans" in table_names:
        meal_plan_columns = {column["name"] for column in inspector.get_columns("meal_plans")}
        if "goal" not in meal_plan_columns:
            statements.append("ALTER TABLE meal_plans ADD COLUMN goal VARCHAR(20)")
        if "starts_on" not in meal_plan_columns:
            statements.append("ALTER TABLE meal_plans ADD COLUMN starts_on DATE")
    else:
        meal_plan_columns = set()

    if "users" in table_names:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        user_column_statements = {
            "onboarding_completed_at": (
                "ALTER TABLE users ADD COLUMN onboarding_completed_at DATETIME"
            ),
            "primary_fridge_id": "ALTER TABLE users ADD COLUMN primary_fridge_id INTEGER",
            "created_at": "ALTER TABLE users ADD COLUMN created_at DATETIME",
            "updated_at": "ALTER TABLE users ADD COLUMN updated_at DATETIME",
        }
        statements.extend(
            statement
            for column_name, statement in user_column_statements.items()
            if column_name not in user_columns
        )

    if "fridges" in table_names:
        fridge_columns = {column["name"] for column in inspector.get_columns("fridges")}
        fridge_column_statements = {
            "kind": "ALTER TABLE fridges ADD COLUMN kind VARCHAR(50) DEFAULT 'fridge'",
            "description": "ALTER TABLE fridges ADD COLUMN description VARCHAR(255)",
            "user_id": "ALTER TABLE fridges ADD COLUMN user_id VARCHAR(50)",
            "is_primary": "ALTER TABLE fridges ADD COLUMN is_primary BOOLEAN DEFAULT 0",
            "created_at": "ALTER TABLE fridges ADD COLUMN created_at DATETIME",
            "updated_at": "ALTER TABLE fridges ADD COLUMN updated_at DATETIME",
        }
        statements.extend(
            statement
            for column_name, statement in fridge_column_statements.items()
            if column_name not in fridge_columns
        )

    if "user_goals" in table_names:
        goal_columns = {column["name"] for column in inspector.get_columns("user_goals")}
        goal_column_statements = {
            "target_weight_kg": "ALTER TABLE user_goals ADD COLUMN target_weight_kg FLOAT",
            "estimate_snapshot_json": (
                "ALTER TABLE user_goals ADD COLUMN estimate_snapshot_json JSON"
            ),
            "source": "ALTER TABLE user_goals ADD COLUMN source VARCHAR(30) DEFAULT 'manual'",
            "updated_at": "ALTER TABLE user_goals ADD COLUMN updated_at DATETIME",
        }
        statements.extend(
            statement
            for column_name, statement in goal_column_statements.items()
            if column_name not in goal_columns
        )

    if "inventory_items" in table_names:
        inventory_columns = {
            column["name"] for column in inspector.get_columns("inventory_items")
        }
        inventory_column_statements = {
            "source_provider": "ALTER TABLE inventory_items ADD COLUMN source_provider VARCHAR(50)",
            "expiration_date_source": (
                "ALTER TABLE inventory_items "
                "ADD COLUMN expiration_date_source VARCHAR(40) DEFAULT 'unknown'"
            ),
            "expiration_confidence": (
                "ALTER TABLE inventory_items ADD COLUMN expiration_confidence FLOAT"
            ),
            "confidence": "ALTER TABLE inventory_items ADD COLUMN confidence FLOAT",
        }
        statements.extend(
            statement
            for column_name, statement in inventory_column_statements.items()
            if column_name not in inventory_columns
        )

    if "canonical_products" in table_names:
        product_columns = {
            column["name"] for column in inspector.get_columns("canonical_products")
        }
        product_column_statements = {
            "category": (
                "ALTER TABLE canonical_products "
                "ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'Other'"
            ),
            "default_location": (
                "ALTER TABLE canonical_products "
                "ADD COLUMN default_location VARCHAR(50) NOT NULL DEFAULT 'fridge'"
            ),
            "shelf_life_days": (
                "ALTER TABLE canonical_products "
                "ADD COLUMN shelf_life_days INTEGER NOT NULL DEFAULT 14"
            ),
            "expiration_confidence": (
                "ALTER TABLE canonical_products "
                "ADD COLUMN expiration_confidence FLOAT NOT NULL DEFAULT 0.45"
            ),
            "is_active": (
                "ALTER TABLE canonical_products "
                "ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"
            ),
        }
        statements.extend(
            statement
            for column_name, statement in product_column_statements.items()
            if column_name not in product_columns
        )
        statements.append(
            "CREATE INDEX IF NOT EXISTS ix_canonical_products_normalized_name "
            "ON canonical_products (normalized_name)"
        )
    else:
        statements.append(
            "CREATE TABLE canonical_products ("
            "id INTEGER NOT NULL PRIMARY KEY, "
            "display_name VARCHAR(120) NOT NULL, "
            "normalized_name VARCHAR(120) NOT NULL UNIQUE, "
            "category VARCHAR(50) NOT NULL DEFAULT 'Other', "
            "default_location VARCHAR(50) NOT NULL DEFAULT 'fridge', "
            "shelf_life_days INTEGER NOT NULL DEFAULT 14, "
            "expiration_confidence FLOAT NOT NULL DEFAULT 0.45, "
            "is_active BOOLEAN NOT NULL DEFAULT 1"
            ")"
        )
        statements.append(
            "CREATE INDEX ix_canonical_products_normalized_name "
            "ON canonical_products (normalized_name)"
        )

    if "product_aliases" in table_names:
        alias_columns = {column["name"] for column in inspector.get_columns("product_aliases")}
        alias_column_statements = {
            "canonical_product_id": (
                "ALTER TABLE product_aliases ADD COLUMN canonical_product_id INTEGER"
            ),
            "alias": "ALTER TABLE product_aliases ADD COLUMN alias VARCHAR(160)",
            "normalized_alias": (
                "ALTER TABLE product_aliases ADD COLUMN normalized_alias VARCHAR(160)"
            ),
            "locale": "ALTER TABLE product_aliases ADD COLUMN locale VARCHAR(20)",
            "source": (
                "ALTER TABLE product_aliases "
                "ADD COLUMN source VARCHAR(50) NOT NULL DEFAULT 'seed'"
            ),
            "confidence": (
                "ALTER TABLE product_aliases ADD COLUMN confidence FLOAT NOT NULL DEFAULT 0.8"
            ),
        }
        statements.extend(
            statement
            for column_name, statement in alias_column_statements.items()
            if column_name not in alias_columns
        )
        statements.append(
            "CREATE INDEX IF NOT EXISTS ix_product_aliases_canonical_product_id "
            "ON product_aliases (canonical_product_id)"
        )
        statements.append(
            "CREATE INDEX IF NOT EXISTS ix_product_aliases_normalized_alias "
            "ON product_aliases (normalized_alias)"
        )
    else:
        statements.append(
            "CREATE TABLE product_aliases ("
            "id INTEGER NOT NULL PRIMARY KEY, "
            "canonical_product_id INTEGER NOT NULL, "
            "alias VARCHAR(160) NOT NULL, "
            "normalized_alias VARCHAR(160) NOT NULL UNIQUE, "
            "locale VARCHAR(20), "
            "source VARCHAR(50) NOT NULL DEFAULT 'seed', "
            "confidence FLOAT NOT NULL DEFAULT 0.8, "
            "FOREIGN KEY(canonical_product_id) REFERENCES canonical_products (id)"
            ")"
        )
        statements.append(
            "CREATE INDEX ix_product_aliases_canonical_product_id "
            "ON product_aliases (canonical_product_id)"
        )
        statements.append(
            "CREATE INDEX ix_product_aliases_normalized_alias "
            "ON product_aliases (normalized_alias)"
        )

    if "shopping_lists" in table_names:
        shopping_list_columns = {
            column["name"] for column in inspector.get_columns("shopping_lists")
        }
        shopping_list_column_statements = {
            "fridge_id": "ALTER TABLE shopping_lists ADD COLUMN fridge_id INTEGER",
            "name": (
                "ALTER TABLE shopping_lists "
                "ADD COLUMN name VARCHAR(120) NOT NULL DEFAULT 'Active Shopping List'"
            ),
            "status": (
                "ALTER TABLE shopping_lists "
                "ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'active'"
            ),
        }
        statements.extend(
            statement
            for column_name, statement in shopping_list_column_statements.items()
            if column_name not in shopping_list_columns
        )

    if "shopping_list_items" in table_names:
        shopping_list_item_columns = {
            column["name"] for column in inspector.get_columns("shopping_list_items")
        }
        shopping_list_item_column_statements = {
            "source_recipe_id": (
                "ALTER TABLE shopping_list_items ADD COLUMN source_recipe_id INTEGER"
            ),
            "checked": (
                "ALTER TABLE shopping_list_items "
                "ADD COLUMN checked BOOLEAN NOT NULL DEFAULT 0"
            ),
        }
        statements.extend(
            statement
            for column_name, statement in shopping_list_item_column_statements.items()
            if column_name not in shopping_list_item_columns
        )

    if "meal_plan_entries" in table_names:
        meal_plan_entry_columns = {
            column["name"] for column in inspector.get_columns("meal_plan_entries")
        }
        if "nutrition_snapshot_json" not in meal_plan_entry_columns:
            statements.append(
                "ALTER TABLE meal_plan_entries "
                "ADD COLUMN nutrition_snapshot_json JSON NOT NULL DEFAULT '{}'"
            )

    if "recipes" in table_names:
        recipe_columns = {column["name"] for column in inspector.get_columns("recipes")}
        recipe_column_statements = {
            "goals_json": "ALTER TABLE recipes ADD COLUMN goals_json JSON",
            "hero_emoji": "ALTER TABLE recipes ADD COLUMN hero_emoji VARCHAR(20) DEFAULT '🍽️'",
            "tags_json": "ALTER TABLE recipes ADD COLUMN tags_json JSON",
            "is_active": "ALTER TABLE recipes ADD COLUMN is_active BOOLEAN DEFAULT 1",
            "source": "ALTER TABLE recipes ADD COLUMN source VARCHAR(50) DEFAULT 'local'",
            "source_provider": "ALTER TABLE recipes ADD COLUMN source_provider VARCHAR(50)",
            "external_id": "ALTER TABLE recipes ADD COLUMN external_id VARCHAR(120)",
            "source_url": "ALTER TABLE recipes ADD COLUMN source_url VARCHAR(500)",
            "image_url": "ALTER TABLE recipes ADD COLUMN image_url VARCHAR(500)",
            "attribution_json": "ALTER TABLE recipes ADD COLUMN attribution_json JSON",
            "instructions_json": "ALTER TABLE recipes ADD COLUMN instructions_json JSON",
            "nutrition_snapshot_json": (
                "ALTER TABLE recipes ADD COLUMN nutrition_snapshot_json JSON"
            ),
            "confidence": "ALTER TABLE recipes ADD COLUMN confidence FLOAT",
            "last_synced_at": "ALTER TABLE recipes ADD COLUMN last_synced_at DATETIME",
        }
        statements.extend(
            statement
            for column_name, statement in recipe_column_statements.items()
            if column_name not in recipe_columns
        )
        statements.append(
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "ix_recipes_source_provider_external_id "
            "ON recipes (source_provider, external_id) "
            "WHERE external_id IS NOT NULL"
        )
        statements.append(
            "CREATE INDEX IF NOT EXISTS ix_recipes_is_active_name "
            "ON recipes (is_active, name)"
        )

    if "recipe_ingredients" in table_names:
        ingredient_columns = {
            column["name"] for column in inspector.get_columns("recipe_ingredients")
        }
        ingredient_column_statements = {
            "raw_name": "ALTER TABLE recipe_ingredients ADD COLUMN raw_name VARCHAR(255)",
            "quantity": "ALTER TABLE recipe_ingredients ADD COLUMN quantity FLOAT",
            "unit": "ALTER TABLE recipe_ingredients ADD COLUMN unit VARCHAR(30)",
            "sort_order": (
                "ALTER TABLE recipe_ingredients "
                "ADD COLUMN sort_order INTEGER DEFAULT 0"
            ),
            "source": (
                "ALTER TABLE recipe_ingredients "
                "ADD COLUMN source VARCHAR(50) DEFAULT 'local'"
            ),
        }
        statements.extend(
            statement
            for column_name, statement in ingredient_column_statements.items()
            if column_name not in ingredient_columns
        )
        statements.append(
            "CREATE INDEX IF NOT EXISTS ix_recipe_ingredients_recipe_sort "
            "ON recipe_ingredients (recipe_id, sort_order)"
        )
        statements.append(
            "CREATE INDEX IF NOT EXISTS ix_recipe_ingredients_normalized_recipe "
            "ON recipe_ingredients (normalized_name, recipe_id)"
        )

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
        if "meal_plans" in table_names and "starts_on" not in meal_plan_columns:
            connection.execute(
                text(
                    "UPDATE meal_plans "
                    "SET starts_on = DATE(generated_at) "
                    "WHERE starts_on IS NULL"
                )
            )
