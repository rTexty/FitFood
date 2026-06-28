from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from app.services.cache.provider_cache import JsonContainer
from app.services.provider_models import ProviderServiceError


@dataclass(frozen=True, slots=True)
class MiniMaxJsonResult:
    output_json: JsonContainer
    input_tokens: int
    output_tokens: int
    total_tokens: int
    raw_content: str


class MiniMaxChatService:
    def __init__(
        self,
        *,
        http_client: httpx.Client,
        base_url: str,
        api_key: str,
        model: str,
    ) -> None:
        self._http_client = http_client
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model

    @property
    def model(self) -> str:
        return self._model

    def complete_json(
        self,
        *,
        messages: list[dict[str, Any]],
        max_completion_tokens: int = 2000,
        temperature: float = 0.2,
        top_p: float = 0.95,
    ) -> MiniMaxJsonResult:
        if not self._api_key:
            raise ProviderServiceError("MiniMax API key is not configured")

        payload = {
            "model": self._model,
            "messages": messages,
            "max_completion_tokens": max_completion_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "reasoning_split": True,
        }

        try:
            response = self._http_client.post(
                f"{self._base_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=30.0,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderServiceError("MiniMax request failed") from exc

        response_payload = response.json()
        raw_content = self._content_from_response(response_payload)
        output_json = self._parse_json_content(raw_content)
        usage = response_payload.get("usage", {})
        usage_payload = usage if isinstance(usage, dict) else {}

        input_tokens = self._as_int(usage_payload.get("prompt_tokens"))
        output_tokens = self._as_int(usage_payload.get("completion_tokens"))
        total_tokens = self._as_int(usage_payload.get("total_tokens"))
        return MiniMaxJsonResult(
            output_json=output_json,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            raw_content=raw_content,
        )

    def _content_from_response(self, response_payload: object) -> str:
        if not isinstance(response_payload, dict):
            raise ProviderServiceError("MiniMax response was not a JSON object")

        choices = response_payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise ProviderServiceError("MiniMax response did not include choices")

        first_choice = choices[0]
        if not isinstance(first_choice, dict):
            raise ProviderServiceError("MiniMax response choice was invalid")

        message = first_choice.get("message")
        if not isinstance(message, dict):
            raise ProviderServiceError("MiniMax response message was invalid")

        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ProviderServiceError("MiniMax response content was empty")
        return content.strip()

    def _parse_json_content(self, raw_content: str) -> JsonContainer:
        try:
            parsed = json.loads(raw_content)
        except json.JSONDecodeError:
            parsed = json.loads(self._extract_json_slice(raw_content))

        if not isinstance(parsed, (dict, list)):
            raise ProviderServiceError("MiniMax response JSON must be an object or array")
        return parsed

    def _extract_json_slice(self, raw_content: str) -> str:
        object_start = raw_content.find("{")
        array_start = raw_content.find("[")
        starts = [index for index in (object_start, array_start) if index >= 0]
        if not starts:
            raise ProviderServiceError("MiniMax response did not contain JSON")

        start = min(starts)
        end_char = "}" if raw_content[start] == "{" else "]"
        end = raw_content.rfind(end_char)
        if end < start:
            raise ProviderServiceError("MiniMax response JSON was incomplete")
        return raw_content[start : end + 1]

    def _as_int(self, value: object) -> int:
        return int(value) if isinstance(value, int) else 0
