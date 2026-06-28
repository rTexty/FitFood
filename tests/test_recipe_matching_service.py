from __future__ import annotations

from app.services.recipes.matching import build_recipe_matches


def test_build_recipe_matches_ranks_fridge_cookable_first(client, fridge_id):
    # client fixture seeds recipes + a fridge with inventory
    session_factory = client.app.state.session_factory
    with session_factory() as session:
        matches = build_recipe_matches(
            session,
            fridge_id=fridge_id,
            goal="all",
            max_missing=20,
        )

    assert matches, "expected at least one match"
    # Sorted by fewest missing, then highest score
    missing_counts = [len(m["missing_ingredients"]) for m in matches]
    assert missing_counts == sorted(missing_counts)
    first = matches[0]
    assert set(first.keys()) >= {
        "recipe",
        "match_score",
        "available_ingredients",
        "missing_ingredients",
        "shopping_list_ready",
        "nutrition_summary",
    }


def test_build_recipe_matches_returns_empty_for_unknown_fridge(client):
    session_factory = client.app.state.session_factory
    with session_factory() as session:
        matches = build_recipe_matches(session, fridge_id=999999, goal="all", max_missing=3)
    assert matches == []
