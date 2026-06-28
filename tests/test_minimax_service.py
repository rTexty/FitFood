from __future__ import annotations

import httpx
import pytest

from app.services.llm.minimax import MiniMaxChatService
from app.services.llm.recipe_assistant import MiniMaxRecipeAssistant
from app.services.provider_models import ProviderServiceError


def test_minimax_chat_service_posts_openai_compatible_request_and_parses_json() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.method == "POST"
        assert request.url.path == "/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-key"

        payload = request.read()
        assert b'"model":"MiniMax-M3"' in payload
        assert b'"max_completion_tokens":500' in payload
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"name":"Cached recipe","instructions":["Cook once."]}'
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 25,
                    "completion_tokens": 15,
                    "total_tokens": 40,
                },
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
        service = MiniMaxChatService(
            http_client=http_client,
            base_url="https://api.minimax.io",
            api_key="test-key",
            model="MiniMax-M3",
        )

        result = service.complete_json(
            messages=[{"role": "user", "content": "Return recipe JSON"}],
            max_completion_tokens=500,
            temperature=0.2,
        )

    assert calls == 1
    assert result.output_json == {"name": "Cached recipe", "instructions": ["Cook once."]}
    assert result.input_tokens == 25
    assert result.output_tokens == 15


def test_minimax_chat_service_requires_api_key() -> None:
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200))) as http_client:
        service = MiniMaxChatService(
            http_client=http_client,
            base_url="https://api.minimax.io",
            api_key="",
            model="MiniMax-M3",
        )

        with pytest.raises(ProviderServiceError, match="MiniMax API key"):
            service.complete_json(messages=[{"role": "user", "content": "Hi"}])


def test_recipe_assistant_reuses_ai_artifact_cache(client) -> None:
    calls = 0
    session_factory = client.app.state.session_factory

    class FakeMiniMaxChatService:
        model = "MiniMax-M3"

        def complete_json(self, **_kwargs):
            nonlocal calls
            calls += 1
            return type(
                "FakeResult",
                (),
                {
                    "output_json": {
                        "name": "Inventory Omelet",
                        "instructions": ["Cook the cached draft once."],
                    },
                    "input_tokens": 50,
                    "output_tokens": 30,
                    "total_tokens": 80,
                },
            )()

    input_payload = {
        "available_ingredients": ["eggs", "baby spinach"],
        "goal": "maintain",
        "servings": 1,
    }

    with session_factory() as session:
        assistant = MiniMaxRecipeAssistant(
            chat_service=FakeMiniMaxChatService(),
            session=session,
        )

        first_recipe = assistant.generate_recipe(input_payload)
        second_recipe = assistant.generate_recipe(input_payload)

    assert first_recipe == second_recipe
    assert calls == 1
    assert first_recipe["instructions"] == ["Cook the cached draft once."]
