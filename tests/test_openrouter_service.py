from __future__ import annotations

import json

import httpx
import pytest

from app.core.config import Settings
from app.services.llm.openrouter import OpenRouterChatService
from app.services.provider_models import ProviderServiceError


def test_openrouter_chat_service_posts_request_and_parses_json() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.method == "POST"
        assert request.url.path == "/api/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-openrouter-key"
        assert request.headers["HTTP-Referer"] == "https://fitfood.test"
        assert request.headers["X-OpenRouter-Title"] == "FitFood"

        payload = json.loads(request.read())
        assert payload["model"] == "google/gemma-4-31b-it:free"
        assert "reasoning_split" not in payload
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"merchant":"Green Market","items":[]}'
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 11,
                    "completion_tokens": 7,
                    "total_tokens": 18,
                },
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
        service = OpenRouterChatService(
            http_client=http_client,
            base_url="https://openrouter.ai/api/v1",
            api_key="test-openrouter-key",
            model="google/gemma-4-31b-it:free",
            http_referer="https://fitfood.test",
            app_title="FitFood",
        )

        result = service.complete_json(
            messages=[{"role": "user", "content": "Return receipt JSON"}],
            max_completion_tokens=256,
            temperature=0.1,
        )

    assert calls == 1
    assert result.output_json == {"merchant": "Green Market", "items": []}
    assert result.input_tokens == 11
    assert result.output_tokens == 7


def test_openrouter_chat_service_requires_api_key() -> None:
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200))) as http_client:
        service = OpenRouterChatService(
            http_client=http_client,
            base_url="https://openrouter.ai/api/v1",
            api_key="",
            model="google/gemma-4-31b-it:free",
        )

        with pytest.raises(ProviderServiceError, match="OpenRouter API key"):
            service.complete_json(messages=[{"role": "user", "content": "Hi"}])


def test_settings_auto_selects_openrouter_when_only_openrouter_key_is_present(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("FITFOOD_LLM_PROVIDER", raising=False)
    monkeypatch.delenv("FITFOOD_MINIMAX_API_KEY", raising=False)
    monkeypatch.setenv("FITFOOD_OPENROUTER_API_KEY", "openrouter-key")

    settings = Settings()

    assert settings.llm_provider == "openrouter"
    assert settings.llm_enabled is True
    assert settings.openrouter_model == "google/gemma-4-31b-it:free"
