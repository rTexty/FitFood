from __future__ import annotations

import json
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.services.cache.provider_cache import JsonContainer, JsonValue
from app.services.llm.artifacts import AiArtifactStore
from app.services.llm.minimax import MiniMaxJsonResult


class JsonChatService(Protocol):
    model: str

    def complete_json(self, **kwargs: Any) -> MiniMaxJsonResult:
        ...


class MiniMaxRecipeAssistant:
    def __init__(
        self,
        *,
        chat_service: JsonChatService,
        session: Session,
        prompt_version: str = "recipe-generation-v1",
    ) -> None:
        self._chat_service = chat_service
        self._artifact_store = AiArtifactStore(session)
        self._prompt_version = prompt_version

    def generate_recipe(self, input_payload: JsonValue) -> JsonContainer:
        cached_output = self._artifact_store.get_output(
            task_type="recipe_generation",
            model=self._chat_service.model,
            input_payload=input_payload,
            prompt_version=self._prompt_version,
        )
        if cached_output is not None:
            return cached_output

        result = self._chat_service.complete_json(
            messages=self._build_messages(input_payload),
            max_completion_tokens=2000,
            temperature=0.7,
        )
        return self._artifact_store.store_output(
            task_type="recipe_generation",
            model=self._chat_service.model,
            input_payload=input_payload,
            prompt_version=self._prompt_version,
            output_json=result.output_json,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
        )

    def _build_messages(self, input_payload: JsonValue) -> list[dict[str, Any]]:
        return [
            {
                "role": "system",
                "content": (
                    "You are FitFood's recipe generation engine. "
                    "Return ONLY valid JSON with name, servings, minutes, "
                    "ingredients, missing_ingredients, nutrition_summary, and instructions."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    input_payload,
                    ensure_ascii=False,
                    separators=(",", ":"),
                    sort_keys=True,
                ),
            },
        ]
