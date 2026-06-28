from __future__ import annotations

from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Recipe, RecipeIngredient
from app.services.normalization import normalize_name


class IngredientSeed(TypedDict, total=False):
    display_name: str
    quantity: float
    unit: str
    optional: bool


class RecipeSeed(TypedDict):
    external_id: str
    name: str
    hero_emoji: str
    goal: str
    goals: list[str]
    tags: list[str]
    servings: int
    minutes: int
    nutrition: dict[str, float]
    instructions: list[str]
    ingredients: list[IngredientSeed]


RECIPE_CATALOG_SEEDS: list[RecipeSeed] = [
    {
        "external_id": "spinach_omelet:v1",
        "name": "Spinach Omelet",
        "hero_emoji": "🥚",
        "goal": "maintain",
        "goals": ["lose", "maintain", "gain"],
        "tags": ["Breakfast", "Quick", "High protein"],
        "servings": 1,
        "minutes": 10,
        "nutrition": {"calories": 310, "protein": 22, "carbs": 8, "fat": 21},
        "instructions": [
            "Whisk eggs with a pinch of salt.",
            "Wilt spinach in a lightly oiled pan.",
            "Cook the eggs until just set and fold before serving.",
        ],
        "ingredients": [
            {"display_name": "Eggs", "quantity": 2, "unit": "pcs"},
            {"display_name": "Baby Spinach", "quantity": 1, "unit": "handful"},
            {"display_name": "Olive Oil", "quantity": 1, "unit": "tsp"},
        ],
    },
    {
        "external_id": "chicken_power_bowl:v1",
        "name": "Chicken Power Bowl",
        "hero_emoji": "🥗",
        "goal": "maintain",
        "goals": ["lose", "maintain"],
        "tags": ["Lunch", "High protein", "Meal prep"],
        "servings": 2,
        "minutes": 20,
        "nutrition": {"calories": 520, "protein": 44, "carbs": 38, "fat": 19},
        "instructions": [
            "Cook the rice until tender.",
            "Sear chicken breast until cooked through.",
            "Slice avocado and assemble everything over spinach.",
        ],
        "ingredients": [
            {"display_name": "Chicken Breast", "quantity": 2, "unit": "pcs"},
            {"display_name": "Baby Spinach", "quantity": 1, "unit": "bag"},
            {"display_name": "Avocado", "quantity": 1, "unit": "pcs"},
            {"display_name": "Brown Rice", "quantity": 1, "unit": "cup"},
        ],
    },
    {
        "external_id": "greek_yogurt_parfait:v1",
        "name": "Greek Yogurt Parfait",
        "hero_emoji": "🥣",
        "goal": "maintain",
        "goals": ["lose", "maintain", "gain"],
        "tags": ["Breakfast", "No cook", "Quick"],
        "servings": 1,
        "minutes": 5,
        "nutrition": {"calories": 360, "protein": 24, "carbs": 48, "fat": 8},
        "instructions": [
            "Spoon yogurt into a bowl or jar.",
            "Top with banana slices and rolled oats.",
            "Chill briefly or serve immediately.",
        ],
        "ingredients": [
            {"display_name": "Greek Yogurt", "quantity": 250, "unit": "g"},
            {"display_name": "Bananas", "quantity": 1, "unit": "pcs"},
            {"display_name": "Rolled Oats", "quantity": 40, "unit": "g"},
        ],
    },
]


def _recipe_seed_entry(session: Session, seed: RecipeSeed) -> Recipe | None:
    recipe = session.scalar(
        select(Recipe).where(
            Recipe.source_provider == "fitfood",
            Recipe.external_id == seed["external_id"],
        )
    )
    if recipe is not None:
        return recipe

    return _legacy_seed_recipe_by_name(session, seed)


def _legacy_seed_recipe_by_name(session: Session, seed: RecipeSeed) -> Recipe | None:
    recipe = session.scalar(
        select(Recipe)
        .options(selectinload(Recipe.ingredients))
        .where(
            Recipe.name == seed["name"],
            Recipe.source_provider.is_(None),
            Recipe.external_id.is_(None),
        )
    )
    if recipe is None:
        return None

    expected_ingredients = {
        normalize_name(ingredient_seed["display_name"])
        for ingredient_seed in seed["ingredients"]
    }
    current_ingredients = {ingredient.normalized_name for ingredient in recipe.ingredients}
    if current_ingredients == expected_ingredients:
        return recipe

    return None


def _ingredient_from_seed(seed: IngredientSeed, index: int) -> RecipeIngredient:
    display_name = seed["display_name"]
    return RecipeIngredient(
        display_name=display_name,
        normalized_name=normalize_name(display_name),
        quantity=seed.get("quantity"),
        unit=seed.get("unit"),
        optional=seed.get("optional", False),
        sort_order=index,
        source="seed",
    )


def seed_recipe_catalog(session: Session) -> None:
    for seed in RECIPE_CATALOG_SEEDS:
        recipe = _recipe_seed_entry(session, seed)
        if recipe is None:
            recipe = Recipe(name=seed["name"], source="local")
            session.add(recipe)

        recipe.name = seed["name"]
        recipe.goal = seed["goal"]
        recipe.goals_json = list(seed["goals"])
        recipe.hero_emoji = seed["hero_emoji"]
        recipe.tags_json = list(seed["tags"])
        recipe.servings = seed["servings"]
        recipe.minutes = seed["minutes"]
        recipe.is_active = True
        recipe.source = "local"
        recipe.source_provider = "fitfood"
        recipe.external_id = seed["external_id"]
        recipe.instructions_json = list(seed["instructions"])
        recipe.nutrition_snapshot_json = dict(seed["nutrition"])
        existing_ingredients = {
            ingredient.normalized_name: ingredient for ingredient in recipe.ingredients
        }
        seeded_ingredients: list[RecipeIngredient] = []
        for index, ingredient_seed in enumerate(seed["ingredients"]):
            normalized_name = normalize_name(ingredient_seed["display_name"])
            ingredient = existing_ingredients.get(normalized_name)
            if ingredient is None:
                ingredient = _ingredient_from_seed(ingredient_seed, index)

            ingredient.display_name = ingredient_seed["display_name"]
            ingredient.normalized_name = normalized_name
            ingredient.quantity = ingredient_seed.get("quantity")
            ingredient.unit = ingredient_seed.get("unit")
            ingredient.optional = ingredient_seed.get("optional", False)
            ingredient.sort_order = index
            ingredient.source = "seed"
            seeded_ingredients.append(ingredient)

        recipe.ingredients = seeded_ingredients
