from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.db.models import AiArtifact, ProviderCache
from app.services.cache.provider_cache import PersistentProviderCache
from app.services.llm.artifacts import AiArtifactStore


def test_provider_cache_reuses_expensive_json_result(client: TestClient) -> None:
    calls = 0
    session_factory = client.app.state.session_factory
    request_payload = {
        "constraints": {"goal": "maintain", "max_minutes": 20},
        "inventory": ["eggs", "baby spinach"],
    }
    equivalent_payload = {
        "inventory": ["eggs", "baby spinach"],
        "constraints": {"max_minutes": 20, "goal": "maintain"},
    }

    def produce_recipe() -> dict[str, object]:
        nonlocal calls
        calls += 1
        return {
            "name": "Cached Spinach Omelet",
            "instructions": ["Whisk eggs.", "Cook with spinach."],
        }

    with session_factory() as session:
        cache = PersistentProviderCache(session)

        first_result = cache.get_or_create_json(
            provider="minimax",
            resource_type="recipe_generation",
            request_payload=request_payload,
            ttl_seconds=3600,
            producer=produce_recipe,
        )
        second_result = cache.get_or_create_json(
            provider="minimax",
            resource_type="recipe_generation",
            request_payload=equivalent_payload,
            ttl_seconds=3600,
            producer=produce_recipe,
        )

        assert first_result == second_result
        assert calls == 1
        assert session.query(ProviderCache).count() == 1


def test_provider_cache_refreshes_expired_json_result(client: TestClient) -> None:
    calls = 0
    session_factory = client.app.state.session_factory
    first_now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    later_now = first_now + timedelta(hours=2)

    def produce_recipe() -> dict[str, object]:
        nonlocal calls
        calls += 1
        return {"name": "Cached Recipe", "generation": calls}

    with session_factory() as session:
        first_cache = PersistentProviderCache(session, now=lambda: first_now)
        first_result = first_cache.get_or_create_json(
            provider="themealdb",
            resource_type="recipe_lookup",
            request_payload={"external_id": "52772"},
            ttl_seconds=60,
            producer=produce_recipe,
        )

        refreshed_cache = PersistentProviderCache(session, now=lambda: later_now)
        refreshed_result = refreshed_cache.get_or_create_json(
            provider="themealdb",
            resource_type="recipe_lookup",
            request_payload={"external_id": "52772"},
            ttl_seconds=60,
            producer=produce_recipe,
        )

        assert first_result["generation"] == 1
        assert refreshed_result["generation"] == 2
        assert calls == 2
        assert session.query(ProviderCache).count() == 1


def test_ai_artifact_store_reuses_structured_llm_output(client: TestClient) -> None:
    calls = 0
    session_factory = client.app.state.session_factory
    input_payload = {
        "inventory": ["eggs", "baby spinach"],
        "recipe_goal": "maintain",
        "servings": 1,
    }

    def generate_recipe() -> dict[str, object]:
        nonlocal calls
        calls += 1
        return {
            "name": "LLM Spinach Omelet",
            "instructions": ["Use cached instructions."],
            "missing_ingredients": [],
        }

    with session_factory() as session:
        store = AiArtifactStore(session)

        first_output = store.get_or_create_output(
            task_type="recipe_generation",
            model="MiniMax-M3",
            input_payload=input_payload,
            producer=generate_recipe,
            input_tokens=120,
            output_tokens=80,
        )
        second_output = store.get_or_create_output(
            task_type="recipe_generation",
            model="MiniMax-M3",
            input_payload=input_payload,
            producer=generate_recipe,
            input_tokens=120,
            output_tokens=80,
        )

        assert first_output == second_output
        assert calls == 1

        artifact = session.query(AiArtifact).one()
        assert artifact.task_type == "recipe_generation"
        assert artifact.model == "MiniMax-M3"
        assert artifact.status == "succeeded"
        assert artifact.input_tokens == 120
        assert artifact.output_tokens == 80
